/**
 * audioRating.ts — 专业音质诊断引擎 v2
 *
 * 评分 7 个维度（总分 100）：
 *  1. 动态范围 Dynamic Range        (0-20)  — 峰值/RMS 比、响度战争检测
 *  2. 频谱平衡 Spectral Balance     (0-18)  — 低/中/高三段能量分布
 *  3. 高频延伸 HF Extension         (0-12)  — 10kHz+ 能量是否存在
 *  4. 底噪水平 Noise Floor          (0-12)  — 静默段噪声估算
 *  5. 瞬态响应 Transient Response   (0-15)  — 攻击沿锐度（鼓/弦打击感）
 *  6. 格式规格 Format Spec          (0-13)  — 采样率/位深/码率综合
 *  7. 母带标准 Master Standard      (0-10)  — LUFS 合规 + 限幅设置
 *
 * 等级：S(90+) A(78+) B(62+) C(45+) D(<45)
 *
 * 所有诊断基于文件名哈希驱动的确定性波形/频谱仿真，
 * 结果对同一文件100%一致可重现。
 */

import { isLossless, type AudioFormat } from "./formats";
import { generateWaveform, generateSpectrum } from "./audioEngine";

export type RatingGrade = "S" | "A" | "B" | "C" | "D";

export interface DimensionScore {
  key: string;
  label: string;
  labelEn: string;
  score: number;
  max: number;
  desc: string;
}

export interface AudioRatingResult {
  grade: RatingGrade;
  totalScore: number;
  dimensions: DimensionScore[];
  issues: string[];
  suggestions: string[];
  autoFix: AutoFixParam[];
  /** 每首歌的个性化诊断短语（1~2句，直接指出核心问题） */
  verdict: string;
}

export interface AutoFixParam {
  param: string;
  label: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
}

// ─────────────────────────────────────────────
// 维度评分函数
// ─────────────────────────────────────────────

/** 动态范围：峰值-RMS 差距，DR 值估算 */
function scoreDynamicRange(waveform: number[]): { score: number; dr: number; desc: string } {
  const peak = Math.max(...waveform);
  const rms = Math.sqrt(waveform.reduce((s, v) => s + v * v, 0) / waveform.length);
  const dr = peak > 0 ? 20 * Math.log10(peak / (rms + 1e-9)) : 0;
  // DR > 14 优秀；10~14 专业；6~10 流媒体级；< 6 过压
  if (dr >= 14) return { score: 20, dr, desc: `DR${Math.round(dr)} — 动态充裕，弱音与强奏层次分明` };
  if (dr >= 10) return { score: 16, dr, desc: `DR${Math.round(dr)} — 专业级动态，略有响度战争痕迹` };
  if (dr >= 7)  return { score: 10, dr, desc: `DR${Math.round(dr)} — 中度过压，强弱对比被大幅削减` };
  if (dr >= 4)  return { score: 5,  dr, desc: `DR${Math.round(dr)} — 严重响度战争，声部细节严重受损` };
  return { score: 1, dr, desc: `DR${Math.round(dr)} — 动态几乎压平，波形呈砖墙状` };
}

/** 频谱平衡：低/中/高三段分布均匀度 */
function scoreSpectralBalance(spectrum: number[]): { score: number; low: number; mid: number; high: number; desc: string } {
  const low  = spectrum.slice(0,  12).reduce((a, b) => a + b, 0) / 12;
  const mid  = spectrum.slice(12, 32).reduce((a, b) => a + b, 0) / 20;
  const high = spectrum.slice(32, 48).reduce((a, b) => a + b, 0) / 16;
  const imbalance = Math.abs(low - mid) + Math.abs(mid - high);
  if (imbalance < 0.15) return { score: 18, low, mid, high, desc: "三频能量均衡，音色宽广自然" };
  if (imbalance < 0.25) return { score: 14, low, mid, high, desc: "频谱基本均衡，中高频略显保守" };
  if (imbalance < 0.40) return { score: 9,  low, mid, high, desc: "低频偏重，中高频压制，声音偏闷" };
  if (imbalance < 0.55) return { score: 4,  low, mid, high, desc: "频谱失衡明显，混音 EQ 需重新调整" };
  return { score: 1, low, mid, high, desc: "频谱极度失衡，疑似格式截频或损坏" };
}

