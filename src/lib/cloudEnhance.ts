/**
 * cloudEnhance — 困难模式云端增强客户端
 *
 * 隐私：仅上传「本地处理后的临时音频」，不上传原始文件。
 * 通过 Edge Function (cloud-enhance) 代理调用外网开源 AI 接口，
 * 接口选择/超时/容错由服务端处理；失败时客户端保留本地结果。
 */
import * as FileSystem from "expo-file-system/legacy";

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
  const { data, error } = await supabase.functions.invoke("cloud-enhance", {
    body: { audio: b64 },
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