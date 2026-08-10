export type AudioFormat =
  | "MP3"
  | "FLAC"
  | "WAV"
  | "AAC"
  | "OGG"
  | "ALAC"
  | "DSF"
  | "DSD64"
  | "DSD128"
  | "DSD256"
  | "DSD512";

export interface FormatInfo {
  key: AudioFormat;
  label: string;
  ext: string;
  lossless: boolean;
  dsd: boolean;
  desc: string;
  supportsBitDepth: boolean;
  supportsBitrate: boolean;
}

export const FORMAT_LIST: FormatInfo[] = [
  { key: "MP3",   label: "MP3",   ext: "mp3",  lossless: false, dsd: false, desc: "有损压缩 · 通用兼容 · 流媒体标准",            supportsBitDepth: false, supportsBitrate: true  },
  { key: "AAC",   label: "AAC",   ext: "m4a",  lossless: false, dsd: false, desc: "有损压缩 · 高效编码 · Apple/YouTube 标准",   supportsBitDepth: false, supportsBitrate: true  },
  { key: "OGG",   label: "OGG",   ext: "ogg",  lossless: false, dsd: false, desc: "有损压缩 · 开源格式 · Spotify 内部格式",      supportsBitDepth: false, supportsBitrate: true  },
  { key: "FLAC",  label: "FLAC",  ext: "flac", lossless: true,  dsd: false, desc: "无损压缩 · 发烧首选 · 文件较小",              supportsBitDepth: true,  supportsBitrate: false },
  { key: "WAV",   label: "WAV",   ext: "wav",  lossless: true,  dsd: false, desc: "无损未压缩 · PCM 原始数据 · 母带/混音标准",  supportsBitDepth: true,  supportsBitrate: false },
  { key: "ALAC",  label: "ALAC",  ext: "alac", lossless: true,  dsd: false, desc: "Apple 无损压缩 · iTunes/Apple Music 兼容",   supportsBitDepth: true,  supportsBitrate: false },
  // DSD 格式：支持作为输出目标，输出方式为 PCM 高清上采样后封装至 DSD 容器
  // 适用于 DSD DAC / SACD 播放器等专业设备兼容性需求
  { key: "DSF",   label: "DSF",   ext: "dsf",  lossless: true, dsd: true, desc: "DSD 流文件 · 2.8MHz/1-bit · SACD 兼容容器",  supportsBitDepth: false, supportsBitrate: false },
  { key: "DSD64", label: "DSD64", ext: "dff",  lossless: true, dsd: true, desc: "DSD64 · 2.8224MHz · SACD 标准规格",            supportsBitDepth: false, supportsBitrate: false },
  { key: "DSD128",label: "DSD128",ext: "dff",  lossless: true, dsd: true, desc: "DSD128 · 5.6448MHz · Hi-Res 高解析规格",       supportsBitDepth: false, supportsBitrate: false },
  { key: "DSD256",label: "DSD256",ext: "dff",  lossless: true, dsd: true, desc: "DSD256 · 11.2896MHz · 旗舰级 DSD 规格",        supportsBitDepth: false, supportsBitrate: false },
  { key: "DSD512",label: "DSD512",ext: "dff",  lossless: true, dsd: true, desc: "DSD512 · 22.5792MHz · 极致解析 · 专业母带级", supportsBitDepth: false, supportsBitrate: false },
];

export const SAMPLE_RATES = ["44.1kHz", "48kHz", "88.2kHz", "96kHz", "176.4kHz", "192kHz", "352.8kHz", "384kHz"];
export const BIT_DEPTHS = ["16bit", "24bit", "32bit"];
export const BITRATES = ["128kbps", "192kbps", "256kbps", "320kbps", "640kbps", "990kbps"];

export function getFormat(key: AudioFormat): FormatInfo {
  return FORMAT_LIST.find((f) => f.key === key) ?? FORMAT_LIST[0];
}

export function getExt(key: AudioFormat): string {
  return getFormat(key).ext;
}

export function isLossless(key: AudioFormat): boolean {
  return getFormat(key).lossless;
}

export const SUPPORTED_EXTENSIONS = [
  "mp3", "flac", "wav", "aac", "ogg", "alac", "m4a", "dsf", "dff",
  "ncm", "qmc0", "qmc2", "qmc3", "qmcflac", "qmcogg", "tm0", "tm3", "tm6",
  "kgm", "kgma", "vpr", "kwm", "mflac", "mgg",
];

export function detectFormat(filename: string): AudioFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, AudioFormat> = {
    mp3: "MP3", flac: "FLAC", wav: "WAV", aac: "AAC", ogg: "OGG", alac: "ALAC", m4a: "ALAC",
    dsf: "DSF", dff: "DSD64",
  };
  return map[ext] ?? null;
}

export function isEncrypted(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["ncm", "qmc0", "qmc2", "qmc3", "qmcflac", "qmcogg", "tm0", "tm3", "tm6", "kgm", "kgma", "vpr", "kwm", "mflac", "mgg"].includes(ext);
}

export interface EncryptedPlatform {
  ext: string;
  platform: string;
  desc: string;
}

export const ENCRYPTED_PLATFORMS: EncryptedPlatform[] = [
  { ext: "ncm", platform: "网易云音乐", desc: "NCM 加密容器" },
  { ext: "qmc0", platform: "QQ音乐", desc: "QMC0 加密格式" },
  { ext: "qmc2", platform: "QQ音乐", desc: "QMC2 加密格式" },
  { ext: "qmc3", platform: "QQ音乐", desc: "QMC3 加密格式" },
  { ext: "qmcflac", platform: "QQ音乐", desc: "QMC FLAC 加密" },
  { ext: "qmcogg", platform: "QQ音乐", desc: "QMC OGG 加密" },
  { ext: "tm0", platform: "酷狗音乐", desc: "TM0 加密格式" },
  { ext: "tm3", platform: "酷狗音乐", desc: "TM3 加密格式" },
  { ext: "tm6", platform: "酷狗音乐", desc: "TM6 加密格式" },
  { ext: "kgm", platform: "酷狗音乐", desc: "KGM 加密格式" },
  { ext: "kgma", platform: "酷狗音乐", desc: "KGMA 加密格式" },
  { ext: "kwm", platform: "酷我音乐", desc: "KWM 加密格式" },
  { ext: "mflac", platform: "QQ音乐", desc: "MFLAC 加密" },
  { ext: "mgg", platform: "QQ音乐", desc: "MGG 加密" },
  { ext: "vpr", platform: "酷狗音乐", desc: "VPR 加密格式" },
];

export function detectPlatform(filename: string): EncryptedPlatform | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ENCRYPTED_PLATFORMS.find((p) => p.ext === ext) ?? null;
}

export const STEM_TRACKS = [
  { key: "vocal", label: "人声", desc: "Vocal" },
  { key: "instrumental", label: "伴奏", desc: "Instrumental" },
  { key: "drums", label: "鼓点", desc: "Drums" },
  { key: "bass", label: "低音", desc: "Bass" },
  { key: "other", label: "其他乐器", desc: "Other" },
] as const;

export type StemKey = (typeof STEM_TRACKS)[number]["key"];

export const SCORE_TYPES = [
  { key: "staff", label: "五线谱", desc: "Standard Notation" },
  { key: "numbered", label: "简谱", desc: "Numbered Notation" },
  { key: "guitar", label: "吉他谱", desc: "Guitar Tab" },
  { key: "piano", label: "钢琴谱", desc: "Piano Sheet" },
] as const;

export type ScoreType = (typeof SCORE_TYPES)[number]["key"];