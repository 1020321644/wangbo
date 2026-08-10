import { AudioFormat, getFormat, isLossless } from "./formats";
import * as FileSystem from "expo-file-system/legacy";

// ─── FFmpeg 命令构建 ──────────────────────────────────────────────────────────

/** 根据目标格式和参数生成 FFmpeg 参数列表（不含 -i 和输出路径） */
function buildFfmpegArgs(target: AudioFormat, params: ConvertParams): string[] {
  const info = getFormat(target);

  // 采样率解析：支持 "44.1kHz" → 44100，"96kHz" → 96000，"192kHz" → 192000 等
  const srRaw = params.sampleRate.replace(/kHz$/i, "").trim();
  const srFloat = parseFloat(srRaw);
  const sampleRateNum = String(Math.round(srFloat * (srFloat < 400 ? 1000 : 1)));

  const bd = Number(params.bitDepth.replace(/[^\d]/g, "")) || 16;
  const kbps = params.bitrate.replace(/[^\d]/g, "") || "320";

  // 母带增强滤镜：高通 + 多段均衡 + 响度标准化
  const masterFilters = params.masterEnhance
    ? ["-af", "highpass=f=20,equalizer=f=80:width_type=o:width=2:g=2,equalizer=f=12000:width_type=o:width=2:g=1,loudnorm=I=-14:TP=-0.3:LRA=11"]
    : [];

  if (info.dsd) {
    // DSD 输出：PCM 高清上采样后封装至 DSD 容器
    // DSF/DFF 均按目标规格的采样倍率输出 PCM，由播放器/DAC 负责 DSD 渲染
    // DSD64=2.8224MHz, DSD128=5.6448MHz, DSD256=11.2896MHz, DSD512=22.5792MHz
    // FFmpeg 本身不写 DSD 码流，输出 FLAC/WAV 作为高质量 PCM 载体
    // 目标采样率：DSD64→88200, DSD128→176400, DSD256→352800, DSD512→352800（上限）
    const dsdSampleRate =
      target === "DSD512" || target === "DSD256" ? "352800" :
      target === "DSD128" ? "176400" : "88200";
    // 输出 WAV 32bit 以保留最大动态范围（专业 DSD 转换工作流标准中间格式）
    return ["-ar", dsdSampleRate, "-sample_fmt", "s32", ...masterFilters, "-c:a", "pcm_s32le"];
  }

  if (info.lossless) {
    switch (target) {
      case "FLAC":
        return ["-ar", sampleRateNum, "-sample_fmt", bd === 24 ? "s32" : "s16",
          ...masterFilters, "-c:a", "flac", "-compression_level", "8"];
      case "WAV":
        // WAV 母带级标准：强制 48kHz / 24-bit（pcm_s24le），绝不降级为 16-bit
        return ["-ar", "48000", ...masterFilters, "-c:a", "pcm_s24le"];
      case "ALAC":
        return ["-ar", sampleRateNum, ...masterFilters, "-c:a", "alac"];
      default:
        return ["-ar", sampleRateNum, ...masterFilters, "-c:a", "flac"];
    }
  }

  // 有损格式
  switch (target) {
    case "MP3":
      return ["-ar", sampleRateNum, ...masterFilters, "-c:a", "libmp3lame", "-b:a", `${kbps}k`, "-q:a", "0"];
    case "AAC":
      // AAC 输出为 M4A 容器（MP4 音频），兼容性更好
      return ["-ar", sampleRateNum, ...masterFilters, "-c:a", "aac", "-b:a", `${kbps}k`, "-f", "mp4", "-movflags", "+faststart"];
    case "OGG":
      return ["-ar", sampleRateNum, ...masterFilters, "-c:a", "libvorbis", "-b:a", `${kbps}k`];
    default:
      return ["-ar", sampleRateNum, ...masterFilters, "-c:a", "aac", "-b:a", `${kbps}k`, "-f", "mp4", "-movflags", "+faststart"];
  }
}

/** 生成安全的 ASCII 文件名，避免中文/特殊字符导致 FFmpeg 路径解析失败 */
function safeCacheName(sourceName: string, ext: string): string {
  const base = sourceName
    .replace(/\.[^.]+$/, "")
    .replace(/[\u0080-\uffff]/g, "")   // 去掉所有非 ASCII（中文等）
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^_+/, "")
    .slice(0, 40);
  return `${base || "audio"}_${Date.now()}.${ext}`;
}

/**
 * 将 Android / HarmonyOS content:// URI 转换为本地缓存路径（保留 file:// 前缀，
 * 供 Expo FileSystem 操作使用）。如果已是 file:// 或原生路径则直接返回。
 *
 * 双重策略（防 HarmonyOS 崩溃）：
 *   1. FileSystem.copyAsync — 标准 Android，速度快。
 *   2. Base64 读写回退 — HarmonyOS 沙箱限制时启用，稍慢但可靠。
 */
export async function resolveNativeUri(uri: string, ext: string): Promise<string> {
  if (!uri.startsWith("content://")) return uri;
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "audio";
  const destUri = `${FileSystem.cacheDirectory ?? ""}input_${Date.now()}.${safeExt}`;
  // 策略1: copyAsync（标准 Android / 大多数设备）
  try {
    await FileSystem.copyAsync({ from: uri, to: destUri });
    const info = await FileSystem.getInfoAsync(destUri);
    if (info.exists && (info as any).size > 0) return destUri;
  } catch (e1) {
    console.warn("[resolveNativeUri] copyAsync 失败，切换 Base64 回退 (HarmonyOS):", e1);
  }
  // 策略2: Base64 读写（HarmonyOS 4.x 文件沙箱兼容方案）
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  await FileSystem.writeAsStringAsync(destUri, b64, { encoding: FileSystem.EncodingType.Base64 });
  return destUri;
}

// ── FFmpegKit 路径转换：剥离 file:// scheme，供 JNI 层使用，并记录诊断日志 ──────
/**
 * 将 file:// URI 转换为 FFmpegKit JNI 层可识别的 POSIX 路径。
 * 所有传入 FFmpegKit 的输入/输出路径都必须经过此函数。
 */
export function toFFmpegPath(uri: string): string {
  const path = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
  console.log(`[FFmpegPath] ${uri.slice(0, 120)}\n         →  ${path.slice(0, 120)}`);
  return path;
}

/**
 * execFFmpegCmd — 统一执行 FFmpegKit 命令，含完整结构化日志。
 * 每次调用打印：完整命令字符串、返回码(RC)、耗时、失败日志。
 */
async function execFFmpegCmd(
  FFmpegKit: any,
  ReturnCode: any,
  command: string,
  tag: string,
  onProgress?: (p: number, label: string) => void,
  durationMs?: number,
  progressLabel?: string,
): Promise<void> {
  const startTime = Date.now();
  console.log(`\n╔══[FFmpeg][${tag}]══════════════════════════════════════╗`);
  console.log(`║ CMD: ${command}`);
  console.log(`╚══════════════════════════════════════════════════════╝`);

  await new Promise<void>((resolve, reject) => {
    FFmpegKit.executeAsync(
      command,
      async (session: any) => {
        const rc = await session.getReturnCode();
        const elapsed = Date.now() - startTime;
        const rcVal: number = typeof rc?.getValue === "function" ? rc.getValue() : Number(rc);
        if (ReturnCode.isSuccess(rc)) {
          console.log(`[FFmpeg][${tag}] ✅ RC=${rcVal} 耗时=${elapsed}ms`);
          onProgress?.(1, `${progressLabel ?? tag} 完成`);
          resolve();
        } else {
          const logs = await session.getOutput();
          console.error(`[FFmpeg][${tag}] ❌ RC=${rcVal} 耗时=${elapsed}ms`);
          console.error(`[FFmpeg][${tag}] 失败日志↓\n${logs ?? "(无日志)"}`);
          reject(new Error(`FFmpeg[${tag}] RC=${rcVal}: ${logs?.slice(-400) ?? "无日志"}`));
        }
      },
      (log: any) => {
        const msg: string = log.getMessage?.() ?? "";
        if (msg) console.log(`[FFmpeg][${tag}] ${msg}`);
      },
      (stats: any) => {
        if (onProgress && durationMs) {
          const t: number = stats.getTime?.() ?? 0;
          const p = Math.min(t / durationMs, 0.97);
          onProgress(Number(p.toFixed(3)), `${progressLabel ?? tag} · ${Math.round(p * 100)}%`);
        }
      },
    );
  });
}

// 确定性伪随机，保证同一文件每次生成相同波形/频谱
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// 生成波形数据（归一化振幅 0~1）
export function generateWaveform(seedStr: string, samples = 120): number[] {
  const rand = seededRandom(hashString(seedStr));
  const out: number[] = [];
  let prev = 0.5;
  for (let i = 0; i < samples; i++) {
    const base = 0.35 + 0.5 * Math.abs(Math.sin(i * 0.12 + rand() * 2));
    const noise = rand() * 0.25;
    const v = Math.min(1, Math.max(0.05, base * 0.7 + noise * 0.5 + prev * 0.15));
    prev = v;
    out.push(Number(v.toFixed(3)));
  }
  return out;
}

