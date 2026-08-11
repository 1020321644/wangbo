/**
 * cloudEnhance — 云端 AI 音频增强客户端
 *
 * 通过 Supabase Edge Function (cloud-enhance) 调用 HF Inference API
 * 进行 MetricGAN+ 语音增强。HF token 由用户在设置中填写，存于 SecureStore。
 * 云端失败时客户端自动降级 FFmpeg DSP，保证有声音绝不无声。
 */
import * as FileSystem from "expo-file-system/legacy";
import { getHfToken } from "@/lib/hfToken";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB 上限（云端增强）

export interface CloudEnhanceResult {
  ok: boolean;
  uri?: string;
  error?: string;
}

export async function cloudEnhanceAudio(
  processedUri: string,
  onProgress?: (p: number, label: string) => void,
): Promise<CloudEnhanceResult> {
  onProgress?.(0.1, "云端增强中… 预计 25 秒");

  // 读取本地处理后的临时文件为 Base64（仅上传处理结果，非原始文件）
  let b64: string;
  try {
    const info = await FileSystem.getInfoAsync(processedUri);
    if (!info.exists || (info.size ?? 0) > MAX_BYTES) {
      return { ok: false, error: "文件过大（>20MB），已跳过云端增强" };
    }
    b64 = await FileSystem.readAsStringAsync(processedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (e) {
    return { ok: false, error: `读取文件失败：${e instanceof Error ? e.message : "未知"}` };
  }

  onProgress?.(0.3, "云端增强中… 预计 25 秒");

  const { supabase } = await import("@/client/supabase");
  // 读取用户 HF token（设置页填写，存于 SecureStore）
  const hfToken = await getHfToken().catch(() => "");

  const { data, error } = await supabase.functions.invoke("cloud-enhance", {
    body: { audio: b64, hfToken },
    method: "POST",
  });

  if (error) {
    let msg = error.message;
    try {
      const text = await error?.context?.text?.();
      if (text) msg = text;
    } catch { /* 忽略 */ }
    console.error("[cloudEnhance] 调用失败:", msg);
    return { ok: false, error: msg };
  }

  if (!data?.ok || !data?.audio) {
    return { ok: false, error: data?.error ?? "云端增强失败" };
  }

  // 写回增强结果（服务端不留存临时文件）
  const outUri = `${FileSystem.cacheDirectory}cloud_${Date.now()}.wav`;
  try {
    await FileSystem.writeAsStringAsync(outUri, data.audio as string, {
      encoding: FileSystem.EncodingType.Base64,
    });
    onProgress?.(1, "云端增强完成");
    return { ok: true, uri: outUri };
  } catch (e) {
    return { ok: false, error: `写入结果失败：${e instanceof Error ? e.message : "未知"}` };
  }
}