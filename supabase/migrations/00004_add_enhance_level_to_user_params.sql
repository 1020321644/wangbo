-- 为 user_params 增加 AI 增强模式字段：simple(简单/DeepFilterNet) / advanced(困难/AudioSR)
-- 默认 simple，与现有用户行为一致
ALTER TABLE user_params
  ADD COLUMN enhance_level text NOT NULL DEFAULT 'simple';