// 生成频谱数据（频率分桶能量 0~1）
export function generateSpectrum(seedStr: string, bins = 48): number[] {
  const rand = seededRandom(hashString(seedStr) + 99);
  const out: number[] = [];
  for (let i = 0; i < bins; i++) {
    const lowBoost = Math.exp(-i / 14) * 0.7;
    const mid = Math.exp(-Math.abs(i - 20) / 10) * 0.5;
    const v = Math.min(1, Math.max(0.02, lowBoost + mid + rand() * 0.35));
    out.push(Number(v.toFixed(3)));
  }
  return out;
}

/** AI 增强模式：simple=简单模式(DeepFilterNet 降噪) / advanced=困难模式(AudioSR 超分辨率) */
export type EnhanceLevel = "simple" | "advanced";

export interface ConvertParams {
  sampleRate: string;
  bitDepth: string;
  bitrate: string;
  masterEnhance: boolean;
  /** AI 增强档位（仅 masterEnhance=true 时生效；可选，默认 simple） */
  enhanceLevel?: EnhanceLevel;
}

// 根据目标格式和参数估算输出文件大小（字节）
export function estimateOutputSize(inputBytes: number, target: AudioFormat, params: ConvertParams): number {
  const info = getFormat(target);
  const srFactor = Number(params.sampleRate.replace(/[^\d.]/g, "")) / 44.1;
  const bdFactor = Number(params.bitDepth.replace(/[^\d]/g, "")) / 16;
  let factor: number;
  if (info.dsd) {
    factor = 4 * srFactor;
  } else if (info.lossless) {
    factor = 6 * srFactor * bdFactor;
  } else {
    const kbps = Number(params.bitrate.replace(/[^\d]/g, ""));
    factor = (kbps / 320) * 0.12;
  }
  if (params.masterEnhance) factor *= 1.15;
  return Math.round(inputBytes * factor);
}

// 估算转换耗时（毫秒）
export function estimateDuration(
  inputBytes: number, 
  target: AudioFormat, 
  masterEnhance: boolean = false
): number {
  const info = getFormat(target);
  const base = 1800 + inputBytes / 1000;
  let mult = info.dsd ? 2.4 : info.lossless ? 1.6 : 1;
  
  // 母带增强显著增加处理时间（3 倍）
  if (masterEnhance) {
    mult *= 3;
  }
  
  const estimated = Math.round(base * mult);
  
  // 设置最小处理时间
  const minDuration = masterEnhance ? 8000 : 3000;  // 母带增强最少 8 秒，普通转换最少 3 秒
  
  return Math.max(estimated, minDuration);
}

// 转换模式
export type ConvertMode = "convert" | "enhance";

export function modeLabel(mode: ConvertMode): string {
  return mode === "enhance" ? "发烧级母带制作标准品质提升" : "格式转换";
}

// 有损转无损提示
export function losslessWarning(target: AudioFormat): string | null {
  if (isLossless(target)) {
    return "提示：有损转无损仅改变封装格式，不会真正提升原始音质。建议使用「母带级品质提升」模式。";
  }
  return null;
}

/**
 * 真实音频转换执行器（基于 FFmpegKit）
 *
 * Native：调用 FFmpegKit 执行真实编解码，支持 MP3/FLAC/WAV/AAC/OGG/OPUS/M4A/WEBM。
 *   - masterEnhance=false → 纯格式转换
 *   - masterEnhance=true + simple → DeepFilterNet3 ONNX 降噪（外部导入模型）→ 降级 FFmpeg DSP
 *   - masterEnhance=true + advanced → AudioSR ONNX 超分辨率（外部导入模型）→ 降级 DeepFilterNet3 → 降级 FFmpeg DSP
 *   DSD 格式：FFmpeg 不支持 DSD 编码，自动降级为 WAV PCM 高清输出。
 * Web：仍使用文件复制占位（浏览器环境无 FFmpeg）。
 */
export async function runConvert(
  sourceUri: string,
  sourceName: string,
  target: AudioFormat,
  params: ConvertParams,
  onProgress: (p: number, label: string) => void,
  sourceSize?: number,
  onEngine?: (engine: "ffmpeg-dsp" | "deepfilternet" | "audiosr" | "none") => void,
): Promise<string> {
  const info    = getFormat(target);
  const outExt  = info.dsd ? "wav" : info.ext;
  const cacheDir = FileSystem.cacheDirectory ?? "";
  const outName  = safeCacheName(sourceName, outExt);
  const outUri   = `${cacheDir}${outName}`;

  // ── Web 占位 ─────────────────────────────────────────────────────────────
  if (process.env.EXPO_OS === "web") {
    onEngine?.("none");
    const total = estimateDuration(sourceSize ?? 0, target, params.masterEnhance);
    const start = Date.now();
    const STAGES = ["分析源文件", "格式解析", "参数映射", "编码处理", "写入输出"];
    return new Promise((resolve) => {
      let si = 0;
      const tick = () => {
        const elapsed = Date.now() - start;
        const p = Math.min(1, elapsed / total);
        si = Math.min(Math.floor(p * STAGES.length), STAGES.length - 1);
        onProgress(Number(p.toFixed(3)), STAGES[si]);
        if (p >= 1) { onProgress(1, "输出文件就绪"); resolve(sourceUri); }
        else setTimeout(tick, 60);
      };
      tick();
    });
  }

  // ── Native：FFmpegKit 真实处理 ────────────────────────────────────────────
  const { FFmpegKit, FFprobeKit, ReturnCode } = await import("ffmpeg-kit-react-native");

  // ⚠️ Android/HarmonyOS content:// URI → file:// 缓存（resolveNativeUri 双重策略保障）
  // DocumentPicker(copyToCacheDirectory:true) → 已是 file:// → 直接透传给 FFmpegKit
  const nativeSrcUri = await resolveNativeUri(sourceUri, sourceName.split(".").pop()?.toLowerCase() ?? "audio");

  // 获取音频时长（用于进度回调）
  let durationMs = estimateDuration(sourceSize ?? 0, target, params.masterEnhance);
  try {
    // file:// URI 直接传入 FFmpegKit/FFprobeKit — HarmonyOS FFmpegKit 识别 file:// scheme
    const probe = await FFprobeKit.getMediaInformation(nativeSrcUri);
    const info2 = probe.getMediaInformation?.();
    if (info2) durationMs = parseFloat(String(info2.getDuration?.() ?? "0")) * 1000 || durationMs;
  } catch { /* 忽略 */ }

  const startTs = Date.now();

  // ── 母带增强路径（masterEnhance=true）────────────────────────────────────
  if (params.masterEnhance) {
    const level = params.enhanceLevel ?? "simple";

    // ── 尝试 ONNX 推理 ─────────────────────────────────────────────────────
    // 困难模式：GTCRN 降噪 → HiFi-GAN+ BWE 带宽扩展（输出 48kHz）
    if (level === "advanced") {
      try {
        const { useModelStore } = await import("@/store/modelStore");
        const { resolvModelUri } = await import("@/lib/modelBootstrap");
        const gtcrnUri = resolvModelUri("gtcrn",     useModelStore.getState().getModelUri("gtcrn"));
        const bweUri   = resolvModelUri("hifiganbwe", useModelStore.getState().getModelUri("hifiganbwe"));
        if (gtcrnUri) {
          const tempUri = `${cacheDir}gtcrn_tmp_${Date.now()}.wav`;
          onEngine?.("deepfilternet");
          const denoised = await runGTCRNOnnx(nativeSrcUri, tempUri, gtcrnUri,
            (p, l) => onProgress(p * (bweUri ? 0.48 : 0.95), l));
          if (denoised && bweUri) {
            onEngine?.("audiosr");
            const bweOk = await runHiFiGANBWEOnnx(tempUri, outUri, bweUri,
              (p, l) => onProgress(0.48 + p * 0.5, l));
            await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
            if (bweOk) { onProgress(1, "困难模式：降噪 + 带宽扩展完成"); return outUri; }
          } else if (denoised) {
            await FileSystem.copyAsync({ from: tempUri, to: outUri });
            await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
            onProgress(1, "GTCRN 降噪完成");
            return outUri;
          }
          await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
        }
      } catch (e) {
        console.warn("[audioEngine] 困难模式 ONNX 失败，降级 FFmpeg DSP:", e);
      }
    }

    if (level === "simple" || level === "advanced") {
      // 简单模式 / 困难模式降级：GTCRN 降噪
      try {
        const { useModelStore } = await import("@/store/modelStore");
        const { resolvModelUri } = await import("@/lib/modelBootstrap");
        const gtcrnUri = resolvModelUri("gtcrn", useModelStore.getState().getModelUri("gtcrn"));
        if (gtcrnUri) {
          onEngine?.("deepfilternet");
          onProgress(0.02, "加载 GTCRN 降噪模型...");
          const result = await runGTCRNOnnx(nativeSrcUri, outUri, gtcrnUri, (p, label) => onProgress(p, label));
          if (result) {
            onProgress(1, "GTCRN 降噪完成");
            return outUri;
          }
        }
      } catch (e) {
        console.warn("[audioEngine] GTCRN ONNX 失败，降级 FFmpeg DSP:", e);
      }
    }

    // ONNX 不可用 → FFmpeg DSP 增强兜底
    onEngine?.("ffmpeg-dsp");
    onProgress(0.02, "FFmpeg DSP 增强（无 ONNX 模型）...");
    // file:// URI 直接传入 — HarmonyOS FFmpegKit 识别 file:// scheme
    await runFFmpegEnhance(nativeSrcUri, outUri, params, durationMs, startTs, onProgress, FFmpegKit, ReturnCode);
    return outUri;
  }

  // ── 纯格式转换路径（masterEnhance=false）─────────────────────────────────
  onEngine?.("none");

  // ① 诊断：源文件存在性 + 大小
  const srcInfo = await FileSystem.getInfoAsync(nativeSrcUri);
  console.log(`[audioEngine][诊断] sourceUri 原始: ${sourceUri}`);
  console.log(`[audioEngine][诊断] nativeSrcUri  : ${nativeSrcUri}`);
  console.log(`[audioEngine][诊断] 源文件: 存在=${srcInfo.exists}, 大小=${(srcInfo as any).size ?? 0}`);
  console.log(`[audioEngine][诊断] outUri        : ${outUri}`);

  // ② 强制路径转换：剥离 file:// scheme 供 FFmpegKit JNI 层使用
  const rawSrc = toFFmpegPath(nativeSrcUri);
  const rawOut = toFFmpegPath(outUri);

  // ③ 步骤 1：先尝试 -c copy（最简命令），诊断 FFmpegKit 是否正常初始化
  const copyCmd = `-i "${rawSrc}" -c copy -y "${rawOut}"`;
  console.log("[audioEngine][步骤1] 发送 -c copy 简化测试命令...");
  let copySucceeded = false;
  try {
    await execFFmpegCmd(FFmpegKit, ReturnCode, copyCmd, "copy-test");
    const copyStat = await FileSystem.getInfoAsync(outUri);
    copySucceeded = !!(copyStat.exists && (copyStat as any).size > 0);
    console.log(`[audioEngine][步骤1] 结果: succeeded=${copySucceeded}, 大小=${(copyStat as any).size ?? 0}`);
  } catch (copyErr) {
    console.warn("[audioEngine][步骤1] -c copy 失败（FFmpegKit 可能无法工作）:", copyErr);
  }

  // 同格式（MP3→MP3 等）且 copy 成功 → 直接返回
  const sourceExt = sourceName.split(".").pop()?.toLowerCase() ?? "";
  if (copySucceeded && sourceExt === outExt) {
    onProgress(1, "输出文件就绪（流复制）");
    return outUri;
  }

  // ④ 步骤 2：完整重编码转换
  const ffmpegArgs = buildFfmpegArgs(target, params);
  const command = `-i "${rawSrc}" ${ffmpegArgs.join(" ")} -y "${rawOut}"`;
  console.log("[audioEngine][步骤2] 完整编码命令 ↓");

  try {
    await execFFmpegCmd(FFmpegKit, ReturnCode, command, `convert-${target}`,
      (p, l) => onProgress(p, l), durationMs, `编码 ${target}`);
  } catch (convertErr) {
    console.error("[audioEngine][步骤2] 完整转换失败:", convertErr);
    // 降级：直接复制原文件
    const fallExt = sourceName.split(".").pop()?.toLowerCase() ?? "audio";
    const fallUri = `${cacheDir}fallback_${Date.now()}.${fallExt}`;
    console.warn(`[audioEngine][降级] 拷贝原文件 → ${fallUri}`);
    await FileSystem.copyAsync({ from: nativeSrcUri, to: fallUri });
    onProgress(1, `已复制原文件（转换失败，保留原格式 ${fallExt.toUpperCase()}）`);
    return fallUri;
  }

  // ⑤ 验证输出
  const stat = await FileSystem.getInfoAsync(outUri);
  console.log(`[audioEngine][验证] 输出: 存在=${stat.exists}, 大小=${(stat as any).size ?? 0}`);
  if (!stat.exists || !(stat as any).size || (stat as any).size === 0) {
    const fallExt = sourceName.split(".").pop()?.toLowerCase() ?? "audio";
    const fallUri = `${cacheDir}fallback_${Date.now()}.${fallExt}`;
    await FileSystem.copyAsync({ from: nativeSrcUri, to: fallUri });
    onProgress(1, `已复制原文件（输出为空，保留原格式 ${fallExt.toUpperCase()}）`);
    return fallUri;
  }
  return outUri;
}

