/**
 * settingsStore — 应用设置（云端增强开关等）
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SettingsState {
  /** 云端增强开关（默认关闭，用户手动开启） */
  cloudEnhance: boolean;
  setCloudEnhance: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      cloudEnhance: false,
      setCloudEnhance: (v) => set({ cloudEnhance: v }),
    }),
    {
      name: "app-settings",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);