/**
 * 工具箱（极简版）
 * 仅保留音频分析入口，其余工具已移除。
 */
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Activity } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import type { RelativePathString } from "expo-router";

export default function ToolsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <View style={{ paddingTop: insets.top, backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 12 }}>
          <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.text }}>工具箱</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <Pressable
          onPress={() => router.push("/analysis" as RelativePathString)}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.panel, padding: 14 }}
        >
          <Activity size={18} color={C.orange} strokeWidth={1.5} />
          <View>
            <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "bold", color: C.text }}>音频分析</Text>
            <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>AI 音频特征分析与参数建议</Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}
