import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PortalHost } from "@rn-primitives/portal";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme } from "react-native";
import { useEffect } from "react";
import { NAV_THEME } from "@/lib/theme";
import { enableFontScaling } from "@/lib/fontScaling";
import { RecordingFloatWidget } from "@/components/RecordingFloatWidget";
import { extractBundledModels } from "@/lib/modelBootstrap";
import "../global.css";

enableFontScaling();

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  const theme = isDark ? NAV_THEME.dark : NAV_THEME.light;

  // App 启动时解包内置 AI 模型（GTCRN / NovaSR / HiFi-GAN+ BWE）
  useEffect(() => {
    extractBundledModels().catch((e) =>
      console.warn("[RootLayout] 模型解包失败:", e),
    );
  }, []);

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
        <Stack.Screen name="ai-enhance" />
      </Stack>
      <PortalHost />
      <RecordingFloatWidget />
    </GestureHandlerRootView>
  );
}
