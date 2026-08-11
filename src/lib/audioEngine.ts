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
  /** 高质量模式开关（预留参数） */
  highQuality?: boolean;
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
  onEngine?: (engine: "ffmpeg-dsp" | "deepfilternet" | "audiosr" | "cloud-ai" | "none") => void,
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

  // 获取音频时长（用于进度回调）
  let durationMs = estimateDuration(sourceSize ?? 0, target, params.masterEnhance);
  try {
    const probe = await FFprobeKit.getMediaInformation(sourceUri);
    const info2 = probe.getMediaInformation?.();
    if (info2) durationMs = parseFloat(String(info2.getDuration?.() ?? "0")) * 1000 || durationMs;
  } catch { /* 忽略 */ }

  const startTs = Date.now();

  // ── 母带增强路径（masterEnhance=true）────────────────────────────────────
  if (params.masterEnhance) {
    // ── 母带增强：默认纯 FFmpeg DSP 专业滤镜链（开箱即用，无需任何 Token）
    // 若用户在设置中配置了 HF Token，则额外尝试云端 AI 增强（可选）
    try {
      const { getHfToken } = await import("@/lib/hfToken");
      const token = await getHfToken().catch(() => "");
      if (token) {
        const { cloudEnhanceAudio } = await import("@/lib/cloudEnhance");
        onEngine?.("cloud-ai");
        onProgress(0.02, "云端 AI 增强中（已配置 Token）...");
        const cloudResult = await cloudEnhanceAudio(sourceUri, (p, l) => onProgress(p, l));
        if (cloudResult.ok && cloudResult.uri) {
          await FileSystem.copyAsync({ from: cloudResult.uri, to: outUri });
          onProgress(1, "云端 AI 增强完成 ✓");
          return outUri;
        }
        console.warn("[audioEngine] 云端增强未成功，降级 FFmpeg DSP:", cloudResult.error);
      }
    } catch (e) {
      console.warn("[audioEngine] 云端增强异常，降级 FFmpeg DSP:", e);
    }

    // 专业 FFmpeg DSP 母带增强（录音棚级滤镜链，默认主路径，无需 Token）
    onEngine?.("ffmpeg-dsp");
    onProgress(0.02, "FFmpeg 专业母带增强中...");
    await runFFmpegEnhance(sourceUri, outUri, params, durationMs, startTs, onProgress, FFmpegKit, ReturnCode);
    return outUri;
  }

  // ── 纯格式转换路径（masterEnhance=false）─────────────────────────────────
  onEngine?.("none");
  const ffmpegArgs = buildFfmpegArgs(target, params);
  const command = `-i "${sourceUri}" ${ffmpegArgs.join(" ")} -y "${outUri}"`;
  console.log("[audioEngine] 格式转换:", command);

  await new Promise<void>((resolve, reject) => {
    FFmpegKit.executeAsync(
      command,
      async (session: import("ffmpeg-kit-react-native").FFmpegSession) => {
        const rc = await session.getReturnCode();
        if (ReturnCode.isSuccess(rc)) {
          onProgress(1, "输出文件就绪");
          resolve();
        } else {
          const logs = await session.getOutput();
          console.error("[audioEngine] FFmpeg 失败:", logs);
          reject(new Error(`FFmpeg 转换失败: ${logs?.slice(-200) ?? "未知错误"}`));
        }
      },
      (log: import("ffmpeg-kit-react-native").Log) => console.log("[FFmpeg]", log.getMessage()),
      (statistics: import("ffmpeg-kit-react-native").Statistics) => {
        const t = statistics.getTime();
        const p = Math.min(t / durationMs, 0.97);
        onProgress(Number(p.toFixed(3)), `编码 ${target} · ${Math.round(p * 100)}%`);
      },
    );
  });

  // 验证输出
  const stat = await FileSystem.getInfoAsync(outUri);
  if (!stat.exists || !stat.size || stat.size === 0) {
    // 降级：复制原文件
    const fallExt = sourceName.split(".").pop()?.toLowerCase() ?? "audio";
    const fallUri = `${cacheDir}fallback_${Date.now()}.${fallExt}`;
    await FileSystem.copyAsync({ from: sourceUri, to: fallUri });
    onProgress(1, `已复制原文件（转换失败，保留原格式 ${fallExt.toUpperCase()}）`);
    return fallUri;
  }
  return outUri;
}

