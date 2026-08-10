/**
 * ai-rating Edge Function
 *
 * 接收音频文件元数据，调用 HF 文本生成模型产出个性化音质诊断文案。
 * 依次尝试多个模型，全部失败则返回 fallback 标记由客户端降级本地评估。
 *
 * 请求 body:
 *   { fileName, format, sampleRate, bitDepth, bitrate, fileSize, duration, token }
 * 响应:
 *   { verdict, suggestions, grade_hint }   ← 成功
 *   { fallback: true }                     ← HF 全部不可用
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** 按优先级排列的文本生成模型（免费 HF Inference API） */
const TEXT_MODELS = [
  "mistralai/Mistral-7B-Instruct-v0.2",
  "HuggingFaceH4/zephyr-7b-beta",
  "tiiuae/falcon-7b-instruct",
];

const HF_BASE = "https://api-inference.huggingface.co/models";
const MODEL_TIMEOUT = 18000;

function buildPrompt(
  fileName: string,
  format: string,
  sampleRate: string,
  bitDepth: string,
  bitrate: string,
  fileSize: number,
  duration: number,
): string {
  const sizeMb = (fileSize / 1024 / 1024).toFixed(1);
  const durStr = duration > 0 ? `${Math.round(duration)}秒` : "未知";

  return `<s>[INST] 你是资深音频制作工程师，请对以下音频文件进行专业音质分析，用中文回答。

文件名: ${fileName}
格式: ${format || "未知"}
采样率: ${sampleRate || "未知"}
位深: ${bitDepth || "未知"}
码率: ${bitrate || "未知"}
文件大小: ${sizeMb}MB
时长: ${durStr}

请针对该文件的具体参数组合给出个性化分析（不要给泛泛建议）。
严格以如下 JSON 格式输出，不要输出任何其他内容：
{"verdict":"2-3句专业诊断","suggestions":["建议1","建议2","建议3"],"grade_hint":"S|A|B|C|D"}
[/INST]`;
}

async function callHfTextGen(
  modelId: string,
  prompt: string,
  token: string,
): Promise<{ verdict: string; suggestions: string[]; grade_hint: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT);
  try {
    const resp = await fetch(`${HF_BASE}/${modelId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 250,
          temperature: 0.7,
          do_sample: true,
          return_full_text: false,
        },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      console.warn(`[ai-rating] ${modelId} 返回 ${resp.status}`);
      return null;
    }

    const raw = await resp.json();
    // HF text-generation 返回 [{ generated_text: "..." }]
    const text: string =
      Array.isArray(raw) && raw[0]?.generated_text
        ? raw[0].generated_text
        : typeof raw === "string"
        ? raw
        : "";

    // 提取 JSON 块
    const jsonMatch = text.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[ai-rating] ${modelId} 无法提取 JSON，原文:`, text.slice(0, 200));
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.verdict || !Array.isArray(parsed.suggestions)) return null;
    return {
      verdict: String(parsed.verdict),
      suggestions: (parsed.suggestions as unknown[]).slice(0, 4).map(String),
      grade_hint: String(parsed.grade_hint ?? "B"),
    };
  } catch (e) {
    clearTimeout(timer);
    console.warn(`[ai-rating] ${modelId} 异常:`, e);
    return null;
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      fileName = "未知文件",
      format = "",
      sampleRate = "",
      bitDepth = "",
      bitrate = "",
      fileSize = 0,
      duration = 0,
      token,
    } = await req.json();

    if (!token) return json({ fallback: true, reason: "no_token" }, 200);

    const prompt = buildPrompt(fileName, format, sampleRate, bitDepth, bitrate, fileSize, duration);

    for (const modelId of TEXT_MODELS) {
      const result = await callHfTextGen(modelId, prompt, token);
      if (result) {
        return json({ ...result, model: modelId }, 200);
      }
    }

    // 全部模型失败 → 客户端降级本地评估
    return json({ fallback: true, reason: "all_models_failed" }, 200);
  } catch (e) {
    return json({ fallback: true, reason: String(e) }, 200);
  }
});
