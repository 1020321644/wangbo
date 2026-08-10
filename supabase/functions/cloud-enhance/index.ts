// cloud-enhance — 困难模式云端增强（可选）
// 接收本地处理后的临时音频（base64），尝试多个开源 AI 音频增强接口，
// 探针择优 + 25s 超时 + 失败自动切换。全部不可用则返回错误（客户端保留本地结果）。
// 隐私：仅接收处理后的临时文件，处理完成后服务端不留存。

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 预置开源 AI 音频增强接口（可后续替换）
const ENDPOINTS = [
  "https://ai-audio-enhance.example.org/api/v1/enhance",
  "https://openenhance.example.net/process",
  "https://speech-restore.example.com/api/enhance",
  "https://audio-sr.example.io/api/v2/restore",
  "https://noiseremove.example.ai/enhance",
  "https://hifi-restore.example.dev/api/process",
];

async function probe(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function callEndpoint(
  url: string,
  audioB64: string,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: audioB64, format: "wav" }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const out = json?.audio ?? json?.data ?? json?.result;
    return typeof out === "string" ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { audio } = await req.json();
    if (!audio || typeof audio !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少音频数据" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. 探针：3s 内逐个探测，择首个可用接口
    let chosen: string | null = null;
    for (const ep of ENDPOINTS) {
      if (await probe(ep, 3000)) {
        chosen = ep;
        break;
      }
    }

    if (!chosen) {
      return new Response(
        JSON.stringify({ ok: false, error: "繁忙：暂无可用云端增强接口" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. 正式请求：25s 超时
    const result = await callEndpoint(chosen, audio, 25000);
    if (!result) {
      return new Response(
        JSON.stringify({ ok: false, error: "云端增强失败，请稍后重试" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. 返回增强后音频（服务端不留存临时文件）
    return new Response(
      JSON.stringify({ ok: true, audio: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: `云端增强异常：${e instanceof Error ? e.message : "未知"}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});