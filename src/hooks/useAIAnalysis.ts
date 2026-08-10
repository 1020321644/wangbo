/**
 * useAIAnalysis — AI 音频分析与母带参数推荐 hook
 *
 * 功能：
 *  - 使用 MiniMax-M3 大模型分析音频特征，给出专业母带录制参数建议
 *  - 参数标准：最低录音棚级（48kHz/24bit），上限行业最高标准（192kHz/32bit）
 *  - 支持两种模式：
 *    1. analyze(file)         — 分析已有音频文件，给出针对性建议
 *    2. suggestForContext()   — 根据录制模式/格式给出最优录制参数
 *  - 响度目标遵循 EBU R128 / ITU-R BS.1770-4 国际标准
 */

import { useState, useCallback } from "react";
import type { AudioFile } from "@/store/fileStore";
import type { RecordMasterParams, RecordMode, RecordOutputFormat } from "./useMasterRecord";
import { logger } from "@/store/logStore";

/** 专业响度标准（EBU R128 / ITU-R BS.1770-4） */
export interface LoudnessTarget {
  streaming: string;   // 流媒体标准，e.g. "-14 LUFS (Spotify/Apple Music)"
  broadcast: string;   // 广播标准，e.g. "-23 LUFS (EBU R128)"
  truePeak: string;    // 真峰值限制，e.g. "-0.3 dBTP"
}

export interface AIAnalysisResult {
  // 音质评级
  qualityScore: number;
  qualityLevel: "优秀" | "良好" | "一般" | "较差";
  /** 达到的专业标准等级 */
  qualityStandard: "录音棚" | "专业母带" | "Hi-Res" | "行业最高标准";

  // 专业分析
  analysis: {
    format: string;
    sampleRate: string;
    bitDepth: string;
    duration: string;
    overall: string;
  };

  // 优化建议（3-5条）
  suggestions: string[];

  // 推荐参数（最低 48kHz/24bit，上限 192kHz/32bit）
  recommendedParams: RecordMasterParams;

  /** EBU R128 响度目标 */
  loudnessTarget: LoudnessTarget;

  rawResponse: string;
}

export type AnalysisStatus = "idle" | "analyzing" | "done" | "error";

