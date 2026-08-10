/**
 * 视频提取音频 & 母带录制 — 独立入口页
 *
 * 功能：
 *  - ① 导入视频（MP4/MOV 等）：FFmpeg -vn -acodec copy 提取原始音频（不转码）
 *  - ② 麦克风录制母带（expo-audio HIGH_QUALITY preset）
 *  - 输出格式选择：WAV（默认）/ DSD64 / DSD128 / DSD256
 *  - 详细参数调节：采样率、位深、高通滤波、压缩比、增益、限幅电平
 *  - 录制中实时波形可视化（metering 驱动）
 */

import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  StopCircle, CheckCircle2, AlertTriangle,
  Info, Radio,
  ChevronDown, ChevronUp, SlidersHorizontal, Sparkles,
  Film, FileVideo, Mic,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/fileStore";
import {
  useMasterRecord, RECORD_FORMAT_SPECS,
  type RecordOutputFormat, type RecordMasterParams,
} from "@/hooks/useMasterRecord";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { Panel, ScreenHeader, Chip } from "@/components/ui";
import { RecordWaveform } from "@/components/RecordWaveform";

const STEPS = [
  { num: "01", text: "用系统录屏功能录制视频（捕获系统声音，无需任何特权权限）" },
  { num: "02", text: "返回本页面，点「导入视频提取音频」选择录制的 MP4/MOV 文件" },
  { num: "03", text: "APP 自动用 FFmpeg -vn 提取原始音轨（不转码，零音质损失）" },
  { num: "04", text: "提取完成后，母带版音频自动存入文件库" },
  { num: "💡", text: "建议：录屏时选择「系统声音」作为音频源，获得最佳录制效果" },
];

