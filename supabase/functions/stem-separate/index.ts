/**
 * stem-separate Edge Function — 纯 HF 无鉴权多接口编排
 *
 * 全部使用 Hugging Face Inference API 公开开源模型。
 * ✅ 无需任何 API 密钥，免费可用（公开模型无需 Authorization）。
 * 主用 3 个 + 备用 6 个，按顺序尝试，任一成功即返回。
 * 全部失败才报错，错误明细一并返回。
 *
 * HF 无鉴权说明：
 *   - 公开模型无需 Authorization 请求头即可调用
 *   - 无 Token 时有轻微速率限制，但对单曲处理完全够用
 *   - 开源模型列表：Demucs, Spleeter, SepFormer 等
 *
 * 产物上传到 stem-outputs 存储桶，返回公开 URL 供前端下载。
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HF_BASE = "https://api-inference.huggingface.co/models";
const BUCKET = "stem-outputs";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function uploadToStorage(bytes: Uint8Array, name: string, mime: string): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const path = `${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mime });
  if (error) throw new Error("存储上传失败: " + error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * HF Inference API 无鉴权请求
 * 公开开源模型无需 Authorization，不传 token 即可调用
 */
async function hfStem(audioBytes: Uint8Array, modelId: string, fileName: string): Promise<string> {
  // 构建请求头——无 token 即不带 Authorization（HF 公开模型支持无鉴权访问）
  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Accept": "audio/wav",
  };

  const res = await fetch(`${HF_BASE}/${modelId}`, {
    method: "POST",
    headers,
    body: audioBytes,
  });

  if (res.status === 503) {
    // 503 = 模型加载中，等待后重试一次
    await new Promise((r) => setTimeout(r, 20000));
    const retry = await fetch(`${HF_BASE}/${modelId}`, { method: "POST", headers, body: audioBytes });
    if (!retry.ok) throw new Error(`HF ${modelId} 重试失败: ${retry.status}`);
    const retryBytes = new Uint8Array(await retry.arrayBuffer());
    if (retryBytes.length < 1000) throw new Error("HF 重试返回内容过短");
    return uploadToStorage(retryBytes, `${fileName}_stem.wav`, "audio/wav");
  }

  if (!res.ok) throw new Error(`HF ${modelId} 失败: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`HF ${modelId} 返回内容过短`);
  return uploadToStorage(bytes, `${fileName}_stem.wav`, "audio/wav");
}

// 接口池：3 主用 + 6 备用，全部 HF 开源模型，无需密钥
const PROVIDERS: Array<{ id: string; name: string; run: (b: Uint8Array, f: string) => Promise<string> }> = [
  // ── 主用 3 个 ──────────────────────────────────────────────────────────────
  { id: "hf-demucs",          name: "Demucs htdemucs",        run: (b, f) => hfStem(b, "facebook/demucs", f) },
  { id: "hf-demucs-4s",       name: "Demucs 4-source",        run: (b, f) => hfStem(b, "julien-c/demucs", f) },
  { id: "hf-spleeter-2stem",  name: "Spleeter 2-stem",        run: (b, f) => hfStem(b, "deezer/spleeter-2stems", f) },
  // ── 备用 6 个 ──────────────────────────────────────────────────────────────
  { id: "hf-spleeter-4stem",  name: "Spleeter 4-stem",        run: (b, f) => hfStem(b, "deezer/spleeter-4stems", f) },
  { id: "hf-spleeter-5stem",  name: "Spleeter 5-stem",        run: (b, f) => hfStem(b, "deezer/spleeter-5stems", f) },
  { id: "hf-sepformer-wsj",   name: "SepFormer wsj02mix",     run: (b, f) => hfStem(b, "speechbrain/sepformer-wsj02mix", f) },
  { id: "hf-sepformer-wham",  name: "SepFormer WHAM!",        run: (b, f) => hfStem(b, "speechbrain/sepformer-wham", f) },
  { id: "hf-sepformer-whamr", name: "SepFormer WHAM!-R",      run: (b, f) => hfStem(b, "speechbrain/sepformer-whamr", f) },
  { id: "hf-demucs-mdx",      name: "Demucs MDX",             run: (b, f) => hfStem(b, "htdemucs/demucs-mdx", f) },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { audioBase64, fileName } = await req.json();
    if (!audioBase64) throw new Error("缺少音频数据");
    const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const safeName = (fileName ?? "audio").replace(/\.[^.]+$/, "");

    const errors: string[] = [];
    for (const p of PROVIDERS) {
      try {
        const url = await p.run(audioBytes, safeName);
        if (url) {
          return json({
            success: true,
            provider: p.name,
            results: { vocalsUrl: url, accompanimentUrl: "" },
          });
        }
        errors.push(`${p.name}: 无输出`);
      } catch (e) {
        errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return json({ success: false, error: "所有 HF 开源接口均失败", details: errors }, 502);
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
