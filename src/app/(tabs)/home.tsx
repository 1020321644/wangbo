import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter, type RelativePathString } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  FileAudio,
  Settings2,
  Play,
  CheckCircle2,
  AlertTriangle,
  AudioWaveform,
  Sparkles,
  Tag,
  ChevronDown,
  ChevronUp,
  Download,
  Zap,
  Brain,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn, formatDuration, formatFileSize } from "@/lib/utils";
import {
  FORMAT_LIST,
  type AudioFormat,
  detectFormat,
  getFormat,
} from "@/lib/formats";
import { decryptMusicFile, detectEncryptedFormat } from "@/lib/musicDecrypt";
import {
  type ConvertMode,
  estimateOutputSize,
  losslessWarning,
  modeLabel,
  runConvert,
} from "@/lib/audioEngine";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { useHistoryStore } from "@/store/historyStore";
import { useParamStore } from "@/store/paramStore";
import {
  Panel,
  BlueprintButton,
  Chip,
  DataRow,
  ProgressBar,
  Badge,
  ScreenHeader,
} from "@/components/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// 歌曲元数据字段
interface SongMeta {
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  comment: string;
}

function MetaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const C = useColors();
  return (
    <View className="border-b border-border">
      <View className="flex-row items-center">
        <Text
          className="w-16 border-r border-border px-2 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {label}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? `填写${label}`}
          placeholderTextColor={C.muted}
          className="flex-1 px-3 py-2.5 font-mono text-xs text-foreground"
          style={{ color: C.foreground }}
        />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const addFiles = useFileStore((s) => s.addFiles);
  const addHistory = useHistoryStore((s) => s.addRecord);
  const params = useParamStore();

  const [source, setSource] = useState<AudioFile | null>(null);
  const [target, setTarget] = useState<AudioFormat>("FLAC");
  const [mode, setMode] = useState<ConvertMode>("enhance");
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outFileRef = useRef<AudioFile | null>(null);
  const engineRef = useRef<"ffmpeg-dsp" | "deepfilternet" | "audiosr" | "none">("none");
  const [showMeta, setShowMeta] = useState(true);
  const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
  // 困难模式（AudioSR 超分辨率）启用确认弹窗
  const [showAdvancedDialog, setShowAdvancedDialog] = useState(false);
  const [meta, setMeta] = useState<SongMeta>({
    title: "", artist: "", album: "", year: "", genre: "", comment: "",
  });

  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      let name = a.name;
      let uri = a.uri;
      let fmt = detectFormat(name);

      // ── 加密格式自动解密（.qmc/.ncm 等）──
      // 导入时检测，先解密还原为 mp3/flac 再进入主流程
      try {
        const head = await FileSystem.readAsStringAsync(a.uri, {
          length: 16,
          encoding: "base64",
        });
        const headBytes = Uint8Array.from(atob(head), (c) => c.charCodeAt(0));
        const enc = detectEncryptedFormat(headBytes);
        if (enc) {
          const result = await decryptMusicFile(a.uri);
          if (result.success) {
            const ext = result.outputFormat || "mp3";
            const outName = name.replace(/\.[^.]+$/, `.${ext}`);
            const outPath = (FileSystem.cacheDirectory ?? "") + `decrypted_${Date.now()}.${ext}`;
            // Uint8Array → base64 分块转换，避免大文件栈溢出
            let binary = "";
            const CHUNK = 0x8000;
            for (let i = 0; i < result.audioData.length; i += CHUNK) {
              binary += String.fromCharCode.apply(
                null,
                Array.from(result.audioData.subarray(i, i + CHUNK)),
              );
            }
            await FileSystem.writeAsStringAsync(outPath, btoa(binary), {
              encoding: "base64",
            });
            name = outName;
            uri = outPath;
            fmt = ext as AudioFormat;
          } else {
            setError(`解密失败：${result.error ?? "未知错误"}`);
            return;
          }
        }
      } catch {
        // 解密检测失败则按原文件处理
      }

      if (!fmt) {
        setError("不支持的音频格式");
        return;
      }
      setError(null);
      setDone(false);
      // 从文件名预填 title
      const baseName = name.replace(/\.[^.]+$/, "");
      setMeta((m) => ({ ...m, title: m.title || baseName }));
      const file: AudioFile = {
        id: `src-${Date.now()}`,
        name,
        ext: name.split(".").pop()?.toLowerCase() ?? "",
        format: fmt,
        size: a.size ?? Math.round(3.5 * 1024 * 1024),
        duration: Math.round(180 + Math.random() * 180),
        uri,
        createdAt: Date.now(),
        title: baseName,
      };
      setSource(file);
      addFiles([file]);
    } catch {
      setError("文件选择失败，请重试");
    }
  }, [addFiles]);

  const targetInfo = getFormat(target);
  const warning = losslessWarning(target);

  const startConvert = useCallback(async () => {
    if (!source) {
      setError("请先选择源文件");
      return;
    }
    setError(null);
    setConverting(true);
    setDone(false);
    setProgress(0);

    try {
      const outUri = await runConvert(
        source.uri,
        source.name,
        target,
        params,
        (p, label) => {
          setProgress(p);
          if (label) setProgressLabel(label);
        },
        source.size,
        (engine) => { engineRef.current = engine; },
      );

      const outName = source.name.replace(/\.[^.]+$/, `.${targetInfo.ext}`);
      const outTitle = meta.title || outName.replace(/\.[^.]+$/, "");

      // ✅ 读取真实输出文件大小（避免估算导致大小不一致）
      let outSize = estimateOutputSize(source.size, target, params);
      try {
        const outInfo = await FileSystem.getInfoAsync(outUri);
        if (outInfo.exists && outInfo.size && outInfo.size > 0) {
          outSize = outInfo.size;
        }
      } catch { /* 读取失败则使用估算值 */ }

      const newFile: AudioFile = {
        ...source,
        id: `${source.id}-conv-${Date.now()}`,
        name: outName,
        uri: outUri,
        format: target,
        ext: targetInfo.ext,
        size: outSize,
        converted: true,
        targetFormat: target,
        createdAt: Date.now(),
        title: outTitle,
        artist: meta.artist || undefined,
        album: meta.album || undefined,
        year: meta.year || undefined,
        genre: meta.genre || undefined,
        comment: meta.comment || undefined,
        sampleRate: params.sampleRate,
        bitDepth: targetInfo.supportsBitDepth ? params.bitDepth : undefined,
        bitrate: targetInfo.supportsBitrate ? params.bitrate : undefined,
        masterEnhance: params.masterEnhance,
        enhanceEngine: params.masterEnhance ? engineRef.current : undefined,
      };
      await addFiles([newFile]);
      outFileRef.current = newFile;

      await addHistory({
        id: `h-${Date.now()}`,
        sourceName: source.name,
        sourceFormat: source.format,
        targetFormat: target,
        mode,
        outputName: outName,
        outputSize: outSize,
        duration: source.duration,
        createdAt: Date.now(),
        type: "convert",
      });
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "转换失败，请重试";
      setError(msg);
      console.error("[HomeScreen] 转换异常:", err);
    } finally {
      setConverting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, target, mode, params, targetInfo, meta, addHistory, addFiles]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="音频转换控制台"
        subtitle="AUDIO CONVERTER · MASTERING STUDIO"
        right={
          <Pressable
            onPress={() => router.push("/(tabs)/settings" as RelativePathString)}
            className="active:opacity-60 p-1.5"
          >
            <Settings2 size={20} color={C.muted} strokeWidth={1.5} />
          </Pressable>
        }
      />

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 01 源文件 */}
          <Panel title="01 · 源文件 SOURCE">
            {source ? (
              <Pressable onPress={pickFile} className="flex-row items-center gap-3 p-3 active:opacity-70">
                <View className="h-11 w-11 items-center justify-center border border-primary">
                  <FileAudio size={22} color={C.orange} strokeWidth={1.5} />
                </View>
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <Text className="font-mono text-sm font-semibold text-foreground" numberOfLines={1}>
                    {source.name}
                  </Text>
                  <View className="mt-1 flex-row gap-2">
                    <Badge text={source.format ?? "—"} tone="cyan" />
                    <Text className="font-mono text-[10px] text-muted-foreground">
                      {formatFileSize(source.size)} · {formatDuration(source.duration)}
                    </Text>
                  </View>
                  {/* DSD 源文件提示 */}
                  {source.format && ["DSF", "DSD64", "DSD128", "DSD256", "DSD512"].includes(source.format) && (
                    <Text className="mt-1 font-mono text-[10px] text-primary">
                      DSD 源文件 · 解码为 PCM 后转换输出
                    </Text>
                  )}
                </View>
                <Text className="font-mono text-[10px] text-primary">更换</Text>
              </Pressable>
            ) : (
              <Pressable onPress={pickFile} className="items-center justify-center gap-2 py-8 active:opacity-70">
                <FileAudio size={32} color={C.muted} strokeWidth={1} />
                <Text className="font-mono text-sm font-semibold text-foreground">选择音频文件</Text>
                <Text className="font-mono text-[10px] text-muted-foreground">
                  支持 MP3 / FLAC / WAV / AAC / OGG / ALAC / DSF / DFF
                </Text>
              </Pressable>
            )}
          </Panel>

          {/* 02 歌曲信息（元数据） */}
          <Panel title="02 · 歌曲信息 METADATA">
            <Pressable
              onPress={() => setShowMeta((v) => !v)}
              className="flex-row items-center justify-between px-3 py-2.5 active:opacity-70"
            >
              <View className="flex-row items-center gap-2">
                <Tag size={14} color={C.orange} strokeWidth={1.5} />
                <Text className="font-mono text-xs font-bold text-foreground">
                  {meta.title || "填写歌曲信息（嵌入文件标签）"}
                </Text>
              </View>
              {showMeta
                ? <ChevronUp size={16} color={C.muted} />
                : <ChevronDown size={16} color={C.muted} />}
            </Pressable>
            {showMeta ? (
              <View className="border-t border-border">
                <MetaField label="标题" value={meta.title} onChange={(v) => setMeta((m) => ({ ...m, title: v }))} placeholder="歌曲名称" />
                <MetaField label="艺术家" value={meta.artist} onChange={(v) => setMeta((m) => ({ ...m, artist: v }))} placeholder="演唱者 / 艺术家" />
                <MetaField label="专辑" value={meta.album} onChange={(v) => setMeta((m) => ({ ...m, album: v }))} placeholder="专辑名称" />
                <MetaField label="年份" value={meta.year} onChange={(v) => setMeta((m) => ({ ...m, year: v }))} placeholder="发行年份" />
                <MetaField label="流派" value={meta.genre} onChange={(v) => setMeta((m) => ({ ...m, genre: v }))} placeholder="如：Pop / Rock / Classical" />
                <MetaField label="备注" value={meta.comment} onChange={(v) => setMeta((m) => ({ ...m, comment: v }))} placeholder="转换说明 / 版权信息" />
              </View>
            ) : null}
          </Panel>

          {/* 03 转换模式 */}
          <Panel title="03 · 转换模式 MODE">
            <View className="flex-row">
              <Pressable
                onPress={() => setMode("convert")}
                className={cn("flex-1 items-center gap-2 border-r border-border py-4 active:opacity-70", mode === "convert" && "bg-primary/10")}
              >
                <AudioWaveform size={20} color={mode === "convert" ? C.orange : C.muted} strokeWidth={1.5} />
                <Text className={cn("font-mono text-xs font-bold uppercase tracking-wider", mode === "convert" ? "text-primary" : "text-muted-foreground")}>
                  格式转换
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode("enhance")}
                className={cn("flex-1 items-center gap-2 py-4 active:opacity-70", mode === "enhance" && "bg-primary/10")}
              >
                <Sparkles size={20} color={mode === "enhance" ? C.orange : C.muted} strokeWidth={1.5} />
                <Text className={cn("font-mono text-xs font-bold uppercase tracking-wider", mode === "enhance" ? "text-primary" : "text-muted-foreground")}>
                  母带级提升
                </Text>
              </Pressable>
            </View>
            <View className="border-t border-border px-3 py-2">
              <Text className="font-mono text-[10px] text-muted-foreground">
                {mode === "enhance"
                  ? "专业母带处理 · 动态范围优化 · 频谱修复 · 发行级品质"
                  : "格式互转 · 保留原始音频数据 · 可搭配母带参数"}
              </Text>
            </View>
          </Panel>

          {/* 04 目标格式 */}
          <Panel title="04 · 目标格式 TARGET">
            <View className="flex-row flex-wrap gap-2 p-3">
              {FORMAT_LIST.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  active={target === f.key}
                  onPress={() => { setTarget(f.key); setDone(false); }}
                />
              ))}
            </View>
            <View className="border-t border-border px-3 py-2 gap-1">
              <Text className="font-mono text-[10px] text-muted-foreground">{targetInfo.desc}</Text>
              {/* DSD 作为输出时，说明实际输出为 PCM 高清上采样 WAV */}
              {targetInfo.dsd && (
                <Text className="font-mono text-[10px] text-primary">
                  DSD 输出：PCM 高清上采样封装至 WAV（{targetInfo.key === "DSD512" || targetInfo.key === "DSD256" ? "352.8kHz" : targetInfo.key === "DSD128" ? "176.4kHz" : "88.2kHz"} / 32bit），适配专业 DSD DAC 设备
                </Text>
              )}
            </View>
          </Panel>

          {/* 05 母带参数 */}
          <Panel title="05 · 母带参数 MASTERING SPEC">
            {/* AI 处理模式选择：并排 Tab 按钮 */}
            <View className="flex-row border-b border-border">
              {(() => {
                // 简单模式激活：开启 + enhanceLevel=simple
                const isSimpleActive =
                  params.masterEnhance && params.enhanceLevel === "simple";
                // 困难模式激活：开启 + enhanceLevel=advanced
                const isAdvancedActive =
                  params.masterEnhance && params.enhanceLevel === "advanced";
                return (
                  <>
                    {/* 简单模式 — DeepFilterNet 降噪（约 8.6MB） */}
                    <Pressable
                      onPress={() => {
                        if (isSimpleActive) {
                          // 已是简单模式且开启 → 关闭
                          params.setMasterEnhance(false);
                        } else if (isAdvancedActive) {
                          // 当前困难模式 → 切换为简单模式（保持开启）
                          params.setEnhanceLevel("simple");
                        } else {
                          // 未开启 → 弹确认框
                          setShowEnhanceDialog(true);
                        }
                      }}
                      className={cn(
                        "flex-1 items-center gap-1.5 border-r border-border py-3.5 active:opacity-70",
                        isSimpleActive ? "bg-primary/10" : "bg-transparent"
                      )}
                    >
                      <Zap
                        size={18}
                        color={isSimpleActive ? C.orange : C.muted}
                        strokeWidth={1.5}
                      />
                      <Text
                        className={cn(
                          "font-mono text-[11px] font-bold uppercase tracking-wider",
                          isSimpleActive ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        简单模式
                      </Text>
                      <View className={cn(
                        "rounded-sm px-1.5 py-0.5",
                        isSimpleActive ? "bg-primary/20" : "bg-border"
                      )}>
                        <Text className={cn(
                          "font-mono text-[9px] font-bold",
                          isSimpleActive ? "text-primary" : "text-muted-foreground"
                        )}>
                          {isSimpleActive ? "FFmpeg DSP" : "内置增强"}
                        </Text>
                      </View>
                    </Pressable>

                    {/* 困难模式 — AudioSR 超分辨率（约 100MB） */}
                    <Pressable
                      onPress={() => {
                        if (isAdvancedActive) {
                          // 已是困难模式且开启 → 关闭
                          params.setMasterEnhance(false);
                        } else if (isSimpleActive) {
                          // 当前简单模式 → 切换为困难模式（保持开启）
                          params.setEnhanceLevel("advanced");
                        } else {
                          // 未开启 → 弹确认框
                          setShowAdvancedDialog(true);
                        }
                      }}
                      className={cn(
                        "flex-1 items-center gap-1.5 py-3.5 active:opacity-70",
                        isAdvancedActive ? "bg-primary/10" : "bg-transparent"
                      )}
                    >
                      <Brain
                        size={18}
                        color={isAdvancedActive ? C.orange : C.muted}
                        strokeWidth={1.5}
                      />
                      <Text
                        className={cn(
                          "font-mono text-[11px] font-bold uppercase tracking-wider",
                          isAdvancedActive ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        困难模式
                      </Text>
                      <View className={cn(
                        "rounded-sm px-1.5 py-0.5",
                        isAdvancedActive ? "bg-primary/20" : "bg-border"
                      )}>
                        <Text className={cn(
                          "font-mono text-[9px] font-bold",
                          isAdvancedActive ? "text-primary" : "text-muted-foreground"
                        )}>
                          {isAdvancedActive ? "DSP Pro" : "强力增强"}
                        </Text>
                      </View>
                    </Pressable>
                  </>
                );
              })()}
            </View>

            {/* 简单模式 确认弹窗 — FFmpeg DSP 降噪 */}
            <AlertDialog open={showEnhanceDialog} onOpenChange={setShowEnhanceDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>启用简单模式（FFmpeg DSP）</AlertDialogTitle>
                  <AlertDialogDescription>
                    将使用 FFmpeg 内置 DSP 滤镜链进行母带级音频增强：{"\n"}
                    • 高通滤波（去除 20Hz 以下低频噪声）{"\n"}
                    • 多段参量 EQ（低频/中频/高频精细调整）{"\n"}
                    • 动态压缩（提升响度一致性）{"\n"}
                    • 精密限幅（峰值 -0.3 dBFS）{"\n"}
                    • EBU R128 响度标准化（-14 LUFS Streaming）{"\n\n"}
                    处理时间约增加 2-3 倍，无需任何 AI 模型，100% 本地运算。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onPress={() => {
                      params.setEnhanceLevel("simple");
                      params.setMasterEnhance(true);
                    }}
                  >
                    启用
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* 困难模式 确认弹窗 — FFmpeg DSP Pro */}
            <AlertDialog open={showAdvancedDialog} onOpenChange={setShowAdvancedDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>启用困难模式（FFmpeg DSP Pro）</AlertDialogTitle>
                  <AlertDialogDescription>
                    使用更激进的 DSP 参数进行宽带提升与深度母带处理：{"\n"}
                    • 宽带 EQ（50Hz-16kHz 全频段精细曲线）{"\n"}
                    • 强力动态压缩（4:1 比例，提升整体密度）{"\n"}
                    • 精密限幅（峰值 -0.3 dBFS，attack 3ms）{"\n"}
                    • 严格响度标准化（-14 LUFS，LRA=8）{"\n\n"}
                    适合老旧/低质音源修复与发行级母带处理。{"\n"}
                    处理时间约为简单模式的 1.5 倍，同样无需 AI 模型。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onPress={() => {
                      params.setEnhanceLevel("advanced");
                      params.setMasterEnhance(true);
                    }}
                  >
                    启用困难模式
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <DataRow label="采样率 SR" value={params.sampleRate} valueColor={C.cyan} />
            <DataRow label="位深 BD" value={targetInfo.supportsBitDepth ? params.bitDepth : "—"} valueColor={C.cyan} />
            <DataRow label="码率 BR" value={targetInfo.supportsBitrate ? params.bitrate : "—"} valueColor={C.cyan} />
            <DataRow label="高质量模式" value={params.highQuality ? "ON · 仅封装不重编码" : "OFF"} valueColor={params.highQuality ? C.cyan : C.muted} />
            <DataRow label="母带级提升" value={params.masterEnhance ? `ON · ${params.enhanceLevel === "advanced" ? "困难模式 DSP Pro" : "简单模式 FFmpeg DSP"}` : "OFF"} valueColor={params.masterEnhance ? C.orange : C.muted} />
            <DataRow label="动态范围目标" value="DR14+" valueColor={C.cyan} />
            <DataRow label="响度标准" value="-14 LUFS (Streaming)" valueColor={C.cyan} />
            <DataRow label="限幅峰值" value="-0.3 dBFS" valueColor={C.cyan} />
            <Pressable
              onPress={() => router.push("/params" as RelativePathString)}
              className="flex-row items-center justify-center gap-2 border-t border-border bg-secondary py-3 active:opacity-70"
            >
              <Settings2 size={16} color={C.orange} strokeWidth={1.5} />
              <Text className="font-mono text-xs font-bold uppercase tracking-wider text-primary">调整参数</Text>
            </Pressable>
          </Panel>

          {warning ? (
            <View className="flex-row items-start gap-2 border border-border bg-card p-3">
              <AlertTriangle size={16} color={C.orange} strokeWidth={1.5} />
              <Text className="flex-1 font-mono text-[10px] leading-4 text-muted-foreground">{warning}</Text>
            </View>
          ) : null}

          {error ? (
            <View className="border border-destructive bg-card p-3">
              <Text className="font-mono text-xs text-destructive">{error}</Text>
            </View>
          ) : null}

          {/* 06 执行 */}
          <Panel title="06 · 执行 EXECUTE">
            {converting ? (
              <View className="gap-3 p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="font-mono text-xs font-bold uppercase tracking-wider text-cyan">
                    {progressLabel || "处理中…"}
                  </Text>
                  <Text className="font-mono text-sm font-bold text-cyan">{Math.round(progress * 100)}%</Text>
                </View>
                <ProgressBar progress={progress} />
                <Text className="font-mono text-[10px] text-muted-foreground">
                  {modeLabel(mode)} · 目标 {target} · {params.sampleRate} / {targetInfo.supportsBitDepth ? params.bitDepth : params.bitrate}
                </Text>
              </View>
            ) : done ? (
              <View className="items-center gap-3 p-5">
                <CheckCircle2 size={32} color={C.cyan} strokeWidth={1.5} />
                <Text className="font-mono text-sm font-bold text-foreground">转换完成</Text>
                <Text className="font-mono text-[10px] text-muted-foreground">
                  {target} · {params.sampleRate}{targetInfo.supportsBitDepth ? ` · ${params.bitDepth}` : ""}{params.masterEnhance ? ` · 母带增强 · ${params.enhanceLevel === "advanced" ? "DSP Pro" : "FFmpeg DSP"}` : ""}
                </Text>
                <View className="w-full flex-row gap-2">
                  <BlueprintButton
                    label="查看文件"
                    icon={<Play size={16} color="#FFFFFF" strokeWidth={2} />}
                    className="flex-1"
                    onPress={() => router.push("/(tabs)/files" as RelativePathString)}
                  />
                  <BlueprintButton
                    label="预览分析"
                    variant="outline"
                    className="flex-1"
                    onPress={() => router.push("/analysis" as RelativePathString)}
                  />
                </View>
                <BlueprintButton
                  label="导出文件"
                  variant="outline"
                  icon={<Download size={16} color={C.orange} strokeWidth={1.5} />}
                  className="w-full"
                  onPress={async () => {
                    const f = outFileRef.current;
                    if (!f) return;
                    try {
                      if (process.env.EXPO_OS === "web") {
                        window.open(f.uri, "_blank");
                        return;
                      }
                      const info = await FileSystem.getInfoAsync(f.uri);
                      if (!info.exists) {
                        setError("输出文件不存在，请重新转换");
                        return;
                      }
                      const available = await Sharing.isAvailableAsync();
                      if (!available) { setError("当前设备不支持导出"); return; }
                      await Sharing.shareAsync(f.uri, { mimeType: "audio/*", dialogTitle: `导出 ${f.name}` });
                    } catch { setError("导出失败，请重试"); }
                  }}
                />
                <BlueprintButton
                  label="再次转换"
                  variant="outline"
                  className="w-full"
                  onPress={() => { setDone(false); setProgress(0); setProgressLabel(""); }}
                />
              </View>
            ) : (
              <View className="p-4">
                <BlueprintButton
                  label="开始母带级转换"
                  icon={<Sparkles size={18} color="#FFFFFF" strokeWidth={2} />}
                  onPress={startConvert}
                />
              </View>
            )}
          </Panel>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

