import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PortalHost } from "@rn-primitives/portal";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme } from "react-native";
import { NAV_THEME } from "@/lib/theme";
import { enableFontScaling } from "@/lib/fontScaling";
import { RecordingFloatWidget } from "@/components/RecordingFloatWidget";
import "../global.css";

// 全局开启字体跟随系统缩放（辅助功能）
enableFontScaling();

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme !== "light"; // null/undefined 时默认深色
  const theme = isDark ? NAV_THEME.dark : NAV_THEME.light;

  // 所有 AI 处理（音质提升 / Stem 分离 / 曲谱）均已改为云端 Edge Function，
  // 客户端不再包含任何本地模型或原生推理模块。

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={theme.background}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: "fade",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="params" options={{ presentation: "modal" }} />
        <Stack.Screen name="analysis" />
        <Stack.Screen name="stem" />
        <Stack.Screen name="decrypt" />
        <Stack.Screen name="score" />
        <Stack.Screen name="bg-record" />
        <Stack.Screen name="model-import" options={{ headerShown: false }} />
      </Stack>
      <PortalHost />
      {/* 全局悬浮录制控制器：录制中切屏后仍可操作，不在 bg-record 屏幕时显示 */}
      <RecordingFloatWidget />
    </GestureHandlerRootView>
  );
}
