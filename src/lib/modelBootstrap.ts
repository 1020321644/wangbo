/**
 * modelBootstrap.ts — 内置 AI 模型解包
 *
 * 【测试版 v1.0.111】仅打包 GTCRN 降噪模型用于鸿蒙真机兼容性测试。
 * 超分辨率模型（HiFi-GAN / NovaSR）暂不打包，待 GTCRN 测试通过后逐步加回。
 *
 * 模型版本：
 *   gtcrn   — GTCRN 16kHz 降噪（535 KB，腾讯/yuyun2000）
 */
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

// ── 模型文件目录 ──────────────────────────────────────────────────────────────
export const MODELS_DIR = (FileSystem.documentDirectory ?? "") + "ai_models/";

/** 各模型在 documentDirectory 中的路径 */
export const BUNDLED_MODEL_URIS: Readonly<Record<string, string>> = {
  gtcrn: MODELS_DIR + "gtcrn.onnx",
};

// ── Asset 来源（静态 require，Metro 打包时解析） ──────────────────────────────
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const MODEL_ASSETS: Record<string, number> = {
  gtcrn: require("../../assets/models/gtcrn_16k.onnx") as number,
};
/* eslint-enable no-undef */

let _extractPromise: Promise<void> | null = null;

/**
 * 解包内置模型到本地文件系统（幂等，重复调用安全）
 * 在 app/_layout.tsx 的 useEffect 中调用一次即可。
 */
export async function extractBundledModels(): Promise<void> {
  if (process.env.EXPO_OS === "web") return;
  if (_extractPromise) return _extractPromise;
  _extractPromise = _doExtract();
  return _extractPromise;
}

async function _doExtract(): Promise<void> {
  try {
    await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
  } catch {
    // 已存在，忽略
  }
  for (const [id, module] of Object.entries(MODEL_ASSETS)) {
    const dest = BUNDLED_MODEL_URIS[id];
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists && (info as { size?: number }).size && (info as { size?: number }).size! > 1000) {
      continue; // 已解包，跳过
    }
    try {
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      if (asset.localUri) {
        await FileSystem.copyAsync({ from: asset.localUri, to: dest });
        console.log(`[modelBootstrap] 已解包 ${id} → ${dest}`);
      }
    } catch (e) {
      console.warn(`[modelBootstrap] 解包 ${id} 失败:`, e);
    }
  }
}

/**
 * 获取模型最终路径：用户导入 > 内置默认
 * @param id        模型 ID（gtcrn / novasr / hifiganbwe）
 * @param userUri   用户在 model-import 页导入的自定义路径（可为 null）
 */
export function resolvModelUri(id: string, userUri: string | null): string | null {
  if (userUri) return userUri;
  return BUNDLED_MODEL_URIS[id] ?? null;
}
