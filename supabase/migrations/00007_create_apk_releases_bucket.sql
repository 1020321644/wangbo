
-- 创建 APK 发布公共存储桶（用于 CI/CD 直链分发，无需登录）
INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
VALUES ('apk-releases', 'apk-releases', true, now(), now())
ON CONFLICT (id) DO UPDATE SET public = true, updated_at = now();

-- 允许公开读取（任何人可下载 APK）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='objects' AND schemaname='storage' AND policyname='APK public read'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "APK public read" ON storage.objects
        FOR SELECT USING (bucket_id = 'apk-releases')
    $p$;
  END IF;
END$$;

-- 允许匿名角色上传（CI/CD 使用 anon key 上传）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='objects' AND schemaname='storage' AND policyname='APK anon upload'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "APK anon upload" ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'apk-releases')
    $p$;
  END IF;
END$$;

-- 允许匿名角色删除旧 APK（可选，方便 CI/CD 覆盖同名文件）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='objects' AND schemaname='storage' AND policyname='APK anon delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "APK anon delete" ON storage.objects
        FOR DELETE USING (bucket_id = 'apk-releases')
    $p$;
  END IF;
END$$;
