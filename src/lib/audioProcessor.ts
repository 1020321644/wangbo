/**
 * 音频处理引擎 — FFmpegKit 原生实现
 *
 * 使用 ffmpeg-kit-react-native 进行真实音频处理：
 * - analyzeAudioQuality：FFprobe 分析音频质量
 * - processWithFFmpeg：简单模式 DSP 增强滤镜链
 * - processWithAI：困难模式超复杂滤镜链（ONNX 模型降级兜底）
 */

import * as FileSystem from "expo-file-system";

export interface AudioQualityAnalysis {
  sampleRate: number;
  bitRate: number;
  channels: number;
  quality: "low" | "normal" | "high";
  recommendedMethod: "ffmpeg" | "ai";
}

/**
 * 分析音频文件质量（FFprobe）
 */
export async function analyzeAudioQuality(
  fileUri: string,
): Promise<AudioQualityAnalysis> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) throw new Error("文件不存在");

    const { FFprobeKit } = await import("ffmpeg-kit-react-native");
    const session = await FFprobeKit.getMediaInformation(fileUri);
    const info = session.getMediaInformation?.();

    // 新版 ffmpeg-kit-next：采样率/声道在 StreamInformation 上，从首个音频流获取
    const audioStream = info?.getStreams?.()?.[0];
    const sampleRate = audioStream ? parseInt(String(audioStream.getSampleRate?.() ?? "44100"), 10) : 44100;
    const bitRate    = info ? parseInt(String(info.getBitrate?.()   ?? "128000"), 10) : 128000;
    // 声道数：从 channel layout 字符串解析（stereo=2, mono=1, 5.1=6 等）
    const layout = audioStream?.getChannelLayout?.() ?? "";
    const channels = layout.includes("mono") ? 1 : layout.includes("5.1") ? 6 : 2;

    let quality: "low" | "normal" | "high";
    if (sampleRate < 32000 || bitRate < 128000) quality = "low";
    else if (sampleRate >= 44100 && bitRate >= 256000) quality = "high";
    else quality = "normal";

    const recommendedMethod: "ffmpeg" | "ai" = quality === "low" ? "ai" : "ffmpeg";
    console.log("[analyzeAudioQuality]", { sampleRate, bitRate, channels, quality, recommendedMethod });
    return { sampleRate, bitRate, channels, quality, recommendedMethod };
  } catch (error) {
    console.warn("[analyzeAudioQuality] FFprobe 失败，返回默认值:", error);
    return { sampleRate: 44100, bitRate: 128000, channels: 2, quality: "normal", recommendedMethod: "ffmpeg" };
  }
}

/**
 * 简单模式：FFmpeg DSP 滤镜增强（高通 + 压缩 + 均衡 + 归一化）
 */
export async function processWithFFmpeg(
  inputUri: string,
  outputUri: string,
  onProgress?: (progress: number, timeElapsed: number, timeRemaining: number) => void,
): Promise<void> {
  const { FFmpegKit, FFprobeKit } = await import("ffmpeg-kit-react-native");

  // 获取时长
  let durationMs = 0;
  try {
    const probe = await FFprobeKit.getMediaInformation(inputUri);
    const info  = probe.getMediaInformation?.();
    if (info) durationMs = parseFloat(String(info.getDuration?.() ?? "0")) * 1000;
  } catch { /* 忽略 */ }

  const startTime = Date.now();
  const command = [
    "-i", `"${inputUri}"`,
    "-af", [
      "highpass=f=80",
      "acompressor=threshold=-20dB:ratio=4:attack=5:release=50",
      "equalizer=f=2000:width_type=h:width=200:g=3",
      "equalizer=f=8000:width_type=h:width=1000:g=2",
      "alimiter=limit=0.95:attack=5:release=50",
      "aresample=48000", "aresample=96000", "aresample=48000",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
    ].join(","),
    "-ar", "48000",
    "-b:a", "320k",
    "-y",
    `"${outputUri}"`,
  ].join(" ");

  console.log("[processWithFFmpeg] 开始处理:", command);

  await FFmpegKit.executeAsync(
    command,
    async (session: import("ffmpeg-kit-react-native").FFmpegSession) => {
      const rc = await session.getReturnCode();
      if (rc.isValueSuccess()) {
        console.log("[processWithFFmpeg] ✅ 处理成功");
        onProgress?.(100, Date.now() - startTime, 0);
      } else {
        const logs = await session.getOutput();
        console.error("[processWithFFmpeg] ❌ 失败:", logs);
        throw new Error("FFmpeg DSP 处理失败");
      }
    },
    (log: import("ffmpeg-kit-react-native").Log) => console.log("[processWithFFmpeg]", log.getMessage()),
    (statistics: import("ffmpeg-kit-react-native").Statistics) => {
      if (durationMs > 0 && onProgress) {
        const t = statistics.getTime();
        const p = Math.min((t / durationMs) * 100, 100);
        const elapsed = Date.now() - startTime;
        onProgress(p, elapsed, p > 0 ? (elapsed / p) * (100 - p) : 0);
      }
    },
  );
}