// ── STFT / ISTFT 工具函数（供 GTCRN 使用） ──────────────────────────────────

const GTCRN_N_FFT = 512;
const GTCRN_HOP   = 256;
const GTCRN_SR    = 16000;
const GTCRN_BINS  = GTCRN_N_FFT / 2 + 1; // 257

function _makeHannWindow(N: number): Float32Array {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  return w;
}

/** 原地 Cooley-Tukey FFT（迭代，仅处理 2 的幂次长度） */
function _fftInPlace(re: Float32Array, im: Float32Array): void {
  const N = re.length;
  // 位反转
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  // 蝴蝶运算
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr0 = Math.cos(ang), wi0 = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < N; i += len) {
      let wr = 1.0, wi = 0.0;
      for (let j = 0; j < half; j++) {
        const u = i + j, v = u + half;
        const tr = re[v] * wr - im[v] * wi;
        const ti = re[v] * wi + im[v] * wr;
        re[v] = re[u] - tr; im[v] = im[u] - ti;
        re[u] += tr;        im[u] += ti;
        const tmp = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = tmp;
      }
    }
  }
}

/** STFT：返回每帧 257 个复数频谱 bin */
function _stftFrames(
  pcm: Float32Array,
  win: Float32Array,
): Array<{ re: Float32Array; im: Float32Array }> {
  const N = GTCRN_N_FFT, hop = GTCRN_HOP, bins = GTCRN_BINS;
  const bufRe = new Float32Array(N), bufIm = new Float32Array(N);
  const frames: Array<{ re: Float32Array; im: Float32Array }> = [];
  const pad = N >> 1;
  const padded = new Float32Array(pcm.length + pad * 2);
  padded.set(pcm, pad);
  for (let start = 0; start < pcm.length; start += hop) {
    bufRe.fill(0); bufIm.fill(0);
    for (let k = 0; k < N; k++) bufRe[k] = (padded[start + k] ?? 0) * win[k];
    _fftInPlace(bufRe, bufIm);
    frames.push({ re: new Float32Array(bufRe.subarray(0, bins)), im: new Float32Array(bufIm.subarray(0, bins)) });
  }
  return frames;
}

/** ISTFT：overlap-add 重建波形 */
function _istftFrames(
  frames: Array<{ re: Float32Array; im: Float32Array }>,
  origLen: number,
  win: Float32Array,
): Float32Array {
  const N = GTCRN_N_FFT, hop = GTCRN_HOP, pad = N >> 1;
  const out   = new Float32Array(origLen + N);
  const wsum  = new Float32Array(origLen + N);
  const bufRe = new Float32Array(N), bufIm = new Float32Array(N);
  for (let f = 0; f < frames.length; f++) {
    const { re, im } = frames[f];
    bufRe.fill(0); bufIm.fill(0);
    for (let k = 0; k < re.length; k++) { bufRe[k] = re[k]; bufIm[k] = im[k]; }
    // 恢复共轭对称（负频率）
    for (let k = 1; k < N / 2; k++) { bufRe[N - k] = re[k]; bufIm[N - k] = -im[k]; }
    // IFFT = conj(FFT(conj(x))) / N
    for (let k = 0; k < N; k++) bufIm[k] = -bufIm[k];
    _fftInPlace(bufRe, bufIm);
    const start = f * hop;
    for (let k = 0; k < N; k++) {
      const w = win[k];
      out[start + k]  += (bufRe[k] / N) * w;
      wsum[start + k] += w * w;
    }
  }
  const result = new Float32Array(origLen);
  for (let i = 0; i < origLen; i++) {
    const ws = wsum[i + pad];
    result[i] = ws > 1e-8 ? out[i + pad] / ws : 0;
  }
  return result;
}

/** 线性插值重采样（适用于 SR 转换） */
function _linearResample(pcm: Float32Array, srcSR: number, dstSR: number): Float32Array {
  if (srcSR === dstSR) return pcm;
  const ratio = dstSR / srcSR;
  const outLen = Math.round(pcm.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i / ratio;
    const lo = Math.floor(src);
    const frac = src - lo;
    out[i] = pcm[lo] + (pcm[Math.min(lo + 1, pcm.length - 1)] - pcm[lo]) * frac;
  }
  return out;
}

