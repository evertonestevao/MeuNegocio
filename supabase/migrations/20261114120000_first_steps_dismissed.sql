-- "Primeiros passos" no Início: o cartão de onboarding (logo, serviços, clientes, primeiro orçamento).
-- Antes o "Não mostrar mais" ficava só no localStorage do navegador — voltava em outro aparelho ou ao
-- limpar o cache. Agora a dispensa fica na empresa, então some de vez em qualquer dispositivo.
--
-- Escrita já é owner/admin pelas policies existentes (company_profiles_insert_admin /
-- company_profiles_update_admin); leitura é do escritório (company_profiles_select_office). Nenhuma
-- policy nova é necessária.
alter table public.company_profiles
  add column first_steps_dismissed_at timestamptz;
