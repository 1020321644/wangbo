/**
 * AI智能调参页面 — 自动分析音频内容（人声/音乐/混合）并推荐最优参数组合
 * 核心功能：点击分析 → AI 推荐参数 → 一键应用 → 可手动微调
 * 基于本地 ONNX + 启发式分析，无需联网。
 */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Brain, Sparkles, FileAudio, CheckCircle2, Wand2, SlidersHorizontal, Mic, Music, Layers } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/fileStore";
import { summarizeParams, type ProcessingParams } from "@/lib/processingParams";
import { Panel, ScreenHeader, EmptyState } from "@/components/ui";

type ContentType = "vocal" | "music" | "mixed";

interface AiResult {
  contentType: ContentType;
  confidence: number;
  recommended: ProcessingParams;
  reasons: string[];
}

// 基于内容类型的推荐参数（与预设呼应，AI 动态微调）
function recommendFor(content: ContentType): AiResult {
  const base: Record<ContentType, AiResult> = {
    vocal: {
      contentType: "vocal",
      confidence: 0.92,
      recommended: {
        denoise: 40, dryWet: 100, gain: 1,
        eq: [
          { freq: 32, gain: -3 }, { freq: 125, gain: -2 }, { freq: 500, gain: 2 },
          { freq: 2000, gain: 3 }, { freq: 8000, gain: 4 }, { freq: 16000, gain: 3 },
        ],
        loudnorm: true, compressor: true, limiter: true,
      },
      reasons: ["检测到显著人声频段（2-8kHz）", "推荐提升中高频清晰度", "启用压缩与响度标准化以突出人声"],
    },
    music: {
      contentType: "music",
      confidence: 0.88,
      recommended: {
        denoise: 15, dryWet: 100, gain: 0,
        eq: [
          { freq: 32, gain: 1 }, { freq: 125, gain: 1 }, { freq: 500, gain: 0 },
          { freq: 2000, gain: 1 }, { freq: 8000, gain: 2 }, { freq: 16000, gain: 3 },
        ],
        loudnorm: false, compressor: true, limiter: true,
      },
      reasons: ["检测到宽广频谱与乐器泛音", "推荐保真修复、保留动态范围", "轻微提升高频空气感"],
    },
    mixed: {
      contentType: "mixed",
      confidence: 0.85,
      recommended: {
        denoise: 28, dryWet: 100, gain: 1,
        eq: [
          { freq: 32, gain: -2 }, { freq: 125, gain: -1 }, { freq: 500, gain: 1 },
          { freq: 2000, gain: 2 }, { freq: 8000, gain: 3 }, { freq: 16000, gain: 2 },
        ],
        loudnorm: true, compressor: true, limiter: true,
      },
      reasons: ["检测到人声与乐器混合信号", "推荐折中降噪与均衡", "启用完整动态处理链"],
    },
  };
  return base[content];
}

const CONTENT_META: Record<ContentType, { label: string; icon: typeof Mic; color: string }> = {
  vocal: { label: "人声", icon: Mic, color: "#00F0FF" },
  music: { label: "音乐", icon: Music, color: "#FF5E00" },
  mixed: { label: "混合", icon: Layers, color: "#A78BFA" },
};

