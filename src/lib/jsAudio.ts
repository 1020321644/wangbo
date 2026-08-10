/**
 * 纯 JS 音频处理工具（替代 ffmpeg-kit-react-native）
 *
 * 由于 ffmpeg-kit 的 maven binaries 已不可用（Arthenica 项目关闭），
 * 改用纯 JS 实现音频信息解析、WAV 处理与 MP3 编码。
 */

import * as FileSystem from "expo-file-system";
import { fetch } from "expo/fetch";

/** 音频基本信息 */
export interface AudioInfo {
  duration: number; // 秒
  sampleRate: number;
  channels: number;
  bitRate: number;
  bitsPerSample: number;
}

/** 读取文件为 ArrayBuffer */
async function readArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return await response.arrayBuffer();
}

/**
 * 解析音频文件信息（支持 WAV/MP3/FLAC 等常见格式）
 */
export async function getAudioInfo(uri: string): Promise<AudioInfo> {
  const buffer = await readArrayBuffer(uri);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // WAV (RIFF)
  if (
    bytes.length >= 44 &&
    view.getUint32(0, false) === 0x52494646 && // "RIFF"
    view.getUint32(8, false) === 0x57415645 // "WAVE"
  ) {
    return parseWav(view);
  }

  // MP3 (ID3v2 或直接帧)
  if (
    bytes.length >= 3 &&
    (view.getUint32(0, false) === 0x49443303 || // "ID3"
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
  ) {
    return parseMp3(buffer, bytes);
  }

  // FLAC
  if (bytes.length >= 4 && view.getUint32(0, false) === 0x664c6143) {
    return parseFlac(view, bytes);
  }

  // 兜底：按文件大小估算
  const stat = await FileSystem.getInfoAsync(uri);
  const size = stat.exists ? (stat.size ?? 0) : 0;
  return {
    duration: size > 0 ? size / (16000 * 1024) * 60 : 0,
    sampleRate: 44100,
    channels: 2,
    bitRate: 128000,
    bitsPerSample: 16,
  };
}

function parseWav(view: DataView): AudioInfo {
  let sampleRate = 44100;
  let channels = 2;
  let bitsPerSample = 16;
  let dataSize = 0;
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x666d7420) {
      // "fmt "
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 20, true);
    } else if (chunkId === 0x64617461) {
      // "data"
      dataSize = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const duration = byteRate > 0 ? dataSize / byteRate : 0;
  return {
    duration,
    sampleRate,
    channels,
    bitRate: Math.round(byteRate * 8),
    bitsPerSample,
  };
}

function parseMp3(buffer: ArrayBuffer, bytes: Uint8Array): AudioInfo {
  let offset = 0;
  // 跳过 ID3v2
  if (bytes.length >= 10 && viewStr(bytes, 0, 3) === "ID3") {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    offset = 10 + size;
  }
  // 查找第一个有效帧
  let sampleRate = 44100;
  let channels = 2;
  const bitrateTable = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
  ];
  const srTable = [
    [44100, 48000, 32000],
    [22050, 24000, 16000],
    [11025, 12000, 8000],
  ];
  for (let i = offset; i < bytes.length - 4; i++) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
      const versionBits = (bytes[i + 1] >> 3) & 0x03;
      const layerBits = (bytes[i + 1] >> 1) & 0x03;
      const bitrateIdx = (bytes[i + 2] >> 4) & 0x0f;
      const srIdx = (bytes[i + 2] >> 2) & 0x03;
      const channelMode = (bytes[i + 3] >> 6) & 0x03;
      if (layerBits === 0x01) {
        // Layer III
        const vIdx = versionBits === 0x03 ? 0 : versionBits === 0x02 ? 1 : 2;
        sampleRate = srTable[vIdx]?.[srIdx] ?? 44100;
        channels = channelMode === 0x03 ? 1 : 2;
        const br = bitrateTable[bitrateIdx] * 1000;
        const frameLen = Math.floor((144 * br) / sampleRate);
        const remaining = bytes.length - i;
        const frames = Math.floor(remaining / Math.max(frameLen, 1));
        const duration = frames * (1152 / sampleRate);
        return {
          duration,
          sampleRate,
          channels,
          bitRate: br || 128000,
          bitsPerSample: 16,
        };
      }
    }
  }
  return {
    duration: buffer.byteLength / 16000,
    sampleRate: 44100,
    channels: 2,
    bitRate: 128000,
    bitsPerSample: 16,
  };
}

