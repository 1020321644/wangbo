/**
 * AI 模型路径管理 Store
 *
 * App 内置三个默认模型（assets/models/）开箱即用；
 * 用户也可通过「AI 模型管理」导入自定义 .onnx 文件覆盖默认模型。
 *
 * 支持的模型：
 *  - gtcrn      : GTCRN 16kHz 降噪（535 KB）— 简单/困难模式
 *  - novasr     : NovaSR 16k→48k 超分（229 KB）— 轻量超分备选
 *  - hifiganbwe : HiFi-GAN+ BWE 带宽扩展（4.2 MB）— 困难模式
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ModelEntry {
  /** 模型 ID */
  id: "gtcrn" | "novasr" | "hifiganbwe";
  /** 用户导入后的本地 URI（expo-file-system 格式，如 file://...） */
  localUri: string;
  /** 文件大小（字节） */
  size: number;
  /** 导入时间戳 */
  importedAt: number;
  /** 显示名称 */
  label: string;
}

interface ModelState {
  models: Record<string, ModelEntry>;
  /** 设置模型路径（导入后调用） */
  setModel: (entry: ModelEntry) => void;
  /** 删除模型 */
  removeModel: (id: string) => void;
  /** 获取模型 URI（不存在返回 null） */
  getModelUri: (id: string) => string | null;
  /** 是否已导入某模型 */
  hasModel: (id: string) => boolean;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      models: {},

      setModel: (entry) =>
        set((state) => ({
          models: { ...state.models, [entry.id]: entry },
        })),

      removeModel: (id) =>
        set((state) => {
          const next = { ...state.models };
          delete next[id];
          return { models: next };
        }),

      getModelUri: (id) => get().models[id]?.localUri ?? null,

      hasModel: (id) => !!get().models[id],
    }),
    {
      name: "ai-model-store",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
