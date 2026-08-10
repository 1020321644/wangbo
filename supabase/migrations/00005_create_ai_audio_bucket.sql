-- AI 音质提升中转桶：存放待处理与已处理音频（公开读，供 Edge Function 读写）
insert into storage.buckets (id, name, public)
values ('ai-audio', 'ai-audio', true);

-- 匿名用户可上传待处理音频
create policy "anon_upload_ai_audio"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'ai-audio');

-- 匿名用户可读取（含 Edge Function 产出的结果文件）
create policy "anon_read_ai_audio"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'ai-audio');

-- 允许删除（清理临时文件）
create policy "anon_delete_ai_audio"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'ai-audio');