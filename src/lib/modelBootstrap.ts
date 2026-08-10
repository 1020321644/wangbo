/**
 * modelBootstrap.ts — 内置 AI 模型解包（一次性加载，无热插拔）
 *
 * 三个模型在构建期打包进 assets/models/，首次运行时
 * 释放到 documentDirectory/ai_models/ 供 ONNX Runtime 使用。
 * 应用启动时调用一次 extractBundledModels() 即可，不支持动态导入或切换。
 *
 * 解包策略（四层兜底，兼容 HarmonyOS 4.x 沙箱）：
 *   1. 标准路径 copyAsync（asset.localUri 是 file://）
 *   2. asset.uri Base64 读写（HarmonyOS localUri 为 null 时）
 *   3. asset.uri fetch + writeAsStringAsync（网络资产格式兜底）
 *   4. 静默跳过并警告（避免崩溃；降级至 FFmpeg DSP）
 */
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { fetch } from "expo/fetch";

// ── 模型文件目录 ──────────────────────────────────────────────────────────────
export const MODELS_DIR = (FileSystem.documentDirectory ?? "") + "ai_models/";

/** 各模型在 documentDirectory 中的路径 */
export const BUNDLED_MODEL_URIS: Readonly<Record<string, string>> = {
  gtcrn:      MODELS_DIR + "gtcrn.onnx",
  novasr:     MODELS_DIR + "novasr.onnx",
  hifiganbwe: MODELS_DIR + "hifiganbwe.onnx",
};

// ── Asset 来源（静态 require，Metro 打包时解析） ──────────────────────────────
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const MODEL_ASSETS: Record<string, number> = {
  gtcrn:      require("../../assets/models/gtcrn_16k.onnx") as number,
  novasr:     require("../../assets/models/novasr.onnx") as number,
  hifiganbwe: require("../../assets/models/hifiganbwe.onnx") as number,
};
/* eslint-enable @typescript-eslint/no-require-imports */
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
  } catch { /* 已存在，忽略 */ }

  for (const [id, module] of Object.entries(MODEL_ASSETS)) {
    const dest = BUNDLED_MODEL_URIS[id];

    // 已解包且文件有效 → 跳过
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists && (info as { size?: number }).size! > 1000) {
      console.log(`[modelBootstrap] ${id} 已就绪（跳过解包）`);
      continue;
    }

    const ok = await _extractOne(id, module, dest);
    if (!ok) {
      console.error(`[modelBootstrap] ❌ ${id} 三种策略均失败，将降级使用 FFmpeg DSP`);
    }
  }
}

async function _extractOne(id: string, module: number, dest: string): Promise<boolean> {
  const asset = Asset.fromModule(module);

  try {
    await asset.downloadAsync();
  } catch (e) {
    console.warn(`[modelBootstrap] ${id} downloadAsync 失败:`, e);
  }

  // ── 策略 1：标准 copyAsync（asset.localUri 是 file://）──────────────────
  if (asset.localUri?.startsWith("file://")) {
    try {
      await FileSystem.copyAsync({ from: asset.localUri, to: dest });
      const check = await FileSystem.getInfoAsync(dest);
      if (check.exists && (check as { size?: number }).size! > 1000) {
        console.log(`[modelBootstrap] ✅ ${id} 策略1 成功 → ${dest}`);
        return true;
      }
    } catch (e1) {
      console.warn(`[modelBootstrap] ${id} 策略1 copyAsync 失败:`, e1);
    }
  }

  // ── 策略 2：asset.localUri / asset.uri Base64 读写（HarmonyOS 沙箱）──────
  const srcUri = asset.localUri ?? asset.uri;
  if (srcUri) {
    try {
      const b64 = await FileSystem.readAsStringAsync(srcUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(dest, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const check = await FileSystem.getInfoAsync(dest);
      if (check.exists && (check as { size?: number }).size! > 1000) {
        console.log(`[modelBootstrap] ✅ ${id} 策略2 Base64 成功 → ${dest}`);
        return true;
      }
    } catch (e2) {
      console.warn(`[modelBootstrap] ${id} 策略2 Base64 失败:`, e2);
    }
  }

  // ── 策略 3：fetch asset.uri 二进制流（远程/bundle URL 格式）──────────────
  if (asset.uri) {
    try {
      const resp = await fetch(asset.uri);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // 转 base64 字符串
        let b64 = "";
        const CHUNK = 8192;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          b64 += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
        }
        const b64str = btoa(b64);
        await FileSystem.writeAsStringAsync(dest, b64str, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const check = await FileSystem.getInfoAsync(dest);
        if (check.exists && (check as { size?: number }).size! > 1000) {
          console.log(`[modelBootstrap] ✅ ${id} 策略3 fetch 成功 → ${dest}`);
          return true;
        }
      }
    } catch (e3) {
      console.warn(`[modelBootstrap] ${id} 策略3 fetch 失败:`, e3);
    }
  }

  return false;
}
