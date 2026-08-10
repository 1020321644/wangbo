/**
 * AI 模型管理（热插拔已禁用）
 *
 * 当前为二分测试版本：保留所有内置 .onnx 模型文件，
 * 但关闭动态导入 / 切换 / 删除功能。模型在应用启动时一次性加载默认版本。
 * 若本版本不再闪退，说明问题出在热插拔逻辑（文件路径 / 权限 / 动态加载机制）。
 */
import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Cpu } from "lucide-react-native";
import { useColors } from "@/lib/theme";

export default function ModelImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: C.panel,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 4 }}
          >
            <ChevronLeft size={22} color={C.text} />
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: C.text }}>返回</Text>
          </Pressable>
          <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.text }}>
            AI 模型管理
          </Text>
          <View style={{ width: 60 }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: C.panel,
            padding: 16,
            gap: 10,
            alignItems: "center",
          }}
        >
          <Cpu size={28} color={C.orange} />
          <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "bold", color: C.text }}>
            模型管理功能已关闭
          </Text>
          <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, lineHeight: 14, textAlign: "center" }}>
            当前版本使用内置默认模型（GTCRN / HiFi-GAN+ BWE / NovaSR），{'\n'}
            在应用启动时一次性加载，不支持动态导入或切换。{'\n'}
            所有 AI 处理仍在本地设备离线运行。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
