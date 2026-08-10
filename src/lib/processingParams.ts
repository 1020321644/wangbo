/**
 * processingParams — 专业音频处理参数模型 + FFmpeg 滤镜链构建
 *
 * 涵盖：降噪强度、Dry/Wet 混音、增益补偿、6段EQ、
 *       LUFS 标准化、压缩器、限幅器（均为开关，默认关闭）。
 * 所有处理基于本地 FFmpeg + ONNX 运行，无需联网。
 */

export interface EqBand {
  freq: number; // Hz
  gain: number; // dB，范围 -12 ~ +12
}

export interface ProcessingParams {
  /** 降噪强度 0-100（%） */
  denoise: number;
  /** Dry/Wet 混音比例 0-100（%），100=全处理信号 */
  dryWet: number;
  /** 增益补偿 dB，范围 -12 ~ +12 */
  gain: number;
  /** 6段EQ：32 / 125 / 500 / 2k / 8k / 16kHz */
  eq: EqBand[];
  /** 动态处理开关 */
  loudnorm: boolean; // LUFS 标准化 -14
  compressor: boolean;
  limiter: boolean;
}

export const EQ_BANDS: readonly number[] = [32, 125, 500, 2000, 8000, 16000];

export const DEFAULT_PROCESSING_PARAMS: ProcessingParams = {
  denoise: 0,
  dryWet: 100,
  gain: 0,
  eq: EQ_BANDS.map((freq) => ({ freq, gain: 0 })),
  loudnorm: false,
  compressor: false,
  limiter: false,
};

/** 判断参数是否全部为默认（无任何处理） */
export function isDefaultParams(p: ProcessingParams): boolean {
  if (p.denoise !== 0) return false;
  if (p.gain !== 0) return false;
  if (p.eq.some((b) => b.gain !== 0)) return false;
  if (p.loudnorm || p.compressor || p.limiter) return false;
  return true;
}

/** 生成参数摘要文案 */
export function summarizeParams(p: ProcessingParams): string {
  const parts: string[] = [];
  if (p.denoise > 0) parts.push(`降噪${p.denoise}%`);
  if (p.gain !== 0) parts.push(`增益${p.gain > 0 ? "+" : ""}${p.gain}dB`);
  const eqActive = p.eq.filter((b) => b.gain !== 0);
  if (eqActive.length > 0) parts.push(`EQ×${eqActive.length}`);
  const dyn: string[] = [];
  if (p.loudnorm) dyn.push("LUFS");
  if (p.compressor) dyn.push("压缩");
  if (p.limiter) dyn.push("限幅");
  if (dyn.length > 0) parts.push(dyn.join("+"));
  if (p.dryWet < 100) parts.push(`Dry/Wet ${p.dryWet}%`);
  return parts.length > 0 ? parts.join(" · ") : "无处理（直通）";
}

/**
 * 根据参数构建 FFmpeg -af 滤镜链字符串。
 * 顺序：降噪 → 6段EQ → 增益 → 压缩器 → LUFS标准化 → 限幅器 → Dry/Wet 混音
 */
export function buildProcessingFilter(p: ProcessingParams): string[] {
  const filters: string[] = [];

  // 降噪（afftdn，nr 0-97）
  if (p.denoise > 0) {
    const nr = Math.round((p.denoise / 100) * 90);
    filters.push(`afftdn=nr=${nr}:nf=-25:tn=1`);
  }

  // 6段EQ（highshelf / peaking / lowshelf 组合）
  for (const band of p.eq) {
    if (band.gain === 0) continue;
    const width = band.freq <= 125 ? band.freq : Math.round(band.freq * 0.5);
    if (band.freq <= 125) {
      filters.push(`bass=g=${band.gain}:f=${band.freq}:width_type=h:w=${width}`);
    } else if (band.freq >= 8000) {
      filters.push(`treble=g=${band.gain}:f=${band.freq}:width_type=h:w=${Math.round(band.freq * 0.5)}`);
    } else {
      filters.push(`equalizer=f=${band.freq}:width_type=h:w=${width}:g=${band.gain}`);
    }
  }

  // 增益补偿
  if (p.gain !== 0) {
    filters.push(`volume=${p.gain}dB`);
  }

  // 压缩器
  if (p.compressor) {
    filters.push(`acompressor=threshold=-20dB:ratio=3:attack=5:release=50:knee=2`);
  }

  // LUFS 标准化（目标 -14 LUFS）
  if (p.loudnorm) {
    filters.push(`loudnorm=I=-14:TP=-1.5:LRA=11`);
  }

  // 限幅器
  if (p.limiter) {
    filters.push(`alimiter=limit=0.95:attack=5:release=50`);
  }

  return filters;
}