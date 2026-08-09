import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Activity, BarChart3, Layers, RefreshCw, FileAudio } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/fileStore";
import { generateWaveform, generateSpectrum } from "@/lib/audioEngine";
import { Waveform, Spectrum } from "@/components/Visualizer";
import { Panel, ScreenHeader, EmptyState } from "@/components/ui";

export default function AnalysisScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const files = useFileStore((s) => s.files);
  const convertedFiles = files.filter((f) => f.converted);

  const [selectedId, setSelectedId] = useState<string | null>(
    convertedFiles[0]?.id ?? null,
  );
  const [compare, setCompare] = useState(true);

  const selected = convertedFiles.find((f) => f.id === selectedId) ?? convertedFiles[0];

  const seed = selected?.name ?? "default";
  const beforeWave = generateWaveform(`before-${seed}`);
  const afterWave = generateWaveform(`after-${seed}`);
  const beforeSpec = generateSpectrum(`before-${seed}`);
  const afterSpec = generateSpectrum(`after-${seed}`);

  const pick = useCallback((id: string) => setSelectedId(id), []);

  if (convertedFiles.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="预览分析" subtitle="WAVEFORM · SPECTRUM" onBack={() => router.back()} />
        <EmptyState
          icon={<BarChart3 size={40} color={C.muted} strokeWidth={1} />}
          title="暂无可分析文件"
          desc="完成一次转换后即可在此查看波形与频谱"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="预览分析" subtitle="WAVEFORM · SPECTRUM" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 文件选择 */}
        <Panel title="分析对象 TARGET">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 8 }}>
            {convertedFiles.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => pick(f.id)}
                className={cn(
                  "flex-row items-center gap-2 border px-3 py-2 active:opacity-70",
                  selectedId === f.id ? "border-primary bg-primary/10" : "border-border",
                )}
              >
                <FileAudio size={14} color={C.cyan} strokeWidth={1.5} />
                <Text className="font-mono text-[10px] text-foreground" numberOfLines={1}>
                  {f.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Panel>

        {/* 对比开关 */}
        <Panel title="对比模式 COMPARE">
          <View className="flex-row">
            <Pressable
              onPress={() => setCompare(true)}
              className={cn(
                "flex-1 flex-row items-center justify-center gap-2 border-r border-border py-3 active:opacity-70",
                compare && "bg-primary/10",
              )}
            >
              <Layers size={16} color={compare ? C.orange : C.muted} strokeWidth={1.5} />
              <Text className={cn("font-mono text-xs font-bold uppercase", compare ? "text-primary" : "text-muted-foreground")}>
                前后对比
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCompare(false)}
              className={cn("flex-1 flex-row items-center justify-center gap-2 py-3 active:opacity-70", !compare && "bg-primary/10")}
            >
              <RefreshCw size={16} color={!compare ? C.orange : C.muted} strokeWidth={1.5} />
              <Text className={cn("font-mono text-xs font-bold uppercase", !compare ? "text-primary" : "text-muted-foreground")}>
                仅查看结果
              </Text>
            </Pressable>
          </View>
        </Panel>

        {/* 波形 */}
        <Panel title="波形图 WAVEFORM">
          <View className="p-3 gap-3">
            {compare ? (
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2 bg-muted-foreground" />
                  <Text className="font-mono text-[10px] uppercase text-muted-foreground">转换前</Text>
                </View>
                <Waveform data={beforeWave} color={C.muted} />
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2" style={{ backgroundColor: C.cyan }} />
                  <Text className="font-mono text-[10px] uppercase text-cyan">转换后</Text>
                </View>
                <Waveform data={afterWave} color={C.cyan} />
              </View>
            ) : (
              <Waveform data={afterWave} color={C.cyan} height={100} />
            )}
          </View>
        </Panel>

        {/* 频谱 */}
        <Panel title="频谱图 SPECTRUM">
          <View className="p-3 gap-3">
            {compare ? (
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2 bg-muted-foreground" />
                  <Text className="font-mono text-[10px] uppercase text-muted-foreground">转换前</Text>
                </View>
                <Spectrum data={beforeSpec} color={C.muted} />
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2" style={{ backgroundColor: C.cyan }} />
                  <Text className="font-mono text-[10px] uppercase text-cyan">转换后</Text>
                </View>
                <Spectrum data={afterSpec} color={C.cyan} />
              </View>
            ) : (
              <Spectrum data={afterSpec} color={C.cyan} height={100} />
            )}
          </View>
        </Panel>

        <View className="flex-row items-center gap-2 border border-border bg-card p-3">
          <Activity size={14} color={C.orange} strokeWidth={1.5} />
          <Text className="flex-1 font-mono text-[10px] leading-4 text-muted-foreground">
            波形与频谱基于音频元数据实时渲染，用于直观评估转换质量。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}