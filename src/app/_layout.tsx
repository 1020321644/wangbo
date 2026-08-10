import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PortalHost } from "@rn-primitives/portal";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme } from "react-native";
import { NAV_THEME } from "@/lib/theme";
import { enableFontScaling } from "@/lib/fontScaling";
import "../global.css";

enableFontScaling();

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  const theme = isDark ? NAV_THEME.dark : NAV_THEME.light;

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
      </Stack>
      <PortalHost />
    </GestureHandlerRootView>
  );
}
