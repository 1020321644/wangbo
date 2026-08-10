/**
 * 批处理页面 — 多文件队列批量转换，支持预设（人声优化/古典修复/直播清晰）及自定义
 */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Plus, Trash2, Zap, CheckCircle2, XCircle, FileAudio, Layers } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { usePresetStore } from "@/store/presetStore";
import { buildProcessingFilter } from "@/lib/processingParams";
import { applyProcessing } from "@/lib/audioEngine";
import { Panel, ScreenHeader, EmptyState, Chip } from "@/components/ui";

interface BatchItem {
  file: AudioFile;
  status: "pending" | "processing" | "done" | "error";
}

export default function BatchScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const files = useFileStore((s) => s.files);
  const addFiles = useFileStore((s) => s.addFiles);
  const presets = usePresetStore((s) => s.getAll());

  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [presetId, setPresetId] = useState<string>(presets[0]?.id ?? "voice");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const selectedPreset = presets.find((p) => p.id === presetId);

  const addFileToQueue = useCallback((f: AudioFile) => {
    setQueue((q) => {
      if (q.some((item) => item.file.id === f.id)) return q;
      return [...q, { file: f, status: "pending" }];
    });
    setFinished(false);
  }, []);

  const removeFile = useCallback((id: string) => {
    setQueue((q) => q.filter((item) => item.file.id !== id));
  }, []);

  const handleRun = useCallback(async () => {
    if (queue.length === 0 || running || !selectedPreset) return;
    setRunning(true);
    setFinished(false);
    const filters = buildProcessingFilter(selectedPreset.params);
    const results: AudioFile[] = [];
    for (let i = 0; i < queue.length; i++) {
      setQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: "processing" } : item));
      try {
        const outUri = await applyProcessing(
          queue[i].file.uri, queue[i].file.name, filters,
          () => {}, queue[i].file.size,
        );
        results.push({
          id: `batch-${Date.now()}-${i}`,
          name: queue[i].file.name.replace(/\.[^.]+$/, "") + `_${selectedPreset.name}.wav`,
          ext: "wav", format: "WAV", size: queue[i].file.size,
          duration: queue[i].file.duration, uri: outUri,
          converted: true, targetFormat: "WAV", createdAt: Date.now(),
        });
        setQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: "done" } : item));
      } catch {
        setQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: "error" } : item));
      }
    }
    if (results.length > 0) addFiles(results);
    setRunning(false);
    setFinished(true);
  }, [queue, running, selectedPreset, addFiles]);

  const doneCount = queue.filter((q) => q.status === "done").length;
  const errCount = queue.filter((q) => q.status === "error").length;

  if (files.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="批处理" subtitle="BATCH CONVERT" onBack={() => router.back()} />
        <EmptyState
          icon={<FileAudio size={40} color={C.muted} strokeWidth={1} />}
          title="暂无音频文件"
          desc="请先在文件管理导入音频，再进行批处理"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="批处理" subtitle="BATCH CONVERT" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 预设选择 */}
        <Panel title="处理预设 PRESET">
          <View className="flex-row flex-wrap gap-2 p-3">
            {presets.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                active={presetId === p.id}
                onPress={() => setPresetId(p.id)}
              />
            ))}
          </View>
          {selectedPreset && (
            <View className="border-t border-border px-3 py-2">
              <Text className="font-mono text-[10px] text-muted-foreground">{selectedPreset.desc}</Text>
            </View>
          )}
        </Panel>

        {/* 文件队列 */}
        <Panel title={`文件队列 QUEUE · ${queue.length}`}>
          {queue.length === 0 ? (
            <View className="p-4 items-center">
              <Layers size={28} color={C.muted} strokeWidth={1} />
              <Text className="font-mono text-[10px] text-muted-foreground mt-2">队列为空，点击下方按钮添加文件</Text>
            </View>
          ) : (
            queue.map((item) => (
              <View key={item.file.id} className="flex-row items-center gap-2 border-b border-border px-3 py-2">
                <View className="flex-1">
                  <Text className="font-mono text-[11px] text-foreground" numberOfLines={1}>{item.file.name}</Text>
                  <Text className="font-mono text-[9px] text-muted-foreground">
                    {item.file.format ?? item.file.ext?.toUpperCase()} · {(item.file.size / 1024 / 1024).toFixed(1)}MB
                  </Text>
                </View>
                {item.status === "processing" && <ActivityIndicator size="small" color={C.orange} />}
                {item.status === "done" && <CheckCircle2 size={16} color="#22c55e" />}
                {item.status === "error" && <XCircle size={16} color="#ef4444" />}
                {item.status === "pending" && (
                  <Pressable onPress={() => removeFile(item.file.id)} className="active:opacity-70">
                    <Trash2 size={14} color={C.muted} />
                  </Pressable>
                )}
              </View>
            ))
          )}
        </Panel>

        {/* 添加文件 */}
        {pickerOpen && (
          <Panel title="选择文件 ADD FILES">
            <ScrollView style={{ maxHeight: 260 }}>
              {files.map((f) => {
                const inQueue = queue.some((q) => q.file.id === f.id);
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => addFileToQueue(f)}
                    disabled={inQueue}
                    className={cn(
                      "flex-row items-center justify-between border-b border-border px-3 py-2 active:opacity-70",
                      inQueue && "opacity-40",
                    )}
                  >
                    <Text className="flex-1 font-mono text-[11px] text-foreground" numberOfLines={1}>{f.name}</Text>
                    {inQueue ? (
                      <CheckCircle2 size={14} color="#22c55e" />
                    ) : (
                      <Plus size={14} color={C.orange} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setPickerOpen(false)} className="border-t border-border py-2.5 active:opacity-70">
              <Text className="font-mono text-[10px] text-muted-foreground text-center">收起</Text>
            </Pressable>
          </Panel>
        )}

        {!pickerOpen && (
          <Pressable
            onPress={() => setPickerOpen(true)}
            className="flex-row items-center justify-center gap-2 border border-dashed border-border bg-card py-3 active:opacity-70"
          >
            <Plus size={14} color={C.orange} />
            <Text className="font-mono text-xs font-bold text-primary">添加文件到队列</Text>
          </Pressable>
        )}

        {/* 结果统计 */}
        {finished && (
          <View className="border border-primary bg-primary/10 p-3 flex-row items-center gap-2">
            <CheckCircle2 size={16} color={C.orange} />
            <Text className="flex-1 font-mono text-xs text-primary">
              批处理完成 · 成功 {doneCount} · 失败 {errCount}
            </Text>
          </View>
        )}

        {/* 开始批处理 */}
        <Pressable
          onPress={handleRun}
          disabled={queue.length === 0 || running}
          className={cn(
            "flex-row items-center justify-center gap-2 py-4 active:opacity-80",
            queue.length === 0 || running ? "bg-secondary opacity-60" : "bg-primary",
          )}
        >
          {running ? <ActivityIndicator color="#fff" /> : <Zap size={20} color="#fff" />}
          <Text className="font-mono text-sm font-bold text-white">
            {running ? "批处理中…" : `开始批处理 · ${queue.length} 个文件`}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}