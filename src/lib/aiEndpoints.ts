/**
 * 困难模式：开源 AI 音频增强接口池
 *
 * 使用 Hugging Face Inference API 上的开源音频增强 / 语音增强模型。
 * 全部为开源模型，需用户提供免费的 HF Access Token（注册即得，无需付费）。
 * 接口可用性由运行时 3s 探针动态判定，任一不可用可在此替换 modelId。
 *
 * 说明：HF Inference API 对部分音频模型可能返回 503（模型加载中）或暂不支持，
 * 此时探针会判定为不可用并自动切换到下一个接口；全部不可用时引导切回简单模式。
 */
export interface AiEndpoint {
  id: string;
  name: string;
  /** Hugging Face 模型 ID */
  modelId: string;
  desc: string;
}

export const AI_ENDPOINTS: AiEndpoint[] = [
  {
    id: "sepformer-wham",
    name: "SepFormer 语音增强",
    modelId: "speechbrain/sepformer-wham-enhancement",
    desc: "分离并增强人声，抑制背景噪声",
  },
  {
    id: "sepformer-whamr",
    name: "SepFormer 去混响增强",
    modelId: "speechbrain/sepformer-whamr-enhancement",
    desc: "语音增强 + 去混响，还原清晰人声",
  },
  {
    id: "metricgan",
    name: "MetricGAN+ 降噪",
    modelId: "speechbrain/metricgan-plus-voicebank",
    desc: "基于指标的生成式降噪增强",
  },
  {
    id: "dptnet",
    name: "DPTNet 语音增强",
    modelId: "JorisCos/DPTNet",
    desc: "双路径 Transformer 语音增强",
  },
  {
    id: "denoiser",
    name: "Denoiser 深度降噪",
    modelId: "facebook/denoiser",
    desc: "Facebook 深度学习宽带降噪",
  },
  {
    id: "sepformer-wsj02mix",
    name: "SepFormer 分离增强",
    modelId: "speechbrain/sepformer-wsj02mix",
    desc: "多声源分离与增强",
  },
];

/** 获取免费 HF Token 的地址 */
export const HF_TOKEN_URL = "https://huggingface.co/settings/tokens";