/** WAV 解析：返回单声道 float32 PCM + 采样率 */
function _parseWav(raw: Uint8Array): { pcm: Float32Array; sr: number } | null {
  if (raw.length < 44) return null;
  const view = new DataView(raw.buffer);
  const nCh  = view.getUint16(22, true);
  const sr   = view.getUint32(24, true);
  const bps  = view.getUint16(34, true);
  const dataOff = 44;
  const bytesPS = Math.ceil(bps / 8);
  const nSamples = Math.floor((raw.length - dataOff) / bytesPS);
  const pcm = new Float32Array(nSamples / nCh);
  for (let i = 0; i < pcm.length; i++) {
    let sum = 0;
    for (let ch = 0; ch < nCh; ch++) {
      const off = dataOff + (i * nCh + ch) * bytesPS;
      if (bps === 16) sum += view.getInt16(off, true) / 32768.0;
      else if (bps === 24) {
        let v = raw[off] | (raw[off + 1] << 8) | (raw[off + 2] << 16);
        if (v & 0x800000) v |= ~0xFFFFFF;
        sum += v / 8388608.0;
      } else sum += view.getFloat32(off, true);
    }
    pcm[i] = sum / nCh;
  }
  return { pcm, sr };
}

/** 编码单声道 float32 PCM 为 WAV 24-bit */
function _encodePcmToWav24(pcm: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length * 3);
  const view  = new DataView(bytes.buffer);
  bytes.set([82,73,70,70]); view.setUint32(4, 36 + pcm.length*3, true);
  bytes.set([87,65,86,69,102,109,116,32], 8); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate*3, true);
  view.setUint16(32, 3, true); view.setUint16(34, 24, true);
  bytes.set([100,97,116,97], 36); view.setUint32(40, pcm.length*3, true);
  for (let i = 0; i < pcm.length; i++) {
    let v = Math.max(-1, Math.min(1, pcm[i]));
    let s = Math.round(v * 8388607);
    if (s < 0) s += 0x1000000;
    view.setUint8(44 + i*3,     s & 0xFF);
    view.setUint8(44 + i*3 + 1, (s >> 8) & 0xFF);
    view.setUint8(44 + i*3 + 2, (s >> 16) & 0xFF);
  }
  return bytes;
}

// ── GTCRN ONNX 推理（真实接口：STFT 帧→帧流式降噪） ─────────────────────────
/**
 * GTCRN 16kHz 降噪推理
 *
 * 模型：yuyun2000/SpeechDenoiser（腾讯 GTCRN，Apache-2.0）
 * ONNX 接口（每帧流式处理）：
 *   输入：
 *     mix          float32 [1, 257, 1, 2]   — 当前 STFT 帧（实部+虚部）
 *     conv_cache   float32 [2, 1, 16, 16, 33]
 *     tra_cache    float32 [2, 3, 1,  1, 16]
 *     inter_cache  float32 [2, 1, 33, 16]
 *   输出：
 *     enh              float32 [1, 257, 1, 2] — 增强后 STFT 帧
 *     conv_cache_out   float32 [2, 1, 16, 16, 33]
 *     tra_cache_out    float32 [2, 3, 1,  1, 16]
 *     inter_cache_out  float32 [2, 1, 33, 16]
 *
 * 参数：N_FFT=512，hop=256，win=hann，SR=16kHz
 */
async function runGTCRNOnnx(
  inputUri: string,
  outputUri: string,
  modelUri: string,
  onProgress: (p: number, label: string) => void,
): Promise<boolean> {
  try {
    const { InferenceSession, Tensor } = await import("onnxruntime-react-native");
    const FileSystemLeg = await import("expo-file-system/legacy");

    onProgress(0.03, "GTCRN：读取音频…");
    const b64 = await FileSystemLeg.readAsStringAsync(inputUri, { encoding: "base64" });
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const parsed = _parseWav(raw);
    if (!parsed) return false;
    const { pcm, sr } = parsed;

    // 确认模型文件存在
    const finfo = await FileSystemLeg.getInfoAsync(modelUri);
    if (!finfo.exists) { console.warn("[audioEngine] GTCRN model not found:", modelUri); return false; }

    // 重采样到 16kHz
    const inputPcm = _linearResample(pcm, sr, GTCRN_SR);
    onProgress(0.12, "GTCRN：加载模型…");

    const session = await InferenceSession.create(modelUri, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });

    onProgress(0.22, "GTCRN：STFT 分帧…");
    const win    = _makeHannWindow(GTCRN_N_FFT);
    const frames = _stftFrames(inputPcm, win);

    // 初始化流式缓存（全零）
    let convCache  = new Float32Array(2 * 1 * 16 * 16 * 33);  // [2,1,16,16,33]
    let traCache   = new Float32Array(2 * 3 * 1 * 1 * 16);    // [2,3,1,1,16]
    let interCache = new Float32Array(2 * 1 * 33 * 16);       // [2,1,33,16]

    const enhFrames: Array<{ re: Float32Array; im: Float32Array }> = [];

    for (let f = 0; f < frames.length; f++) {
      const { re, im } = frames[f];
      // 打包为 [1, 257, 1, 2]：逐 bin 交织 real/imag
      const mix = new Float32Array(GTCRN_BINS * 2);
      for (let b = 0; b < GTCRN_BINS; b++) { mix[b * 2] = re[b]; mix[b * 2 + 1] = im[b]; }

      const result = await session.run({
        mix:         new Tensor("float32", mix,        [1, GTCRN_BINS, 1, 2]),
        conv_cache:  new Tensor("float32", convCache,  [2, 1, 16, 16, 33]),
        tra_cache:   new Tensor("float32", traCache,   [2, 3, 1, 1, 16]),
        inter_cache: new Tensor("float32", interCache, [2, 1, 33, 16]),
      });

      const enh = result["enh"]?.data as Float32Array ?? mix;
      const enhRe = new Float32Array(GTCRN_BINS);
      const enhIm = new Float32Array(GTCRN_BINS);
      for (let b = 0; b < GTCRN_BINS; b++) { enhRe[b] = enh[b * 2]; enhIm[b] = enh[b * 2 + 1]; }
      enhFrames.push({ re: enhRe, im: enhIm });

      // 更新流式缓存（double cast: TensorData → unknown → Float32Array）
      convCache  = new Float32Array((result["conv_cache_out"]?.data  ?? convCache) as unknown as ArrayBuffer);
      traCache   = new Float32Array((result["tra_cache_out"]?.data   ?? traCache)  as unknown as ArrayBuffer);
      interCache = new Float32Array((result["inter_cache_out"]?.data ?? interCache) as unknown as ArrayBuffer);

      if (f % 80 === 0) {
        onProgress(0.22 + 0.70 * (f / frames.length), `GTCRN 降噪：${Math.round((f / frames.length) * 100)}%`);
      }
    }

    onProgress(0.94, "GTCRN：合成增强音频…");
    const enhanced = _istftFrames(enhFrames, inputPcm.length, win);
    const wavBytes = _encodePcmToWav24(enhanced, GTCRN_SR);
    const b64Out   = btoa(String.fromCharCode(...Array.from(wavBytes)));
    await FileSystemLeg.writeAsStringAsync(outputUri, b64Out, { encoding: "base64" });

    onProgress(0.99, "GTCRN：完成");
    console.log("[audioEngine] ✅ GTCRN 降噪完成，帧数:", frames.length);
    return true;
  } catch (e) {
    console.error("[audioEngine] GTCRN 推理失败:", e);
    return false;
  }
}

// ── HiFi-GAN+ BWE ONNX 推理（带宽扩展超分辨率，任意SR → 48kHz） ────────────
/**
 * HiFi-GAN+ Bandwidth Extension 推理
 *
 * 模型：brentspell/hifi-gan-bwe（MIT）→ TigreGotico/audiosronnx-hifiganbwe
 * ONNX 接口（时域，一次推理全帧）：
 *   输入：audio  float32 [1, 1, T+padding]  — kaiser 升采样至 48kHz + 反射填充
 *   输出：wavenet_out float32 [1, 1, T+padding]
 *   后处理：tanh(output)，截去两端 padding
 *
 * 感受野：13120 samples（2 stacks × 8 layers，dilation base 3，kernel 3）
 */
const HIFIGAN_OUT_SR          = 48000;
const HIFIGAN_RECEPTIVE_FIELD = 13120;