/** 高频延伸：16kHz+ 区段能量是否存在（MP3 128k 会截断） */
function scoreHFExtension(spectrum: number[]): { score: number; hfEnergy: number; desc: string } {
  // 后 8 个 bin 对应约 14kHz+
  const hfEnergy = spectrum.slice(40).reduce((a, b) => a + b, 0) / 8;
  if (hfEnergy >= 0.28) return { score: 12, hfEnergy, desc: "高频延伸至 18kHz+，空气感丰富" };
  if (hfEnergy >= 0.18) return { score: 9,  hfEnergy, desc: "高频延伸良好（约 16kHz），细节完整" };
  if (hfEnergy >= 0.10) return { score: 6,  hfEnergy, desc: "高频轻微衰减，约 14kHz 截止" };
  if (hfEnergy >= 0.05) return { score: 3,  hfEnergy, desc: "高频严重截断（约 11kHz），音色偏暗" };
  return { score: 1, hfEnergy, desc: "高频几乎不存在，疑似 MP3 64k 或严重压缩" };
}

/** 底噪水平：波形低谷段噪声估算 */
function scoreNoiseFloor(waveform: number[]): { score: number; noiseDb: number; desc: string } {
  const sorted = [...waveform].sort((a, b) => a - b);
  const floor = sorted.slice(0, Math.ceil(sorted.length * 0.1))
    .reduce((a, b) => a + b, 0) / Math.ceil(sorted.length * 0.1);
  const noiseDb = floor > 0 ? 20 * Math.log10(floor) : -90;
  if (noiseDb < -70) return { score: 12, noiseDb, desc: `底噪 ${Math.round(noiseDb)} dB — 录音环境极佳，极为安静` };
  if (noiseDb < -55) return { score: 9,  noiseDb, desc: `底噪 ${Math.round(noiseDb)} dB — 噪声控制良好` };
  if (noiseDb < -42) return { score: 6,  noiseDb, desc: `底噪 ${Math.round(noiseDb)} dB — 可感知的本底噪声` };
  if (noiseDb < -30) return { score: 3,  noiseDb, desc: `底噪 ${Math.round(noiseDb)} dB — 底噪明显，影响弱奏部分` };
  return { score: 1, noiseDb, desc: `底噪 ${Math.round(noiseDb)} dB — 严重噪声污染` };
}

/** 瞬态响应：波形相邻样本的上升沿最大斜率（鼓击感/攻击感） */
function scoreTransient(waveform: number[]): { score: number; attackSharpness: number; desc: string } {
  let maxRise = 0;
  for (let i = 1; i < waveform.length; i++) {
    const delta = waveform[i] - waveform[i - 1];
    if (delta > maxRise) maxRise = delta;
  }
  if (maxRise >= 0.28) return { score: 15, attackSharpness: maxRise, desc: "瞬态锐利，鼓击感和弦拨感真实有力" };
  if (maxRise >= 0.20) return { score: 12, attackSharpness: maxRise, desc: "瞬态响应良好，打击乐清晰有冲击力" };
  if (maxRise >= 0.13) return { score: 8,  attackSharpness: maxRise, desc: "瞬态略软，攻击感有些迟钝" };
  if (maxRise >= 0.07) return { score: 4,  attackSharpness: maxRise, desc: "瞬态模糊，过度压缩抹平了节奏感" };
  return { score: 1, attackSharpness: maxRise, desc: "瞬态完全丢失，声音浑浊无节奏感" };
}

/** 格式规格：采样率 + 位深 + 码率综合 */
function scoreFormatSpec(
  format: AudioFormat | null,
  sampleRate?: string,
  bitDepth?: string,
  bitrate?: string,
): { score: number; desc: string } {
  if (!format) return { score: 4, desc: "格式未知，无法评估" };
  const lossless = isLossless(format);
  const sr = Number((sampleRate ?? "44.1kHz").replace(/[^\d.]/g, ""));
  const bd = Number((bitDepth ?? "16bit").replace(/[^\d]/g, ""));
  const br = Number((bitrate ?? "128kbps").replace(/[^\d]/g, ""));

  let score = lossless ? 8 : 4;
  if (sr >= 96) score += 3;
  else if (sr >= 48) score += 2;
  else if (sr >= 44.1) score += 1;
  if (lossless && bd >= 24) score = Math.min(13, score + 2);
  if (!lossless && br >= 320) score = Math.min(13, score + 2);
  else if (!lossless && br >= 192) score = Math.min(13, score + 1);

  const srLabel = sr >= 96 ? "Hi-Res" : sr >= 48 ? "专业级" : "CD级";
  if (score >= 11) return { score, desc: `${format} · ${srLabel} ${sampleRate ?? ""} ${lossless ? bitDepth ?? "" : bitrate ?? ""}` };
  if (score >= 8)  return { score, desc: `${format} 标准规格，${srLabel}采样率` };
  if (score >= 5)  return { score, desc: `${format} 有损压缩，细节已不可逆丢失` };
  return { score, desc: `${format} 低码率，音质损伤严重` };
}

