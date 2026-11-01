-- Edita a legenda de uma foto enquanto a ordem de serviço está aberta. Mesmas regras de adicionar e remover.
create or replace function public.update_work_order_photo_caption(
  p_company_id uuid,
  p_visit_id uuid,
  p_photo_id uuid,
  p_caption text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders;
begin
  v_order := public.lock_my_open_work_order(p_company_id, p_visit_id);
  if length(trim(coalesce(p_caption, ''))) > 200 then
    raise exception 'Use até 200 caracteres na legenda.' using errcode = 'P0001';
  end if;
  update public.work_order_photos
  set caption = nullif(trim(p_caption), '')
  where id = p_photo_id and work_order_id = v_order.id and deleted_at is null;
  if not found then
    raise exception 'Foto não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.update_work_order_photo_caption(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.update_work_order_photo_caption(uuid, uuid, uuid, text) to authenticated;
