import { create } from "zustand";
import { ConvertParams, type EnhanceLevel } from "@/lib/audioEngine";
import { dbLoadParams, dbUpsertParams } from "@/db/api";

interface ParamState extends ConvertParams {
  loaded: boolean;
  loadFromDB: () => Promise<void>;
  setSampleRate: (v: string) => void;
  setBitDepth: (v: string) => void;
  setBitrate: (v: string) => void;
  setMasterEnhance: (v: boolean) => void;
  setEnhanceLevel: (v: EnhanceLevel) => void;
  reset: () => void;
}

const DEFAULT: ConvertParams = {
  sampleRate: "96kHz",
  bitDepth: "24bit",
  bitrate: "320kbps",
  masterEnhance: true,
  enhanceLevel: "simple",
};

// 防抖持久化：延迟 800ms 写库，避免每次滑动立刻触发
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(params: ConvertParams) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    dbUpsertParams(params).catch((e) =>
      console.warn("[paramStore] save DB error:", e)
    );
  }, 800);
}

export const useParamStore = create<ParamState>((set, get) => ({
  ...DEFAULT,
  loaded: false,

  loadFromDB: async () => {
    if (get().loaded) return;
    try {
      const params = await dbLoadParams();
      if (params) set({ ...params, loaded: true });
      else set({ loaded: true });
    } catch (e) {
      console.warn("[paramStore] loadFromDB failed:", e);
      set({ loaded: true });
    }
  },

  setSampleRate: (v) => {
    set({ sampleRate: v });
    scheduleSave({ ...get(), sampleRate: v });
  },
  setBitDepth: (v) => {
    set({ bitDepth: v });
    scheduleSave({ ...get(), bitDepth: v });
  },
  setBitrate: (v) => {
    set({ bitrate: v });
    scheduleSave({ ...get(), bitrate: v });
  },
  setMasterEnhance: (v) => {
    set({ masterEnhance: v });
    scheduleSave({ ...get(), masterEnhance: v });
  },
  setEnhanceLevel: (v) => {
    set({ enhanceLevel: v });
    scheduleSave({ ...get(), enhanceLevel: v });
  },
  reset: () => {
    set({ ...DEFAULT });
    scheduleSave(DEFAULT);
  },
}));