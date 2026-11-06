-- Busca de clientes sem acento ("goncalves" acha "Gonçalves") e pelos números do documento e do
-- telefone, digitados com ou sem pontuação. Sem tabela nova: só colunas geradas, que seguem as
-- policies de RLS das tabelas onde estão.

create extension if not exists unaccent with schema extensions;

-- unaccent() não é immutable (o dicionário poderia mudar), e coluna gerada exige immutable. Com o
-- dicionário fixo no argumento, o resultado só depende do texto.
create or replace function public.immutable_unaccent(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

-- O banco calcula a coluna gerada com o papel de quem grava: quem cadastra cliente precisa poder
-- chamar a função. Ela é pura (texto entra, texto sai) e não lê tabela nenhuma.
revoke execute on function public.immutable_unaccent(text) from public, anon;
grant execute on function public.immutable_unaccent(text) to authenticated, service_role;

-- Nome sem acento, em minúsculas, e o documento só com os dígitos.
alter table public.clients
  add column search_text text generated always as (
    lower(public.immutable_unaccent(name)) || ' ' || coalesce(regexp_replace(document, '\D', '', 'g'), '')
  ) stored;

alter table public.client_contacts
  add column phone_digits text generated always as (regexp_replace(phone, '\D', '', 'g')) stored;