// ─── 参数选择行 ────────────────────────────────────────────────────────────────
function ParamRow<T extends string | number>({
  label, options, value, onChange,
}: {
  label: string;
  options: { val: T; text: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="border-b border-border px-3 py-2 gap-1">
      <Text className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{label}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {options.map((o) => (
          <Pressable
            key={String(o.val)}
            onPress={() => onChange(o.val)}
            className={cn(
              "border px-2.5 py-1 active:opacity-70",
              value === o.val
                ? "border-primary bg-primary/10"
                : "border-border bg-transparent",
            )}
          >
            <Text className={cn(
              "font-mono text-[11px] font-semibold",
              value === o.val ? "text-primary" : "text-muted-foreground",
            )}>
              {o.text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── 圆形录制动画指示器 ───────────────────────────────────────────────────────
function RecordingIndicator({ elapsed }: { elapsed: number }) {
  return (
    <View className="items-center gap-3">
      <View className="h-24 w-24 items-center justify-center rounded-full border-2 border-destructive">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-destructive/20">
          <Radio size={32} color="#EF4444" strokeWidth={1.5} />
        </View>
      </View>
      <Text className="font-mono text-3xl font-black text-destructive">
        {Math.floor(elapsed / 60).toString().padStart(2, "0")}
        :{(elapsed % 60).toString().padStart(2, "0")}
      </Text>
    </View>
  );
}

export default function BgRecordScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const files  = useFileStore((s) => s.files);
  const {
    state, outputFormat, setOutputFormat,
    masterParams, setMasterParams,
    recordMode,
    metering,
    start, stop, reset,
  } = useMasterRecord();

  const [paramsOpen, setParamsOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");

  const isIdle       = state.status === "idle";
  const isRequesting = state.status === "requesting";
  const isRecording  = state.status === "recording";
  const isDone       = state.status === "done";
  const isError      = state.status === "error";

  const currentSpec = RECORD_FORMAT_SPECS[outputFormat];

  const latestMaster = isDone
    ? files.slice().reverse().find((f) => f.masterEnhance)
    : null;

  const handleStart = useCallback(async () => {
    await start({
      id: `bg-${Date.now()}`,
      name: "APP内播放",
      ext: "webm",
      format: null,
      size: 0,
      duration: 0,
      uri: "",
      createdAt: Date.now(),
    });
  }, [start]);

  const updateParam = useCallback(<K extends keyof RecordMasterParams>(key: K, val: RecordMasterParams[K]) => {
    setMasterParams((prev) => ({ ...prev, [key]: val }));
  }, [setMasterParams]);

  // ── 导入视频提取音频（FFmpeg -vn -acodec copy，不转码）─────────────────────
  const handleImportVideo = useCallback(async () => {
    setExtracting(true);
    setExtractMsg("正在选择视频文件…");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["video/*", "video/mp4", "video/quicktime", "video/x-matroska", "video/webm"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) {
        setExtracting(false);
        return;
      }
      const asset = result.assets[0];
      const srcName = asset.name || "video.mp4";
      const srcExt  = srcName.split(".").pop()?.toLowerCase() ?? "mp4";

      setExtractMsg("正在提取原始音轨（不转码）…");

      const cacheDir = FileSystem.cacheDirectory ?? "";
      let srcUri = asset.uri;
      if (asset.uri.startsWith("content://")) {
        const dest = `${cacheDir}video_${Date.now()}.${srcExt}`;
        const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
        srcUri = dest;
      }

      const { FFmpegKit, ReturnCode } = await import("ffmpeg-kit-react-native");
      const { toFFmpegPath } = await import("@/lib/audioEngine");
      const rawSrc = toFFmpegPath(srcUri);
      const outUri = `${cacheDir}extract_${Date.now()}.aac`;
      const rawOut = toFFmpegPath(outUri);

      const copyCmd = `-y -i "${rawSrc}" -vn -acodec copy "${rawOut}"`;
      console.log("[video-extract] CMD:", copyCmd);
      const session = await FFmpegKit.execute(copyCmd);
      const rc = await session.getReturnCode();
      const rcVal: number = typeof rc?.getValue === "function" ? rc.getValue() : Number(rc);
      console.log("[video-extract] copy RC=", rcVal);

      if (!ReturnCode.isSuccess(rc)) {
        setExtractMsg("原始音轨无法直接复制，正在转码提取…");
        const transCmd = `-y -i "${rawSrc}" -vn -ac:a aac -b:a 320k "${rawOut}"`;
        console.log("[video-extract] transcode CMD:", transCmd);
        const session2 = await FFmpegKit.execute(transCmd);
        const rc2 = await session2.getReturnCode();
        const rc2Val: number = typeof rc2?.getValue === "function" ? rc2.getValue() : Number(rc2);
        console.log("[video-extract] transcode RC=", rc2Val);
        if (!ReturnCode.isSuccess(rc2)) {
          setExtracting(false);
          setExtractMsg("提取失败：视频文件可能不包含可解码的音频轨道");
          return;
        }
      }

      const stat = await FileSystem.getInfoAsync(outUri);
      if (!stat.exists || !(stat as any).size) {
        setExtracting(false);
        setExtractMsg("提取失败：输出文件为空");
        return;
      }

      const baseName = srcName.replace(/\.[^.]+$/, "");
      const size = (stat as any).size;

      const { addFiles } = useFileStore.getState();
      addFiles([{
        id: `extract-${Date.now()}`,
        name: `${baseName}_提取音频.aac`,
        ext: "aac",
        format: null,
        size,
        duration: 0,
        uri: outUri,
        masterEnhance: false,
        converted: true,
        targetFormat: undefined,
        createdAt: Date.now(),
      }]);

      setExtractMsg(`✅ 已提取音频（${(size / 1024).toFixed(0)} KB），已存入文件库`);
    } catch (e) {
      console.error("[video-extract] error:", e);
      setExtractMsg(`提取失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExtracting(false);
    }
  }, []);

  // ── AI 智能调参 ──────────────────────────────────────────────────────────────
  const { status: aiStatus, result: aiResult, suggestForContext, reset: resetAI } = useAIAnalysis();

  const handleAISuggest = useCallback(async () => {
    resetAI();
    await suggestForContext(recordMode, outputFormat);
  }, [resetAI, suggestForContext, recordMode, outputFormat]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="视频提取音频"
        subtitle="VIDEO → AUDIO"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ① 导入视频提取音频（推荐）── */}
        {isIdle && (
          <Pressable
            onPress={handleImportVideo}
            disabled={extracting}
            className="border-2 border-primary bg-primary/10 p-4 active:opacity-80"
            style={{ borderCurve: "continuous" }}
          >
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center bg-primary">
                {extracting ? <ActivityIndicator size="small" color="#fff" /> : <Film size={26} color="#fff" strokeWidth={2} />}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="font-mono text-base font-black text-primary">导入视频提取音频</Text>
                  <View className="border border-primary px-1 py-0.5">
                    <Text className="font-mono text-[8px] text-primary">推荐</Text>
                  </View>
                </View>
                <Text className="font-mono text-[10px] text-muted-foreground leading-4">
                  支持 MP4/MOV/MKV/WebM · FFmpeg -vn 提取原始音轨 · 不转码零损失
                </Text>
              </View>
              <FileVideo size={22} color={C.orange} strokeWidth={1.5} />
            </View>
            {extracting && extractMsg ? (
              <Text className="mt-3 font-mono text-[10px] text-primary">{extractMsg}</Text>
            ) : null}
          </Pressable>
        )}

        {/* 使用说明 */}
        {isIdle && (
          <Panel title="使用步骤 HOW TO USE">
            <View className="p-3 gap-3">
              {STEPS.map((s) => (
                <View key={s.num} className="flex-row items-start gap-3">
                  <View className="h-7 w-7 items-center justify-center border border-primary bg-primary/10 shrink-0">
                    <Text className="font-mono text-[10px] font-bold text-primary">{s.num}</Text>
                  </View>
                  <Text className="flex-1 font-mono text-xs leading-5 text-foreground">{s.text}</Text>
                </View>
              ))}
              <View className="flex-row items-start gap-2 mt-1 border border-border bg-card p-2">
                <Info size={12} color={C.muted} strokeWidth={1.5} />
                <Text className="flex-1 font-mono text-[10px] leading-4 text-muted-foreground">
                  原理：系统录屏捕获系统声音（无需特权权限），导入视频后 FFmpeg -vn -acodec copy 直接复制原始音轨，零转码零损失。
                </Text>
              </View>
            </View>
          </Panel>
        )}

        {/* ── ② 麦克风录制母带（备选）── */}
        {isIdle && (
          <Panel title="麦克风录制母带（备选）MIC MASTER">
            <View className="p-3 gap-2">
              <Text className="font-mono text-[10px] text-muted-foreground leading-4">
                无需录屏，直接用麦克风录制。建议在安静环境下手机靠近音源（音箱/耳机外放）。
              </Text>
              <Pressable
                onPress={handleStart}
                className="flex-row items-center justify-center gap-2 border border-primary bg-primary/10 py-3 active:opacity-70"
              >
                <Mic size={16} color={C.orange} strokeWidth={1.5} />
                <Text className="font-mono text-xs font-bold text-primary">开始麦克风录制</Text>
              </Pressable>
            </View>
          </Panel>
        )}

        {/* 录制中 */}
        {(isRequesting || isRecording) && (
          <Panel title="录制中 RECORDING">
            <View className="p-4 items-center gap-4">
              <RecordingIndicator elapsed={state.elapsed} />
              <RecordWaveform metering={metering} active />
              <Text className="font-mono text-[10px] text-muted-foreground">
                {recordMode === "microphone" ? "麦克风录制中 · 请靠近音源" : "录制中…"}
              </Text>
            </View>
          </Panel>
        )}

        {/* 输出格式选择（idle / error 时显示） */}
        {(isIdle || isError) && (
          <Panel title="输出格式 OUTPUT FORMAT">
            <View className="flex-row flex-wrap gap-2 p-3">
              {(Object.keys(RECORD_FORMAT_SPECS) as RecordOutputFormat[]).map((fmt) => (
                <Chip
                  key={fmt}
                  label={RECORD_FORMAT_SPECS[fmt].label}
                  active={outputFormat === fmt}
                  onPress={() => setOutputFormat(fmt)}
                />
              ))}
            </View>
            <View className="border-t border-border px-3 py-2 gap-1">
              <Text className="font-mono text-[10px] text-muted-foreground">{currentSpec.desc}</Text>
              <Text className="font-mono text-[10px] text-primary">
                规格：{currentSpec.sampleRate} / {currentSpec.bitDepth}
              </Text>
            </View>
          </Panel>
        )}

        {/* 详细参数 */}
        {(isIdle || isError) && (
          <Panel title="详细参数 ADVANCED PARAMS">
            <Pressable
              onPress={() => setParamsOpen((v) => !v)}
              className="flex-row items-center justify-between px-3 py-2.5"
            >
              <View className="flex-row items-center gap-2">
                <SlidersHorizontal size={14} color={C.orange} strokeWidth={1.5} />
                <Text className="font-mono text-xs font-bold text-foreground">采样率 / 位深 / 处理链</Text>
              </View>
              {paramsOpen ? <ChevronUp size={14} color={C.muted} /> : <ChevronDown size={14} color={C.muted} />}
            </Pressable>
            {paramsOpen && (
              <>
                <ParamRow
                  label="采样率 SAMPLE RATE"
                  value={masterParams.sampleRate}
                  onChange={(v) => updateParam("sampleRate", v)}
                  options={[
                    { val: "44.1kHz", text: "44.1k" },
                    { val: "48kHz", text: "48k" },
                    { val: "88.2kHz", text: "88.2k" },
                    { val: "96kHz", text: "96k" },
                    { val: "192kHz", text: "192k" },
                  ]}
                />
                <ParamRow
                  label="位深 BIT DEPTH"
                  value={masterParams.bitDepth}
                  onChange={(v) => updateParam("bitDepth", v)}
                  options={[
                    { val: "16bit", text: "16bit" },
                    { val: "24bit", text: "24bit" },
                    { val: "32bit", text: "32bit" },
                  ]}
                />
                <ParamRow
                  label="高通滤波 HPF"
                  value={masterParams.hpfFreq}
                  onChange={(v) => updateParam("hpfFreq", v)}
                  options={[
                    { val: 20, text: "20Hz" },
                    { val: 30, text: "30Hz" },
                    { val: 40, text: "40Hz" },
                    { val: 80, text: "80Hz" },
                  ]}
                />
                <ParamRow
                  label="压缩比 COMP 1"
                  value={masterParams.comp1Ratio}
                  onChange={(v) => updateParam("comp1Ratio", v)}
                  options={[
                    { val: 2, text: "2:1" },
                    { val: 3, text: "3:1" },
                    { val: 4, text: "4:1" },
                    { val: 6, text: "6:1" },
                  ]}
                />
                <ParamRow
                  label="增益 GAIN"
                  value={masterParams.gain}
                  onChange={(v) => updateParam("gain", v)}
                  options={[
                    { val: 1.0, text: "1.0×" },
                    { val: 1.1, text: "1.1×" },
                    { val: 1.2, text: "1.2×" },
                    { val: 1.3, text: "1.3×" },
                    { val: 1.5, text: "1.5×" },
                    { val: 2.0, text: "2.0×" },
                  ]}
                />
                <ParamRow
                  label="限幅电平 LIMIT"
                  value={masterParams.limitLevel}
                  onChange={(v) => updateParam("limitLevel", v)}
                  options={[
                    { val: -0.3, text: "-0.3" },
                    { val: -0.5, text: "-0.5" },
                    { val: -1.0, text: "-1.0" },
                    { val: -1.5, text: "-1.5" },
                    { val: -2.0, text: "-2.0" },
                    { val: -3.0, text: "-3.0" },
                  ]}
                />
              </>
            )}
          </Panel>
        )}

        {/* AI 智能调参 */}
        {(isIdle || isError) && (
          <Panel title="AI 智能调参 AI ASSIST">
            <View className="p-3 gap-2">
              <Text className="font-mono text-[10px] text-muted-foreground leading-4">
                AI 根据录制模式与目标格式，自动推荐专业母带参数。
              </Text>
              <Pressable
                onPress={handleAISuggest}
                disabled={aiStatus === "analyzing"}
                className="flex-row items-center justify-center gap-2 border border-primary bg-primary/10 py-3 active:opacity-70"
              >
                {aiStatus === "analyzing" ? <ActivityIndicator size="small" color={C.orange} /> : <Sparkles size={16} color={C.orange} strokeWidth={1.5} />}
                <Text className="font-mono text-xs font-bold text-primary">AI 一键推荐参数</Text>
              </Pressable>
              {aiResult ? (
                <View className="border border-border bg-card p-2 gap-1">
                  <Text className="font-mono text-[10px] text-primary">推荐：{aiResult.recommendedParams.sampleRate} / {aiResult.recommendedParams.bitDepth}</Text>
                  <Text className="font-mono text-[10px] text-muted-foreground">{aiResult.analysis.overall}</Text>
                </View>
              ) : null}
            </View>
          </Panel>
        )}

        {/* 录制完成 */}
        {isDone && latestMaster && (
          <Panel title="录制完成 CAPTURED">
            <View className="p-4 gap-3">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={20} color="#22c55e" strokeWidth={1.5} />
                <Text className="font-mono text-sm font-bold text-foreground">{latestMaster.name}</Text>
              </View>
              <Text className="font-mono text-[10px] text-muted-foreground">
                {currentSpec.label} · {currentSpec.sampleRate} / {currentSpec.bitDepth}
              </Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => router.push("/(tabs)/player" as any)}
                  className="flex-1 items-center border border-primary bg-primary py-2.5 active:opacity-70"
                >
                  <Text className="font-mono text-xs font-bold text-white">播放试听</Text>
                </Pressable>
                <Pressable
                  onPress={reset}
                  className="flex-1 items-center border border-border py-2.5 active:opacity-70"
                >
                  <Text className="font-mono text-xs font-bold text-muted-foreground">重新录制</Text>
                </Pressable>
              </View>
            </View>
          </Panel>
        )}

        {/* 录制中操作 */}
        {(isRequesting || isRecording) && (
          <Pressable
            onPress={stop}
            className="flex-row items-center justify-center gap-2 bg-destructive py-4 active:opacity-80"
          >
            <StopCircle size={18} color="#fff" strokeWidth={1.5} />
            <Text className="font-mono text-sm font-bold text-white">停止并保存</Text>
          </Pressable>
        )}

        {/* 错误提示 */}
        {isError && (
          <View className="border border-destructive bg-card p-3 gap-2">
            <View className="flex-row items-center gap-2">
              <AlertTriangle size={16} color="#EF4444" strokeWidth={1.5} />
              <Text className="font-mono text-xs font-bold text-destructive">录制出错</Text>
            </View>
            <Text className="font-mono text-[10px] leading-4 text-muted-foreground">{state.error}</Text>
            <Pressable
              onPress={reset}
              className="items-center border border-border py-2.5 active:opacity-70"
            >
              <Text className="font-mono text-xs font-bold text-foreground">重试</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