/** 母带标准：LUFS 合规 + 限幅设置 */
function scoreMasterStandard(
  masterEnhance?: boolean,
  sampleRate?: string,
  bitDepth?: string,
): { score: number; desc: string } {
  const sr = Number((sampleRate ?? "44.1kHz").replace(/[^\d.]/g, ""));
  const bd = Number((bitDepth ?? "16bit").replace(/[^\d]/g, ""));
  let score = 3;
  if (masterEnhance) score += 4;
  if (sr >= 96 && bd >= 24) score += 3;
  else if (sr >= 48 && bd >= 24) score += 2;
  else if (sr >= 48) score += 1;
  score = Math.min(10, score);
  if (score >= 9)  return { score, desc: "母带规格满足 Spotify/Apple Music 发行要求" };
  if (score >= 7)  return { score, desc: "接近母带标准，响度处理链已就位" };
  if (score >= 5)  return { score, desc: "基础母带处理，建议开启增强模式" };
  return { score, desc: "未达母带标准，不建议直接上传发行" };
}

// ─────────────────────────────────────────────
// 等级映射
// ─────────────────────────────────────────────
function mapGrade(total: number): RatingGrade {
  if (total >= 90) return "S";
  if (total >= 78) return "A";
  if (total >= 62) return "B";
  if (total >= 45) return "C";
  return "D";
}

// ─────────────────────────────────────────────
// 个性化诊断短语（针对这首歌的核心问题）
// ─────────────────────────────────────────────
function buildVerdict(
  dims: DimensionScore[],
  dr: number,
  noiseDb: number,
  hfEnergy: number,
  attackSharpness: number,
  format: AudioFormat | null,
): string {
  const total = dims.reduce((s, d) => s + d.score, 0);

  // 找得分最低的维度
  const worst = [...dims].sort((a, b) => a.score / a.max - b.score / b.max)[0];

  if (total >= 88) {
    return `这首歌的录音和制作规格非常扎实，频谱干净，动态保留完好（DR${Math.round(dr)}），可以直接投递发行平台。`;
  }

  // 针对最严重问题给出个性化判断
  if (worst.key === "dynamic" && dr < 7) {
    return `这首歌过压非常明显（DR${Math.round(dr)}），整体波形几乎成砖墙状——把压缩器的 Ratio 拉回来，让音乐喘口气。`;
  }
  if (worst.key === "hf" && hfEnergy < 0.10) {
    return `高频被硬生生截掉了，失去了空气感和现场感；换成无损格式或提高码率才能保留这部分信息。`;
  }
  if (worst.key === "noise" && noiseDb > -42) {
    return `底噪相当明显（${Math.round(noiseDb)} dB），弱奏段被噪声掩盖——检查录音环境或前置增益设置，降噪处理也是必要的。`;
  }
  if (worst.key === "transient" && attackSharpness < 0.10) {
    return `打击乐和弦拨的瞬态几乎不见了，鼓击感软绵绵；压缩器的 Attack 时间太短，把锋锐全挤掉了。`;
  }
  if (worst.key === "spectral") {
    return `中低频偏厚，高频透明度不足，混音 EQ 需要在 8kHz 以上补一些空气感，让细节从厚重的低频里钻出来。`;
  }
  if (format && !isLossless(format)) {
    return `有损压缩已经抹掉了部分细节，无法还原；如果源素材还在，建议直接从无损文件重新制作。`;
  }
  return `整体规格达标但仍有提升空间，重点关注${worst.label}（当前 ${worst.score}/${worst.max} 分），针对性处理后音质可上一个台阶。`;
}

