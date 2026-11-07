-- Filtros de clientes: pessoa física ou jurídica (pelo tamanho do CPF/CNPJ) e cidade (pelo
-- endereço dos locais, sem acento). Só colunas geradas: valem as policies das tabelas.

alter table public.clients
  add column person_kind text generated always as (
    case length(regexp_replace(coalesce(document, ''), '\D', '', 'g'))
      when 11 then 'pf'
      when 14 then 'pj'
    end
  ) stored;

alter table public.client_locations
  add column search_text text generated always as (lower(public.immutable_unaccent(coalesce(address, '')))) stored;

create index clients_person_kind_idx on public.clients (company_id, person_kind) where deleted_at is null;

-- Local só com a cidade, vindo da importação ("Lins", "Itu"): o banco pedia 5 caracteres e
-- recusava a planilha inteira. O formulário continua pedindo o endereço completo.
alter table public.client_locations drop constraint client_locations_address_check;
alter table public.client_locations add constraint client_locations_address_check
  check (length(address) between 2 and 300);
