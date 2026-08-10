import { create } from "zustand";
import { AudioFormat } from "@/lib/formats";
import { ConvertMode } from "@/lib/audioEngine";
import { dbLoadHistory, dbInsertHistory, dbClearHistory } from "@/db/api";

export interface HistoryRecord {
  id: string;
  sourceName: string;
  sourceFormat: AudioFormat | null;
  targetFormat: AudioFormat;
  mode: ConvertMode;
  outputName: string;
  outputSize: number;
  duration: number;
  createdAt: number;
  type: "convert" | "stem" | "decrypt" | "score";
}

interface HistoryState {
  records: HistoryRecord[];
  loaded: boolean;
  loadFromDB: () => Promise<void>;
  addRecord: (r: HistoryRecord) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  records: [],
  loaded: false,

  loadFromDB: async () => {
    if (get().loaded) return;
    try {
      const records = await dbLoadHistory();
      set({ records, loaded: true });
    } catch (e) {
      console.warn("[historyStore] loadFromDB failed:", e);
      set({ loaded: true });
    }
  },

  addRecord: async (r) => {
    set((state) => ({
      records: [r, ...state.records].slice(0, 100),
    }));
    try {
      await dbInsertHistory(r);
    } catch (e) {
      console.warn("[historyStore] addRecord DB error:", e);
    }
  },

  clearAll: async () => {
    set({ records: [] });
    try {
      await dbClearHistory();
    } catch (e) {
      console.warn("[historyStore] clearAll DB error:", e);
    }
  },
}));