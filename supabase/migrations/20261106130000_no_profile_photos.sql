-- Foto de perfil desligada por decisão do produto: o único arquivo de imagem que a empresa envia é
-- o logo. Fecha os dois caminhos de gravação pela API: o arquivo no bucket avatars e o link no
-- perfil. A leitura e a exclusão continuam (a exclusão de conta limpa a pasta, se houver algo).

drop policy "avatars_insert_own" on storage.objects;
drop policy "avatars_update_own" on storage.objects;

-- Perfil: o usuário só troca o nome. updated_at vem do trigger, que não depende desta permissão.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

update public.profiles set avatar_url = null where avatar_url is not null;
