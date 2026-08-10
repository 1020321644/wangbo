/**
 * MiniPlayer — 全局浮窗播放控制条 + 录制状态浮窗
 *
 * - 切换到其他 Tab 时仍显示在底部导航栏上方
 * - 若正在后台录制母带，额外显示录制状态控制条
 * - 数据来自 usePlayerStore（player.tsx 注册）
 * - 录制状态来自 useMasterRecordStore（全局单例）
 * - 性能优化：React.memo + 选择器优化，避免频繁重渲染
 */
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Play, Pause, SkipForward, Music2, StopCircle, CheckCircle2, AlertTriangle } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { usePlayerStore } from "@/store/playerStore";
import { useMasterRecordStore } from "@/store/masterRecordStore";
import { memo } from "react";

export const MiniPlayer = memo(function MiniPlayer() {
  const C = useColors();
  const router = useRouter();
  const pathname = usePathname();
  
  // 性能优化：选择器只订阅需要的字段
  const current = usePlayerStore((s) => s.current);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const next = usePlayerStore((s) => s.next);
  
  const status = useMasterRecordStore((s) => s.status);
  const elapsed = useMasterRecordStore((s) => s.elapsed);
  const error = useMasterRecordStore((s) => s.error);
  const stop = useMasterRecordStore((s) => s.stop);
  const reset = useMasterRecordStore((s) => s.reset);

  const isRecording = status === "recording";
  const isUploading = status === "uploading";
  const isRequesting = status === "requesting";
  const isDone = status === "done";
  const isErr = status === "error";
  const hasRecordActivity = status !== "idle";

  const showPlayer = !!current && pathname !== "/(tabs)/player" && pathname !== "/player";

  if (!showPlayer && !hasRecordActivity) return null;

  const title = current ? (current.title ?? current.name.replace(/\.[^.]+$/, "")) : null;
  const artist = current?.artist ?? "未知艺人";

  return (
    <View style={{ gap: 4 }}>
      {/* ── 录制状态浮条（录制中 / 完成 / 错误时显示） ── */}
      {hasRecordActivity && (
        <View style={{
          marginHorizontal: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: isRecording ? "#1A0A0A" : isDone ? "#0A1A1A" : "#1A1A0A",
          borderWidth: 1,
          borderColor: isRecording ? "#EF4444" : isDone ? C.cyan : isErr ? "#EF4444" : C.orange,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 7,
        }}>
          {isRequesting && <ActivityIndicator size="small" color={C.orange} />}
          {isRecording  && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />}
          {isUploading  && <ActivityIndicator size="small" color={C.cyan} />}
          {isDone       && <CheckCircle2 size={14} color={C.cyan} strokeWidth={1.5} />}
          {isErr        && <AlertTriangle size={14} color="#EF4444" strokeWidth={1.5} />}

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "bold",
              color: isRecording ? "#EF4444" : isDone ? C.cyan : isErr ? "#EF4444" : C.orange }}>
              {isRequesting && "申请权限中…"}
              {isRecording  && `🎙 后台录制中 · ${elapsed}s`}
              {isUploading  && "保存母带文件中…"}
              {isDone       && `✅ 母带版已保存 · ${elapsed}s`}
              {isErr        && `❌ ${error ?? "录制失败"}`}
            </Text>
            {isRecording && (
              <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, marginTop: 1 }}>
                切到音乐APP播放 · 本APP后台录制
              </Text>
            )}
          </View>

          {isRecording && (
            <Pressable onPress={stop}
              hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 4,
                borderWidth: 1, borderColor: "#EF4444", borderRadius: 4,
                paddingHorizontal: 8, paddingVertical: 4 }}>
              <StopCircle size={12} color="#EF4444" strokeWidth={1.5} />
              <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: "#EF4444" }}>停止</Text>
            </Pressable>
          )}
          {(isDone || isErr) && (
            <Pressable onPress={reset} hitSlop={8} style={{ paddingHorizontal: 8 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>关闭</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── 播放器 Mini 控制条 ── */}
      {showPlayer && (
        <Pressable
          onPress={() => router.push("/(tabs)/player" as never)}
          style={{
            marginHorizontal: 8,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#111827",
            borderWidth: 1,
            borderColor: C.orange,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 12,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: "#1F2937",
            alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#374151" }}>
            <Music2 size={18} color={C.orange} strokeWidth={1.5} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1}
              style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: "#F9FAFB" }}>
              {title}
            </Text>
            <Text numberOfLines={1}
              style={{ fontFamily: "monospace", fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>
              {artist}
            </Text>
          </View>

          <Pressable onPress={(e) => { e.stopPropagation(); if (isPlaying) { pause(); } else { play(); } }}
            hitSlop={8} style={{ padding: 6 }}>
            {isPlaying
              ? <Pause  size={22} color={C.orange} strokeWidth={2} />
              : <Play   size={22} color={C.orange} strokeWidth={2} />}
          </Pressable>

          <Pressable onPress={(e) => { e.stopPropagation(); next(); }}
            hitSlop={8} style={{ padding: 6 }}>
            <SkipForward size={20} color={C.muted} strokeWidth={1.5} />
          </Pressable>
        </Pressable>
      )}
    </View>
  );
});