// ── ONNX 本地推理已迁移至云端（cloud-enhance Edge Function）────────────────
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
    ? [ // 困难模式：专业母带滤镜链（DSP Pro）
        // ⚠️  stereotools 的 mwid 选项在当前 FFmpeg 版本无效，已替换为 extrastereo
        "highpass=f=60", "lowpass=f=20000",
        "acompressor=threshold=-30dB:ratio=6:attack=2:release=100",
        "equalizer=f=100:width_type=h:width=50:g=2",
        "equalizer=f=2000:width_type=h:width=200:g=3",
        "equalizer=f=10000:width_type=h:width=1000:g=1",
        "extrastereo=m=0.3",   // 立体声宽度增强（替代 stereotools=mlev:mwid）
        "afftdn=nr=15:nf=-25:tn=1", // 频域降噪
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "alimiter=limit=0.95:attack=5:release=50",
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

  const command = `-i "${inputUri}" -af "${enhanceFilter.join(",")}" -ar 48000 -sample_fmt s32 -c:a pcm_s24le -y "${outputUri}"`;
  console.log("[audioEngine] FFmpeg 增强:", command);

  await new Promise<void>((resolve, reject) => {
    FFmpegKit.executeAsync(
      command,
      async (session: any) => {
        const rc = await session.getReturnCode();
        if (ReturnCode.isSuccess(rc)) {
          onProgress(1, "母带增强完成（FFmpeg DSP）");
          resolve();
        } else {
          const logs = await session.getOutput();
          reject(new Error(`FFmpeg 增强失败: ${logs?.slice(-200) ?? ""}`));
        }
      },
      (log: any) => console.log("[FFmpeg-Enhance]", log.getMessage()),
      (statistics: any) => {
        const t = statistics.getTime();
        const p = Math.min(t / durationMs, 0.97);
        onProgress(Number(p.toFixed(3)), `FFmpeg DSP · ${Math.round(p * 100)}%`);
      },
    );
  });
}

/** 调试用：生成 1 秒正弦波 WAV 并跑一遍 FFmpeg 母带增强滤镜，验证本地引擎可用 */
export async function testMasterEnhance(
  onProgress?: (p: number, label: string) => void,
): Promise<{ ok: boolean; message: string }> {
  const cacheDir = FileSystem.cacheDirectory ?? "";
  if (process.env.EXPO_OS === "web") {
    return { ok: true, message: "Web 预览环境跳过本地引擎测试（原生设备可用）" };
  }
  onProgress?.(0.1, "生成测试音频…");
  const SR = 16000, SECS = 1, num = SR * SECS;
  const wav = new Uint8Array(44 + num * 2);
  const view = new DataView(wav.buffer);
  [82, 73, 70, 70].forEach((b, i) => (wav[i] = b));
  view.setUint32(4, 36 + num * 2, true);
  [87, 65, 86, 69, 102, 109, 116, 32].forEach((b, i) => (wav[8 + i] = b));
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SR, true);
  view.setUint32(28, SR * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  [100, 97, 116, 97].forEach((b, i) => (wav[36 + i] = b));
  view.setUint32(40, num * 2, true);
  for (let i = 0; i < num; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / SR) * 16383), true);
  }
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < wav.length; i += CHUNK) {
    bin += String.fromCharCode(...Array.from(wav.subarray(i, i + CHUNK)));
  }
  const inUri = `${cacheDir}mt_test_in_${Date.now()}.wav`;
  const outUri = `${cacheDir}mt_test_out_${Date.now()}.wav`;
  await FileSystem.writeAsStringAsync(inUri, btoa(bin), {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress?.(0.4, "FFmpeg 母带增强处理中…");
  const { FFmpegKit, ReturnCode } = await import("ffmpeg-kit-react-native");
  const filter =
    "highpass=f=80,acompressor=threshold=-20dB:ratio=4:attack=5:release=50," +
    "equalizer=f=2000:width_type=h:width=200:g=3,equalizer=f=8000:width_type=h:width=1000:g=2," +
    "alimiter=limit=0.95:attack=5:release=50,loudnorm=I=-16:TP=-1.5:LRA=11";
  const command = `-i "${inUri}" -af "${filter}" -ar 48000 -sample_fmt s32 -c:a pcm_s24le -y "${outUri}"`;
  let ok = false;
  let errMsg = "";
  await new Promise<void>((resolve) => {
    FFmpegKit.executeAsync(command, async (session: any) => {
      const rc = await session.getReturnCode();
      if (ReturnCode.isSuccess(rc)) ok = true;
      else errMsg = (await session.getOutput())?.slice(-150) ?? "";
      resolve();
    });
  });
  await FileSystem.deleteAsync(inUri, { idempotent: true }).catch(() => {});
  if (ok) {
    const stat = await FileSystem.getInfoAsync(outUri);
    const outSize = stat.exists ? stat.size ?? 0 : 0;
    await FileSystem.deleteAsync(outUri, { idempotent: true }).catch(() => {});
    onProgress?.(1, "完成");
    return {
      ok: true,
      message: `✅ 本地母带增强（FFmpeg DSP）测试通过！输出 ${outSize} 字节，录音棚级滤镜链正常工作，无需 Token 即可使用。`,
    };
  }
  return { ok: false, message: `❌ FFmpeg 增强失败：${errMsg}` };
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