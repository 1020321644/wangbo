import { useEffect } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { AudioLines, FolderOpen, Music, SlidersHorizontal, Settings } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/lib/theme";
import { useFileStore } from "@/store/fileStore";
import { useHistoryStore } from "@/store/historyStore";
import { useParamStore } from "@/store/paramStore";
import { MiniPlayer } from "@/components/MiniPlayer";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const C = useColors();

  const loadFiles = useFileStore((s) => s.loadFromDB);
  const loadHistory = useHistoryStore((s) => s.loadFromDB);
  const loadParams = useParamStore((s) => s.loadFromDB);

  useEffect(() => {
    (async () => {
      await Promise.all([loadFiles(), loadHistory(), loadParams()]);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MiniPlayer 浮窗高度 + 间距
  const MINI_H = 60;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName="home"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: C.orange,
          tabBarInactiveTintColor: C.muted,
          tabBarStyle: {
            height: 64 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 8,
            backgroundColor: C.panel,
            borderTopColor: C.border,
            borderTopWidth: 1,
          },
          tabBarLabelStyle: {
            fontFamily: "monospace",
            fontSize: 10,
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: 1,
          },
          // 每个 Tab 屏幕底部留出 MiniPlayer 高度，避免内容被遮挡
          sceneStyle: { paddingBottom: MINI_H + 8, backgroundColor: C.background },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "转换",
            tabBarIcon: ({ color, size }) => <AudioLines color={color} size={size} strokeWidth={1.5} />,
          }}
        />
        <Tabs.Screen
          name="files"
          options={{
            title: "文件",
            tabBarIcon: ({ color, size }) => <FolderOpen color={color} size={size} strokeWidth={1.5} />,
          }}
        />
        <Tabs.Screen
          name="player"
          options={{
            title: "播放器",
            tabBarIcon: ({ color, size }) => <Music color={color} size={size} strokeWidth={1.5} />,
          }}
        />
        <Tabs.Screen
          name="tools"
          options={{
            title: "工具箱",
            tabBarIcon: ({ color, size }) => <SlidersHorizontal color={color} size={size} strokeWidth={1.5} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "设置",
            tabBarIcon: ({ color, size }) => <Settings color={color} size={size} strokeWidth={1.5} />,
          }}
        />
      </Tabs>
      {/* 全局浮窗播放条，悬浮在导航栏上方 */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 64 + insets.bottom + 6,
          paddingHorizontal: 0,
        }}
        pointerEvents="box-none"
      >
        <MiniPlayer />
      </View>
    </View>
  );
}