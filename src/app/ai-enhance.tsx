/**
 * AI 音质提升页面（纯云端，无密钥）
 *
 * - 降噪 / 超分修复 / 响度标准化 三项可选
 * - 全部经云端开源 AI 模型处理（无需 Token、无需网络密钥）
 * - 完成后静默存本地，弹成功框带「立即试听」并列入文件管理
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import {
  FileAudio,
  Wand2,
  Download,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  Sparkles,
  Gauge,
  RefreshCw,
  Cloud,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { formatFileSize } from "@/lib/utils";
import { Panel, ScreenHeader, ProgressBar, BlueprintButton } from "@/components/ui";
import { type EnhanceOptions, enhanceCloud } from "@/lib/aiEnhanceClient";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { useRouter, type RelativePathString } from "expo-router";
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

interface PickedFile {
  uri: string;
  name: string;
  size: number;
}

const ENHANCE_ITEMS: {
  key: keyof EnhanceOptions;
  title: string;
  desc: string;
  icon: typeof Volume2;
}[] = [
  { key: "denoise", title: "智能降噪", desc: "去除底噪与嘶声，还原清晰人声", icon: Volume2 },
  { key: "enhance", title: "超分修复", desc: "语音增强 + 去混响，修复高频细节", icon: Sparkles },
  { key: "normalize", title: "响度标准化", desc: "统一音量电平，平衡整体响度", icon: Gauge },
];

export default function AIEnhanceScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addFiles = useFileStore((s) => s.addFiles);

  const [file, setFile] = useState<PickedFile | null>(null);
  const [options, setOptions] = useState<EnhanceOptions>({
    denoise: true,
    enhance: true,
    normalize: false,
  });
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ uri: string; name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);

  const targetProgressRef = useRef(0);

  // 平滑进度动画（处理中每 120ms 步进逼近目标值）
  useEffect(() => {
    if (!processing) {
      targetProgressRef.current = 0;
      return;
    }
    const id = setInterval(() => {
      setProgress((prev) => {
        const target = targetProgressRef.current;
        if (prev >= target) return prev;
        const step = Math.max(0.4, (target - prev) * 0.09);
        return Math.min(prev + step, target);
      });
    }, 120);
    return () => clearInterval(id);
  }, [processing]);

  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets[0]) {
        const f = res.assets[0];
        setFile({ uri: f.uri, name: f.name, size: f.size ?? 0 });
        setResult(null);
        setError(null);
      }
    } catch {
      setError("选择文件失败，请重试");
    }
  }, []);

  const addToStore = useCallback(
    async (uri: string, name: string, size: number) => {
      const audioFile: AudioFile = {
        id: `enh_${Date.now()}`,
        name,
        ext: "wav",
        format: "WAV",
        size,
        duration: 0,
        uri,
        createdAt: Date.now(),
        converted: true,
        targetFormat: "WAV",
        masterEnhance: true,
      };
      await addFiles([audioFile]);
    },
    [addFiles],
  );

  const startProcess = useCallback(async () => {
    if (!file) return;
    if (!options.denoise && !options.enhance && !options.normalize) {
      setError("请至少选择一项处理选项");
      return;
    }
    setError(null);
    setResult(null);
    setProcessing(true);
    setProgress(0);
    targetProgressRef.current = 0;

    try {
      const r = await enhanceCloud(
        file.uri,
        file.name,
        options,
        (text) => setPhase(text),
        (v) => {
          if (v >= 0) targetProgressRef.current = v;
        },
      );
      setResult({ uri: r.localUri, name: r.localUri.split("/").pop() || "ai_enhanced.wav", size: r.size });
      targetProgressRef.current = 100;
      await addToStore(r.localUri, r.localUri.split("/").pop() || "ai_enhanced.wav", r.size);
      setSuccessOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败，请重试");
      setPhase("");
    } finally {
      setProcessing(false);
    }
  }, [file, options, addToStore]);

  const shareResult = useCallback(async () => {
    if (!result) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { mimeType: "audio/wav", dialogTitle: result.name });
    }
  }, [result]);

  const goPlayer = useCallback(() => {
    setSuccessOpen(false);
    router.push("/(tabs)/player" as RelativePathString);
  }, [router]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="AI 音质提升" subtitle="CLOUD AI ENGINE" />

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 云端引擎说明 */}
          <View className="flex-row items-center gap-2 border border-border bg-card p-3">
            <Cloud size={16} color={C.cyan} strokeWidth={1.5} />
            <Text className="flex-1 font-mono text-[10px] leading-4 text-muted-foreground">
              全部经云端开源 AI 模型处理，无需任何密钥或 Token，依赖网络与云端算力。
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

          {/* 处理选项 */}
          <Panel title="处理选项">
            {ENHANCE_ITEMS.map((item, i) => {
              const Icon = item.icon;
              const active = options[item.key];
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setOptions((o) => ({ ...o, [item.key]: !o[item.key] }))}
                  className={`flex-row items-center gap-3 p-4 active:opacity-70 ${
                    i < ENHANCE_ITEMS.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <View className="h-11 w-11 items-center justify-center border border-border">
                    <Icon size={20} color={active ? C.orange : C.muted} strokeWidth={1.5} />
                  </View>
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text className="font-mono text-sm font-bold text-foreground">{item.title}</Text>
                    <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground" numberOfLines={1}>
                      {item.desc}
                    </Text>
                  </View>
                  <View
                    className="h-5 w-5 items-center justify-center border"
                    style={{ borderColor: active ? C.orange : C.border, backgroundColor: active ? C.orange : "transparent" }}
                  >
                    {active ? <CheckCircle2 size={14} color="#0A1128" strokeWidth={2.5} /> : null}
                  </View>
                </Pressable>
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
                  进度条反映实际处理阶段：上传 → 云端 AI 推理 → 下载结果
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
                  <Text className="flex-1 font-mono text-sm font-bold text-foreground" numberOfLines={1}>
                    {result.name}
                  </Text>
                  <Text className="font-mono text-[10px] text-muted-foreground">
                    {formatFileSize(result.size)}
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <BlueprintButton
                    label="立即试听"
                    onPress={goPlayer}
                    variant="primary"
                    icon={<FileAudio size={16} color="#FFFFFF" strokeWidth={2} />}
                    className="flex-1"
                  />
                  <BlueprintButton
                    label="分享 / 导出"
                    onPress={shareResult}
                    variant="ghost"
                    icon={<Download size={16} color={C.cyan} strokeWidth={1.5} />}
                    className="flex-1"
                  />
                </View>
              </View>
            </Panel>
          ) : null}

          {/* 开始按钮 */}
          <BlueprintButton
            label={processing ? "处理中…" : "开始云端 AI 音质提升"}
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
              {result ? `${result.name}（${formatFileSize(result.size)}）已保存到本地，可在文件管理与播放器中查看。` : "音频已增强并保存。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text className="font-mono text-sm text-foreground">关闭</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={goPlayer}>
              <Text className="font-mono text-sm font-bold text-primary-foreground">立即试听</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}