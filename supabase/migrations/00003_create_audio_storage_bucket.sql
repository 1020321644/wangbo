
-- 创建音频文件存储桶（公开读，支持永久 URL）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-files',
  'audio-files',
  true,
  524288000,  -- 500 MB
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/x-wav', 'audio/x-m4a', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: 任何人可上传和读取（匿名应用）
CREATE POLICY "public upload audio" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'audio-files');

CREATE POLICY "public read audio" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'audio-files');

CREATE POLICY "public delete audio" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'audio-files');