/** 调用 MiniMax-M3 的通用方法 */
async function callMiniMax(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(
    "https://app-dk2quyiid79d-api-rLobPAn0n7m9-gateway.appmiaoda.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${process.env.EXPO_PUBLIC_INTEGRATIONS_API_KEY}`,
      },
      body: JSON.stringify({
        model: "MiniMax-M3",
        thinking: { type: "adaptive" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        top_p: 0.9,
        max_completion_tokens: 4096,
      }),
    },
  );
  if (!response.ok) throw new Error(`MiniMax API 错误：HTTP ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** 解析 AI 返回的 JSON 块 */
function parseJsonBlock(raw: string): unknown {
  const m = raw.match(/```json\s*([\s\S]*?)\s*```/) ?? raw.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error("AI 响应格式错误，无法解析 JSON");
  return JSON.parse(m[1] ?? m[0]);
}

/** 专业标准系统提示（所有 AI 调用共用） */
const SYSTEM_PROMPT = `你是顶级母带工程师，曾参与格莱美获奖专辑制作。你的建议必须符合以下专业标准：

【专业参数标准 — 严格遵守】
- 采样率最低：48kHz（录音棚级），推荐 96kHz 或 192kHz（Hi-Res/行业最高标准）
  * 绝对禁止推荐 44.1kHz 或更低用于专业制作
  * 对已有 44.1kHz 素材，建议重录至 96kHz 或更高
- 位深最低：24bit（录音棚级），推荐 32bit（浮点精度，行业最高标准）
  * 绝对禁止推荐 16bit 用于专业母带处理
- 响度标准（EBU R128 / ITU-R BS.1770-4）：
  * 流媒体：-14 LUFS（Spotify/Apple Music/YouTube 标准）
  * 广播/专业发行：-23 LUFS（EBU R128）
  * 真峰值（True Peak）：不超过 -0.3 dBTP（流媒体），-1.0 dBTP（广播）
- 高通滤波（HPF）：
  * 音乐：20-30Hz（去除超低频噪声，保留低音层次）
  * 人声：60-80Hz（去除低频隆隆声）
- 动态压缩：
  * 第一级（峰值控制）：2:1 ~ 3:1，软拐点（Soft Knee），ratio 推荐 2~3
  * 第二级（总线压缩）：1.5:1 ~ 2:1，轻度胶水压缩，ratio 推荐 2
- 限幅器（Limiter）：
  * True Peak 限幅：-0.3 dBFS（流媒体优化）~ -1.0 dBFS（广播安全）
  * 绝对禁止设置为 -1.5 dBFS 以下用于专业发行

你的回答必须严格输出 JSON 格式，不包含任何其他文字。`;

const DEFAULT_AI_PARAMS: RecordMasterParams = {
  sampleRate:  "96kHz",
  bitDepth:    "32bit",
  hpfFreq:     20,
  comp1Ratio:  2,
  comp2Ratio:  2,
  gain:        1.1,
  limitLevel:  -0.3,
  masterEnhance: true,
};

const DEFAULT_LOUDNESS: LoudnessTarget = {
  streaming: "-14 LUFS (Spotify/Apple Music/YouTube)",
  broadcast: "-23 LUFS (EBU R128 广播标准)",
  truePeak:  "-0.3 dBTP (流媒体最佳实践)",
};

export function useAIAnalysis() {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 分析已有音频文件，给出专业母带参数建议 */
  const analyze = useCallback(async (file: AudioFile): Promise<AIAnalysisResult | null> => {
    setStatus("analyzing");
    setError(null);
    setResult(null);

    try {
      logger.info("AI 分析", `开始专业分析: ${file.name}`,
        `格式: ${file.format}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

      const prompt = `请分析以下音频文件，并给出专业母带工程建议。

**音频文件信息：**
- 文件名：${file.name}
- 格式：${file.format ?? "未知"}
- 文件大小：${(file.size / 1024 / 1024).toFixed(2)} MB
- 时长：${Math.floor(file.duration / 60)}分${file.duration % 60}秒
${file.sampleRate ? `- 当前采样率：${file.sampleRate}` : "- 采样率：未知（建议重录至 96kHz）"}
${file.bitDepth  ? `- 当前位深：${file.bitDepth}` : "- 位深：未知（建议重录至 32bit）"}
${file.bitrate   ? `- 比特率：${file.bitrate}` : ""}
${file.masterEnhance ? "- 已进行过母带处理" : ""}

请严格按以下 JSON 格式输出，recommendedParams 中 sampleRate 必须 ≥ 96kHz，bitDepth 必须为 32bit（行业最高标准），limitLevel 不低于 -0.5dBFS：

\`\`\`json
{
  "qualityScore": 72,
  "qualityLevel": "良好",
  "qualityStandard": "录音棚",
  "analysis": {
    "format": "...",
    "sampleRate": "...",
    "bitDepth": "...",
    "duration": "...",
    "overall": "..."
  },
  "suggestions": ["建议1", "建议2", "建议3"],
  "recommendedParams": {
    "sampleRate": "96kHz",
    "bitDepth": "32bit",
    "hpfFreq": 20,
    "comp1Ratio": 2,
    "comp2Ratio": 2,
    "gain": 1.1,
    "limitLevel": -0.3,
    "masterEnhance": true
  },
  "loudnessTarget": {
    "streaming": "-14 LUFS (Spotify/Apple Music)",
    "broadcast": "-23 LUFS (EBU R128)",
    "truePeak": "-0.3 dBTP"
  }
}
\`\`\``;

      const rawResponse = await callMiniMax(SYSTEM_PROMPT, prompt);
      logger.info("AI 分析", "响应成功", `长度: ${rawResponse.length} 字符`);

      const parsed = parseJsonBlock(rawResponse) as Record<string, unknown>;
      const analysisResult = buildResult(parsed, rawResponse);
      setResult(analysisResult);
      setStatus("done");
      logger.info("AI 分析", `完成: ${file.name}`,
        `评分: ${analysisResult.qualityScore}，标准: ${analysisResult.qualityStandard}`);
      return analysisResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI 分析失败";
      setError(msg);
      setStatus("error");
      logger.error("AI 分析", `分析失败: ${file.name}`, msg);
      return null;
    }
  }, []);

  /**
   * 根据录制上下文（模式/格式）给出最优母带录制参数建议
   * 适用于 bg-record.tsx 无源文件时的 AI 智能调参
   */
  const suggestForContext = useCallback(async (
    mode: RecordMode,
    outputFormat: RecordOutputFormat,
  ): Promise<AIAnalysisResult | null> => {
    setStatus("analyzing");
    setError(null);
    setResult(null);

    const modeDesc = mode === "system"
      ? "Android REMOTE_SUBMIX 系统内录（捕获设备音频输出，内容为音乐播放）"
      : "麦克风录制（手机麦克风近场拾音，内容可能为音乐外放/人声/环境音）";

    try {
      logger.info("AI 调参", `上下文调参: ${modeDesc}，格式: ${outputFormat}`);

      const prompt = `请为以下后台母带录制场景推荐最优参数：

**录制场景：**
- 录制模式：${modeDesc}
- 目标输出格式：${outputFormat}
- 使用场景：高保真音乐录制/母带采集，要求达到行业最高标准

请给出行业最高标准（192kHz/32bit）级别的参数推荐，JSON 格式：

\`\`\`json
{
  "qualityScore": 98,
  "qualityLevel": "优秀",
  "qualityStandard": "行业最高标准",
  "analysis": {
    "format": "针对 ${outputFormat} 格式的专业说明",
    "sampleRate": "推荐采样率说明",
    "bitDepth": "推荐位深说明",
    "duration": "录制时长建议",
    "overall": "场景综合评估"
  },
  "suggestions": [
    "建议1：录制环境优化",
    "建议2：信号链优化",
    "建议3：母带链路设置",
    "建议4：响度目标设定",
    "建议5：后期处理建议"
  ],
  "recommendedParams": {
    "sampleRate": "192kHz",
    "bitDepth": "32bit",
    "hpfFreq": 20,
    "comp1Ratio": 2,
    "comp2Ratio": 2,
    "gain": 1.1,
    "limitLevel": -0.3,
    "masterEnhance": true
  },
  "loudnessTarget": {
    "streaming": "-14 LUFS (Spotify/Apple Music/YouTube)",
    "broadcast": "-23 LUFS (EBU R128)",
    "truePeak": "-0.3 dBTP"
  }
}
\`\`\``;

      const rawResponse = await callMiniMax(SYSTEM_PROMPT, prompt);
      logger.info("AI 调参", "响应成功", `长度: ${rawResponse.length} 字符`);

      const parsed = parseJsonBlock(rawResponse) as Record<string, unknown>;
      const analysisResult = buildResult(parsed, rawResponse);
      setResult(analysisResult);
      setStatus("done");
      logger.info("AI 调参", "调参完成",
        `标准: ${analysisResult.qualityStandard}，推荐: ${analysisResult.recommendedParams.sampleRate}/${analysisResult.recommendedParams.bitDepth}`);
      return analysisResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI 调参失败";
      setError(msg);
      setStatus("error");
      logger.error("AI 调参", "调参失败", msg);
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, analyze, suggestForContext, reset };
}

/** 从解析结果构建标准化 AIAnalysisResult，强制执行专业参数下限 */
function buildResult(parsed: Record<string, unknown>, rawResponse: string): AIAnalysisResult {
  const rp = (parsed.recommendedParams as Partial<RecordMasterParams>) ?? {};

  // 强制执行专业参数标准下限
  const sampleRate = enforceSampleRate(rp.sampleRate ?? "96kHz");
  const bitDepth   = enforceBitDepth(rp.bitDepth ?? "32bit");
  const limitLevel = enforceLimitLevel(rp.limitLevel ?? -0.3);

  const recommendedParams: RecordMasterParams = {
    sampleRate,
    bitDepth,
    hpfFreq:      validateHpf(rp.hpfFreq ?? 20),
    comp1Ratio:   validateComp1(rp.comp1Ratio ?? 2),
    comp2Ratio:   validateComp2(rp.comp2Ratio ?? 2),
    gain:         validateGain(rp.gain ?? 1.1),
    limitLevel,
    masterEnhance: rp.masterEnhance !== false,
  };

  const lt = (parsed.loudnessTarget as Partial<LoudnessTarget>) ?? {};

  return {
    qualityScore:    Number(parsed.qualityScore) || 80,
    qualityLevel:    validateQualityLevel(parsed.qualityLevel as string),
    qualityStandard: validateQualityStandard(parsed.qualityStandard as string),
    analysis:        (parsed.analysis as AIAnalysisResult["analysis"]) ?? {
      format: "无分析", sampleRate: "无分析", bitDepth: "无分析",
      duration: "无分析", overall: "无分析",
    },
    suggestions:     Array.isArray(parsed.suggestions) ? parsed.suggestions as string[] : [],
    recommendedParams,
    loudnessTarget: {
      streaming: lt.streaming ?? DEFAULT_LOUDNESS.streaming,
      broadcast: lt.broadcast ?? DEFAULT_LOUDNESS.broadcast,
      truePeak:  lt.truePeak  ?? DEFAULT_LOUDNESS.truePeak,
    },
    rawResponse,
  };
}

// ── 参数校验/强制 helpers ──────────────────────────────────────────────────────

type SampleRate = RecordMasterParams["sampleRate"];
type BitDepth   = RecordMasterParams["bitDepth"];
type HpfFreq    = RecordMasterParams["hpfFreq"];
type Comp1      = RecordMasterParams["comp1Ratio"];
type Comp2      = RecordMasterParams["comp2Ratio"];
type Gain       = RecordMasterParams["gain"];
type LimitLvl   = RecordMasterParams["limitLevel"];

const ALLOWED_SR:    SampleRate[] = ["44.1kHz", "48kHz", "88.2kHz", "96kHz", "192kHz"];
const ALLOWED_BD:    BitDepth[]   = ["16bit", "24bit", "32bit"];
const ALLOWED_HPF:   HpfFreq[]    = [20, 30, 40, 80];
const ALLOWED_C1:    Comp1[]      = [2, 3, 4, 6];
const ALLOWED_C2:    Comp2[]      = [1.5, 2, 3];
const ALLOWED_GAIN:  Gain[]       = [1.0, 1.1, 1.2, 1.3, 1.5, 2.0];
const ALLOWED_LIM:   LimitLvl[]   = [-0.3, -0.5, -1.0, -1.5, -2.0, -3.0];

/** 强制 ≥ 96kHz（专业标准不低于 Hi-Res） */
function enforceSampleRate(raw: string): SampleRate {
  const v = ALLOWED_SR.includes(raw as SampleRate) ? raw as SampleRate : "96kHz";
  const srMap: Record<SampleRate, number> = {
    "44.1kHz": 0, "48kHz": 1, "88.2kHz": 2, "96kHz": 3, "192kHz": 4,
  };
  return srMap[v] >= srMap["96kHz"] ? v : "96kHz";
}

/** 强制 ≥ 24bit */
function enforceBitDepth(raw: string): BitDepth {
  const v = ALLOWED_BD.includes(raw as BitDepth) ? raw as BitDepth : "32bit";
  const bdMap: Record<BitDepth, number> = { "16bit": 0, "24bit": 1, "32bit": 2 };
  return bdMap[v] >= bdMap["24bit"] ? v : "24bit";
}

/** 强制 ≥ -1.0 dBFS（不超过行业广播安全值） */
function enforceLimitLevel(raw: number): LimitLvl {
  // limitLevel 是负数，绝对值越大越保守；-0.3 最激进（流媒体优化）
  const v = ALLOWED_LIM.reduce((prev, cur) =>
    Math.abs(cur - raw) < Math.abs(prev - raw) ? cur : prev
  );
  return v >= -1.0 ? v : -1.0; // 不低于 -1.0 dBFS
}

function validateHpf(v: unknown): HpfFreq {
  return ALLOWED_HPF.includes(v as HpfFreq) ? (v as HpfFreq) : 20;
}
function validateComp1(v: unknown): Comp1 {
  return ALLOWED_C1.includes(v as Comp1) ? (v as Comp1) : 2;
}
function validateComp2(v: unknown): Comp2 {
  return ALLOWED_C2.includes(v as Comp2) ? (v as Comp2) : 2;
}
function validateGain(v: unknown): Gain {
  return ALLOWED_GAIN.includes(v as Gain) ? (v as Gain) : 1.1;
}
function validateQualityLevel(v: string): AIAnalysisResult["qualityLevel"] {
  const ok: AIAnalysisResult["qualityLevel"][] = ["优秀", "良好", "一般", "较差"];
  return ok.includes(v as AIAnalysisResult["qualityLevel"]) ? (v as AIAnalysisResult["qualityLevel"]) : "良好";
}
function validateQualityStandard(v: string): AIAnalysisResult["qualityStandard"] {
  const ok: AIAnalysisResult["qualityStandard"][] = ["录音棚", "专业母带", "Hi-Res", "行业最高标准"];
  return ok.includes(v as AIAnalysisResult["qualityStandard"])
    ? (v as AIAnalysisResult["qualityStandard"])
    : "录音棚";
}

// 保留供外部使用的默认值导出
export { DEFAULT_AI_PARAMS, DEFAULT_LOUDNESS };
