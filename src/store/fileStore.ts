import { create } from "zustand";
import { AudioFormat } from "@/lib/formats";
import {
  dbLoadFiles,
  dbInsertFiles,
  dbDeleteFile,
  dbUpdateFile,
  dbClearFiles,
} from "@/db/api";

export interface AudioFile {
  id: string;
  name: string;
  ext: string;
  format: AudioFormat | null;
  size: number;
  duration: number;
  uri: string;
  createdAt: number;
  converted?: boolean;
  targetFormat?: AudioFormat;
  // 歌曲元数据
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  genre?: string;
  comment?: string;
  // 母带规格（转换后填充）
  sampleRate?: string;
  bitDepth?: string;
  bitrate?: string;
  masterEnhance?: boolean;
  /** 实际使用的 AI 增强引擎（audiosr / deepfilternet / ffmpeg-dsp / none） */
  enhanceEngine?: string;
}

interface FileState {
  files: AudioFile[];
  loaded: boolean;
  loadFromDB: () => Promise<void>;
  addFiles: (files: AudioFile[]) => Promise<void>;
  removeFile: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  markConverted: (id: string, target: AudioFormat, newName: string, newSize: number) => Promise<void>;
  updateFile: (id: string, patch: Partial<Omit<AudioFile, "id">>) => Promise<void>;
  getById: (id: string) => AudioFile | undefined;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  loaded: false,

  // 从 DB 加载（在 App 启动或 Tab 聚焦时调用一次）
  loadFromDB: async () => {
    if (get().loaded) return;
    try {
      const files = await dbLoadFiles();
      set({ files, loaded: true });
    } catch (e) {
      console.warn("[fileStore] loadFromDB failed:", e);
      set({ loaded: true });
    }
  },

  addFiles: async (newFiles) => {
    set((state) => ({ files: [...newFiles, ...state.files] }));
    try {
      await dbInsertFiles(newFiles);
    } catch (e) {
      console.warn("[fileStore] addFiles DB error:", e);
    }
  },

  removeFile: async (id) => {
    set((state) => ({ files: state.files.filter((f) => f.id !== id) }));
    try {
      await dbDeleteFile(id);
    } catch (e) {
      console.warn("[fileStore] removeFile DB error:", e);
    }
  },

  clearAll: async () => {
    set({ files: [] });
    try {
      await dbClearFiles();
    } catch (e) {
      console.warn("[fileStore] clearAll DB error:", e);
    }
  },

  markConverted: async (id, target, newName, newSize) => {
    const newId = `${id}-conv-${Date.now()}`;
    const newFile: AudioFile = {
      ...(get().files.find((f) => f.id === id) as AudioFile),
      id: newId,
      name: newName,
      format: target,
      ext: target.toLowerCase(),
      size: newSize,
      converted: true,
      targetFormat: target,
      createdAt: Date.now(),
    };
    set((state) => ({ files: [newFile, ...state.files] }));
    try {
      await dbInsertFiles([newFile]);
    } catch (e) {
      console.warn("[fileStore] markConverted DB error:", e);
      // 回滚
      try { await dbUpdateFile(id, { converted: true, targetFormat: target }); } catch {}
    }
  },

  getById: (id) => get().files.find((f) => f.id === id),

  updateFile: async (id, patch) => {
    set((state) => ({
      files: state.files.map((f) => f.id === id ? { ...f, ...patch } : f),
    }));
    try {
      await dbUpdateFile(id, patch);
    } catch (e) {
      console.warn("[fileStore] updateFile DB error:", e);
    }
  },
}));