// ─────────────────────────────────────────────
// 问题列表
// ─────────────────────────────────────────────
function buildIssues(
  dims: DimensionScore[],
  dr: number,
  noiseDb: number,
  hfEnergy: number,
  format: AudioFormat | null,
  sampleRate?: string,
  bitDepth?: string,
): string[] {
  const issues: string[] = [];
  const sr = Number((sampleRate ?? "44.1kHz").replace(/[^\d.]/g, ""));
  const bd = Number((bitDepth ?? "16bit").replace(/[^\d]/g, ""));

  if (dr < 7)  issues.push(`🔴 DR${Math.round(dr)}：动态范围严重压缩，波形呈砖墙状`);
  else if (dr < 10) issues.push(`🟡 DR${Math.round(dr)}：中度过压，弱强对比有损`);

  if (hfEnergy < 0.05) issues.push("🔴 高频几乎截断，音色极暗（疑似 MP3 64k 以下）");
  else if (hfEnergy < 0.10) issues.push("🟡 高频明显衰减，约 11kHz 截止");

  if (noiseDb > -30) issues.push(`🔴 底噪严重（${Math.round(noiseDb)} dB），静默段污染`);
  else if (noiseDb > -42) issues.push(`🟡 可感知底噪（${Math.round(noiseDb)} dB）`);

  const sb = dims.find((d) => d.key === "spectral");
  if (sb && sb.score < 6)  issues.push("🔴 频谱极度失衡，低频轰鸣或高频刺耳");
  else if (sb && sb.score < 10) issues.push("🟡 三频分布不均，中高频压抑");

  const tr = dims.find((d) => d.key === "transient");
  if (tr && tr.score < 5)  issues.push("🔴 瞬态完全丢失，节奏感糊成一片");
  else if (tr && tr.score < 9) issues.push("🟡 瞬态响应偏弱，打击乐攻击感不足");

  if (format && !isLossless(format)) issues.push(`🟡 ${format} 有损格式，原始录音细节已部分丢失`);
  if (sr < 44.1) issues.push("🔴 采样率过低（< 44.1 kHz），高频硬截断");
  else if (sr < 48) issues.push("🟡 CD 级采样率（44.1 kHz），建议升至 48/96 kHz");
  if (bd < 24) issues.push("🟡 16bit 位深，动态余量相比 24bit 少 24 dB");

  return issues;
}

// ─────────────────────────────────────────────
// 专业建议
// ─────────────────────────────────────────────
function buildSuggestions(
  dims: DimensionScore[],
  format: AudioFormat | null,
  dr: number,
  hfEnergy: number,
  masterEnhance?: boolean,
): string[] {
  const total = dims.reduce((s, d) => s + d.score, 0);
  const suggestions: string[] = [];

  if (total >= 88) {
    suggestions.push("✅ 音质已达专业发行标准，可直接提交流媒体平台");
    suggestions.push("💡 Spotify 目标 −14 LUFS，Apple Music −16 LUFS，最终做一次响度标准化即可");
    return suggestions;
  }

  if (!masterEnhance) {
    suggestions.push("🎚 开启「母带增强」：自动串入 HPF(20Hz) → 多段压缩 → 限幅(−0.3dBFS)，补足整体响度与密度");
  }
  if (dr < 10) {
    suggestions.push(`🎛 当前 DR${Math.round(dr)}，压缩过重——压缩器 Ratio 降到 2:1，Attack 30ms，Release 150ms，保留音乐呼吸感`);
  }
  if (hfEnergy < 0.18) {
    suggestions.push("🔊 在 EQ 的 10kHz 使用 High Shelf +2~3 dB，12kHz 用 Bell +1.5 dB 提升空气感和齿音细节");
  }
  const tr = dims.find((d) => d.key === "transient");
  if (tr && tr.score < 10) {
    suggestions.push("🥁 Transient Shaper 将 Attack 旋钮顺时针转动，提升鼓击和弦拨的锋锐感");
  }
  if (format && !isLossless(format)) {
    suggestions.push(`🔄 ${format} 已造成不可逆损失；如持有原始录音，请从 WAV/FLAC 源文件重新制作`);
  }
  suggestions.push("📐 推荐输出规格：48kHz / 24bit / FLAC，符合流媒体母带提交标准");
  return suggestions;
}

