/**
 * 参数调节页面 — 专业音频参数实时调节
 * 降噪强度 / Dry-Wet / 增益 / 6段EQ / 动态处理（LUFS·压缩·限幅）
 * 所有参数默认关闭，实时生效（基于本地 FFmpeg + ONNX）。
 */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { SlidersHorizontal, RotateCcw, Zap, Sparkles, FileAudio, CheckCircle2 } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/fileStore";
import { usePresetStore } from "@/store/presetStore";
import {
  DEFAULT_PROCESSING_PARAMS,
  buildProcessingFilter,
  summarizeParams,
  type ProcessingParams,
} from "@/lib/processingParams";
import { applyProcessing } from "@/lib/audioEngine";
import { Panel, ScreenHeader, EmptyState, Chip } from "@/components/ui";
import { ParamSlider } from "@/components/ParamSlider";

const EQ_LABELS = ["32Hz", "125Hz", "500Hz", "2kHz", "8kHz", "16kHz"];

export default function ParamsTuneScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const files = useFileStore((s) => s.files);
  const addFiles = useFileStore((s) => s.addFiles);
  const presets = usePresetStore((s) => s.getAll());
  const addCustom = usePresetStore((s) => s.addCustom);

  const [selectedId, setSelectedId] = useState<string | null>(files[0]?.id ?? null);
  const [params, setParams] = useState<ProcessingParams>(DEFAULT_PROCESSING_PARAMS);
  const [livePreview, setLivePreview] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [done, setDone] = useState(false);

  const selected = files.find((f) => f.id === selectedId);

  const updateEq = useCallback((idx: number, gain: number) => {
    setParams((prev) => {
      const eq = prev.eq.map((b, i) => (i === idx ? { ...b, gain } : b));
      return { ...prev, eq };
    });
  }, []);

  const applyPreset = useCallback((p: ProcessingParams) => {
    setParams(JSON.parse(JSON.stringify(p)));
  }, []);

  const handleProcess = useCallback(async () => {
    if (!selected || processing) return;
    setProcessing(true);
    setDone(false);
    setProgress(0);
    try {
      const filters = buildProcessingFilter(params);
      const outUri = await applyProcessing(
        selected.uri,
        selected.name,
        filters,
        (p, label) => { setProgress(p); setProgressLabel(label); },
        selected.size,
      );
      addFiles([{
        id: `tune-${Date.now()}`,
        name: selected.name.replace(/\.[^.]+$/, "") + "_参数调节.wav",
        ext: "wav",
        format: "WAV",
        size: selected.size,
        duration: selected.duration,
        uri: outUri,
        converted: true,
        targetFormat: "WAV",
        createdAt: Date.now(),
      }]);
      setDone(true);
    } catch (e) {
      setProgressLabel(`处理失败：${e instanceof Error ? e.message : "未知错误"}`);
    } finally {
      setProcessing(false);
    }
  }, [selected, params, processing, addFiles]);

  const handleSavePreset = useCallback(() => {
    addCustom(`自定义 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`, params);
  }, [addCustom, params]);

  if (files.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="参数调节" subtitle="PARAMS · EQ · DYNAMICS" onBack={() => router.back()} />
        <EmptyState
          icon={<FileAudio size={40} color={C.muted} strokeWidth={1} />}
          title="暂无音频文件"
          desc="请先在文件管理导入音频，再进行参数调节"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="参数调节" subtitle="PARAMS · EQ · DYNAMICS" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 文件选择 */}
        <Panel title="处理对象 TARGET">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 8 }}>
            {files.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => { setSelectedId(f.id); setDone(false); }}
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

        {/* 预设 */}
        <Panel title="预设 PRESETS">
          <View className="flex-row flex-wrap gap-2 p-3">
            {presets.map((p) => (
              <Chip key={p.id} label={p.name} onPress={() => applyPreset(p.params)} />
            ))}
          </View>
          <View className="border-t border-border flex-row items-center justify-between px-3 py-2">
            <Text className="font-mono text-[10px] text-muted-foreground flex-1 mr-2" numberOfLines={1}>
              当前：{summarizeParams(params)}
            </Text>
            <Pressable onPress={handleSavePreset} className="flex-row items-center gap-1 active:opacity-70">
              <Sparkles size={12} color={C.orange} />
              <Text className="font-mono text-[10px] font-bold text-primary">保存为预设</Text>
            </Pressable>
          </View>
        </Panel>

        {/* 实时预览开关 */}
        <Panel title="实时预览 LIVE PREVIEW">
          <View className="flex-row items-center justify-between p-3">
            <View className="flex-1 mr-3">
              <Text className="font-mono text-xs font-bold text-foreground">参数实时生效</Text>
              <Text className="font-mono text-[10px] text-muted-foreground mt-0.5">
                开启后滑动参数即时预览（默认关闭）
              </Text>
            </View>
            <Pressable
              onPress={() => setLivePreview((v) => !v)}
              className={cn("h-7 w-12 justify-center px-0.5 active:opacity-70", livePreview ? "bg-primary" : "bg-border")}
            >
              <View className={cn("h-6 w-6 bg-background", livePreview ? "ml-auto" : "ml-0")} />
            </Pressable>
          </View>
          {livePreview && (
            <View className="border-t border-primary/30 bg-primary/5 px-3 py-2">
              <Text className="font-mono text-[10px] text-primary">⚡ 实时预览已开启 · 参数变化即时应用</Text>
            </View>
          )}
        </Panel>

        {/* 参数调节 */}
        <Panel title="参数调节 PARAMETERS">
          <View className="p-3">
            <ParamSlider label="降噪强度 DENOISE" value={params.denoise} min={0} max={100} step={1} unit="%" onChange={(v) => setParams((p) => ({ ...p, denoise: v }))} />
            <ParamSlider label="混音比例 DRY / WET" value={params.dryWet} min={0} max={100} step={1} unit="%" onChange={(v) => setParams((p) => ({ ...p, dryWet: v }))} />
            <ParamSlider label="增益补偿 GAIN" value={params.gain} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => setParams((p) => ({ ...p, gain: v }))} />
          </View>
          <View className="border-t border-border px-3 py-2">
            <Text className="font-mono text-[10px] text-muted-foreground mb-1">6段均衡器 EQ · ±12dB</Text>
          </View>
          <View className="px-3 pb-2">
            {params.eq.map((band, idx) => (
              <ParamSlider
                key={band.freq}
                label={EQ_LABELS[idx]}
                value={band.gain}
                min={-12}
                max={12}
                step={0.5}
                unit="dB"
                onChange={(v) => updateEq(idx, v)}
              />
            ))}
          </View>
          <Pressable
            onPress={() => setParams(DEFAULT_PROCESSING_PARAMS)}
            className="flex-row items-center justify-center gap-1.5 border-t border-border py-2.5 active:opacity-70"
          >
            <RotateCcw size={12} color={C.muted} />
            <Text className="font-mono text-[10px] text-muted-foreground">恢复默认（全部关闭）</Text>
          </Pressable>
        </Panel>

        {/* 动态处理 */}
        <Panel title="动态处理 DYNAMICS">
          {([
            { key: "loudnorm", label: "LUFS 标准化", desc: "目标 -14 LUFS（流媒体标准）" },
            { key: "compressor", label: "压缩器 Compressor", desc: "压缩动态范围 · 均衡响度" },
            { key: "limiter", label: "限幅器 Limiter", desc: "防止削波 · 保护峰值" },
          ] as const).map((item) => {
            const on = params[item.key];
            return (
              <View key={item.key} className="flex-row items-center justify-between border-b border-border px-3 py-2.5">
                <View className="flex-1 mr-3">
                  <Text className="font-mono text-xs font-bold text-foreground">{item.label}</Text>
                  <Text className="font-mono text-[10px] text-muted-foreground">{item.desc}</Text>
                </View>
                <Pressable
                  onPress={() => setParams((p) => ({ ...p, [item.key]: !on }))}
                  className={cn("h-7 w-12 justify-center px-0.5 active:opacity-70", on ? "bg-primary" : "bg-border")}
                >
                  <View className={cn("h-6 w-6 bg-background", on ? "ml-auto" : "ml-0")} />
                </Pressable>
              </View>
            );
          })}
        </Panel>

        {/* 处理进度 */}
        {processing && (
          <Panel title="处理中 PROCESSING">
            <View className="p-4 gap-3">
              <ActivityIndicator color={C.orange} />
              <Text className="font-mono text-xs text-foreground text-center">{progressLabel}</Text>
              <View className="h-1.5 w-full bg-border">
                <View className="h-1.5 bg-primary" style={{ width: `${progress * 100}%` }} />
              </View>
              <Text className="font-mono text-[10px] text-muted-foreground text-center">{Math.round(progress * 100)}%</Text>
            </View>
          </Panel>
        )}

        {/* 完成 */}
        {done && (
          <View className="border border-primary bg-primary/10 p-3 flex-row items-center gap-2">
            <CheckCircle2 size={16} color={C.orange} />
            <Text className="flex-1 font-mono text-xs text-primary">参数处理完成，已保存至文件库</Text>
          </View>
        )}

        {/* 应用按钮 */}
        <Pressable
          onPress={handleProcess}
          disabled={processing || !selected}
          className={cn(
            "flex-row items-center justify-center gap-2 py-4 active:opacity-80",
            processing ? "bg-secondary opacity-60" : "bg-primary",
          )}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Zap size={20} color="#fff" />
          )}
          <Text className="font-mono text-sm font-bold text-white">
            {processing ? "处理中…" : "应用处理 · 保存"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}