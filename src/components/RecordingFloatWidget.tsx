/**
 * RecordingFloatWidget — 全局悬浮录制控制器
 *
 * - 录制进行中，从任何屏幕（含系统内录离开 APP 后返回）均可看到并操作
 * - 仅在 /bg-record 以外的屏幕显示（bg-record 自带完整录制 UI）
 * - 通过 useMasterRecordStore 全局单例驱动，零屏幕绑定
 * - 显示：录制模式 · 实时电平条 · 已录时长 · 停止按钮
 */
import { View, Text, Pressable } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StopCircle, Radio } from "lucide-react-native";
import { useMasterRecordStore } from "@/store/masterRecordStore";

export function RecordingFloatWidget() {
  const pathname = usePathname();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();

  const status     = useMasterRecordStore((s) => s.status);
  const elapsed    = useMasterRecordStore((s) => s.elapsed);
  const metering   = useMasterRecordStore((s) => s.metering);
  const recordMode = useMasterRecordStore((s) => s.recordMode);
  const stop       = useMasterRecordStore((s) => s.stop);

  // 仅录制中 & 不在 bg-record 屏幕时显示
  const isBgRecord = pathname === "/bg-record" || pathname.endsWith("/bg-record");
  if (status !== "recording" || isBgRecord) return null;

  const mm   = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss   = String(elapsed % 60).padStart(2, "0");
  const modeLabel = recordMode === "system" ? "系统内录" : "麦克风";

  // 电平条颜色：高电平橙警告，中等绿，低灰
  const barColor = metering > 0.8 ? "#F59E0B" : metering > 0.4 ? "#10B981" : "#EF4444";

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: insets.bottom + 132, // 避开 MiniPlayer + Tab bar 区域
        left: 12,
        right: 12,
        zIndex: 9998,
        alignItems: "flex-end",
      }}
    >
      {/* 悬浮卡主体 */}
      <Pressable
        onPress={() => router.push("/bg-record" as never)}
        style={{
          backgroundColor: "#1A0808",
          borderWidth: 1,
          borderColor: "#EF4444",
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 8,
          gap: 5,
          minWidth: 220,
          maxWidth: 320,
          shadowColor: "#EF4444",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 12,
        }}
      >
        {/* 标题行：录制指示 + 模式 + 时间 */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {/* 闪烁红点 */}
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#EF4444" }} />
          <Radio size={12} color="#EF4444" strokeWidth={1.5} />
          <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: "#EF4444", flex: 1 }}>
            {modeLabel} · REC
          </Text>
          <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "900", color: "#F9FAFB" }}>
            {mm}:{ss}
          </Text>
        </View>

        {/* 电平条 + 停止按钮 */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {/* 电平条容器（flex-row 比例方案，避免百分比宽度问题） */}
          <View style={{ flex: 1, height: 4, backgroundColor: "#374151", borderRadius: 2, flexDirection: "row", overflow: "hidden" }}>
            <View style={{ flex: Math.max(0.02, metering), height: 4, backgroundColor: barColor, borderRadius: 2 }} />
            <View style={{ flex: Math.max(0.02, 1 - metering), height: 4 }} />
          </View>

          {/* 停止按钮 */}
          <Pressable
            onPress={stop}
            hitSlop={10}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderWidth: 1,
              borderColor: "#EF4444",
              borderRadius: 5,
              paddingHorizontal: 7,
              paddingVertical: 3,
            }}
          >
            <StopCircle size={11} color="#EF4444" strokeWidth={1.5} />
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: "#EF4444" }}>
              停止
            </Text>
          </Pressable>
        </View>

        {/* 提示文字 */}
        <Text style={{ fontFamily: "monospace", fontSize: 9, color: "#6B7280" }}>
          点击返回录制控制台
        </Text>
      </Pressable>
    </View>
  );
}