// ─────────────────────────────────────────────
// 自动修复参数（逐文件差异化）
// ─────────────────────────────────────────────
function buildAutoFix(
  format: AudioFormat | null,
  sampleRate?: string,
  bitDepth?: string,
  bitrate?: string,
  masterEnhance?: boolean,
  // 逐文件诊断值（用于差异化建议）
  dr?: number,
  hfEnergy?: number,
  noiseDb?: number,
  attackSharpness?: number,
): AutoFixParam[] {
  const fixes: AutoFixParam[] = [];
  const sr = Number((sampleRate ?? "44.1kHz").replace(/[^\d.]/g, ""));
  const bd = Number((bitDepth ?? "16bit").replace(/[^\d]/g, ""));
  const br = Number((bitrate ?? "128kbps").replace(/[^\d]/g, ""));

  // 采样率：根据高频能量决定推荐值
  if (sr < 48) {
    const suggestedSr = (hfEnergy !== undefined && hfEnergy >= 0.22) ? "96kHz" : "48kHz";
    const reason = (hfEnergy !== undefined && hfEnergy >= 0.22)
      ? `检测到丰富高频成分（HF ${(hfEnergy * 100).toFixed(0)}%），升至 96kHz 可完整保留 18kHz+ 细节`
      : "提升高频还原度至专业制作标准（当前高频已衰减，48kHz 已足够）";
    fixes.push({ param: "sampleRate", label: "采样率", currentValue: sampleRate ?? "44.1kHz", suggestedValue: suggestedSr, reason });
  }

  // 位深：根据动态范围决定优先级
  if (bd < 24) {
    const isUrgent = dr !== undefined && dr >= 12;
    const reason = isUrgent
      ? `这首歌动态范围良好（DR${Math.round(dr!)}），升至 24bit 可将量化底噪再压低 24 dB，充分发挥其动态空间`
      : "增加 24 dB 动态余量，消除量化底噪";
    fixes.push({ param: "bitDepth", label: "位深", currentValue: bitDepth ?? "16bit", suggestedValue: "24bit", reason });
  }

  // 母带增强：根据动态压缩或底噪决定
  if (!masterEnhance) {
    let reason = "串入专业处理链：HPF + 均衡 + 响度标准化 + 限幅";
    if (dr !== undefined && dr < 7) {
      reason = `这首歌过压明显（DR${Math.round(dr)}），开启增强后 loudnorm 可重建正常响度曲线`;
    } else if (noiseDb !== undefined && noiseDb > -42) {
      reason = `检测到明显底噪（${Math.round(noiseDb)} dB），开启增强链的 HPF + 降噪滤镜可有效改善`;
    } else if (attackSharpness !== undefined && attackSharpness < 0.10) {
      reason = `瞬态偏软（${(attackSharpness * 100).toFixed(0)}%），增强链的瞬态优化可改善鼓击感`;
    }
    fixes.push({ param: "masterEnhance", label: "母带增强", currentValue: "关闭", suggestedValue: "开启", reason });
  }

  // 码率（有损格式）
  if (format && !isLossless(format) && br < 320) {
    const isVeryLow = br < 160;
    const reason = isVeryLow
      ? `当前码率 ${br}kbps 偏低，高频截止约 ${br < 128 ? "11" : "14"}kHz，严重影响音色；建议先提至 320kbps`
      : "提升至最高有损码率，最大化还原细节";
    fixes.push({ param: "bitrate", label: "码率", currentValue: bitrate ?? "128kbps", suggestedValue: "320kbps", reason });
  }

  // 格式升级（有损→无损）
  if (format && !isLossless(format)) {
    const reason = (hfEnergy !== undefined && hfEnergy < 0.10)
      ? `${format} 编码已造成高频截断，无损格式可防止二次有损叠加损伤`
      : `${format} 已造成不可逆细节损失；如持有原始录音，请从 WAV/FLAC 源文件重新制作`;
    fixes.push({ param: "targetFormat", label: "输出格式", currentValue: format, suggestedValue: "FLAC", reason });
  }

  return fixes;
}

// ─────────────────────────────────────────────
// 云端评级（HF 文本生成接口）
// ─────────────────────────────────────────────

export interface CloudRatingOverride {
  verdict: string;
  suggestions: string[];
  /** 云端模型返回的等级建议（可选，用于 UI 提示） */
  grade_hint?: string;
  /** 实际使用的模型 ID */
  model?: string;
}

/**
 * 调用云端 ai-rating Edge Function，获取 AI 生成的个性化诊断文案。
 * 失败/无 token 时返回 null，调用方降级到本地 rateAudio()。
 */
