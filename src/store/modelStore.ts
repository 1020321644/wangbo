/**
 * AI 模型路径管理 Store
 *
 * 用户通过「AI 模型管理」界面导入 .onnx 文件后，
 * 路径持久化到 AsyncStorage，供 audioEngine.ts 读取。
 *
 * 支持的模型：
 *  - deepfilter3：DeepFilterNet3（约 8.6MB）— 简单模式降噪
 *  - audiosr：AudioSR（约 20-100MB）— 困难模式超分辨率
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ModelEntry {
  /** 模型 ID */
  id: "deepfilter3" | "audiosr";
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
