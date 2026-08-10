/**
 * 云端 Stem 分离接口池（全部 HF 开源模型，无需密钥）
 *
 * 全部基于 Hugging Face Inference API 公开开源模型，无需任何 API 密钥。
 * 主用 ≥3 个，备用 ≥6 个；运行时按顺序尝试，任一成功即返回。
 */
export interface StemProvider {
  id: string;
  name: string;
  role: "primary" | "backup";
  model: string;
  desc: string;
}

export const STEM_PROVIDERS: StemProvider[] = [
  // ── 主用 3 个 ──
  { id: "hf-demucs",         name: "Demucs htdemucs",    role: "primary", model: "facebook/demucs",              desc: "Meta Demucs 四轨分离，开源 SOTA，无需密钥" },
  { id: "hf-demucs-4s",      name: "Demucs 4-source",    role: "primary", model: "julien-c/demucs",              desc: "Demucs 四轨变体，人声/伴奏/鼓/贝斯" },
  { id: "hf-spleeter-2stem", name: "Spleeter 2-stem",    role: "primary", model: "deezer/spleeter-2stems",       desc: "Deezer Spleeter 人声/伴奏分离，开源经典" },
  // ── 备用 6 个 ──
  { id: "hf-spleeter-4stem", name: "Spleeter 4-stem",    role: "backup",  model: "deezer/spleeter-4stems",       desc: "Spleeter 四轨分离备用" },
  { id: "hf-spleeter-5stem", name: "Spleeter 5-stem",    role: "backup",  model: "deezer/spleeter-5stems",       desc: "Spleeter 五轨分离备用" },
  { id: "hf-sepformer-wsj",  name: "SepFormer wsj02mix", role: "backup",  model: "speechbrain/sepformer-wsj02mix", desc: "SepFormer 多声源分离" },
  { id: "hf-sepformer-wham", name: "SepFormer WHAM!",    role: "backup",  model: "speechbrain/sepformer-wham",   desc: "SepFormer 语音分离（WHAM!）" },
  { id: "hf-sepformer-whamr",name: "SepFormer WHAM!-R",  role: "backup",  model: "speechbrain/sepformer-whamr",  desc: "SepFormer 去混响分离" },
  { id: "hf-demucs-mdx",     name: "Demucs MDX",         role: "backup",  model: "htdemucs/demucs-mdx",          desc: "Demucs MDX 变体备用" },
];

export const STEM_PRIMARY_COUNT = STEM_PROVIDERS.filter((p) => p.role === "primary").length;
export const STEM_BACKUP_COUNT  = STEM_PROVIDERS.filter((p) => p.role === "backup").length;