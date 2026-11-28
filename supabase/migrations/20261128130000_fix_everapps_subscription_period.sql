-- Correção de dados: a assinatura sub_vafj8jywuhjjya9h (empresa EverApps) recebeu fim de período
-- em 28/01/2027 porque o webhook usava o "próximo vencimento" do Asaas, que já apontava para a
-- cobrança depois da seguinte. A cobrança paga venceu em 28/11/2026: o período certo vai até 28/12/2026.
-- Só mexe se ainda estiver com o valor errado (idempotente; em outros bancos não encontra a linha).
update public.subscriptions
set current_period_start = '2026-11-28T00:00:00Z',
    current_period_end = '2026-12-28T00:00:00Z',
    updated_at = now()
where external_subscription_id = 'sub_vafj8jywuhjjya9h'
  and deleted_at is null
  and current_period_end = '2027-01-28T00:00:00Z';
