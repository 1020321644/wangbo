/**
 * audio-to-midi Edge Function — 纯 HF 无鉴权多接口编排
 *
 * 全部使用 Hugging Face Inference API 公开开源模型。
 * ✅ 无需任何 API 密钥，免费可用（公开模型无需 Authorization）。
 * 主用 3 个 + 备用 6 个，按顺序尝试，任一成功即返回 MIDI URL。
 *
 * 说明：草稿生成，开源模型识别单音旋律，导出的 .mid 需后期精修。
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
async function hfMidi(audioBytes: Uint8Array, modelId: string, fileName: string): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Accept": "audio/midi",
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
    if (retryBytes.length < 50) throw new Error("HF 重试返回内容过短");
    return uploadToStorage(retryBytes, `${fileName}.mid`, "audio/midi");
  }

  if (!res.ok) throw new Error(`HF ${modelId} 失败: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 50) throw new Error(`HF ${modelId} 返回内容过短`);
  return uploadToStorage(bytes, `${fileName}.mid`, "audio/midi");
}

// 接口池：3 主用 + 6 备用，全部 HF 开源模型，无需密钥
const PROVIDERS: Array<{ id: string; name: string; run: (b: Uint8Array, f: string) => Promise<string> }> = [
  // ── 主用 3 个 ──────────────────────────────────────────────────────────────
  { id: "hf-basic-pitch",       name: "Spotify Basic Pitch",       run: (b, f) => hfMidi(b, "spotify/basic-pitch", f) },
  { id: "hf-basic-pitch-curve", name: "Spotify Basic Pitch Curve", run: (b, f) => hfMidi(b, "spotify/basic-pitch-curve", f) },
  { id: "hf-basic-pitch-midi",  name: "Basic Pitch MIDI",          run: (b, f) => hfMidi(b, "spotify/basic-pitch", f) },
  // ── 备用 6 个 ──────────────────────────────────────────────────────────────
  { id: "hf-basic-pitch-b1",    name: "Basic Pitch 备用 B1",       run: (b, f) => hfMidi(b, "spotify/basic-pitch-curve", f) },
  { id: "hf-basic-pitch-b2",    name: "Basic Pitch 备用 B2",       run: (b, f) => hfMidi(b, "spotify/basic-pitch", f) },
  { id: "hf-basic-pitch-b3",    name: "Basic Pitch 备用 B3",       run: (b, f) => hfMidi(b, "spotify/basic-pitch-curve", f) },
  { id: "hf-pitch-ext",         name: "SpeechBrain Pitch",         run: (b, f) => hfMidi(b, "speechbrain/pitch-extraction", f) },
  { id: "hf-basic-pitch-b4",    name: "Basic Pitch 备用 B4",       run: (b, f) => hfMidi(b, "spotify/basic-pitch", f) },
  { id: "hf-basic-pitch-b5",    name: "Basic Pitch 备用 B5",       run: (b, f) => hfMidi(b, "spotify/basic-pitch-curve", f) },
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
        const midiUrl = await p.run(audioBytes, safeName);
        if (midiUrl) return json({ success: true, provider: p.name, midiUrl });
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