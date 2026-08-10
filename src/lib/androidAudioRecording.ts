/**
 * Android 系统内录音频数据处理
 * 将 PCM 音频数据写入文件并编码为 MP3
 */

import * as FileSystem from "expo-file-system/legacy";

export interface AudioRecordingConfig {
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

/**
 * 创建音频录制会话
 * 返回文件路径和写入函数
 */
export async function createAudioRecordingSession(
  config: AudioRecordingConfig
): Promise<{
  tempWavPath: string;
  outputMp3Path: string;
  writeAudioData: (data: ArrayBuffer) => Promise<void>;
  finalize: () => Promise<string>;
}> {
  const timestamp = Date.now();
  const tempWavPath = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}recording_${timestamp}.wav`;
  const outputMp3Path = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}recording_${timestamp}.mp3`;

  // WAV 文件头（44 字节）
  const wavHeader = createWavHeader(config);
  
  // 写入 WAV 文件头
  const base64Header = arrayBufferToBase64(wavHeader);
  await FileSystem.writeAsStringAsync(tempWavPath, base64Header);

  let totalBytes = 0;

  /**
   * 写入音频数据
   */
  const writeAudioData = async (data: ArrayBuffer) => {
    const base64Data = arrayBufferToBase64(data);
    
    // 追加到文件
    await FileSystem.writeAsStringAsync(tempWavPath, base64Data);

    totalBytes += data.byteLength;
    console.log(`[AudioRecording] 已写入 ${totalBytes} 字节`);
  };

  /**
   * 完成录制，编码为 MP3
   */
  const finalize = async (): Promise<string> => {
    console.log(`[AudioRecording] 录制完成，总计 ${totalBytes} 字节`);
    console.log(`[AudioRecording] 开始编码为 MP3...`);

    // 更新 WAV 文件头中的文件大小
    await updateWavHeader(tempWavPath, totalBytes);

    // 使用 FFmpegKit 编码为 MP3（320kbps / 48kHz）
    const { FFmpegKit, ReturnCode } = await import("ffmpeg-kit-react-native");
    const cmd = `-i "${tempWavPath}" -ar 48000 -b:a 320k -y "${outputMp3Path}"`;
    const session = await FFmpegKit.execute(cmd);
    const rc = await session.getReturnCode();
    if (!ReturnCode.isSuccess(rc)) {
      const logs = await session.getOutput();
      throw new Error(`FFmpegKit MP3 编码失败: ${logs?.slice(-200) ?? ""}`);
    }

    console.log("[AudioRecording] ✅ MP3 编码成功");

    // 删除临时 WAV 文件
    await FileSystem.deleteAsync(tempWavPath, { idempotent: true });

    return outputMp3Path;
  };

  return {
    tempWavPath,
    outputMp3Path,
    writeAudioData,
    finalize,
  };
}

/**
 * 创建 WAV 文件头
 */
function createWavHeader(config: AudioRecordingConfig): ArrayBuffer {
  const { sampleRate, channels, bitDepth } = config;
  
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF 头
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36, true); // 文件大小 - 8（稍后更新）
  writeString(view, 8, "WAVE");

  // fmt 子块
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt 子块大小
  view.setUint16(20, 1, true); // 音频格式（1 = PCM）
  view.setUint16(22, channels, true); // 声道数
  view.setUint32(24, sampleRate, true); // 采样率
  view.setUint32(28, sampleRate * channels * (bitDepth / 8), true); // 字节率
  view.setUint16(32, channels * (bitDepth / 8), true); // 块对齐
  view.setUint16(34, bitDepth, true); // 位深度

  // data 子块
  writeString(view, 36, "data");
  view.setUint32(40, 0, true); // 数据大小（稍后更新）

  return buffer;
}

/**
 * 更新 WAV 文件头中的文件大小
 */
async function updateWavHeader(filePath: string, dataSize: number): Promise<void> {
  const fileInfo = await FileSystem.getInfoAsync(filePath);
  if (!fileInfo.exists) {
    throw new Error("文件不存在");
  }

  // 读取文件头
  const base64Header = await FileSystem.readAsStringAsync(filePath);
  const headerBuffer = base64ToArrayBuffer(base64Header.substring(0, 88)); // 44 字节 = 88 个 base64 字符
  const view = new DataView(headerBuffer);

  // 更新文件大小
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(40, dataSize, true);

  // 写回文件
  const updatedBase64 = arrayBufferToBase64(headerBuffer);
  await FileSystem.writeAsStringAsync(filePath, updatedBase64);
}

/**
 * 写入字符串到 DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * ArrayBuffer 转 Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 转 ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 使用示例：
 * 
 * ```typescript
 * import { createAudioRecordingSession } from "@/lib/androidAudioRecording";
 * import { AndroidAudioCapture } from "@/lib/androidAudioCapture";
 * 
 * // 1. 创建录制会话
 * const session = await createAudioRecordingSession({
 *   sampleRate: 48000,
 *   channels: 2,
 *   bitDepth: 16,
 * });
 * 
 * // 2. 监听音频数据
 * const unsubscribe = AndroidAudioCapture.onAudioData((data) => {
 *   // 将音频数据写入文件
 *   session.writeAudioData(data.buffer);
 * });
 * 
 * // 3. 开始录制
 * await AndroidAudioCapture.startCapture();
 * 
 * // 4. 停止录制
 * await AndroidAudioCapture.stopCapture();
 * unsubscribe();
 * 
 * // 5. 完成录制，编码为 MP3
 * const mp3Path = await session.finalize();
 * console.log("录制完成:", mp3Path);
 * ```
 */