function parseFlac(view: DataView, bytes: Uint8Array): AudioInfo {
  let sampleRate = 44100;
  let channels = 2;
  let bitsPerSample = 16;
  let totalSamples = 0;
  let offset = 4;
  while (offset + 4 < bytes.length) {
    const blockType = bytes[offset] & 0x7f;
    const isLast = (bytes[offset] & 0x80) !== 0;
    const len = view.getUint32(offset + 1, false);
    if (blockType === 0) {
      // STREAMINFO
      const _minBlockSize = view.getUint16(offset + 5, false);
      const _maxBlockSize = view.getUint16(offset + 7, false);
      const _minFrame = view.getUint24(offset + 9);
      const _maxFrame = view.getUint24(offset + 12);
      const sr = view.getUint32(offset + 18, false) >> 12;
      sampleRate = sr;
      channels = ((view.getUint8(offset + 20) >> 1) & 0x07) + 1;
      bitsPerSample = (((view.getUint8(offset + 20) & 0x01) << 4) | (view.getUint8(offset + 21) >> 4)) + 1;
      totalSamples = view.getUint32(offset + 22, false) & 0x0fffffff;
      const duration = sampleRate > 0 ? totalSamples / sampleRate : 0;
      return {
        duration,
        sampleRate,
        channels,
        bitRate: Math.round(sampleRate * channels * bitsPerSample),
        bitsPerSample,
      };
    }
    offset += 4 + len;
    if (isLast) break;
  }
  return {
    duration: bytes.length / 16000,
    sampleRate,
    channels,
    bitRate: 128000,
    bitsPerSample,
  };
}

function viewStr(bytes: Uint8Array, from: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[from + i]);
  return s;
}

/** DataView 扩展：读取 24 位无符号整数 */
declare global {
  interface DataView {
    getUint24(byteOffset: number, littleEndian?: boolean): number;
  }
}
DataView.prototype.getUint24 = function (byteOffset: number, littleEndian = false): number {
  const b1 = this.getUint8(byteOffset);
  const b2 = this.getUint8(byteOffset + 1);
  const b3 = this.getUint8(byteOffset + 2);
  return littleEndian ? (b3 << 16) | (b2 << 8) | b1 : (b1 << 16) | (b2 << 8) | b3;
};

