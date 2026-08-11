// cloud-enhance — AI 音频增强（Hugging Face Inference API）
// 使用 MetricGAN+ 进行语音降噪增强，HF token 由客户端传入（用户免费账号即可）
// 增强失败 → ok: false，客户端自动降级 FFmpeg DSP，绝不出现无声

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// HF 音频增强模型（按优先级）
const HF_MODELS = [
  "speechbrain/metricgan-plus-voicebank", // MetricGAN+ 语音增强（主力）
  "facebook/denoiser",                    // Meta 降噪（备用）
];

const HF_TIMEOUT_MS = 30000;

async function enhanceWithHF(
  audioBuf: Uint8Array,
  hfToken: string,
): Promise<Uint8Array | null> {
  for (const model of HF_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${hfToken}`,
            "Content-Type": "audio/wav",
          },
          body: audioBuf,
          signal: controller.signal,
        },
      );
      clearTimeout(timer);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[cloud-enhance] ${model} 失败 ${res.status}: ${errText}`);
        continue;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 100) { console.warn(`[cloud-enhance] ${model} 空响应`); continue; }
      console.log(`[cloud-enhance] ✅ ${model} 成功，输出 ${buf.byteLength} bytes`);
      return new Uint8Array(buf);
    } catch (e) {
      clearTimeout(timer);
      console.warn(`[cloud-enhance] ${model} 异常:`, e);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { audio, hfToken } = await req.json();

    if (!audio || typeof audio !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少音频数据" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!hfToken || typeof hfToken !== "string" || !hfToken.startsWith("hf_")) {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少 Hugging Face Token，请前往「设置 → AI 模型」填写免费 Token" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // base64 → 二进制
    const binary = atob(audio);
    const audioBuf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) audioBuf[i] = binary.charCodeAt(i);

    // 调用 HF Inference API
    const resultBuf = await enhanceWithHF(audioBuf, hfToken);
    if (!resultBuf) {
      return new Response(
        JSON.stringify({ ok: false, error: "云端增强失败，HF 模型不可用，已降级 FFmpeg DSP" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 二进制 → base64
    let resultB64 = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < resultBuf.length; i += CHUNK) {
      resultB64 += String.fromCharCode(...Array.from(resultBuf.subarray(i, i + CHUNK)));
    }
    resultB64 = btoa(resultB64);

    return new Response(
      JSON.stringify({ ok: true, audio: resultB64 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: `云端增强异常：${e instanceof Error ? e.message : "未知"}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
