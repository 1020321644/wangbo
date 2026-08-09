/**
 * ai-enhance Edge Function — 纯 HF 无鉴权云端音频增强
 *
 * ✅ 无需任何 API 密钥（HF 公开开源模型无需 Authorization）。
 * 根据用户选项（denoise/enhance/normalize）构建模型优先级，
 * 按顺序尝试多个开源音频增强模型，任一成功即返回。
 * 全部失败才报错，错误明细一并返回。
 *
 * 输入：{ fileUrl: string, options: { denoise?, enhance?, normalize? } }
 * 输出：{ url: string, size: number, model: string }
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HF_BASE = "https://api-inference.huggingface.co/models";
const BUCKET = "ai-audio";
const HF_TIMEOUT_MS = 25000; // 25s 超时，防止长时间挂起

// ── 纯 DSP 兜底（无外网依赖）──────────────────────────────────────────────
async function dspEnhance(audioBytes: Uint8Array, opts: Record<string, boolean>): Promise<Uint8Array> {
  if (audioBytes.length < 44) return audioBytes;
  const view = new DataView(audioBytes.buffer, audioBytes.byteOffset);
  const riff = String.fromCharCode(audioBytes[0], audioBytes[1], audioBytes[2], audioBytes[3]);
  if (riff !== "RIFF") return audioBytes;

  const numChannels  = view.getUint16(22, true);
  const sampleRate   = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataOffset   = 44;
  const bytesPerSample = Math.ceil(bitsPerSample / 8);
  const totalSamples  = Math.floor((audioBytes.length - dataOffset) / bytesPerSample);
  if (totalSamples <= 0) return audioBytes;

  // 读取 PCM → Float32
  const samples = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const off = dataOffset + i * bytesPerSample;
    if (bitsPerSample === 16) {
      samples[i] = view.getInt16(off, true) / 32768.0;
    } else if (bitsPerSample === 24) {
      let v = audioBytes[off] | (audioBytes[off+1] << 8) | (audioBytes[off+2] << 16);
      if (v & 0x800000) v |= ~0xFFFFFF;
      samples[i] = v / 8388608.0;
    } else {
      samples[i] = view.getFloat32(off, true);
    }
  }

  // 高通滤波 80Hz（去除低频噪音）
  if (opts.denoise !== false) {
    const alpha = 1 - (2 * Math.PI * 80) / sampleRate;
    const a = Math.max(0, Math.min(1, alpha));
    let prev = samples[0];
    for (let i = 1; i < samples.length; i++) {
      const curr = a * (prev + samples[i] - samples[i-1]);
      prev = curr; samples[i] = curr;
    }
  }

  // 软限幅增益 +3dB
  if (opts.enhance !== false) {
    const g = 1.41;
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.tanh(samples[i] * g);
    }
  }

  // 响度标准化至 -0.3dBFS
  if (opts.normalize !== false) {
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    if (peak > 0.001 && peak < 0.97) {
      const g2 = 0.97 / peak;
      for (let i = 0; i < samples.length; i++) samples[i] = Math.max(-1, Math.min(1, samples[i] * g2));
    }
  }

  // 编码为 PCM 16-bit WAV（48kHz，与母带标准一致）
  const outSamples = samples.length;
  const outBytes = new Uint8Array(44 + outSamples * 2);
  const outView  = new DataView(outBytes.buffer);
  const ch = numChannels || 1;
  const sr = Math.min(sampleRate || 48000, 48000);
  outBytes.set([82,73,70,70]); outView.setUint32(4, 36 + outSamples*2, true);
  outBytes.set([87,65,86,69,102,109,116,32], 8); outView.setUint32(16, 16, true);
  outView.setUint16(20, 1, true); outView.setUint16(22, ch, true);
  outView.setUint32(24, sr, true); outView.setUint32(28, sr*ch*2, true);
  outView.setUint16(32, ch*2, true); outView.setUint16(34, 16, true);
  outBytes.set([100,97,116,97], 36); outView.setUint32(40, outSamples*2, true);
  for (let i = 0; i < outSamples; i++) {
    outView.setInt16(44 + i*2, Math.max(-32768, Math.min(32767, Math.round(samples[i]*32767))), true);
  }
  return outBytes;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 模型池：按处理类型分组（全部 HF 开源模型，无需密钥）
const MODEL_POOL: Record<string, string[]> = {
  denoise: [
    "facebook/denoiser",
    "speechbrain/sepformer-wham-enhancement",
    "speechbrain/metricgan-plus-voicebank",
  ],
  enhance: [
    "speechbrain/sepformer-whamr-enhancement",
    "JorisCos/DPTNet",
    "speechbrain/sepformer-wsj02mix",
  ],
  normalize: [
    "speechbrain/metricgan-plus-voicebank",
    "facebook/denoiser",
  ],
};

/** 尝试单个模型，超时 25s 返回 null */
async function tryModel(audioBytes: Uint8Array, modelId: string): Promise<Uint8Array | null> {
  const headers = { "Content-Type": "audio/wav", Accept: "audio/wav" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HF_TIMEOUT_MS);
  try {
    let res = await fetch(`${HF_BASE}/${modelId}`, { method: "POST", headers, body: audioBytes, signal: ctrl.signal });
    if (res.status === 503) {
      await sleep(15000);
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), HF_TIMEOUT_MS);
      res = await fetch(`${HF_BASE}/${modelId}`, { method: "POST", headers, body: audioBytes, signal: ctrl2.signal });
      clearTimeout(t2);
    }
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length < 1000 ? null : bytes;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { fileUrl, options } = await req.json();
    if (!fileUrl) throw new Error("缺少 fileUrl");

    // 根据选项构建模型优先级列表
    const opts = options ?? {};
    const activeKeys = ["denoise", "enhance", "normalize"].filter((k) => opts[k]);
    const keys = activeKeys.length > 0 ? activeKeys : ["denoise", "enhance", "normalize"];
    const models: string[] = [];
    for (const k of keys) {
      for (const m of MODEL_POOL[k] ?? []) {
        if (!models.includes(m)) models.push(m);
      }
    }
    // 兜底：补齐所有模型
    for (const k of Object.keys(MODEL_POOL)) {
      for (const m of MODEL_POOL[k]) {
        if (!models.includes(m)) models.push(m);
      }
    }

    // 拉取待处理音频
    const audioResp = await fetch(fileUrl);
    if (!audioResp.ok) return json({ error: `拉取音频失败: ${audioResp.status}` }, 502);
    const audioBytes = new Uint8Array(await audioResp.arrayBuffer());

    const errors: string[] = [];
    for (const m of models) {
      try {
        const bytes = await tryModel(audioBytes, m);
        if (bytes) {
          const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );
          const objectName = `results/enhanced_${Date.now()}.wav`;
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(objectName, bytes, { contentType: "audio/wav", upsert: true });
          if (upErr) {
            errors.push(`${m}: 存储失败 ${upErr.message}`);
            continue;
          }
          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectName);
          return json({ url: pub.publicUrl, size: bytes.length, model: m }, 200);
        }
        errors.push(`${m}: 无有效输出`);
      } catch (e) {
        errors.push(`${m}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // ── HF 全部失败，兜底使用纯 DSP 处理 ──────────────────────────────────
    const dspBytes = await dspEnhance(audioBytes, options ?? {});
    const supabase2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const objName2 = `results/dsp_enhanced_${Date.now()}.wav`;
    const { error: upErr2 } = await supabase2.storage.from(BUCKET).upload(objName2, dspBytes, { contentType: "audio/wav", upsert: true });
    if (upErr2) return json({ error: "DSP 增强存储失败: " + upErr2.message, details: errors }, 502);
    const { data: pub2 } = supabase2.storage.from(BUCKET).getPublicUrl(objName2);
    return json({ url: pub2.publicUrl, size: dspBytes.length, model: "dsp-fallback(HPF+增益+响度标准化)" }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});