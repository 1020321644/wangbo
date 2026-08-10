/**
 * AI 音频增强客户端（纯云端，无密钥）
 *
 * 流程：
 *  1. 上传音频到中转桶，得到公开 URL
 *  2. 调用 ai-enhance Edge Function（内部按选项择优多模型，无鉴权）
 *  3. 下载结果写回本地文件
 *
 * 所有外部请求经 Edge Function 代理转发，无需任何 API 密钥。
 */
import { supabase } from "@/client/supabase";
import * as FileSystem from "expo-file-system/legacy";
import { fetch } from "expo/fetch";

const REQUEST_TIMEOUT = 90000; // 云端多模型回退可能较慢

export interface EnhanceOptions {
  denoise: boolean;
  enhance: boolean;
  normalize: boolean;
}

export interface EnhanceResult {
  localUri: string;
  size: number;
  engineName: string;
}

/**
 * 云端 AI 音质增强
 * @param onPhase    阶段文案回调
 * @param onProgress 进度回调 0-100
 */
export async function enhanceCloud(
  inputUri: string,
  inputName: string,
  options: EnhanceOptions,
  onPhase?: (text: string) => void,
  onProgress?: (value: number) => void,
): Promise<EnhanceResult> {
  // 1. 上传到中转桶
  onPhase?.("上传音频中…");
  onProgress?.(8);
  const arrayBuffer = await (await fetch(inputUri)).arrayBuffer();
  const uploadName = `inputs/${Date.now()}_${inputName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: upErr } = await supabase.storage
    .from("ai-audio")
    .upload(uploadName, arrayBuffer, { contentType: "audio/wav", upsert: true });
  if (upErr) throw new Error(`上传失败：${upErr.message}`);
  onProgress?.(20);
  const { data: pub } = supabase.storage.from("ai-audio").getPublicUrl(uploadName);

  // 2. 调用云端 Edge Function
  onPhase?.("云端 AI 增强中…");
  onProgress?.(35);
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-enhance`;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);

  // 等待期间平滑推进进度（35 → 80）
  let p = 35;
  const creep = setInterval(() => {
    p = Math.min(p + 4, 80);
    onProgress?.(p);
  }, 4000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ fileUrl: pub.publicUrl, options }),
      signal: ctrl.signal,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error((data as { error?: string })?.error || `接口返回 ${resp.status}`);
    }
    const resultUrl = (data as { url?: string })?.url;
    if (!resultUrl) throw new Error("云端未返回结果");

    // 3. 下载结果写回本地
    onPhase?.("下载增强结果…");
    onProgress?.(88);
    const outName = `${inputName.replace(/\.[^.]+$/, "")}_ai_enhanced.wav`;
    const outUri = `${FileSystem.documentDirectory}${outName}`;
    const dl = await FileSystem.downloadAsync(resultUrl, outUri);
    onProgress?.(100);
    return {
      localUri: dl.uri,
      size: (data as { size?: number })?.size ?? 0,
      engineName: (data as { model?: string })?.model || "云端 AI",
    };
  } finally {
    clearTimeout(timer);
    clearInterval(creep);
  }
}