/**
 * 全局播放状态 store
 * 供 MiniPlayer 浮窗读取当前播放信息
 */
import { create } from "zustand";
import type { AudioFile } from "./fileStore";

export interface PlayerState {
  current: AudioFile | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  // 由 player 页面注入的控制方法
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  // player 页面调用此方法注册控制器
  register: (controls: {
    play: () => void;
    pause: () => void;
    next: () => void;
    prev: () => void;
  }) => void;
  // player 页面更新播放信息
  update: (patch: Partial<Pick<PlayerState, "current" | "isPlaying" | "position" | "duration">>) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  current: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  play: () => {},
  pause: () => {},
  next: () => {},
  prev: () => {},
  register: (controls) => set({ ...controls }),
  update: (patch) => set((s) => ({ ...s, ...patch })),
}));