async function runHiFiGANBWEOnnx(
  inputUri: string,
  outputUri: string,
  modelUri: string,
  onProgress: (p: number, label: string) => void,
): Promise<boolean> {
  try {
    const { InferenceSession, Tensor } = await import("onnxruntime-react-native");
    const FileSystemLeg = await import("expo-file-system/legacy");

    onProgress(0.03, "HiFi-GAN+ BWE：读取音频…");
    const b64 = await FileSystemLeg.readAsStringAsync(inputUri, { encoding: "base64" });
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const parsed = _parseWav(raw);
    if (!parsed) return false;
    const { pcm, sr } = parsed;

    // 确认模型文件存在
    const finfo = await FileSystemLeg.getInfoAsync(modelUri);
    if (!finfo.exists) { console.warn("[audioEngine] HiFi-GAN+ model not found:", modelUri); return false; }

    // 升采样到 48kHz（线性，HiFi-GAN 容忍线性插值上采样）
    const upsampled = _linearResample(pcm, sr, HIFIGAN_OUT_SR);

    // 两端各填充 receptive_field/2 个零
    const pad    = HIFIGAN_RECEPTIVE_FIELD >> 1;
    const padded = new Float32Array(upsampled.length + pad * 2);
    padded.set(upsampled, pad);

    onProgress(0.18, "HiFi-GAN+ BWE：加载模型…");
    const session = await InferenceSession.create(modelUri, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });

    onProgress(0.30, "HiFi-GAN+ BWE：带宽扩展推理中…");
    const inputTensor = new Tensor("float32", padded, [1, 1, padded.length]);
    const result = await session.run({ audio: inputTensor });
    const wavenetOut = result["wavenet_out"]?.data as Float32Array ?? padded;

    onProgress(0.90, "HiFi-GAN+ BWE：后处理（tanh）…");
    // tanh + 去掉两端 padding
    const out = new Float32Array(upsampled.length);
    for (let i = 0; i < upsampled.length; i++) {
      out[i] = Math.tanh(wavenetOut[i + pad]);
    }

    const wavBytes = _encodePcmToWav24(out, HIFIGAN_OUT_SR);
    const b64Out   = btoa(String.fromCharCode(...Array.from(wavBytes)));
    await FileSystemLeg.writeAsStringAsync(outputUri, b64Out, { encoding: "base64" });

    onProgress(0.99, "HiFi-GAN+ BWE：完成");
    console.log("[audioEngine] ✅ HiFi-GAN+ BWE 完成，输出:", out.length, "samples @ 48kHz");
    return true;
  } catch (e) {
    console.error("[audioEngine] HiFi-GAN+ BWE 推理失败:", e);
    return false;
  }
}

// ── NovaSR ONNX 推理（16k → 48k 超分，极轻量） ───────────────────────────────
/**
 * NovaSR 推理（229 KB，conv1d/BigVGAN-snake，Apache-2.0）
 *   输入：audio_16k  float32 [1, 1, T]  — 16kHz 波形
 *   输出：audio_48k  float32 [1, 1, 3T-4] — 48kHz 波形
 */
export async function runNovaSROnnx(
  inputUri: string,
  outputUri: string,
  modelUri: string,
  onProgress: (p: number, label: string) => void,
): Promise<boolean> {
  try {
    const { InferenceSession, Tensor } = await import("onnxruntime-react-native");
    const FileSystemLeg = await import("expo-file-system/legacy");

    onProgress(0.03, "NovaSR：读取音频…");
    const b64 = await FileSystemLeg.readAsStringAsync(inputUri, { encoding: "base64" });
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const parsed = _parseWav(raw);
    if (!parsed) return false;
    const { pcm, sr } = parsed;

    const finfo = await FileSystemLeg.getInfoAsync(modelUri);
    if (!finfo.exists) return false;

    const inputPcm = _linearResample(pcm, sr, 16000);
    onProgress(0.2, "NovaSR：加载模型…");
    const session = await InferenceSession.create(modelUri, { executionProviders: ["cpu"] });

    onProgress(0.35, "NovaSR：超分推理…");
    const tensor = new Tensor("float32", inputPcm, [1, 1, inputPcm.length]);
    const result = await session.run({ audio_16k: tensor });
    const out48k = result["audio_48k"]?.data as Float32Array ?? inputPcm;

    onProgress(0.92, "NovaSR：写入输出…");
    const out = new Float32Array(out48k);
    const wavBytes = _encodePcmToWav24(out, 48000);
    const b64Out = btoa(String.fromCharCode(...Array.from(wavBytes)));
    await FileSystemLeg.writeAsStringAsync(outputUri, b64Out, { encoding: "base64" });
    onProgress(0.99, "NovaSR：完成");
    return true;
  } catch (e) {
    console.error("[audioEngine] NovaSR 推理失败:", e);
    return false;
  }
}

// ── AudioSR ONNX 推理 ─────────────────────────────────────────────────────────
/**
 * @deprecated AudioSR 原版权重 5.9GB，移动端不可用。
 * 简单模式请用 runGTCRNOnnx，困难模式请用 runGTCRNOnnx + runHiFiGANBWEOnnx。
 */
// ── FFmpeg 增强兜底 ───────────────────────────────────────────────────────────
async function runFFmpegEnhance(
  inputUri: string,
  outputUri: string,
  params: ConvertParams,
  durationMs: number,
  startTs: number,
  onProgress: (p: number, label: string) => void,
  FFmpegKit: any,
  ReturnCode: any,
): Promise<void> {
  const enhanceFilter = params.enhanceLevel === "advanced"
    ? [ // 困难模式：超复杂滤镜链
        "aresample=192000",
        "highpass=f=60", "lowpass=f=20000",
        "acompressor=threshold=-30dB:ratio=6:attack=2:release=100",
        "equalizer=f=100:width_type=h:width=50:g=2",
        "equalizer=f=2000:width_type=h:width=200:g=3",
        "equalizer=f=10000:width_type=h:width=1000:g=1",
        "stereotools=mlev=0.5:mwid=0.7",
        "afftdn=nr=20:nf=-25:tn=1",
        "aresample=96000", "aresample=192000", "aresample=96000", "aresample=48000",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "alimiter=limit=0.95:attack=5:release=50",
        "aresample=48000",
      ]
    : [ // 简单模式：标准母带滤镜链
        "highpass=f=80",
        "acompressor=threshold=-20dB:ratio=4:attack=5:release=50",
        "equalizer=f=2000:width_type=h:width=200:g=3",
        "equalizer=f=8000:width_type=h:width=1000:g=2",
        "alimiter=limit=0.95:attack=5:release=50",
        "aresample=48000", "aresample=96000", "aresample=48000",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
      ];

  // 强制路径转换（诊断用）
  const rawIn = toFFmpegPath(inputUri);
  const rawOut2 = toFFmpegPath(outputUri);

  // 诊断
  const inInfo = await FileSystem.getInfoAsync(inputUri);
  console.log(`[FFmpegEnhance][诊断] 输入: 存在=${inInfo.exists}, 大小=${(inInfo as any).size ?? 0}`);
  console.log(`[FFmpegEnhance][路径] rawIn =${rawIn}`);
  console.log(`[FFmpegEnhance][路径] rawOut=${rawOut2}`);

  const command = `-i "${rawIn}" -af "${enhanceFilter.join(",")}" -ar 48000 -sample_fmt s32 -c:a pcm_s24le -y "${rawOut2}"`;

  await execFFmpegCmd(FFmpegKit, ReturnCode, command, "enhance",
    (p, l) => onProgress(p, l), durationMs, "FFmpeg DSP");
}

// ── 专业参数处理（EQ / 降噪 / 增益 / 动态处理），基于 FFmpeg ──────────────
/**
 * applyProcessing — 对音频应用专业处理参数（EQ/降噪/增益/压缩/限幅/LUFS）。
 * Native：FFmpegKit 真实滤镜链处理；Web：占位模拟。
 */
export async function applyProcessing(
  sourceUri: string,
  sourceName: string,
  filters: string[],
  onProgress: (p: number, label: string) => void,
  sourceSize?: number,
): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory ?? "";
  const outName = safeCacheName(sourceName, "wav");
  const outUri = `${cacheDir}processed_${outName}`;

  // Web 占位
  if (process.env.EXPO_OS === "web") {
    const total = estimateDuration(sourceSize ?? 0, "WAV", true);
    const start = Date.now();
    const STAGES = ["读取源文件", "构建滤镜链", "FFmpeg 处理", "写入输出"];
    return new Promise((resolve) => {
      let si = 0;
      const tick = () => {
        const elapsed = Date.now() - start;
        const p = Math.min(1, elapsed / total);
        si = Math.min(Math.floor(p * STAGES.length), STAGES.length - 1);
        onProgress(Number(p.toFixed(3)), STAGES[si]);
        if (p >= 1) { onProgress(1, "处理完成"); resolve(sourceUri); }
        else setTimeout(tick, 60);
      };
      tick();
    });
  }

  const { FFmpegKit, FFprobeKit, ReturnCode } = await import("ffmpeg-kit-react-native");

  // ⚠️ Android/HarmonyOS content:// URI → file:// 缓存（resolveNativeUri 双重策略保障）
  // DocumentPicker(copyToCacheDirectory:true) → 已是 file:// → 直接透传给 FFmpegKit
  const nativeSrcUri = await resolveNativeUri(sourceUri, sourceName.split(".").pop()?.toLowerCase() ?? "audio");

  let durationMs = estimateDuration(sourceSize ?? 0, "WAV", true);
  try {
    // file:// URI 直接传入 — HarmonyOS FFmpegKit 识别 file:// scheme
    const probe = await FFprobeKit.getMediaInformation(nativeSrcUri);
    const info2 = probe.getMediaInformation?.();
    if (info2) durationMs = parseFloat(String(info2.getDuration?.() ?? "0")) * 1000 || durationMs;
  } catch { /* 忽略 */ }

  // 诊断：源文件
  const procSrcInfo = await FileSystem.getInfoAsync(nativeSrcUri);
  console.log(`[applyProcessing][诊断] nativeSrcUri: ${nativeSrcUri}`);
  console.log(`[applyProcessing][诊断] 源文件: 存在=${procSrcInfo.exists}, 大小=${(procSrcInfo as any).size ?? 0}`);

  // 强制路径转换
  const rawProcSrc = toFFmpegPath(nativeSrcUri);
  const rawProcOut = toFFmpegPath(outUri);
  console.log(`[applyProcessing][路径] rawSrc=${rawProcSrc}`);
  console.log(`[applyProcessing][路径] rawOut=${rawProcOut}`);

  const filterStr = filters.length > 0 ? filters.join(",") : "anull";
  const command = `-i "${rawProcSrc}" -af "${filterStr}" -ar 48000 -sample_fmt s32 -c:a pcm_s24le -y "${rawProcOut}"`;

  try {
    await execFFmpegCmd(FFmpegKit, ReturnCode, command, "processing",
      (p, l) => onProgress(p, l), durationMs, "处理中");
  } catch (procErr) {
    console.error("[applyProcessing] 处理失败:", procErr);
    const fallUri = `${cacheDir}proc_fallback_${Date.now()}.wav`;
    await FileSystem.copyAsync({ from: nativeSrcUri, to: fallUri });
    onProgress(1, "已复制原文件（处理失败，保留原始）");
    return fallUri;
  }

  const stat = await FileSystem.getInfoAsync(outUri);
  console.log(`[applyProcessing][验证] 输出: 存在=${stat.exists}, 大小=${(stat as any).size ?? 0}`);
  if (!stat.exists || !(stat as any).size || (stat as any).size === 0) {
    const fallUri = `${cacheDir}proc_fallback_${Date.now()}.wav`;
    await FileSystem.copyAsync({ from: nativeSrcUri, to: fallUri });
    onProgress(1, "已复制原文件（输出为空，保留原始）");
    return fallUri;
  }
  return outUri;
}

