import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from "react-native";
import { useRouter, type RelativePathString } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import {
  Plus,
  Trash2,
  Share2,
  FileAudio,
  History,
  CheckCircle2,
  Mic,
  ChevronDown,
  Clock,
  Sparkles,
  X,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn, formatDuration, formatFileSize, formatTime } from "@/lib/utils";
import { detectFormat } from "@/lib/formats";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { useHistoryStore } from "@/store/historyStore";
import { useReRecord, type ReRecordFormat } from "@/hooks/useReRecord";
import { useAIAnalysis, type AIAnalysisResult } from "@/hooks/useAIAnalysis";
import {
  Panel,
  BlueprintButton,
  Badge,
  EmptyState,
  ScreenHeader,
} from "@/components/ui";
import { logger } from "@/store/logStore";

// 支持的重制输出格式
const RERECORD_FORMATS: { value: ReRecordFormat; label: string }[] = [
  { value: "webm", label: "WEBM" },
  { value: "wav",  label: "WAV"  },
  { value: "mp3",  label: "MP3"  },
  { value: "ogg",  label: "OGG"  },
  { value: "flac", label: "FLAC" },
];

export default function FilesScreen() {
  const insets = useSafeAreaInsets();
  const C = useColors();
  const router = useRouter();
  const files = useFileStore((s) => s.files);
  const addFiles = useFileStore((s) => s.addFiles);
  const removeFile = useFileStore((s) => s.removeFile);
  const records = useHistoryStore((s) => s.records);
  const clearHistory = useHistoryStore((s) => s.clearAll);
  const { reRecord, cancel, tasks } = useReRecord();
  const { status: aiStatus, error: aiError, analyze: runAIAnalysis, reset: resetAI } = useAIAnalysis();

  const [tab, setTab] = useState<"files" | "history">("files");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysisFile, setAiAnalysisFile] = useState<AudioFile | null>(null);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  // 每个文件的待选格式（默认 webm）
  const [formatMap, setFormatMap] = useState<Map<string, ReRecordFormat>>(new Map());
  // 展开格式选择的文件 id
  const [expandedFormat, setExpandedFormat] = useState<string | null>(null);
  // 每个文件的自定义歌名
  const [titleMap, setTitleMap] = useState<Map<string, string>>(new Map());
  // 每个文件的自定义艺人
  const [artistMap, setArtistMap] = useState<Map<string, string>>(new Map());
  // 展开元信息编辑的文件 id
  const [expandedMeta, setExpandedMeta] = useState<string | null>(null);

  const handleAIAnalysis = useCallback(async (file: AudioFile) => {
    setAiAnalysisFile(file);
    setAiResult(null);
    const result = await runAIAnalysis(file);
    if (result) {
      setAiResult(result);
    }
  }, [runAIAnalysis]);

  const closeAIDialog = useCallback(() => {
    setAiAnalysisFile(null);
    setAiResult(null);
    resetAI();
  }, [resetAI]);

  const setFileFormat = useCallback((fileId: string, fmt: ReRecordFormat) => {
    setFormatMap((prev) => { const next = new Map(prev); next.set(fileId, fmt); return next; });
    setExpandedFormat(null);
  }, []);

  const importFiles = useCallback(async () => {
    setImporting(true);
    setError(null);
    try {
      logger.info("文件库", "开始导入音频文件");
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) {
        setImporting(false);
        logger.info("文件库", "用户取消导入");
        return;
      }
      const newFiles: AudioFile[] = [];
      for (const a of res.assets) {
        const fmt = detectFormat(a.name);
        if (!fmt) {
          logger.warn("文件库", `不支持的文件格式: ${a.name}`);
          continue;
        }
        newFiles.push({
          id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: a.name,
          ext: a.name.split(".").pop()?.toLowerCase() ?? "",
          format: fmt,
          size: a.size ?? Math.round(2 + Math.random() * 6) * 1024 * 1024,
          duration: Math.round(120 + Math.random() * 300),
          uri: a.uri,
          createdAt: Date.now(),
        });
      }
      if (newFiles.length === 0) {
        const errMsg = "未识别到支持的音频格式";
        setError(errMsg);
        logger.error("文件库", errMsg);
      } else {
        addFiles(newFiles);
        logger.info("文件库", `成功导入 ${newFiles.length} 个文件`, newFiles.map(f => f.name).join(", "));
      }
    } catch (err) {
      const errMsg = "导入失败，请重试";
      setError(errMsg);
      logger.error("文件库", errMsg, String(err), err instanceof Error ? err.stack : undefined);
    } finally {
      setImporting(false);
    }
  }, [addFiles]);

  const shareFile = useCallback(async (file: AudioFile) => {
    try {
      logger.info("文件库", `开始导出文件: ${file.name}`);
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        const errMsg = "当前设备不支持导出";
        setError(errMsg);
        logger.error("文件库", errMsg);
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: "audio/*",
        dialogTitle: `导出 ${file.name}`,
      });
      logger.info("文件库", `导出成功: ${file.name}`);
    } catch (err) {
      const errMsg = "导出失败，请重试";
      setError(errMsg);
      logger.error("文件库", `导出失败: ${file.name}`, String(err), err instanceof Error ? err.stack : undefined);
    }
  }, []);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="文件管理"
        subtitle="FILE MANAGER"
        right={
          <Pressable onPress={importFiles} className="active:opacity-70">
            {importing ? (
              <ActivityIndicator size="small" color={C.orange} />
            ) : (
              <Plus size={22} color={C.orange} strokeWidth={1.5} />
            )}
          </Pressable>
        }
      />

      {/* Tab 切换 */}
      <View className="flex-row border-b border-border">
        <Pressable
          onPress={() => setTab("files")}
          className={cn(
            "flex-1 items-center py-3",
            tab === "files" && "border-b-2 border-primary",
          )}
        >
          <Text
            className={cn(
              "font-mono text-xs font-bold uppercase tracking-wider",
              tab === "files" ? "text-primary" : "text-muted-foreground",
            )}
          >
            文件库 ({files.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("history")}
          className={cn(
            "flex-1 items-center py-3",
            tab === "history" && "border-b-2 border-primary",
          )}
        >
          <Text
            className={cn(
              "font-mono text-xs font-bold uppercase tracking-wider",
              tab === "history" ? "text-primary" : "text-muted-foreground",
            )}
          >
            历史记录 ({records.length})
          </Text>
        </Pressable>
      </View>

      {error ? (
        <View className="border-b border-destructive bg-card px-4 py-2">
          <Text className="font-mono text-xs text-destructive">{error}</Text>
        </View>
      ) : null}

      {tab === "files" ? (
        <FlatList
          data={files}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 24,
            gap: 8,
            flexGrow: 1,
          }}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={<FileAudio size={40} color={C.muted} strokeWidth={1} />}
              title="文件库为空"
              desc="点击右上角 + 导入音频文件"
            />
          }
          renderItem={({ item }) => {
            const task = tasks.get(item.id);
            const isRunning = task && task.status !== "done" && task.status !== "error";
            return (
              <Panel>
                <View className="flex-row items-center gap-3 p-3">
                  <View className="h-10 w-10 items-center justify-center border border-border">
                    <FileAudio size={18} color={C.cyan} strokeWidth={1.5} />
                  </View>
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text className="font-mono text-sm font-semibold text-foreground" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                      <Badge text={item.format ?? "—"} tone="cyan" />
                      {item.converted ? <Badge text="已转换" tone="orange" /> : null}
                      {item.masterEnhance ? <Badge text="母带级" tone="orange" /> : null}
                      <Text className="font-mono text-[10px] text-muted-foreground">
                        {formatFileSize(item.size)} · {formatDuration(item.duration)}
                      </Text>
                    </View>
                    {/* 后台任务状态条 */}
                    {task ? (
                      <View className="mt-1.5 flex-row items-center gap-1.5">
                        {task.status === "pending" && (
                          <><ActivityIndicator size="small" color={C.muted} /><Text className="font-mono text-[10px] text-muted-foreground">等待授权…</Text></>
                        )}
                        {task.status === "recording" && (
                          <><View className="h-1.5 w-1.5 bg-destructive" /><Text className="font-mono text-[10px] text-destructive">录制中 {formatDuration(task.elapsed)}</Text></>
                        )}
                        {task.status === "uploading" && (
                          <><ActivityIndicator size="small" color={C.orange} /><Text className="font-mono text-[10px] text-orange-400">上传中…</Text></>
                        )}
                        {task.status === "done" && (
                          <><CheckCircle2 size={12} color={C.cyan} /><Text className="font-mono text-[10px] text-cyan">重制完成，永久文件已保存</Text></>
                        )}
                        {task.status === "error" && (
                          <Text className="font-mono text-[10px] text-destructive" numberOfLines={1}>⚠ {task.error}</Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                </View>
                <View className="flex-row border-t border-border">
                  {/* 重制按钮 + 格式选择 + 歌名输入 */}
                  {isRunning ? (
                    <Pressable
                      onPress={() => cancel(item.id)}
                      className="flex-1 flex-row items-center justify-center gap-1.5 border-r border-border py-2.5 active:opacity-70"
                    >
                      <ActivityIndicator size="small" color={C.orange} />
                      <Text className="font-mono text-[10px] font-bold uppercase text-destructive">取消重制</Text>
                    </Pressable>
                  ) : (
                    <View className="flex-1 border-r border-border">
                      {/* 歌名 / 艺人输入（可展开） */}
                      <Pressable
                        onPress={() => setExpandedMeta(expandedMeta === item.id ? null : item.id)}
                        className="flex-row items-center justify-center gap-1 border-b border-border py-1.5 active:opacity-70"
                      >
                        <Text className="font-mono text-[10px] text-muted-foreground">
                          {titleMap.get(item.id) ? `🎵 ${titleMap.get(item.id)}` : "填写歌名（可选）"}
                        </Text>
                        <ChevronDown size={10} color={C.muted} />
                      </Pressable>
                      {expandedMeta === item.id && (
                        <View className="border-b border-border bg-card px-2 py-2 gap-1.5">
                          <TextInput
                            placeholder="歌曲名称（如：月亮代表我的心）"
                            placeholderTextColor={C.muted}
                            value={titleMap.get(item.id) ?? ""}
                            onChangeText={(v) => setTitleMap((prev) => { const n = new Map(prev); n.set(item.id, v); return n; })}
                            style={{
                              fontFamily: "monospace", fontSize: 11,
                              color: C.foreground, borderWidth: 1,
                              borderColor: C.border, backgroundColor: C.background,
                              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2,
                            }}
                          />
                          <TextInput
                            placeholder="艺人名称（如：邓丽君）"
                            placeholderTextColor={C.muted}
                            value={artistMap.get(item.id) ?? ""}
                            onChangeText={(v) => setArtistMap((prev) => { const n = new Map(prev); n.set(item.id, v); return n; })}
                            style={{
                              fontFamily: "monospace", fontSize: 11,
                              color: C.foreground, borderWidth: 1,
                              borderColor: C.border, backgroundColor: C.background,
                              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2,
                            }}
                          />
                        </View>
                      )}
                      {/* 格式选择行 */}
                      <Pressable
                        onPress={() => setExpandedFormat(expandedFormat === item.id ? null : item.id)}
                        className="flex-row items-center justify-center gap-1 border-b border-border py-1.5 active:opacity-70"
                      >
                        <Text className="font-mono text-[10px] text-muted-foreground">
                          输出：{(formatMap.get(item.id) ?? "webm").toUpperCase()}
                        </Text>
                        <ChevronDown size={10} color={C.muted} />
                      </Pressable>
                      {/* 格式下拉 */}
                      {expandedFormat === item.id && (
                        <View className="flex-row flex-wrap border-b border-border bg-card px-2 py-1 gap-1">
                          {RERECORD_FORMATS.map((f) => (
                            <Pressable
                              key={f.value}
                              onPress={() => setFileFormat(item.id, f.value)}
                              className={cn(
                                "px-2 py-0.5 border active:opacity-70",
                                (formatMap.get(item.id) ?? "webm") === f.value
                                  ? "border-primary bg-primary/10"
                                  : "border-border",
                              )}
                            >
                              <Text className={cn(
                                "font-mono text-[10px] font-bold",
                                (formatMap.get(item.id) ?? "webm") === f.value ? "text-primary" : "text-muted-foreground",
                              )}>{f.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                      {/* 重制按钮 */}
                      <Pressable
                        onPress={() => reRecord(
                          item,
                          formatMap.get(item.id) ?? "webm",
                          titleMap.get(item.id) || undefined,
                          artistMap.get(item.id) || undefined,
                        )}
                        className="flex-row items-center justify-center gap-1.5 py-2 active:opacity-70"
                      >
                        <Mic size={13} color={C.orange} strokeWidth={1.5} />
                        <Text className="font-mono text-[10px] font-bold uppercase text-primary">重制</Text>
                      </Pressable>
                    </View>
                  )}
                  <Pressable
                    onPress={() => handleAIAnalysis(item)}
                    className="flex-1 flex-row items-center justify-center gap-1.5 border-r border-border py-2.5 active:opacity-70"
                  >
                    <Sparkles size={12} color={C.primary} />
                    <Text className="font-mono text-[10px] font-bold uppercase text-primary">AI评级</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => shareFile(item)}
                    className="flex-1 flex-row items-center justify-center gap-1.5 border-r border-border py-2.5 active:opacity-70"
                  >
                    <Share2 size={14} color={C.orange} strokeWidth={1.5} />
                    <Text className="font-mono text-[10px] font-bold uppercase text-primary">导出</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeFile(item.id)}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 active:opacity-70"
                  >
                    <Trash2 size={14} color={C.muted} strokeWidth={1.5} />
                    <Text className="font-mono text-[10px] font-bold uppercase text-muted-foreground">删除</Text>
                  </Pressable>
                </View>
              </Panel>
            );
          }}
        />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 24,
            gap: 8,
            flexGrow: 1,
          }}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={<History size={40} color={C.muted} strokeWidth={1} />}
              title="暂无历史记录"
              desc="完成转换后记录将显示在此处"
            />
          }
          ListHeaderComponent={
            records.length > 0 ? (
              <Pressable
                onPress={clearHistory}
                className="mb-1 flex-row items-center justify-end gap-1 active:opacity-70"
              >
                <Trash2 size={12} color={C.muted} strokeWidth={1.5} />
                <Text className="font-mono text-[10px] uppercase text-muted-foreground">清空</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <Panel>
              <View className="p-3">
                <View className="flex-row items-center gap-2">
                  <CheckCircle2 size={14} color={C.cyan} strokeWidth={1.5} />
                  <Text className="flex-1 font-mono text-sm font-semibold text-foreground" numberOfLines={1}>
                    {item.outputName}
                  </Text>
                  <Badge text={item.targetFormat as string} tone="orange" />
                </View>
                <View className="mt-2 gap-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-mono text-[10px] text-muted-foreground">源文件</Text>
                    <Text className="font-mono text-[10px] text-foreground" numberOfLines={1}>
                      {item.sourceName}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="font-mono text-[10px] text-muted-foreground">输出大小</Text>
                    <Text className="font-mono text-[10px] text-cyan">{formatFileSize(item.outputSize)}</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="font-mono text-[10px] text-muted-foreground">时长</Text>
                    <Text className="font-mono text-[10px] text-foreground">{formatDuration(item.duration)}</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="font-mono text-[10px] text-muted-foreground">时间</Text>
                    <View className="flex-row items-center gap-1">
                      <Clock size={10} color={C.muted} strokeWidth={1.5} />
                      <Text className="font-mono text-[10px] text-muted-foreground">{formatTime(item.createdAt)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </Panel>
          )}
        />
      )}

      {tab === "files" && files.length > 0 ? (
        <View style={{ paddingBottom: insets.bottom + 12 }} className="px-3 pt-1">
          <BlueprintButton label="导入更多文件" variant="outline" onPress={importFiles} />
        </View>
      ) : null}

      {/* 隐藏路由引用以避免未使用告警 */}
      <View className="hidden">
        <Text onPress={() => router.push("/analysis" as RelativePathString)}>nav</Text>
      </View>

      {/* AI 分析对话框 */}
      {aiAnalysisFile && (
        <View className="absolute inset-0 bg-black/80 items-center justify-center p-4" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View className="w-full max-w-md border border-border bg-card">
            {/* 标题栏 */}
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} color={C.primary} />
                <Text className="font-mono text-sm font-bold text-primary">AI 音质评级</Text>
              </View>
              <Pressable onPress={closeAIDialog} className="active:opacity-70">
                <X size={16} color={C.muted} />
              </Pressable>
            </View>

            {/* 内容区 */}
            <ScrollView className="max-h-96 px-4 py-3" showsVerticalScrollIndicator={false}>
              <Text className="font-mono text-xs text-muted-foreground mb-2">文件：{aiAnalysisFile.name}</Text>

              {aiStatus === "analyzing" && (
                <View className="items-center py-8">
                  <ActivityIndicator size="large" color={C.primary} />
                  <Text className="font-mono text-xs text-muted-foreground mt-3">AI 正在分析音频特征...</Text>
                </View>
              )}

              {aiStatus === "error" && (
                <View className="border border-destructive bg-destructive/10 p-3">
                  <Text className="font-mono text-xs text-destructive">{aiError}</Text>
                </View>
              )}

              {aiStatus === "done" && aiResult && (
                <View className="gap-3">
                  {/* 评分 */}
                  <View className="border border-primary bg-primary/10 p-3">
                    <Text className="font-mono text-xs text-muted-foreground mb-1">音质评分</Text>
                    <View className="flex-row items-baseline gap-2">
                      <Text className="font-mono text-3xl font-bold text-primary">{aiResult.qualityScore}</Text>
                      <Text className="font-mono text-sm text-muted-foreground">/ 100</Text>
                      <Badge text={aiResult.qualityLevel} tone="orange" />
                    </View>
                  </View>

                  {/* 分析 */}
                  <View className="border border-border p-3 gap-2">
                    <Text className="font-mono text-xs font-bold text-foreground">专业分析</Text>
                    <View className="gap-1">
                      <Text className="font-mono text-[10px] text-cyan">格式：</Text>
                      <Text className="font-mono text-[10px] text-muted-foreground">{aiResult.analysis.format}</Text>
                    </View>
                    <View className="gap-1">
                      <Text className="font-mono text-[10px] text-cyan">采样率：</Text>
                      <Text className="font-mono text-[10px] text-muted-foreground">{aiResult.analysis.sampleRate}</Text>
                    </View>
                    <View className="gap-1">
                      <Text className="font-mono text-[10px] text-cyan">位深：</Text>
                      <Text className="font-mono text-[10px] text-muted-foreground">{aiResult.analysis.bitDepth}</Text>
                    </View>
                    <View className="gap-1">
                      <Text className="font-mono text-[10px] text-cyan">综合评价：</Text>
                      <Text className="font-mono text-[10px] text-muted-foreground">{aiResult.analysis.overall}</Text>
                    </View>
                  </View>

                  {/* 建议 */}
                  <View className="border border-border p-3 gap-2">
                    <Text className="font-mono text-xs font-bold text-foreground">优化建议</Text>
                    {aiResult.suggestions.map((s, i) => (
                      <View key={i} className="flex-row gap-2">
                        <Text className="font-mono text-[10px] text-primary">{i + 1}.</Text>
                        <Text className="font-mono text-[10px] text-muted-foreground flex-1">{s}</Text>
                      </View>
                    ))}
                  </View>

                  {/* 推荐参数 */}
                  <View className="border border-orange-500 bg-orange-500/10 p-3 gap-2">
                    <Text className="font-mono text-xs font-bold text-orange-400">AI 推荐参数</Text>
                    <View className="flex-row flex-wrap gap-2">
                      <Badge text={`采样率: ${aiResult.recommendedParams.sampleRate}`} tone="cyan" />
                      <Badge text={`位深: ${aiResult.recommendedParams.bitDepth}`} tone="cyan" />
                      <Badge text={`HPF: ${aiResult.recommendedParams.hpfFreq}Hz`} tone="cyan" />
                      <Badge text={`压缩: ${aiResult.recommendedParams.comp1Ratio}:1`} tone="cyan" />
                      <Badge text={`增益: ×${aiResult.recommendedParams.gain}`} tone="cyan" />
                      <Badge text={`限幅: ${aiResult.recommendedParams.limitLevel}dB`} tone="cyan" />
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* 底部按钮 */}
            <View className="border-t border-border p-3">
              <BlueprintButton
                label="关闭"
                onPress={closeAIDialog}
                variant="outline"
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}