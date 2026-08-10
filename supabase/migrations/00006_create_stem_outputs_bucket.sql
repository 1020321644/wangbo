-- 云端 Stem 分离 / MIDI 转换的中间产物存储桶（公开读，便于客户端下载）
insert into storage.buckets (id, name, public)
values ('stem-outputs', 'stem-outputs', true);

-- 匿名用户可读取产物
create policy "stem_outputs_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'stem-outputs');

-- 服务端（Edge Function 用 service role）可写入，匿名禁止写
create policy "stem_outputs_service_write"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'stem-outputs');