/**
 * 困难模式：超复杂 FFmpeg 滤镜链（AI 超分辨率降级兜底，真实 ONNX 在 audioEngine 中调用）
 */
export async function processWithAI(
  inputUri: string,
  outputUri: string,
  onProgress?: (progress: number, timeElapsed: number, timeRemaining: number) => void,
): Promise<void> {
  const { FFmpegKit, FFprobeKit } = await import("ffmpeg-kit-react-native");

  let durationMs = 0;
  try {
    const probe = await FFprobeKit.getMediaInformation(inputUri);
    const info  = probe.getMediaInformation?.();
    if (info) durationMs = parseFloat(String(info.getDuration?.() ?? "0")) * 1000;
  } catch { /* 忽略 */ }

  const startTime = Date.now();
  const command = `-i "${inputUri}" -af "${[
    "aresample=192000",
    "highpass=f=60", "lowpass=f=20000",
    "acompressor=threshold=-30dB:ratio=6:attack=2:release=100",
    "equalizer=f=100:width_type=h:width=50:g=2",
    "equalizer=f=500:width_type=h:width=100:g=1",
    "equalizer=f=2000:width_type=h:width=200:g=3",
    "equalizer=f=5000:width_type=h:width=500:g=2",
    "equalizer=f=10000:width_type=h:width=1000:g=1",
    "stereotools=mlev=0.5:mwid=0.7",
    "afftdn=nr=20:nf=-25:tn=1",
    "adeclick",
    "aresample=96000", "aresample=192000", "aresample=96000", "aresample=48000",
    "aphaser=in_gain=0.4:out_gain=0.74:delay=3:decay=0.4:speed=0.5",
    "aphaser=in_gain=0.4:out_gain=0.74:delay=3:decay=0.4:speed=0.5",
    "aphaser=in_gain=0.4:out_gain=0.74:delay=3:decay=0.4:speed=0.5",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    "alimiter=limit=0.95:attack=5:release=50",
    "aresample=48000",
  ].join(",")}" -ar 48000 -b:a 320k -y "${outputUri}"`;

  console.log("[processWithAI] 🚀 开始困难模式处理:", command);

  await FFmpegKit.executeAsync(
    command,
    async (session: import("ffmpeg-kit-react-native").FFmpegSession) => {
      const rc = await session.getReturnCode();
      if (rc.isValueSuccess()) {
        console.log("[processWithAI] ✅ 处理成功");
        onProgress?.(100, Date.now() - startTime, 0);
      } else {
        const logs = await session.getOutput();
        console.error("[processWithAI] ❌ 失败:", logs);
        throw new Error("AI 超分处理失败");
      }
    },
    (log: import("ffmpeg-kit-react-native").Log) => console.log("[processWithAI]", log.getMessage()),
    (statistics: import("ffmpeg-kit-react-native").Statistics) => {
      if (durationMs > 0 && onProgress) {
        const t = statistics.getTime();
        const p = Math.min((t / durationMs) * 100, 100);
        const elapsed = Date.now() - startTime;
        onProgress(p, elapsed, p > 0 ? (elapsed / p) * (100 - p) : 0);
      }
    },
  );
}
