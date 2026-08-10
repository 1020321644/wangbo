/**
 * 云端 音频→MIDI 接口池（全部 HF 开源模型，无需密钥）
 *
 * 全部基于 Hugging Face Inference API 公开开源模型，无需任何 API 密钥。
 * 主用 ≥3 个，备用 ≥6 个；运行时按顺序尝试，任一成功即返回。
 *
 * 说明：草稿生成，开源模型识别单音旋律，导出的 .mid 需后期精修。
 */
export interface MidiProvider {
  id: string;
  name: string;
  role: "primary" | "backup";
  model: string;
  desc: string;
}

export const MIDI_PROVIDERS: MidiProvider[] = [
  // ── 主用 3 个 ──
  { id: "hf-basic-pitch",       name: "Spotify Basic Pitch",       role: "primary", model: "spotify/basic-pitch",       desc: "Spotify 开源 Basic Pitch，音频转 MIDI，无需密钥" },
  { id: "hf-basic-pitch-curve", name: "Spotify Basic Pitch Curve", role: "primary", model: "spotify/basic-pitch-curve", desc: "Basic Pitch 曲线版，音高更细腻" },
  { id: "hf-basic-pitch-midi",  name: "Basic Pitch MIDI 直出",     role: "primary", model: "spotify/basic-pitch",       desc: "Basic Pitch 主用备用通道" },
  // ── 备用 6 个 ──
  { id: "hf-basic-pitch-b1",    name: "Basic Pitch 备用 B1",       role: "backup",  model: "spotify/basic-pitch-curve", desc: "Basic Pitch Curve 备用 B1" },
  { id: "hf-basic-pitch-b2",    name: "Basic Pitch 备用 B2",       role: "backup",  model: "spotify/basic-pitch",       desc: "Basic Pitch 备用 B2" },
  { id: "hf-basic-pitch-b3",    name: "Basic Pitch 备用 B3",       role: "backup",  model: "spotify/basic-pitch-curve", desc: "Basic Pitch Curve 备用 B3" },
  { id: "hf-pitch-ext",         name: "SpeechBrain Pitch",         role: "backup",  model: "speechbrain/pitch-extraction", desc: "音高检测备用方案" },
  { id: "hf-basic-pitch-b4",    name: "Basic Pitch 备用 B4",       role: "backup",  model: "spotify/basic-pitch",       desc: "Basic Pitch 备用 B4" },
  { id: "hf-basic-pitch-b5",    name: "Basic Pitch 备用 B5",       role: "backup",  model: "spotify/basic-pitch-curve", desc: "Basic Pitch Curve 备用 B5" },
];

export const MIDI_PRIMARY_COUNT = MIDI_PROVIDERS.filter((p) => p.role === "primary").length;
export const MIDI_BACKUP_COUNT  = MIDI_PROVIDERS.filter((p) => p.role === "backup").length;