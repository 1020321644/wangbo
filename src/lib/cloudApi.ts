/**
 * 云端 AI 接口调用封装（Stem 分离 / 音频转 MIDI）
 * 所有第三方接口均经 Supabase Edge Function 代理，密钥由服务端持有。
 */
import { supabase } from "@/client/supabase";
import { fetch } from "expo/fetch";

export interface CloudStemResult {
  vocalsUrl: string;
  accompanimentUrl: string;
}

/** 读取本地音频文件为 base64（用于传给 Edge Function） */
export async function readAudioAsBase64(uri: string): Promise<string> {
  const resp = await fetch(uri);
  if (!resp.ok) throw new Error(`文件读取失败: ${resp.status}`);
  const arrayBuf = await resp.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

/** 云端 Stem 分离（多接口自动编排） */
export async function separateCloudStems(
  audioUri: string,
  fileName: string,
): Promise<{ provider: string; results: CloudStemResult }> {
  const audioBase64 = await readAudioAsBase64(audioUri);
  const { data, error } = await supabase.functions.invoke("stem-separate", {
    body: { audioBase64, fileName },
    method: "POST",
  });
  if (error) {
    const msg = (await error?.context?.text?.()) || error?.message || "云端分离失败";
    throw new Error(msg);
  }
  if (!data?.success) throw new Error(data?.error || "云端分离失败");
  return { provider: data.provider, results: data.results };
}

/** 云端 音频转 MIDI（多接口自动编排） */
export async function convertCloudMidi(
  audioUri: string,
  fileName: string,
): Promise<{ provider: string; midiUrl: string }> {
  const audioBase64 = await readAudioAsBase64(audioUri);
  const { data, error } = await supabase.functions.invoke("audio-to-midi", {
    body: { audioBase64, fileName },
    method: "POST",
  });
  if (error) {
    const msg = (await error?.context?.text?.()) || error?.message || "云端转换失败";
    throw new Error(msg);
  }
  if (!data?.success) throw new Error(data?.error || "云端转换失败");
  return { provider: data.provider, midiUrl: data.midiUrl };
}

/** 下载远程 URL 到本地缓存，返回本地 uri */
export async function downloadToCache(url: string, ext: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`下载失败: ${resp.status}`);
  const arrayBuf = await resp.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  const base64 = btoa(binary);
  const FileSystem = await import("expo-file-system/legacy");
  const outPath = (FileSystem.cacheDirectory ?? "") + `cloud_${Date.now()}.${ext}`;
  await FileSystem.writeAsStringAsync(outPath, base64, {
    encoding: "base64",
  });
  return outPath;
}