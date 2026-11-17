-- Teste grátis passa a valer em plano de qualquer cobrança (mensal ou em ciclo de parcelas). Antes o
-- anual ignorava trial_days (o checkout nunca o usava), então os planos em ciclo que já existem
-- guardam o valor padrão de quando o campo não valia (7 dias). Sem este ajuste, o Anual passaria a
-- oferecer 7 dias grátis sozinho. Zera nos planos em ciclo existentes: quem quiser teste no anual liga
-- em /admin/planos, de propósito.
update public.plans set trial_days = 0 where billing_interval = 'year' and trial_days <> 0;
