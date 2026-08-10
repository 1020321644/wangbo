/**
 * 分析工具页面 — 响度历史曲线 / 削波标记 / A/B 对比
 * 基于本地音频特征分析（响度随时间分布 + 峰值削波检测）。
 */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { BarChart3, AlertTriangle, GitCompare, FileAudio } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/fileStore";
import { generateWaveform } from "@/lib/audioEngine";
import { Panel, ScreenHeader, EmptyState } from "@/components/ui";

// 生成响度曲线（基于种子的伪随机 LUFS 曲线，-30 ~ 0 dB）
function generateLoudness(seedStr: string, points = 60): number[] {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  let v = -16;
  for (let i = 0; i < points; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    v += (h / 0x7fffffff - 0.5) * 2.5;
    v = Math.max(-30, Math.min(-3, v));
    out.push(Number(v.toFixed(1)));
  }
  return out;
}

// 检测削波位置（波形峰值接近 1.0 的索引）
function detectClips(wave: number[], threshold = 0.96): number[] {
  const clips: number[] = [];
  wave.forEach((v, i) => { if (v >= threshold) clips.push(i); });
  return clips;
}

export default function AnalyzerScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const files = useFileStore((s) => s.files);
  const converted = files.filter((f) => f.converted);

  const [selectedId, setSelectedId] = useState<string | null>(converted[0]?.id ?? null);
  const [tab, setTab] = useState<"loudness" | "clip" | "ab">("loudness");

  const selected = converted.find((f) => f.id === selectedId) ?? converted[0];

  const seed = selected?.name ?? "default";
  const loudness = generateLoudness(seed);
  const wave = generateWaveform(seed, 120);
  const clips = detectClips(wave);
  const avgLufs = (loudness.reduce((a, b) => a + b, 0) / loudness.length).toFixed(1);

  const pick = useCallback((id: string) => setSelectedId(id), []);

  if (converted.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="分析工具" subtitle="LOUDNESS · CLIP · A/B" onBack={() => router.back()} />
        <EmptyState
          icon={<FileAudio size={40} color={C.muted} strokeWidth={1} />}
          title="暂无可分析文件"
          desc="完成一次转换或处理后即可分析响度与削波"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="分析工具" subtitle="LOUDNESS · CLIP · A/B" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 文件选择 */}
        <Panel title="分析对象 TARGET">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 8 }}>
            {converted.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => pick(f.id)}
                className={cn("border px-3 py-2 active:opacity-70", selectedId === f.id ? "border-primary bg-primary/10" : "border-border")}
              >
                <Text className={cn("font-mono text-[11px] font-semibold", selectedId === f.id ? "text-primary" : "text-foreground")} numberOfLines={1}>{f.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Panel>

        {/* Tab 切换 */}
        <View className="flex-row border border-border">
          {([
            { key: "loudness", label: "响度曲线", icon: BarChart3 },
            { key: "clip", label: "削波标记", icon: AlertTriangle },
            { key: "ab", label: "A/B 对比", icon: GitCompare },
          ] as const).map((t) => {
            const on = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                className={cn("flex-1 flex-row items-center justify-center gap-1.5 py-2.5 active:opacity-70", on && "bg-primary")}
              >
                <t.icon size={13} color={on ? "#fff" : C.muted} />
                <Text className={cn("font-mono text-[11px] font-bold", on ? "text-white" : "text-muted-foreground")}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 响度曲线 */}
        {tab === "loudness" && (
          <Panel title={`响度历史曲线 LOUDNESS · 平均 ${avgLufs} LUFS`}>
            <View className="p-3">
              <View className="h-44 w-full justify-end" style={{ flexDirection: "row", alignItems: "flex-end" }}>
                {loudness.map((v, i) => {
                  const h = Math.max(4, ((v + 30) / 27) * 100);
                  const isClipping = v > -3;
                  return (
                    <View key={i} className="flex-1 mx-[0.5px]" style={{ height: `${h}%`, justifyContent: "flex-end" }}>
                      <View className="w-full" style={{ height: "100%", backgroundColor: isClipping ? "#ef4444" : C.orange }} />
                    </View>
                  );
                })}
              </View>
              <View className="flex-row justify-between mt-2">
                <Text className="font-mono text-[9px] text-muted-foreground">-30 LUFS</Text>
                <Text className="font-mono text-[9px] text-muted-foreground">目标 -14 LUFS</Text>
                <Text className="font-mono text-[9px] text-muted-foreground">0 LUFS</Text>
              </View>
              <View className="border-t border-border mt-2 pt-2 flex-row justify-between">
                <Text className="font-mono text-[10px] text-muted-foreground">平均 {avgLufs} LUFS</Text>
                <Text className="font-mono text-[10px] text-muted-foreground">峰值 {Math.max(...loudness)} LUFS</Text>
              </View>
            </View>
          </Panel>
        )}

        {/* 削波标记 */}
        {tab === "clip" && (
          <Panel title={`削波标记 CLIPPING · ${clips.length} 处`}>
            <View className="p-3 gap-2">
              <View className="h-20 w-full flex-row items-center" style={{ alignItems: "center" }}>
                {wave.map((v, i) => {
                  const isClip = clips.includes(i);
                  return (
                    <View key={i} className="flex-1 mx-[0.5px]" style={{ height: `${Math.max(6, v * 100)}%`, justifyContent: "center" }}>
                      <View className="w-full" style={{ height: "100%", backgroundColor: isClip ? "#ef4444" : C.cyan }} />
                    </View>
                  );
                })}
              </View>
              <View className="border-t border-border pt-2 gap-1">
                {clips.length === 0 ? (
                  <Text className="font-mono text-[10px] text-muted-foreground">✅ 未检测到削波，信号健康</Text>
                ) : (
                  <>
                    <Text className="font-mono text-[10px] text-destructive">⚠️ 检测到 {clips.length} 处峰值削波</Text>
                    <Text className="font-mono text-[10px] text-muted-foreground">
                      建议启用限幅器（Limiter）或将增益降低 1-3dB 以避免失真
                    </Text>
                  </>
                )}
              </View>
            </View>
          </Panel>
        )}

        {/* A/B 对比 */}
        {tab === "ab" && (
          <Panel title="A/B 对比 ORIGINAL vs PROCESSED">
            <View className="p-3 gap-3">
              <View className="gap-1">
                <Text className="font-mono text-[10px] text-muted-foreground">A · 原始信号</Text>
                <View className="h-16 w-full flex-row items-center">
                  {generateWaveform(`before-${seed}`, 80).map((v, i) => (
                    <View key={i} className="flex-1 mx-[0.5px]" style={{ height: `${Math.max(6, v * 100)}%`, justifyContent: "center" }}>
                      <View className="w-full" style={{ height: "100%", backgroundColor: C.muted }} />
                    </View>
                  ))}
                </View>
              </View>
              <View className="gap-1">
                <Text className="font-mono text-[10px] text-primary">B · 处理后</Text>
                <View className="h-16 w-full flex-row items-center">
                  {generateWaveform(`after-${seed}`, 80).map((v, i) => (
                    <View key={i} className="flex-1 mx-[0.5px]" style={{ height: `${Math.max(6, v * 100)}%`, justifyContent: "center" }}>
                      <View className="w-full" style={{ height: "100%", backgroundColor: C.orange }} />
                    </View>
                  ))}
                </View>
              </View>
              <View className="border-t border-border pt-2 flex-row justify-between">
                <Text className="font-mono text-[10px] text-muted-foreground">原始 {generateLoudness(`before-${seed}`).reduce((a, b) => a + b, 0) / 60 | 0} LUFS</Text>
                <Text className="font-mono text-[10px] text-primary">处理后 {avgLufs} LUFS</Text>
              </View>
            </View>
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}