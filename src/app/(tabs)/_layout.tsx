import { useEffect } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { AudioLines, FolderOpen, Settings } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/lib/theme";
import { useFileStore } from "@/store/fileStore";
import { useHistoryStore } from "@/store/historyStore";
import { useParamStore } from "@/store/paramStore";

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
          sceneStyle: { backgroundColor: C.background },
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
          name="settings"
          options={{
            title: "设置",
            tabBarIcon: ({ color, size }) => <Settings color={color} size={size} strokeWidth={1.5} />,
          }}
        />
      </Tabs>
    </View>
  );
}