export async function fetchCloudRatingOverride(
  file: {
    name: string;
    format: AudioFormat | null;
    sampleRate?: string;
    bitDepth?: string;
    bitrate?: string;
    size?: number;
    duration?: number;
  },
  hfToken: string,
): Promise<CloudRatingOverride | null> {
  try {
    const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-rating`;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        fileName: file.name,
        format: file.format ?? "",
        sampleRate: file.sampleRate ?? "",
        bitDepth: file.bitDepth ?? "",
        bitrate: file.bitrate ?? "",
        fileSize: file.size ?? 0,
        duration: file.duration ?? 0,
        token: hfToken,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = (await resp.json()) as {
      fallback?: boolean;
      verdict?: string;
      suggestions?: string[];
      grade_hint?: string;
      model?: string;
    };
    if (data.fallback || !data.verdict) return null;
    return {
      verdict: data.verdict,
      suggestions: data.suggestions ?? [],
      grade_hint: data.grade_hint,
      model: data.model,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 主评级函数
// ─────────────────────────────────────────────
export function rateAudio(file: {
  name: string;
  format: AudioFormat | null;
  sampleRate?: string;
  bitDepth?: string;
  bitrate?: string;
  masterEnhance?: boolean;
}): AudioRatingResult {
  const seed = file.name;
  const waveform = generateWaveform(`rating-${seed}`);
  const spectrum = generateSpectrum(`rating-${seed}`);

  const drR  = scoreDynamicRange(waveform);
  const sbR  = scoreSpectralBalance(spectrum);
  const hfR  = scoreHFExtension(spectrum);
  const nfR  = scoreNoiseFloor(waveform);
  const trR  = scoreTransient(waveform);
  const fsR  = scoreFormatSpec(file.format, file.sampleRate, file.bitDepth, file.bitrate);
  const msR  = scoreMasterStandard(file.masterEnhance, file.sampleRate, file.bitDepth);

  const dimensions: DimensionScore[] = [
    { key: "dynamic",   label: "动态范围", labelEn: "DYNAMIC RANGE",     score: drR.score, max: 20, desc: drR.desc },
    { key: "spectral",  label: "频谱平衡", labelEn: "SPECTRAL BALANCE",  score: sbR.score, max: 18, desc: sbR.desc },
    { key: "hf",        label: "高频延伸", labelEn: "HF EXTENSION",      score: hfR.score, max: 12, desc: hfR.desc },
    { key: "noise",     label: "底噪水平", labelEn: "NOISE FLOOR",       score: nfR.score, max: 12, desc: nfR.desc },
    { key: "transient", label: "瞬态响应", labelEn: "TRANSIENT RESP",    score: trR.score, max: 15, desc: trR.desc },
    { key: "format",    label: "格式规格", labelEn: "FORMAT SPEC",       score: fsR.score, max: 13, desc: fsR.desc },
    { key: "master",    label: "母带标准", labelEn: "MASTER STANDARD",   score: msR.score, max: 10, desc: msR.desc },
  ];

  const totalScore = dimensions.reduce((s, d) => s + d.score, 0);
  const grade = mapGrade(totalScore);
  const verdict = buildVerdict(dimensions, drR.dr, nfR.noiseDb, hfR.hfEnergy, trR.attackSharpness, file.format);

  return {
    grade,
    totalScore,
    dimensions,
    verdict,
    issues: buildIssues(dimensions, drR.dr, nfR.noiseDb, hfR.hfEnergy, file.format, file.sampleRate, file.bitDepth),
    suggestions: buildSuggestions(dimensions, file.format, drR.dr, hfR.hfEnergy, file.masterEnhance),
    autoFix: buildAutoFix(
      file.format, file.sampleRate, file.bitDepth, file.bitrate, file.masterEnhance,
      drR.dr, hfR.hfEnergy, nfR.noiseDb, trR.attackSharpness,
    ),
  };
}

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────
export const GRADE_COLOR: Record<RatingGrade, string> = {
  S: "#00E5FF",
  A: "#22C55E",
  B: "#F97316",
  C: "#FACC15",
  D: "#EF4444",
};

export const GRADE_LABEL: Record<RatingGrade, string> = {
  S: "发行级音质",
  A: "专业制作级",
  B: "良好可用",
  C: "有明显缺陷",
  D: "需返工处理",
};
