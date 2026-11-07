-- Busca na lista de orçamentos pelo título sem acento ("instalacao" acha "Instalação"). O nome do
-- cliente vem de clients.search_text e o número é comparado direto, no servidor.
alter table public.quotes
  add column search_text text generated always as (lower(public.immutable_unaccent(coalesce(title, '')))) stored;
