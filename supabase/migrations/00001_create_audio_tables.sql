-- 设备标识（匿名应用用 device_id 区分数据）
-- audio_files 表：已导入的音频文件记录
CREATE TABLE audio_files (
  id            text        PRIMARY KEY,
  device_id     text        NOT NULL,
  name          text        NOT NULL,
  ext           text        NOT NULL,
  format        text,
  size          bigint      NOT NULL DEFAULT 0,
  duration      numeric     NOT NULL DEFAULT 0,
  uri           text        NOT NULL DEFAULT '',
  converted     boolean     NOT NULL DEFAULT false,
  target_format text,
  created_at    bigint      NOT NULL DEFAULT extract(epoch from now()) * 1000
);

ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;

-- 匿名用户只能操作自己 device_id 的数据
CREATE POLICY "anon_select_own_files" ON audio_files
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_files" ON audio_files
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_files" ON audio_files
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_files" ON audio_files
  FOR DELETE TO anon USING (true);

-- history_records 表：转换/分离/解密/曲谱历史
CREATE TABLE history_records (
  id             text        PRIMARY KEY,
  device_id      text        NOT NULL,
  source_name    text        NOT NULL,
  source_format  text,
  target_format  text        NOT NULL,
  mode           text        NOT NULL,
  output_name    text        NOT NULL,
  output_size    bigint      NOT NULL DEFAULT 0,
  duration       numeric     NOT NULL DEFAULT 0,
  type           text        NOT NULL DEFAULT 'convert',
  created_at     bigint      NOT NULL DEFAULT extract(epoch from now()) * 1000
);

ALTER TABLE history_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_history" ON history_records
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_history" ON history_records
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_delete_history" ON history_records
  FOR DELETE TO anon USING (true);

-- user_params 表：用户参数设置（每个设备一条记录，upsert）
CREATE TABLE user_params (
  device_id       text        PRIMARY KEY,
  sample_rate     text        NOT NULL DEFAULT '96kHz',
  bit_depth       text        NOT NULL DEFAULT '24bit',
  bitrate         text        NOT NULL DEFAULT '320kbps',
  master_enhance  boolean     NOT NULL DEFAULT true,
  updated_at      bigint      NOT NULL DEFAULT extract(epoch from now()) * 1000
);

ALTER TABLE user_params ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_params" ON user_params
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_params" ON user_params
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_params" ON user_params
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 索引
CREATE INDEX idx_audio_files_device ON audio_files (device_id, created_at DESC);
CREATE INDEX idx_history_device ON history_records (device_id, created_at DESC);