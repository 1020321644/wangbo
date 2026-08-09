/**
 * 全局日志系统
 * 记录所有错误、警告、Bug，方便后续排查
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  module: string;
  message: string;
  details?: string;
  stack?: string;
}

interface LogState {
  logs: LogEntry[];
  maxLogs: number;
  addLog: (level: LogLevel, module: string, message: string, details?: string, stack?: string) => void;
  clearLogs: () => void;
  exportLogs: () => string;
  getLogsByLevel: (level: LogLevel) => LogEntry[];
  getLogsByModule: (module: string) => LogEntry[];
}

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
      logs: [],
      maxLogs: 1000, // 最多保留 1000 条日志

      addLog: (level, module, message, details, stack) => {
        const log: LogEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp: Date.now(),
          level,
          module,
          message,
          details,
          stack,
        };

        set((state) => {
          const newLogs = [log, ...state.logs].slice(0, state.maxLogs);
          return { logs: newLogs };
        });

        // 开发环境下同时输出到控制台
        if (__DEV__) {
          const prefix = `[${module}]`;
          switch (level) {
            case "error":
              console.error(prefix, message, details || "", stack || "");
              break;
            case "warn":
              console.warn(prefix, message, details || "");
              break;
            case "info":
              console.info(prefix, message, details || "");
              break;
            case "debug":
              console.debug(prefix, message, details || "");
              break;
          }
        }
      },

      clearLogs: () => set({ logs: [] }),

      exportLogs: () => {
        const { logs } = get();
        const header = `音乐格式转换器 App - 日志报告
生成时间: ${new Date().toLocaleString("zh-CN")}
日志数量: ${logs.length}
========================================

`;
        const content = logs
          .map((log) => {
            const time = new Date(log.timestamp).toLocaleString("zh-CN");
            const levelTag = `[${log.level.toUpperCase()}]`;
            const moduleTag = `[${log.module}]`;
            let entry = `${time} ${levelTag} ${moduleTag} ${log.message}`;
            if (log.details) entry += `\n  详情: ${log.details}`;
            if (log.stack) entry += `\n  堆栈: ${log.stack}`;
            return entry;
          })
          .join("\n\n");

        return header + content;
      },

      getLogsByLevel: (level) => {
        return get().logs.filter((log) => log.level === level);
      },

      getLogsByModule: (module) => {
        return get().logs.filter((log) => log.module === module);
      },
    }),
    {
      name: "audio-converter-logs",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// 便捷日志函数
export const logger = {
  info: (module: string, message: string, details?: string) => {
    useLogStore.getState().addLog("info", module, message, details);
  },
  warn: (module: string, message: string, details?: string) => {
    useLogStore.getState().addLog("warn", module, message, details);
  },
  error: (module: string, message: string, details?: string, stack?: string) => {
    useLogStore.getState().addLog("error", module, message, details, stack);
  },
  debug: (module: string, message: string, details?: string) => {
    useLogStore.getState().addLog("debug", module, message, details);
  },
};