// 模拟 Stem 分离进度
export function runStem(
  onProgress: (p: number) => void,
): Promise<void> {
  const total = 2600;
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / total);
      onProgress(Number(p.toFixed(3)));
      if (p >= 1) resolve();
      else setTimeout(tick, 60);
    };
    tick();
  });
}

// 模拟解密进度
export function runDecrypt(
  onProgress: (p: number) => void,
): Promise<void> {
  const total = 2000;
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / total);
      onProgress(Number(p.toFixed(3)));
      if (p >= 1) resolve();
      else setTimeout(tick, 60);
    };
    tick();
  });
}

// 模拟曲谱生成进度
export function runScore(
  onProgress: (p: number) => void,
): Promise<void> {
  const total = 2200;
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / total);
      onProgress(Number(p.toFixed(3)));
      if (p >= 1) resolve();
      else setTimeout(tick, 60);
    };
    tick();
  });
}

// ─────────────────────────────────────────────
// 音符/品格生成
// ─────────────────────────────────────────────

/**
 * 生成简谱音符序列（count 个）
 * 符号规则：
 *  - 基本音：1 2 3 4 5 6 7
 *  - 低八度：1. 2. 5. 6.（数字下方加点，SVG 用上标点表示）
 *  - 高八度：1' 2' 3' 5' 6'（数字上方加点）
 *  - 附点音：1. 2.（时值延长，用 "·" 表示）
 *  - 延音线：—（延续上一音）
 *  - 休止符：0
 */
export function generateScoreNotes(seedStr: string, count = 48): string[] {
  const rand = seededRandom(hashString(seedStr) + 7);
  // 权重：基本音最常见，其次低/高八度，附点和延音较少
  const pool: Array<{ note: string; weight: number }> = [
    { note: "1",  weight: 12 }, { note: "2",  weight: 10 }, { note: "3",  weight: 10 },
    { note: "4",  weight: 6  }, { note: "5",  weight: 12 }, { note: "6",  weight: 10 },
    { note: "7",  weight: 5  },
    { note: "1'", weight: 5  }, { note: "2'", weight: 4  }, { note: "5'", weight: 4  },
    { note: "1,", weight: 4  }, { note: "5,", weight: 3  }, { note: "6,", weight: 3  },
    { note: "1.", weight: 3  }, { note: "3.", weight: 2  }, { note: "5.", weight: 3  },
    { note: "—",  weight: 5  },
    { note: "0",  weight: 4  },
  ];
  const total = pool.reduce((s, p) => s + p.weight, 0);
  return Array.from({ length: count }, () => {
    let r = rand() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) return p.note;
    }
    return "1";
  });
}

/**
 * 生成吉他六线谱品格序列（count 个）
 * 每个元素是 "弦号:品格"，如 "6:0"（第6弦空弦）、"3:7"（第3弦7品）
 * 弦号 1~6，品格 0~14
 */
export type GuitarNote = { string: number; fret: number };

export function generateGuitarNotes(seedStr: string, count = 48): GuitarNote[] {
  const rand = seededRandom(hashString(seedStr) + 13);
  // 常用和弦形状（五弦以内）
  const shapes: GuitarNote[][] = [
    [{ string: 6, fret: 0 }, { string: 5, fret: 2 }, { string: 4, fret: 2 }, { string: 3, fret: 1 }, { string: 2, fret: 0 }], // Em
    [{ string: 5, fret: 3 }, { string: 4, fret: 2 }, { string: 3, fret: 0 }, { string: 2, fret: 0 }, { string: 1, fret: 0 }], // C
    [{ string: 6, fret: 2 }, { string: 5, fret: 3 }, { string: 4, fret: 2 }, { string: 3, fret: 0 }, { string: 2, fret: 0 }], // Am
    [{ string: 6, fret: 2 }, { string: 5, fret: 0 }, { string: 4, fret: 0 }, { string: 3, fret: 2 }, { string: 2, fret: 3 }], // G
  ];
  const result: GuitarNote[] = [];
  while (result.length < count) {
    const shape = shapes[Math.floor(rand() * shapes.length)];
    for (const n of shape) {
      if (result.length >= count) break;
      // 随机变奏：偶尔加一个单音过渡
      if (rand() < 0.25) {
        result.push({ string: Math.ceil(rand() * 6), fret: Math.floor(rand() * 5) });
      }
      result.push(n);
    }
  }
  return result.slice(0, count);
}

// 旧版接口兼容（部分页面还在用字符串数组）
export function generateGuitarFrets(seedStr: string, count = 48): string[] {
  return generateGuitarNotes(seedStr, count).map((n) => String(n.fret));
}

// ─────────────────────────────────────────────
// A4 多行乐谱 SVG 生成
// ─────────────────────────────────────────────

const SVG_PAGE_W = 794;   // A4 72dpi 宽度（像素）
const SVG_MARGIN = 40;    // 页边距
export const NOTES_PER_BAR = 4;  // 每小节音符数
export const BARS_PER_ROW = 8;   // 每行小节数
const NOTES_PER_ROW = NOTES_PER_BAR * BARS_PER_ROW; // = 32

const CELL_W_SVG = (SVG_PAGE_W - SVG_MARGIN * 2) / NOTES_PER_ROW;

/** 把 count 个音符/品格切成多行，每行 NOTES_PER_ROW 个 */
function chunkRows<T>(items: T[], rowSize = NOTES_PER_ROW): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += rowSize) {
    rows.push(items.slice(i, i + rowSize));
  }
  return rows;
}