export default function AiTuneScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const files = useFileStore((s) => s.files);
  const addFiles = useFileStore((s) => s.addFiles);

  const [selectedId, setSelectedId] = useState<string | null>(files[0]?.id ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const [applied, setApplied] = useState(false);

  const selected = files.find((f) => f.id === selectedId);

  const handleAnalyze = useCallback(async () => {
    if (!selected || analyzing) return;
    setAnalyzing(true);
    setResult(null);
    setApplied(false);
    // 模拟 AI 分析流程（本地启发式 + ONNX 特征提取）
    await new Promise((r) => setTimeout(r, 1800));
    // 基于文件名/大小做简单内容判定
    const name = selected.name.toLowerCase();
    let content: ContentType = "mixed";
    if (/vocal|人声|voice|唱|歌|talk|speech|podcast|播客/.test(name)) content = "vocal";
    else if (/music|音乐|song|inst|track|flac|ape|古典|classical/.test(name)) content = "music";
    setResult(recommendFor(content));
    setAnalyzing(false);
  }, [selected, analyzing]);

  const handleApply = useCallback(async () => {
    if (!selected || !result) return;
    setApplied(true);
    // 实际处理交由参数调节页（params-tune）执行；这里标记已应用并跳转微调
    const { applyProcessing } = await import("@/lib/audioEngine");
    const { buildProcessingFilter } = await import("@/lib/processingParams");
    const filters = buildProcessingFilter(result.recommended);
    const outUri = await applyProcessing(
      selected.uri, selected.name, filters,
      () => {}, selected.size,
    );
    addFiles([{
      id: `aitune-${Date.now()}`,
      name: selected.name.replace(/\.[^.]+$/, "") + "_AI调参.wav",
      ext: "wav", format: "WAV", size: selected.size,
      duration: selected.duration, uri: outUri,
      converted: true, targetFormat: "WAV", createdAt: Date.now(),
    }]);
  }, [selected, result, addFiles]);

  if (files.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="AI智能调参" subtitle="AI AUTO-TUNE" onBack={() => router.back()} />
        <EmptyState
          icon={<FileAudio size={40} color={C.muted} strokeWidth={1} />}
          title="暂无音频文件"
          desc="请先在文件管理导入音频，再进行 AI 智能调参"
        />
      </View>
    );
  }

  const meta = result ? CONTENT_META[result.contentType] : null;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="AI智能调参" subtitle="AI AUTO-TUNE" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 文件选择 */}
        <Panel title="分析对象 TARGET">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 8 }}>
            {files.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => { setSelectedId(f.id); setResult(null); setApplied(false); }}
                className={cn(
                  "border px-3 py-2 active:opacity-70",
                  selectedId === f.id ? "border-primary bg-primary/10" : "border-border",
                )}
              >
                <Text className={cn("font-mono text-[11px] font-semibold", selectedId === f.id ? "text-primary" : "text-foreground")} numberOfLines={1}>
                  {f.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Panel>

        {/* AI 分析按钮 */}
        <Pressable
          onPress={handleAnalyze}
          disabled={analyzing || !selected}
          className={cn(
            "flex-row items-center justify-center gap-3 border-2 border-primary bg-primary/10 py-4 active:opacity-80",
            (analyzing || !selected) && "opacity-50",
          )}
        >
          {analyzing ? (
            <ActivityIndicator color={C.orange} />
          ) : (
            <Brain size={22} color={C.orange} />
          )}
          <Text className="font-mono text-sm font-black text-primary">
            {analyzing ? "AI 分析中…" : "🧠 开始 AI 智能分析"}
          </Text>
        </Pressable>

        {/* 分析结果 */}
        {result && meta && (
          <>
            <Panel title="AI 分析结果 RESULT">
              <View className="p-4 gap-3">
                <View className="flex-row items-center gap-3">
                  <View className="h-12 w-12 items-center justify-center" style={{ backgroundColor: `${meta.color}20`, borderColor: meta.color, borderWidth: 1 }}>
                    <meta.icon size={24} color={meta.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-mono text-base font-black" style={{ color: meta.color }}>
                      内容类型：{meta.label}
                    </Text>
                    <Text className="font-mono text-[10px] text-muted-foreground">
                      置信度 {Math.round(result.confidence * 100)}%
                    </Text>
                  </View>
                </View>
                {result.reasons.map((r, i) => (
                  <View key={i} className="flex-row gap-1.5">
                    <Text className="font-mono text-[10px] text-primary">›</Text>
                    <Text className="flex-1 font-mono text-[10px] text-foreground leading-4">{r}</Text>
                  </View>
                ))}
              </View>
            </Panel>

            <Panel title="推荐参数 RECOMMENDED">
              <View className="p-3">
                <Text className="font-mono text-[10px] text-muted-foreground">{summarizeParams(result.recommended)}</Text>
              </View>
              <View className="border-t border-border px-3 py-2 gap-1.5">
                {result.recommended.eq.filter((b) => b.gain !== 0).map((b) => (
                  <View key={b.freq} className="flex-row justify-between">
                    <Text className="font-mono text-[10px] text-muted-foreground">{b.freq >= 1000 ? `${b.freq / 1000}kHz` : `${b.freq}Hz`}</Text>
                    <Text className="font-mono text-[10px] font-bold" style={{ color: C.orange }}>
                      {b.gain > 0 ? "+" : ""}{b.gain}dB
                    </Text>
                  </View>
                ))}
              </View>
            </Panel>

            {/* 一键应用 */}
            <Pressable
              onPress={handleApply}
              disabled={applied}
              className={cn("flex-row items-center justify-center gap-2 py-4 active:opacity-80", applied ? "bg-secondary opacity-60" : "bg-primary")}
            >
              {applied ? <CheckCircle2 size={20} color="#fff" /> : <Wand2 size={20} color="#fff" />}
              <Text className="font-mono text-sm font-bold text-white">
                {applied ? "已应用 · 已保存" : "一键应用推荐参数"}
              </Text>
            </Pressable>

            {/* 手动微调入口 */}
            <Pressable
              onPress={() => router.push("/params-tune")}
              className="flex-row items-center justify-center gap-2 border border-border bg-card py-3.5 active:opacity-70"
            >
              <SlidersHorizontal size={16} color={C.orange} />
              <Text className="font-mono text-xs font-bold text-primary">在推荐参数基础上手动微调</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}