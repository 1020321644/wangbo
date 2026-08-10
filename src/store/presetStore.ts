/**
 * presetStore — 处理预设管理（人声优化 / 古典修复 / 直播清晰 + 自定义保存）
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_PROCESSING_PARAMS,
  type ProcessingParams,
} from "@/lib/processingParams";

export interface Preset {
  id: string;
  name: string;
  builtIn: boolean;
  desc: string;
  params: ProcessingParams;
}

const VOICE: ProcessingParams = {
  ...DEFAULT_PROCESSING_PARAMS,
  denoise: 35,
  dryWet: 100,
  gain: 1,
  eq: [
    { freq: 32, gain: -3 },
    { freq: 125, gain: -2 },
    { freq: 500, gain: 2 },
    { freq: 2000, gain: 3 },
    { freq: 8000, gain: 4 },
    { freq: 16000, gain: 3 },
  ],
  compressor: true,
  loudnorm: true,
  limiter: true,
};

const CLASSICAL: ProcessingParams = {
  ...DEFAULT_PROCESSING_PARAMS,
  denoise: 15,
  dryWet: 100,
  gain: 0,
  eq: [
    { freq: 32, gain: 1 },
    { freq: 125, gain: 1 },
    { freq: 500, gain: 0 },
    { freq: 2000, gain: 1 },
    { freq: 8000, gain: 2 },
    { freq: 16000, gain: 3 },
  ],
  compressor: true,
  limiter: true,
};

const LIVE: ProcessingParams = {
  ...DEFAULT_PROCESSING_PARAMS,
  denoise: 50,
  dryWet: 100,
  gain: 2,
  eq: [
    { freq: 32, gain: -4 },
    { freq: 125, gain: -3 },
    { freq: 500, gain: 3 },
    { freq: 2000, gain: 4 },
    { freq: 8000, gain: 5 },
    { freq: 16000, gain: 4 },
  ],
  compressor: true,
  loudnorm: true,
  limiter: true,
};

const BUILT_IN: Preset[] = [
  { id: "voice", name: "人声优化", builtIn: true, desc: "突出人声 · 降噪 · 提升清晰度", params: VOICE },
  { id: "classical", name: "古典修复", desc: "保真修复 · 宽广动态 · 温润高频", builtIn: true, params: CLASSICAL },
  { id: "live", name: "直播清晰", desc: "强降噪 · 压缩 · 响度标准化", builtIn: true, params: LIVE },
];

interface PresetState {
  custom: Preset[];
  addCustom: (name: string, params: ProcessingParams) => void;
  removeCustom: (id: string) => void;
  getAll: () => Preset[];
  getById: (id: string) => Preset | undefined;
}

export const usePresetStore = create<PresetState>()(
  persist(
    (set, get) => ({
      custom: [],
      addCustom: (name, params) =>
        set((s) => ({
          custom: [
            ...s.custom,
            {
              id: `custom-${Date.now()}`,
              name,
              builtIn: false,
              desc: "自定义预设",
              params,
            },
          ],
        })),
      removeCustom: (id) =>
        set((s) => ({ custom: s.custom.filter((p) => p.id !== id) })),
      getAll: () => [...BUILT_IN, ...get().custom],
      getById: (id) => [...BUILT_IN, ...get().custom].find((p) => p.id === id),
    }),
    {
      name: "processing-presets",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export { BUILT_IN };