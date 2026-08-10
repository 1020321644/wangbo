/**
 * masterRecordStore — 全局录制状态单例
 *
 * - bg-record.tsx 和 player.tsx 都调用同一个 useMasterRecordStore
 * - MiniPlayer / RecordingFloatWidget 也从这里读取录制状态，实现跨 Tab 悬浮控制
 * - stop / reset 方法通过 register 由 useMasterRecord hook 注入
 * - metering / recordMode 由 useMasterRecord useEffect 定期同步，供悬浮窗实时展示
 */
import { create } from "zustand";
import type { MasterRecordStatus } from "@/hooks/useMasterRecord";

/** inline 避免循环 import（与 useMasterRecord 中 RecordMode 保持一致） */
type RecordMode = "system" | "microphone";

export interface MasterRecordStorePatch {
  status?: MasterRecordStatus;
  elapsed?: number;
  error?: string;
  /** 归一化实时电平 0-1（由 useMasterRecord useEffect 同步，expo-audio dBFS 已转换） */
  metering?: number;
  /** 当前录制模式，null 表示空闲 */
  recordMode?: RecordMode | null;
}

export interface MasterRecordStoreState {
  status:     MasterRecordStatus;
  elapsed:    number;
  error?:     string;
  metering:   number;
  recordMode: RecordMode | null;
  stop:    () => Promise<void>;
  reset:   () => void;
  sync:    (patch: MasterRecordStorePatch) => void;
  register:(controls: { stop: () => Promise<void>; reset: () => void }) => void;
}

export const useMasterRecordStore = create<MasterRecordStoreState>((set) => ({
  status:     "idle",
  elapsed:    0,
  error:      undefined,
  metering:   0,
  recordMode: null,
  stop:  async () => {},
  reset: () => {},
  sync:  (patch) => set((s) => ({ ...s, ...patch })),
  register: (controls) => set({ ...controls }),
}));
