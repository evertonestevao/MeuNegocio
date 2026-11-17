-- Aviso por e-mail 2 dias antes do fim do teste grátis.
--
-- Uma vez por dia, às 10h de Brasília (13h UTC), o pg_cron chama run_trial_ending_notifier(). Se houver
-- teste acabando em 2 dias, ela avisa o app (POST /api/cron/trial-ending) pelo pg_net; é o app que
-- monta e envia o e-mail e depois marca a assinatura como avisada. O e-mail não sai do banco.
--
-- Configuração por ambiente (fora das migrations, porque tem segredo), no Vault do Supabase:
--   select vault.create_secret('https://SEU-APP', 'app_url');
--   select vault.create_secret('<mesmo valor de CRON_SECRET do app>', 'cron_secret');
-- Sem essas duas, a função só registra um aviso e não faz nada.

create extension if not exists pg_net;

alter table public.subscriptions add column trial_ending_notified_at timestamptz;

-- Fim do teste como data civil. O Asaas grava a data da primeira cobrança como meia-noite UTC; já o
-- teste sem cartão termina em um instante qualquer. Meia-noite UTC é a data em si; o resto conta no
-- fuso de Brasília.
create or replace function public.trial_end_date(p_end timestamptz)
returns date
language sql
immutable
set search_path = public
as $$
  select case
    when (p_end at time zone 'UTC')::time = time '00:00' then (p_end at time zone 'UTC')::date
    else (p_end at time zone 'America/Sao_Paulo')::date
  end
$$;

-- Testes que terminam daqui a p_days dias e ainda não foram avisados: um registro por proprietário.
-- Fica de fora a assinatura cancelada (cancel_at_period_end), já que o aviso incentiva a continuar.
create or replace function public.trial_ending_notices(p_days integer default 2)
returns table (subscription_id uuid, company_id uuid, owner_email text, owner_name text, trial_ends_on date)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.company_id, u.email::text, p.full_name, public.trial_end_date(s.current_period_end)
  from public.subscriptions s
  join public.companies c on c.id = s.company_id and c.deleted_at is null
  join public.company_members m on m.company_id = s.company_id and m.role = 'owner' and m.deleted_at is null
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where s.deleted_at is null
    and s.status = 'trialing'
    and not s.cancel_at_period_end
    and s.trial_ending_notified_at is null
    and s.current_period_end is not null
    and u.email is not null
    and public.trial_end_date(s.current_period_end) = (now() at time zone 'America/Sao_Paulo')::date + p_days
$$;

create or replace function public.mark_trial_ending_notified(p_subscription_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscriptions set trial_ending_notified_at = now()
  where id = p_subscription_id and deleted_at is null and trial_ending_notified_at is null
$$;

-- Só o servidor: a lista traz e-mail de cliente.
revoke execute on function public.trial_ending_notices(integer), public.mark_trial_ending_notified(uuid) from public, anon, authenticated;
grant execute on function public.trial_ending_notices(integer), public.mark_trial_ending_notified(uuid) to service_role;

-- Chamada pelo pg_cron. Só toca o app quando há o que avisar.
create or replace function public.run_trial_ending_notifier()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.trial_ending_notices(2)) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    raise warning 'trial-ending: cadastre app_url e cron_secret no Vault para enviar os avisos';
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/cron/trial-ending',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.run_trial_ending_notifier() from public, anon, authenticated;

-- 13h UTC = 10h em Brasília (sem horário de verão). Uma vez por dia.
select cron.schedule('trial-ending-notice', '0 13 * * *', 'select public.run_trial_ending_notifier()');
