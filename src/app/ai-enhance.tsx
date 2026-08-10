/**
 * AI 音质提升页面 — 本地 ONNX 推理（离线可用）
 *
 * 简单模式：GTCRN 16kHz 降噪（535 KB，腾讯开源）→ FFmpeg DSP 兜底
 * 困难模式：GTCRN 降噪 + HiFi-GAN+ BWE 带宽扩展至 48kHz → FFmpeg DSP 兜底
 *
 * 模型已内置于 App（assets/models/）；首次启动后解包至 documentDirectory。
 * 无需网络、无需 Token，完全离线运行。
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import {
  FileAudio, Wand2, Download, CheckCircle2, AlertTriangle,
  Volume2, Sparkles, Gauge, RefreshCw, Cpu, Zap,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { formatFileSize } from "@/lib/utils";
import { Panel, ScreenHeader, ProgressBar, BlueprintButton } from "@/components/ui";
import { runConvert } from "@/lib/audioEngine";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { useRouter, type RelativePathString } from "expo-router";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PickedFile { uri: string; name: string; size: number; }
type EnhanceMode = "simple" | "advanced";

const ENHANCE_OPTIONS = [
  { key: "denoise",   title: "智能降噪",    desc: "GTCRN 深度降噪，去除底噪与嘶声", icon: Volume2   },
  { key: "enhance",   title: "带宽扩展",    desc: "HiFi-GAN+ 超分修复高频细节（困难模式）", icon: Sparkles },
  { key: "normalize", title: "响度标准化",  desc: "FFmpeg EBU R128 响度对齐",       icon: Gauge     },
] as const;

export default function AIEnhanceScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addFiles = useFileStore((s) => s.addFiles);

  const [file, setFile] = useState<PickedFile | null>(null);
  const [mode, setMode] = useState<EnhanceMode>("simple");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ uri: string; name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);

  const targetProgressRef = useRef(0);

  // 平滑进度动画
  useEffect(() => {
    if (!processing) { targetProgressRef.current = 0; return; }
    const id = setInterval(() => {
      setProgress((prev) => {
        const target = targetProgressRef.current;
        if (prev >= target) return prev;
        return Math.min(prev + Math.max(0.4, (target - prev) * 0.09), target);
      });
    }, 120);
    return () => clearInterval(id);
  }, [processing]);

  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      if (!res.canceled && res.assets[0]) {
        const f = res.assets[0];
        setFile({ uri: f.uri, name: f.name, size: f.size ?? 0 });
        setResult(null); setError(null);
      }
    } catch { setError("选择文件失败，请重试"); }
  }, []);

  const startProcess = useCallback(async () => {
    if (!file) return;
    setError(null); setResult(null); setProcessing(true);
    setProgress(0); targetProgressRef.current = 0;
    try {
      const outUri = await runConvert(
        file.uri,
        file.name,
        "WAV",
        {
          sampleRate: "48kHz",
          bitDepth: "24bit",
          bitrate: "320kbps",
          masterEnhance: true,
          enhanceLevel: mode,
        },
        (p: number, label: string) => {
          setPhase(label);
          if (p >= 0) targetProgressRef.current = Math.round(p * 100);
        },
        file.size,
        (engine: string) => {
          if (engine === "deepfilternet") setPhase("GTCRN 降噪中…");
          else if (engine === "audiosr") setPhase("HiFi-GAN+ 带宽扩展中…");
        },
      );
      const outName = file.name.replace(/\.[^.]+$/, "") + `_enhanced_${mode}.wav`;
      const info = await (await import("expo-file-system/legacy")).getInfoAsync(outUri);
      const size = info.exists && info.size ? info.size : 0;
      setResult({ uri: outUri, name: outName, size });
      targetProgressRef.current = 100;
      const audioFile: AudioFile = {
        id: `enh_${Date.now()}`, name: outName, ext: "wav", format: "WAV",
        size, duration: 0, uri: outUri, createdAt: Date.now(),
        converted: true, targetFormat: "WAV", masterEnhance: true,
      };
      await addFiles([audioFile]);
      setSuccessOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败，请重试");
      setPhase("");
    } finally { setProcessing(false); }
  }, [file, mode, addFiles]);

  const shareResult = useCallback(async () => {
    if (!result) return;
    if (await Sharing.isAvailableAsync())
      await Sharing.shareAsync(result.uri, { mimeType: "audio/wav", dialogTitle: result.name });
  }, [result]);

  const goPlayer = useCallback(() => {
    setSuccessOpen(false);
    router.push("/(tabs)/player" as RelativePathString);
  }, [router]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="AI 音质提升" subtitle="LOCAL ONNX ENGINE" />
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 本地引擎说明 */}
          <View className="flex-row items-center gap-2 border border-border bg-card p-3">
            <Cpu size={16} color={C.cyan} strokeWidth={1.5} />
            <Text className="flex-1 font-mono text-[10px] leading-4 text-muted-foreground">
              全本地 ONNX 推理，离线可用。内置 GTCRN（535 KB）+ HiFi-GAN+ BWE（4.2 MB），无需网络。
            </Text>
          </View>

          {/* 文件选择 */}
          <Panel title="源音频">
            <Pressable onPress={pickFile} className="flex-row items-center gap-3 p-4 active:opacity-70">
              <View className="h-11 w-11 items-center justify-center border border-border">
                <FileAudio size={20} color={C.cyan} strokeWidth={1.5} />
              </View>
              <View className="flex-1" style={{ minWidth: 0 }}>
                <Text className="font-mono text-sm font-bold text-foreground" numberOfLines={1}>
                  {file ? file.name : "点击选择音频文件"}
                </Text>
                <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {file ? formatFileSize(file.size) : "支持录音或已导入的音频"}
                </Text>
              </View>
              <RefreshCw size={16} color={C.muted} strokeWidth={1.5} />
            </Pressable>
          </Panel>

          {/* 模式选择 */}
          <Panel title="AI 模式">
            <View className="flex-row">
              {([
                { id: "simple",   label: "简单模式", sub: "GTCRN 降噪",              icon: Volume2 },
                { id: "advanced", label: "困难模式", sub: "降噪 + BWE 超分 48kHz",   icon: Zap     },
              ] as const).map(({ id, label, sub, icon: Icon }, i) => {
                const active = mode === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setMode(id)}
                    className={`flex-1 items-center gap-1 p-3 active:opacity-70 ${i === 0 ? "border-r border-border" : ""}`}
                    style={{ borderColor: active ? C.orange : C.border, backgroundColor: active ? `${C.orange}15` : "transparent" }}
                  >
                    <Icon size={18} color={active ? C.orange : C.muted} strokeWidth={1.5} />
                    <Text className="font-mono text-xs font-bold" style={{ color: active ? C.orange : C.text }}>{label}</Text>
                    <Text className="font-mono text-[9px] text-center" style={{ color: C.muted }}>{sub}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Panel>

          {/* 选项说明 */}
          <Panel title="处理内容">
            {ENHANCE_OPTIONS.map((item, i) => {
              const Icon = item.icon;
              const available = item.key !== "enhance" || mode === "advanced";
              return (
                <View
                  key={item.key}
                  className={`flex-row items-center gap-3 p-3 ${i < ENHANCE_OPTIONS.length - 1 ? "border-b border-border" : ""}`}
                  style={{ opacity: available ? 1 : 0.4 }}
                >
                  <Icon size={16} color={available ? C.cyan : C.muted} strokeWidth={1.5} />
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text className="font-mono text-xs font-bold text-foreground">{item.title}</Text>
                    <Text className="font-mono text-[9px] text-muted-foreground">{item.desc}</Text>
                  </View>
                  {!available && (
                    <Text className="font-mono text-[9px]" style={{ color: C.muted }}>困难模式</Text>
                  )}
                </View>
              );
            })}
          </Panel>

          {/* 进度 */}
          {processing ? (
            <Panel title="处理进度">
              <View className="p-4 gap-3">
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={C.orange} />
                  <Text className="flex-1 font-mono text-xs text-foreground">{phase || "处理中…"}</Text>
                  <Text className="font-mono text-xs font-bold" style={{ color: C.cyan }}>
                    {Math.round(progress)}%
                  </Text>
                </View>
                <ProgressBar progress={progress / 100} />
                <Text className="font-mono text-[10px] text-muted-foreground">
                  本地推理中，无需网络，约需 1~3 分钟（取决于设备算力）
                </Text>
              </View>
            </Panel>
          ) : null}

          {/* 错误 */}
          {error ? (
            <View className="flex-row items-start gap-2 border border-destructive bg-card p-3">
              <AlertTriangle size={16} color={C.orange} strokeWidth={1.5} />
              <Text className="flex-1 font-mono text-xs text-foreground">{error}</Text>
            </View>
          ) : null}

          {/* 结果 */}
          {result ? (
            <Panel title="处理完成">
              <View className="p-4 gap-3">
                <View className="flex-row items-center gap-2">
                  <CheckCircle2 size={18} color={C.cyan} strokeWidth={1.5} />
                  <Text className="flex-1 font-mono text-sm font-bold text-foreground" numberOfLines={1}>{result.name}</Text>
                  <Text className="font-mono text-[10px] text-muted-foreground">{formatFileSize(result.size)}</Text>
                </View>
                <View className="flex-row gap-2">
                  <BlueprintButton
                    label="立即试听" onPress={goPlayer} variant="primary"
                    icon={<FileAudio size={16} color="#FFFFFF" strokeWidth={2} />}
                    className="flex-1"
                  />
                  <BlueprintButton
                    label="分享/导出" onPress={shareResult} variant="ghost"
                    icon={<Download size={16} color={C.cyan} strokeWidth={1.5} />}
                    className="flex-1"
                  />
                </View>
              </View>
            </Panel>
          ) : null}

          {/* 开始按钮 */}
          <BlueprintButton
            label={processing ? "处理中…" : `开始 ${mode === "advanced" ? "困难" : "简单"}模式 AI 提升`}
            onPress={startProcess}
            disabled={!file || processing}
            variant="primary"
            icon={<Wand2 size={18} color="#FFFFFF" strokeWidth={2} />}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 成功弹框 */}
      <AlertDialog open={successOpen} onOpenChange={setSuccessOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>处理完成</AlertDialogTitle>
            <AlertDialogDescription>
              {result ? `${result.name}（${formatFileSize(result.size)}）已保存，可在播放器查看。` : "音频已增强并保存。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel><Text className="font-mono text-sm text-foreground">关闭</Text></AlertDialogCancel>
            <AlertDialogAction onPress={goPlayer}>
              <Text className="font-mono text-sm font-bold text-primary-foreground">立即试听</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