/** PCM 样本（Float32，范围 -1 ~ 1） */
export interface PcmData {
  samples: Float32Array; // 交错声道
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

/**
 * 解码 WAV 为 PCM Float32 样本
 */
export async function decodeWav(uri: string): Promise<PcmData> {
  const buffer = await readArrayBuffer(uri);
  const view = new DataView(buffer);
  let offset = 12;
  let dataOffset = 0;
  let dataLen = 0;
  let sampleRate = 44100;
  let channels = 2;
  let bitsPerSample = 16;
  while (offset + 8 <= view.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x666d7420) {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 20, true);
    } else if (chunkId === 0x64617461) {
      dataOffset = offset + 8;
      dataLen = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  const frameCount = Math.floor(dataLen / (channels * (bitsPerSample / 8)));
  const samples = new Float32Array(frameCount * channels);
  const bytesPerSample = bitsPerSample / 8;
  for (let i = 0; i < frameCount; i++) {
    for (let c = 0; c < channels; c++) {
      const pos = dataOffset + (i * channels + c) * bytesPerSample;
      let val = 0;
      if (bitsPerSample === 16) {
        val = view.getInt16(pos, true) / 32768;
      } else if (bitsPerSample === 24) {
        const b1 = view.getInt8(pos);
        const b2 = view.getUint8(pos + 1);
        const b3 = view.getUint8(pos + 2);
        val = ((b1 << 16) | (b2 << 8) | b3) / 8388608;
      } else if (bitsPerSample === 32) {
        val = view.getInt32(pos, true) / 2147483648;
      }
      samples[i * channels + c] = val;
    }
  }
  return { samples, sampleRate, channels, bitsPerSample };
}

/**
 * 将 PCM Float32 样本编码为 WAV 文件
 */
export async function encodeWav(
  pcm: PcmData,
  outUri: string,
  bitsPerSample = 16,
): Promise<void> {
  const { samples, sampleRate, channels } = pcm;
  const frameCount = samples.length / channels;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = frameCount * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const pos = 44 + i * bytesPerSample;
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    if (bitsPerSample === 16) {
      view.setInt16(pos, Math.round(clamped * 32767), true);
    } else if (bitsPerSample === 24) {
      const v = Math.round(clamped * 8388607);
      view.setUint8(pos, (v >> 16) & 0xff);
      view.setUint8(pos + 1, (v >> 8) & 0xff);
      view.setUint8(pos + 2, v & 0xff);
    } else if (bitsPerSample === 32) {
      view.setInt32(pos, Math.round(clamped * 2147483647), true);
    }
  }
  const base64 = arrayBufferToBase64(buffer);
  await FileSystem.writeAsStringAsync(outUri, base64, {
    encoding: "base64",
  });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

/**
 * 线性重采样（改变采样率）
 */
export function resample(pcm: PcmData, targetRate: number): PcmData {
  if (pcm.sampleRate === targetRate) return pcm;
  const ratio = targetRate / pcm.sampleRate;
  const newLen = Math.round((pcm.samples.length / pcm.channels) * ratio);
  const out = new Float32Array(newLen * pcm.channels);
  for (let i = 0; i < newLen; i++) {
    const srcPos = i / ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    for (let c = 0; c < pcm.channels; c++) {
      const a = pcm.samples[srcIdx * pcm.channels + c] ?? 0;
      const b = pcm.samples[(srcIdx + 1) * pcm.channels + c] ?? a;
      out[i * pcm.channels + c] = a + (b - a) * frac;
    }
  }
  return { samples: out, sampleRate: targetRate, channels: pcm.channels, bitsPerSample: pcm.bitsPerSample };
}

/**
 * 简单增益（音量调整）
 */
export function applyGain(pcm: PcmData, gain: number): PcmData {
  const out = new Float32Array(pcm.samples.length);
  for (let i = 0; i < pcm.samples.length; i++) {
    out[i] = pcm.samples[i] * gain;
  }
  return { ...pcm, samples: out };
}

/**
 * 峰值归一化（响度标准化）
 */
export function normalize(pcm: PcmData, targetPeak = 0.95): PcmData {
  let peak = 0;
  for (let i = 0; i < pcm.samples.length; i++) {
    const a = Math.abs(pcm.samples[i]);
    if (a > peak) peak = a;
  }
  if (peak === 0) return pcm;
  return applyGain(pcm, targetPeak / peak);
}

/**
 * 简单高通滤波（去除低频噪声）
 */
export function highpass(pcm: PcmData, cutoffHz = 80): PcmData {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / pcm.sampleRate;
  const alpha = rc / (rc + dt);
  const out = new Float32Array(pcm.samples.length);
  let prevIn = Array.from({ length: pcm.channels }).fill(0) as number[];
  let prevOut = Array.from({ length: pcm.channels }).fill(0) as number[];
  const frameCount = pcm.samples.length / pcm.channels;
  for (let i = 0; i < frameCount; i++) {
    for (let c = 0; c < pcm.channels; c++) {
      const x = pcm.samples[i * pcm.channels + c];
      const y = alpha * (prevOut[c] + x - prevIn[c]);
      out[i * pcm.channels + c] = y;
      prevIn[c] = x;
      prevOut[c] = y;
    }
  }
  return { ...pcm, samples: out };
}

/**
 * 使用 lamejs 将 PCM 编码为 MP3
 */
export async function encodeMp3(
  pcm: PcmData,
  outUri: string,
  kbps = 320,
): Promise<void> {
  const lamejs = await import("lamejs");
  const Mp3Encoder = lamejs.Mp3Encoder;
  const encoder = new Mp3Encoder(pcm.channels, pcm.sampleRate, kbps);
  // 分离声道
  const frameCount = pcm.samples.length / pcm.channels;
  const left = new Int16Array(frameCount);
  const right = pcm.channels > 1 ? new Int16Array(frameCount) : null;
  for (let i = 0; i < frameCount; i++) {
    const l = Math.max(-1, Math.min(1, pcm.samples[i * pcm.channels]));
    left[i] = l < 0 ? l * 0x8000 : l * 0x7fff;
    if (right) {
      const r = Math.max(-1, Math.min(1, pcm.samples[i * pcm.channels + 1]));
      right[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
    }
  }
  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < frameCount; i += blockSize) {
    const lChunk = left.subarray(i, i + blockSize);
    const rChunk = right ? right.subarray(i, i + blockSize) : null;
    const buf = rChunk
      ? encoder.encodeBuffer(lChunk, rChunk)
      : encoder.encodeBuffer(lChunk);
    if (buf.length > 0) chunks.push(new Uint8Array(buf));
  }
  const end = encoder.flush();
  if (end.length > 0) chunks.push(new Uint8Array(end));
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    result.set(c, pos);
    pos += c.length;
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < result.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(result.subarray(i, i + chunk)),
    );
  }
  await FileSystem.writeAsStringAsync(outUri, btoa(binary), {
    encoding: "base64",
  });
}

/**
 * 裁剪 PCM（按秒）
 */
export function trim(pcm: PcmData, startSec: number, endSec: number): PcmData {
  const startSample = Math.floor(startSec * pcm.sampleRate);
  const endSample = Math.floor(endSec * pcm.sampleRate);
  const startIdx = Math.max(0, startSample) * pcm.channels;
  const endIdx = Math.min(pcm.samples.length / pcm.channels, endSample) * pcm.channels;
  const out = pcm.samples.slice(startIdx, endIdx);
  return { ...pcm, samples: out };
}