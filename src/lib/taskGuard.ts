/**
 * taskGuard — 耗时 AI 任务的保活与防杀
 *
 * - expo-keep-awake：禁止息屏，防止系统在计算期间休眠
 * - 前台通知：状态栏弹出「AI 计算中」常驻提示，降低后台被杀概率
 * - 支持嵌套计数：多个任务并行时仅在全部结束后才释放
 * - Web 端跳过通知（expo-notifications 在 Web 不可用），仅保留 keep-awake
 */
import * as KeepAwake from "expo-keep-awake";
import * as Notifications from "expo-notifications";

const TAG = "ai-task";
let depth = 0;

// 前台通知展示策略（仅原生端生效）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** 开始一个耗时任务，label 为状态栏提示文案 */
export async function startTask(label: string) {
  depth++;
  try {
    await KeepAwake.activateKeepAwakeAsync(TAG);
  } catch {
    // keep-awake 失败不应阻断主流程
  }
  if (process.env.EXPO_OS !== "web") {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "AI 计算中",
          body: label,
          sticky: true,
          autoDismiss: false,
        },
        trigger: null,
      });
    } catch {
      // 通知失败不影响计算
    }
  }
}

/** 结束一个耗时任务；全部结束后释放保活与通知 */
export async function endTask() {
  depth = Math.max(0, depth - 1);
  if (depth === 0) {
    try {
      await KeepAwake.deactivateKeepAwake(TAG);
    } catch {
      // 忽略
    }
    if (process.env.EXPO_OS !== "web") {
      try {
        await Notifications.dismissAllNotificationsAsync();
      } catch {
        // 忽略
      }
    }
  }
}