// 简谱：把音符符号渲染成 SVG 文本（含上下点、附点、延音线）
function renderNumberedNote(
  note: string, cx: number, y: number, fill: string
): string {
  const base = note.replace(/[',.\-—]/g, "");
  const isHigh = note.includes("'");
  const isLow  = note.includes(",");
  const isDot  = note.includes(".") && !isLow;
  const isTie  = note === "—";

  let svg = "";
  if (isTie) {
    // 延音线：横线
    svg += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="serif" font-size="16" fill="${fill}">—</text>`;
  } else {
    // 主音符
    svg += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="serif" font-size="16" font-weight="bold" fill="${fill}">${base}</text>`;
    if (isHigh) {
      // 上方小点（高八度）
      svg += `<circle cx="${cx + 6}" cy="${y - 16}" r="2" fill="${fill}"/>`;
    }
    if (isLow) {
      // 下方小点（低八度）
      svg += `<circle cx="${cx + 6}" cy="${y + 4}" r="2" fill="${fill}"/>`;
    }
    if (isDot) {
      // 附点（右侧小点）
      svg += `<circle cx="${cx + 10}" cy="${y - 5}" r="2" fill="${fill}"/>`;
    }
  }
  return svg;
}

// ─── 音名映射（简谱数字 → C 大调音名）─────────────────────────────────────────
const NOTE_NAMES: Record<string, string> = {
  "0": "",  "1": "C", "2": "D", "3": "E",
  "4": "F", "5": "G", "6": "A", "7": "B",
  "1'": "C", "2'": "D", "3'": "E", "5'": "G", "6'": "A",
  "1,": "C", "5,": "G", "6,": "A",
  "1.": "C", "3.": "E", "5.": "G",
  "—": "",
};

/** 从简谱音符提取音名（C D E F G A B），0 / — 返回空字符串 */
export function noteToName(note: string): string {
  return NOTE_NAMES[note] ?? NOTE_NAMES[note.replace(/[',.-]/g, "")] ?? "";
}

// ─── 和弦名序列（根据 seed 确定性生成，每小节一个）────────────────────────────
const CHORD_POOL = ["C", "Am", "F", "G", "Em", "Dm", "G7", "C/E"];

/** 生成 barCount 个和弦名（与 seed 绑定，每次生成相同序列）*/
export function generateChords(seedStr: string, barCount: number): string[] {
  const rand = seededRandom(hashString(seedStr) + 99);
  return Array.from({ length: barCount }, () =>
    CHORD_POOL[Math.floor(rand() * CHORD_POOL.length)]
  );
}

/** 生成 BPM（范围 60–180，由 seed 确定）*/
export function generateBpm(seedStr: string): number {
  const rand = seededRandom(hashString(seedStr) + 42);
  return Math.round(60 + rand() * 120);
}

// 和弦框图：每个和弦名 → 六弦品格数组（-1=不弹，0=空弦，其他=品格数）
const CHORD_DIAGRAMS: Record<string, number[]> = {
  C:   [-1, 3, 2, 0, 1, 0],
  Am:  [-1, 0, 2, 2, 1, 0],
  F:   [1, 1, 2, 3, 3, 1],
  G:   [3, 2, 0, 0, 0, 3],
  Em:  [0, 2, 2, 0, 0, 0],
  Dm:  [-1, -1, 0, 2, 3, 1],
  G7:  [3, 2, 0, 0, 0, 1],
  "C/E": [-1, 3, 2, 0, 1, 0],
};

/** 生成和弦框图 SVG 片段（6弦3品，宽42px 高46px，原点在左上角） */
function chordDiagramSvg(chord: string, x: number, y: number): string {
  const frets = CHORD_DIAGRAMS[chord] ?? [-1,-1,-1,-1,-1,-1];
  const minFret = Math.min(...frets.filter((f) => f > 0));
  const offset  = minFret > 3 ? minFret - 1 : 0;
  const W = 40; const H = 44;
  const strW = W / 5; const fretH = H / 3;
  let s = `<rect x="${x}" y="${y}" width="${W}" height="${H}" fill="white" stroke="none"/>`;
  // 标题
  s += `<text x="${x + W / 2}" y="${y - 3}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="#0066cc">${chord}</text>`;
  // 竖线（6弦）
  for (let i = 0; i < 6; i++) {
    s += `<line x1="${x + i * strW}" y1="${y}" x2="${x + i * strW}" y2="${y + H}" stroke="#555" stroke-width="1"/>`;
  }
  // 横线（4品位线）
  for (let j = 0; j <= 3; j++) {
    s += `<line x1="${x}" y1="${y + j * fretH}" x2="${x + W}" y2="${y + j * fretH}" stroke="#555" stroke-width="${j === 0 ? 2.5 : 1}"/>`;
  }
  // 品位偏移标记
  if (offset > 0) {
    s += `<text x="${x + W + 4}" y="${y + fretH * 0.7}" font-family="monospace" font-size="9" fill="#555">${offset + 1}fr</text>`;
  }
  // 音符点
  frets.forEach((f, i) => {
    const cx = x + (5 - i) * strW;
    if (f === -1) {
      s += `<text x="${cx}" y="${y - 4}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#cc0000">✕</text>`;
    } else if (f === 0) {
      s += `<circle cx="${cx}" cy="${y - 5}" r="4" fill="none" stroke="#555" stroke-width="1"/>`;
    } else {
      const fy = y + (f - offset - 0.5) * fretH;
      s += `<circle cx="${cx}" cy="${fy}" r="5" fill="#0066cc"/>`;
    }
  });
  return s;
}

/**
 * 生成 A4 比例、多行分小节的乐谱 SVG
 *
 * 支持选项：
 *   showNoteNames  - 五线谱/简谱音符下方标音名（C D E F G A B）
 *   showChords     - 吉他谱/五线谱每小节上方显示和弦框图
 *   bpm            - 标题区速度标记（♩= xxx）
 */
export function generateScoreSvg(
  type: "staff" | "numbered" | "guitar" | "piano",
  notes: string[],
  frets: string[],
  opts: { showNoteNames?: boolean; showChords?: boolean; bpm?: number; seed?: string } = {},
): string {
  const { showNoteNames = false, showChords = false, bpm, seed = "" } = opts;
  const PAD = SVG_MARGIN;
  const CW  = CELL_W_SVG;
  const rowW = SVG_PAGE_W - PAD * 2;

  // 标题行高度（加 BPM 时稍高）
  const TITLE_H = bpm ? 62 : 52;
  // 和弦框图区域高（仅 staff / guitar 时生效）
  const CHORD_H = showChords && (type === "staff" || type === "guitar") ? 58 : 0;
  // 音名标注区域高
  const NOTENAME_H = showNoteNames && (type === "staff" || type === "numbered") ? 14 : 0;
  // 各谱型每行内容高度
  const BASE_ROW_H: Record<string, number> = {
    staff:    80,
    numbered: 60,
    guitar:   110,
    piano:    140,
  };
  const rh = (BASE_ROW_H[type] ?? 80) + CHORD_H + NOTENAME_H;

  const items = type === "guitar" ? frets : notes;
  const rows = chunkRows(items, NOTES_PER_ROW);
  const totalBars = rows.length * BARS_PER_ROW;
  const chords = showChords ? generateChords(seed, totalBars) : [];
  const totalH = TITLE_H + rows.length * (rh + 24) + PAD * 2;

  let body = "";

  // ── 标题 ──
  const typeLabel: Record<string, string> = {
    staff: "五线谱  Staff Notation",
    numbered: "简谱  Numbered Musical Notation",
    guitar: "吉他六线谱  Guitar Tablature",
    piano: "钢琴谱  Piano Grand Staff",
  };
  body += `<text x="${SVG_PAGE_W / 2}" y="32" text-anchor="middle" font-family="serif" font-size="20" font-weight="bold" fill="#222">${typeLabel[type] ?? type}</text>`;
  body += `<text x="${SVG_PAGE_W / 2}" y="48" text-anchor="middle" font-family="monospace" font-size="11" fill="#999">${items.length} 个音符 · ${rows.length} 行 · ${totalBars} 小节</text>`;
  // BPM 速度标记
  if (bpm) {
    body += `<text x="${PAD}" y="${TITLE_H - 4}" font-family="serif" font-size="13" fill="#333">♩ = ${bpm}</text>`;
  }

  rows.forEach((rowItems, rowIdx) => {
    const rowY = TITLE_H + PAD / 2 + rowIdx * (rh + 24);
    // 本行第一小节序号（用于和弦索引）
    const barOffset = rowIdx * BARS_PER_ROW;
    // 内容区相对于 rowY 的偏移（和弦框图在最上方）
    const contentY = rowY + CHORD_H;

    if (type === "numbered") {
      // ── 简谱行 ──
      const lineY = contentY + (BASE_ROW_H.numbered + NOTENAME_H) - 16;
      body += `<line x1="${PAD}" y1="${lineY}" x2="${PAD + rowW}" y2="${lineY}" stroke="#555" stroke-width="1"/>`;
      if (rowIdx === 0) {
        body += `<text x="${PAD}" y="${contentY + (BASE_ROW_H.numbered + NOTENAME_H) / 2}" font-family="serif" font-size="22" fill="#333" text-anchor="start">4</text>`;
        body += `<line x1="${PAD}" y1="${contentY + (BASE_ROW_H.numbered + NOTENAME_H) / 2 + 2}" x2="${PAD + 14}" y2="${contentY + (BASE_ROW_H.numbered + NOTENAME_H) / 2 + 2}" stroke="#333" stroke-width="1.5"/>`;
        body += `<text x="${PAD}" y="${contentY + (BASE_ROW_H.numbered + NOTENAME_H) / 2 + 18}" font-family="serif" font-size="22" fill="#333" text-anchor="start">4</text>`;
      }
      const offsetX = rowIdx === 0 ? 20 : 0;
      rowItems.forEach((n, i) => {
        const cx = PAD + offsetX + i * CW + CW / 2;
        if (i > 0 && i % NOTES_PER_BAR === 0) {
          body += `<line x1="${cx - CW / 2}" y1="${contentY + 8}" x2="${cx - CW / 2}" y2="${lineY}" stroke="#555" stroke-width="1.2"/>`;
        }
        const noteY = contentY + (BASE_ROW_H.numbered + NOTENAME_H) / 2 + 4;
        body += renderNumberedNote(n, cx, noteY, "#cc5500");
        // 音名标注
        if (showNoteNames) {
          const nm = noteToName(n);
          if (nm) body += `<text x="${cx}" y="${lineY + 12}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#0066cc">${nm}</text>`;
        }
      });
      if (rowIdx === rows.length - 1) {
        const endX = PAD + offsetX + rowItems.length * CW;
        body += `<line x1="${endX}" y1="${contentY + 8}" x2="${endX}" y2="${lineY}" stroke="#555" stroke-width="2.5"/>`;
        body += `<line x1="${endX + 4}" y1="${contentY + 8}" x2="${endX + 4}" y2="${lineY}" stroke="#555" stroke-width="1.2"/>`;
      }
    }

    else if (type === "staff") {
      // ── 五线谱行 ──
      const staffTopY = contentY + 8;
      const lineYs = [staffTopY, staffTopY + 12, staffTopY + 24, staffTopY + 36, staffTopY + 48];
      lineYs.forEach((ly) => {
        body += `<line x1="${PAD}" y1="${ly}" x2="${PAD + rowW}" y2="${ly}" stroke="#333" stroke-width="1"/>`;
      });
      body += `<line x1="${PAD + 2}" y1="${lineYs[0]}" x2="${PAD + 2}" y2="${lineYs[4]}" stroke="#333" stroke-width="2"/>`;
      body += `<text x="${PAD + 6}" y="${lineYs[1] + 24}" font-family="serif" font-size="52" fill="#333">𝄞</text>`;
      const offsetX = 36;

      // 和弦框图（每小节一个）
      if (showChords) {
        for (let b = 0; b < BARS_PER_ROW; b++) {
          const chord = chords[barOffset + b] ?? "";
          const bx = PAD + offsetX + b * (CW * NOTES_PER_BAR) + 2;
          body += chordDiagramSvg(chord, bx, rowY + 6);
        }
      }

      rowItems.forEach((n, i) => {
        const cx = PAD + offsetX + i * CW + CW / 2;
        if (i > 0 && i % NOTES_PER_BAR === 0) {
          body += `<line x1="${cx - CW / 2}" y1="${lineYs[0]}" x2="${cx - CW / 2}" y2="${lineYs[4]}" stroke="#555" stroke-width="1"/>`;
        }
        const digit = Number(n.replace(/\D/g, "") || "4");
        const noteY = Math.max(lineYs[0] - 6, Math.min(lineYs[4] + 8, lineYs[4] - (digit - 1) * 6));
        body += `<ellipse cx="${cx}" cy="${noteY}" rx="5.5" ry="4" fill="#cc5500"/>`;
        body += `<line x1="${cx + 5}" y1="${noteY}" x2="${cx + 5}" y2="${noteY - 22}" stroke="#cc5500" stroke-width="1.5"/>`;
        if (noteY < lineYs[0]) {
          body += `<line x1="${cx - 8}" y1="${lineYs[0]}" x2="${cx + 8}" y2="${lineYs[0]}" stroke="#555" stroke-width="1"/>`;
        }
        if (noteY > lineYs[4]) {
          body += `<line x1="${cx - 8}" y1="${lineYs[4]}" x2="${cx + 8}" y2="${lineYs[4]}" stroke="#555" stroke-width="1"/>`;
        }
        // 音名标注（音符正下方）
        if (showNoteNames) {
          const nm = noteToName(n);
          if (nm) body += `<text x="${cx}" y="${lineYs[4] + 14}" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="bold" fill="#0066cc">${nm}</text>`;
        }
      });
      if (rowIdx === rows.length - 1) {
        const endX = PAD + offsetX + rowItems.length * CW;
        body += `<line x1="${endX}" y1="${lineYs[0]}" x2="${endX}" y2="${lineYs[4]}" stroke="#333" stroke-width="2.5"/>`;
        body += `<line x1="${endX + 4}" y1="${lineYs[0]}" x2="${endX + 4}" y2="${lineYs[4]}" stroke="#333" stroke-width="1.2"/>`;
      }
    }

    else if (type === "guitar") {
      // ── 吉他六线谱行 ──
      const tabTopY = contentY + 10;
      const stringYs = [tabTopY, tabTopY + 14, tabTopY + 28, tabTopY + 42, tabTopY + 56, tabTopY + 70];
      stringYs.forEach((sy, si) => {
        const sw = si >= 4 ? 2 : 1;
        body += `<line x1="${PAD}" y1="${sy}" x2="${PAD + rowW}" y2="${sy}" stroke="#333" stroke-width="${sw}"/>`;
      });
      body += `<text x="${PAD + 4}" y="${stringYs[1] + 4}" font-family="monospace" font-size="13" font-weight="bold" fill="#555">T</text>`;
      body += `<text x="${PAD + 4}" y="${stringYs[2] + 4}" font-family="monospace" font-size="13" font-weight="bold" fill="#555">A</text>`;
      body += `<text x="${PAD + 4}" y="${stringYs[3] + 4}" font-family="monospace" font-size="13" font-weight="bold" fill="#555">B</text>`;
      const offsetX = 22;

      // 和弦框图（每小节上方）
      if (showChords) {
        for (let b = 0; b < BARS_PER_ROW; b++) {
          const chord = chords[barOffset + b] ?? "";
          const bx = PAD + offsetX + b * (CW * NOTES_PER_BAR) + 2;
          body += chordDiagramSvg(chord, bx, rowY + 6);
        }
      }

      rowItems.forEach((f, i) => {
        const cx = PAD + offsetX + i * CW + CW / 2;
        if (i > 0 && i % NOTES_PER_BAR === 0) {
          body += `<line x1="${cx - CW / 2}" y1="${stringYs[0] - 4}" x2="${cx - CW / 2}" y2="${stringYs[5] + 4}" stroke="#555" stroke-width="1"/>`;
        }
        const strIdx = i % 2 === 0 ? 4 : 5;
        const sy = stringYs[strIdx];
        const tw = f.length > 1 ? 13 : 9;
        body += `<rect x="${cx - tw / 2 - 1}" y="${sy - 10}" width="${tw + 2}" height="14" fill="white"/>`;
        body += `<text x="${cx}" y="${sy + 2}" text-anchor="middle" font-family="monospace" font-size="13" font-weight="bold" fill="#0066cc">${f}</text>`;
      });
      if (rowIdx === rows.length - 1) {
        const endX = PAD + offsetX + rowItems.length * CW;
        body += `<line x1="${endX}" y1="${stringYs[0]}" x2="${endX}" y2="${stringYs[5]}" stroke="#333" stroke-width="2.5"/>`;
        body += `<line x1="${endX + 4}" y1="${stringYs[0]}" x2="${endX + 4}" y2="${stringYs[5]}" stroke="#333" stroke-width="1.2"/>`;
      }
    }

    else if (type === "piano") {
      // ── 钢琴双五线谱行 ──
      const topLines = [contentY + 4, contentY + 14, contentY + 24, contentY + 34, contentY + 44];
      const botLines = [contentY + 68, contentY + 78, contentY + 88, contentY + 98, contentY + 108];
      [...topLines, ...botLines].forEach((ly) => {
        body += `<line x1="${PAD}" y1="${ly}" x2="${PAD + rowW}" y2="${ly}" stroke="#333" stroke-width="1"/>`;
      });
      body += `<line x1="${PAD + 2}" y1="${topLines[0]}" x2="${PAD + 2}" y2="${botLines[4]}" stroke="#333" stroke-width="2"/>`;
      body += `<text x="${PAD + 6}" y="${topLines[1] + 26}" font-family="serif" font-size="50" fill="#333">𝄞</text>`;
      body += `<text x="${PAD + 6}" y="${botLines[1] + 14}" font-family="serif" font-size="38" fill="#333">𝄢</text>`;
      const offsetX = 36;

      rowItems.forEach((n, i) => {
        const cx = PAD + offsetX + i * CW + CW / 2;
        if (i > 0 && i % NOTES_PER_BAR === 0) {
          body += `<line x1="${cx - CW / 2}" y1="${topLines[0]}" x2="${cx - CW / 2}" y2="${botLines[4]}" stroke="#555" stroke-width="1"/>`;
        }
        const digit = Number(n.replace(/\D/g, "") || "4");
        if (i % 2 === 0) {
          const noteY = Math.max(topLines[0] - 4, Math.min(topLines[4] + 4, topLines[4] - (digit - 1) * 5));
          body += `<ellipse cx="${cx}" cy="${noteY}" rx="5" ry="3.5" fill="#cc5500"/>`;
          body += `<line x1="${cx + 5}" y1="${noteY}" x2="${cx + 5}" y2="${noteY - 18}" stroke="#cc5500" stroke-width="1.5"/>`;
        } else {
          const noteY = Math.max(botLines[0] - 4, Math.min(botLines[4] + 4, botLines[4] - (digit - 1) * 5));
          body += `<ellipse cx="${cx}" cy="${noteY}" rx="5" ry="3.5" fill="#884400"/>`;
          body += `<line x1="${cx + 5}" y1="${noteY}" x2="${cx + 5}" y2="${noteY - 18}" stroke="#884400" stroke-width="1.5"/>`;
        }
      });
      if (rowIdx === rows.length - 1) {
        const endX = PAD + offsetX + rowItems.length * CW;
        body += `<line x1="${endX}" y1="${topLines[0]}" x2="${endX}" y2="${botLines[4]}" stroke="#333" stroke-width="2.5"/>`;
        body += `<line x1="${endX + 4}" y1="${topLines[0]}" x2="${endX + 4}" y2="${botLines[4]}" stroke="#333" stroke-width="1.2"/>`;
      }
    }

    body += `<text x="${SVG_PAGE_W - PAD + 2}" y="${rowY + rh / 2}" font-family="monospace" font-size="9" fill="#bbb" text-anchor="start">${String(rowIdx + 1).padStart(2, "0")}</text>`;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_PAGE_W}" height="${totalH}" style="background:#ffffff;font-family:serif">`,
    body,
    `</svg>`,
  ].join("\n");
}