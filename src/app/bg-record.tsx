/**
 * 后台录制母带 — 独立入口页
 *
 * 功能：
 *  - 输出格式选择：WAV（默认）/ DSD64 / DSD128 / DSD256
 *  - 详细参数调节：采样率、位深、高通滤波、压缩比、增益、限幅电平
 *  - 录制中实时波形可视化（metering 驱动）
 *  - 使用麦克风录制（expo-audio HIGH_QUALITY preset）
 *  - 建议：在安静环境下，手机靠近音源（音箱/耳机外放），获得最佳录制效果
 */

import { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  StopCircle, CheckCircle2, AlertTriangle,
  Info, Music2, Disc, ArrowLeft, Radio,
  ChevronDown, ChevronUp, SlidersHorizontal, Sparkles,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/fileStore";
import {
  useMasterRecord, RECORD_FORMAT_SPECS, DEFAULT_MASTER_PARAMS,
  type RecordOutputFormat, type RecordMasterParams,
} from "@/hooks/useMasterRecord";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { Panel, ScreenHeader, Badge, Chip } from "@/components/ui";
import { RecordWaveform } from "@/components/RecordWaveform";

const STEPS = [
  { num: "01", text: "在本 APP 播放器中选好歌曲，点击播放" },
  { num: "02", text: "返回本页面，点「开始后台录制」（使用麦克风录制）" },
  { num: "03", text: "将 APP 切到后台，播放继续，录制自动持续进行" },
  { num: "04", text: "返回本 APP，点「停止并保存」，母带版自动存入文件库" },
  { num: "💡", text: "建议：安静环境 + 手机靠近音源（音箱/耳机外放），获得最佳录制效果" },
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
    recordMode, setRecordMode,
    metering,
    start, stop, reset,
  } = useMasterRecord();

  const [paramsOpen, setParamsOpen] = useState(false);
  
  // 仅 Android 支持系统内录（MediaProjection）
  const isAndroid = process.env.EXPO_OS === "android";

  // 非 Android 平台强制降级为麦克风模式
  useEffect(() => {
    if (!isAndroid && recordMode === "system") {
      setRecordMode("microphone");
    }
  }, [isAndroid, recordMode, setRecordMode]);

  const isIdle       = state.status === "idle";
  const isRequesting = state.status === "requesting";
  const isRecording  = state.status === "recording";
  const isUploading  = state.status === "uploading";
  const isDone       = state.status === "done";
  const isError      = state.status === "error";

  const currentSpec = RECORD_FORMAT_SPECS[outputFormat];
  const isDsd = outputFormat !== "WAV";

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

  // ── AI 智能调参 ──────────────────────────────────────────────────────────────
  const { status: aiStatus, result: aiResult, suggestForContext, reset: resetAI } = useAIAnalysis();

  const handleAISuggest = useCallback(async () => {
    resetAI();
    await suggestForContext(recordMode, outputFormat);
  }, [resetAI, suggestForContext, recordMode, outputFormat]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="后台录制母带"
        subtitle="BG MASTER CAPTURE"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
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
                  录制原理：使用麦克风捕获音频（expo-audio HIGH_QUALITY preset）· 48kHz/24bit 高清录制 · 后台保持录制
                </Text>
              </View>
            </View>
          </Panel>
        )}

        {/* 录制模式选择（idle / error 时显示） */}
        {(isIdle || isError) && (
          <Panel title="录制模式 RECORD MODE">
            <View className="flex-row gap-2 p-3">
              {/* 系统内录：Android 可用，其他平台禁用并显示不支持 */}
              <Pressable
                onPress={() => { if (isAndroid) setRecordMode("system"); }}
                disabled={!isAndroid}
                className={cn(
                  "flex-1 border p-3 gap-1",
                  isAndroid && recordMode === "system"
                    ? "border-primary bg-primary/10 active:opacity-70"
                    : "border-border",
                  !isAndroid && "opacity-40",
                )}
              >
                <Text className={cn(
                  "font-mono text-xs font-bold",
                  isAndroid && recordMode === "system" ? "text-primary" : "text-muted-foreground",
                )}>
                  🎵 系统内录
                </Text>
                {isAndroid ? (
                  <Text className="font-mono text-[10px] text-muted-foreground leading-4">
                    Android 系统音频捕获 · 零外界噪音
                  </Text>
                ) : (
                  <Text className="font-mono text-[9px] text-muted-foreground leading-4">
                    ⛔ 当前平台不支持{"\n"}（iOS · Web · 鸿蒙）
                  </Text>
                )}
              </Pressable>

              {/* 麦克风录制（全平台可用） */}
              <Pressable
                onPress={() => setRecordMode("microphone")}
                className={cn(
                  "flex-1 border p-3 gap-1 active:opacity-70",
                  recordMode === "microphone"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-transparent",
                )}
              >
                <Text className={cn(
                  "font-mono text-xs font-bold",
                  recordMode === "microphone" ? "text-primary" : "text-muted-foreground",
                )}>
                  🎤 麦克风录制
                </Text>
                <Text className="font-mono text-[10px] text-muted-foreground leading-4">
                  全平台通用 · 建议安静环境 + 靠近音源
                </Text>
              </Pressable>
            </View>
            <View className="border-t border-border px-3 py-2">
              <Text className="font-mono text-[10px] text-muted-foreground">
                {isAndroid
                  ? (recordMode === "system"
                    ? "💡 Android 系统内录：捕获设备内部音频，音质纯净无外界噪音"
                    : "💡 麦克风录制：建议在安静环境下手机靠近音源（音箱/耳机外放）")
                  : "💡 当前平台（iOS / Web / 鸿蒙）不支持系统内录，仅可使用麦克风录制"}
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
                输出规格：{currentSpec.sampleRate} / {currentSpec.bitDepth}
                {isDsd ? " · PCM 高清上采样封装" : " · PCM 未压缩原始数据"}
              </Text>
              {isDsd && (
                <Text className="font-mono text-[10px] text-muted-foreground">
                  点对点录制 → 上采样至 {outputFormat} 规格 → 适配专业 DSD DAC 设备
                </Text>
              )}
            </View>
          </Panel>
        )}

        {/* 详细参数面板（可折叠，idle/error 时显示） */}
        {(isIdle || isError) && (
          <Panel title="母带参数 MASTERING PARAMS">
            {/* 折叠切换按钮 + AI 智能调参 */}
            <View className="flex-row items-center">
              <Pressable
                onPress={() => setParamsOpen((v) => !v)}
                className="flex-1 flex-row items-center gap-2 px-3 py-2.5 active:opacity-70"
              >
                <SlidersHorizontal size={14} color={C.orange} strokeWidth={1.5} />
                <Text className="font-mono text-xs font-bold text-primary flex-1" numberOfLines={1}>
                  {paramsOpen ? "收起详细参数" : "展开详细参数调节"}
                </Text>
                {paramsOpen
                  ? <ChevronUp size={14} color={C.muted} />
                  : <ChevronDown size={14} color={C.muted} />}
              </Pressable>
              {/* AI 调参按钮 */}
              <Pressable
                onPress={handleAISuggest}
                disabled={aiStatus === "analyzing"}
                className="flex-row items-center gap-1.5 border-l border-border px-3 py-2.5 active:opacity-70"
                style={{ opacity: aiStatus === "analyzing" ? 0.6 : 1 }}
              >
                {aiStatus === "analyzing"
                  ? <ActivityIndicator size="small" color={C.orange} />
                  : <Sparkles size={14} color={C.orange} strokeWidth={1.5} />}
                <Text className="font-mono text-[11px] font-bold text-primary">
                  {aiStatus === "analyzing" ? "分析中" : "AI 调参"}
                </Text>
              </Pressable>
            </View>

            {/* AI 调参建议结果卡（分析完成后展示） */}
            {aiResult && (
              <View className="border-t border-primary/30 bg-primary/5 p-3 gap-2">
                <View className="flex-row items-center gap-2">
                  <Sparkles size={11} color={C.orange} strokeWidth={1.5} />
                  <Text className="font-mono text-[10px] font-bold text-primary flex-1">
                    AI 建议 · {aiResult.qualityStandard}
                  </Text>
                  <Text className="font-mono text-[10px] text-muted-foreground">
                    {aiResult.recommendedParams.sampleRate} / {aiResult.recommendedParams.bitDepth}
                  </Text>
                </View>
                <Text className="font-mono text-[10px] text-muted-foreground leading-4">
                  响度目标 {aiResult.loudnessTarget.streaming}{"\n"}
                  限幅 {aiResult.loudnessTarget.truePeak}
                </Text>
                {aiResult.suggestions.slice(0, 3).map((s, i) => (
                  <View key={i} className="flex-row gap-1.5">
                    <Text className="font-mono text-[10px] text-primary">›</Text>
                    <Text className="flex-1 font-mono text-[10px] text-foreground leading-4">{s}</Text>
                  </View>
                ))}
                <Pressable
                  onPress={() => { setMasterParams(aiResult.recommendedParams); setParamsOpen(true); }}
                  className="flex-row items-center justify-center gap-2 border border-primary bg-primary/10 py-2 mt-1 active:opacity-70"
                >
                  <CheckCircle2 size={12} color={C.orange} strokeWidth={1.5} />
                  <Text className="font-mono text-[11px] font-bold text-primary">应用 AI 推荐参数</Text>
                </Pressable>
              </View>
            )}

            {paramsOpen && (
              <View className="border-t border-border">
                <ParamRow
                  label="采样率 SAMPLE RATE"
                  options={[
                    { val: "44.1kHz", text: "44.1kHz" },
                    { val: "48kHz",   text: "48kHz ★" },
                    { val: "88.2kHz", text: "88.2kHz" },
                    { val: "96kHz",   text: "96kHz" },
                    { val: "192kHz",  text: "192kHz" },
                  ]}
                  value={masterParams.sampleRate}
                  onChange={(v) => updateParam("sampleRate", v)}
                />
                <ParamRow
                  label="位深 BIT DEPTH"
                  options={[
                    { val: "16bit", text: "16bit" },
                    { val: "24bit", text: "24bit ★" },
                    { val: "32bit", text: "32bit" },
                  ]}
                  value={masterParams.bitDepth}
                  onChange={(v) => updateParam("bitDepth", v)}
                />
                <ParamRow
                  label="高通滤波截止 HPF FREQ"
                  options={[
                    { val: 20, text: "20Hz" },
                    { val: 30, text: "30Hz ★" },
                    { val: 40, text: "40Hz" },
                    { val: 80, text: "80Hz" },
                  ]}
                  value={masterParams.hpfFreq}
                  onChange={(v) => updateParam("hpfFreq", v)}
                />
                <ParamRow
                  label="第一级压缩比 COMP1 RATIO"
                  options={[
                    { val: 2, text: "2:1" },
                    { val: 3, text: "3:1 ★" },
                    { val: 4, text: "4:1" },
                    { val: 6, text: "6:1" },
                  ]}
                  value={masterParams.comp1Ratio}
                  onChange={(v) => updateParam("comp1Ratio", v)}
                />
                <ParamRow
                  label="第二级压缩比 COMP2 RATIO"
                  options={[
                    { val: 1.5, text: "1.5:1" },
                    { val: 2,   text: "2:1 ★" },
                    { val: 3,   text: "3:1" },
                  ]}
                  value={masterParams.comp2Ratio}
                  onChange={(v) => updateParam("comp2Ratio", v)}
                />
                <ParamRow
                  label="增益 GAIN"
                  options={[
                    { val: 1.0, text: "×1.0" },
                    { val: 1.1, text: "×1.1" },
                    { val: 1.2, text: "×1.2" },
                    { val: 1.3, text: "×1.3 ★" },
                    { val: 1.5, text: "×1.5" },
                    { val: 2.0, text: "×2.0" },
                  ]}
                  value={masterParams.gain}
                  onChange={(v) => updateParam("gain", v)}
                />
                <ParamRow
                  label="限幅电平 LIMITER CEILING"
                  options={[
                    { val: -0.3, text: "-0.3dBFS" },
                    { val: -0.5, text: "-0.5dBFS" },
                    { val: -1.0, text: "-1.0dBFS" },
                    { val: -1.5, text: "-1.5dBFS ★" },
                    { val: -2.0, text: "-2.0dBFS" },
                    { val: -3.0, text: "-3.0dBFS" },
                  ]}
                  value={masterParams.limitLevel}
                  onChange={(v) => updateParam("limitLevel", v)}
                />
                {/* 重置按钮 */}
                <Pressable
                  onPress={() => setMasterParams(DEFAULT_MASTER_PARAMS)}
                  className="flex-row items-center justify-center gap-2 border-t border-border py-2.5 active:opacity-70"
                >
                  <Text className="font-mono text-[11px] text-muted-foreground">恢复默认参数</Text>
                </Pressable>
              </View>
            )}

            {/* 当前参数摘要（始终显示） */}
            <View className="border-t border-border px-3 py-2">
              <Text className="font-mono text-[10px] leading-5 text-muted-foreground">
                {masterParams.sampleRate} / {masterParams.bitDepth} · HPF {masterParams.hpfFreq}Hz
                {" · "}压缩 {masterParams.comp1Ratio}:1+{masterParams.comp2Ratio}:1
                {" · "}增益 ×{masterParams.gain} · 限幅 {masterParams.limitLevel}dBFS
              </Text>
            </View>
          </Panel>
        )}

        {/* 录制中状态 + 实时波形 */}
        {isRecording && (
          <Panel title="录制中 RECORDING">
            <View className="items-center py-6 gap-4">
              <RecordingIndicator elapsed={state.elapsed} />
              <Text className="font-mono text-[10px] text-muted-foreground text-center">
                {recordMode === "system" ? "系统内录中 · Android 内部音频通道 · 零外界噪音" : "麦克风录制中 · 请保持安静环境 · 手机靠近音源"}
              </Text>
              <Text className="font-mono text-[10px] text-primary text-center">
                {currentSpec.label} · {masterParams.sampleRate} / {masterParams.bitDepth}
              </Text>
            </View>
            {/* 实时波形 */}
            <View className="border-t border-border px-3 pt-3 pb-4">
              <Text className="font-mono text-[10px] text-muted-foreground mb-2">
                WAVEFORM · 实时电平
              </Text>
              <RecordWaveform
                metering={metering}
                height={72}
                color={C.orange}
                active
              />
            </View>
          </Panel>
        )}

        {/* 上传中 */}
        {isUploading && (
          <Panel title="保存中 SAVING">
            <View className="items-center py-8 gap-3">
              <ActivityIndicator size="large" color={C.cyan} />
              <Text className="font-mono text-sm font-bold text-cyan">保存母带文件…</Text>
              <Text className="font-mono text-[10px] text-muted-foreground">
                已录制 {state.elapsed}s · {currentSpec.label} {masterParams.sampleRate}/{masterParams.bitDepth}
              </Text>
            </View>
          </Panel>
        )}

        {/* 完成 */}
        {isDone && (
          <Panel title="录制完成 DONE">
            <View className="items-center py-6 gap-3">
              <CheckCircle2 size={48} color={C.cyan} strokeWidth={1} />
              <Text className="font-mono text-base font-bold text-cyan">母带版已保存！</Text>
              <Text className="font-mono text-xs text-muted-foreground">
                已录制 {state.elapsed}s · {currentSpec.label} {masterParams.sampleRate} / {masterParams.bitDepth}
              </Text>
              {latestMaster && (
                <View className="w-full border border-border bg-card p-3 gap-1">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Music2 size={14} color={C.cyan} strokeWidth={1.5} />
                    <Text className="font-mono text-xs font-semibold text-foreground flex-1"
                      numberOfLines={1}>{latestMaster.name}</Text>
                    <Badge text={currentSpec.label} tone="orange" />
                    <Badge text="母带级" tone="cyan" />
                  </View>
                  <Text className="font-mono text-[10px] text-muted-foreground">
                    {masterParams.sampleRate} / {masterParams.bitDepth} · 点对点录制 · 无噪音
                  </Text>
                </View>
              )}
            </View>
          </Panel>
        )}

        {/* 错误 */}
        {isError && (
          <View className="border border-destructive bg-destructive/10 p-3 flex-row items-start gap-2">
            <AlertTriangle size={16} color="#EF4444" strokeWidth={1.5} />
            <Text className="flex-1 font-mono text-xs text-destructive leading-5">
              {state.error ?? "录制失败，请重试"}
            </Text>
          </View>
        )}

        {/* 主操作按钮 */}
        <View className="gap-3 mt-2">
          {isIdle || isError ? (
            <Pressable
              onPress={handleStart}
              className="flex-row items-center justify-center gap-3 bg-destructive py-4 active:opacity-80"
            >
              <Radio size={22} color="#fff" strokeWidth={2} />
              <Text className="font-mono text-sm font-bold text-white">
                开始后台录制 · {currentSpec.label}
              </Text>
            </Pressable>
          ) : isRecording ? (
            <Pressable
              onPress={stop}
              className="flex-row items-center justify-center gap-3 border-2 border-destructive py-4 active:opacity-80"
            >
              <StopCircle size={22} color="#EF4444" strokeWidth={2} />
              <Text className="font-mono text-sm font-bold text-destructive">停止并保存母带</Text>
            </Pressable>
          ) : isRequesting || isUploading ? (
            <View className="flex-row items-center justify-center gap-3 bg-secondary py-4 opacity-60">
              <ActivityIndicator color={C.orange} />
              <Text className="font-mono text-sm font-bold text-muted-foreground">
                {isRequesting ? "申请权限中…" : "保存中…"}
              </Text>
            </View>
          ) : isDone ? (
            <View className="gap-2">
              <Pressable
                onPress={() => { reset(); }}
                className="flex-row items-center justify-center gap-3 border border-border bg-card py-3.5 active:opacity-70"
              >
                <Radio size={18} color={C.orange} strokeWidth={1.5} />
                <Text className="font-mono text-sm font-bold text-primary">再录一首</Text>
              </Pressable>
              <Pressable
                onPress={() => router.back()}
                className="flex-row items-center justify-center gap-2 py-3 active:opacity-70"
              >
                <ArrowLeft size={14} color={C.muted} strokeWidth={1.5} />
                <Text className="font-mono text-xs text-muted-foreground">返回文件库查看</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* 技术说明 + 系统内录平台限制 */}
        {isIdle && (
          <View className="gap-2">
            <View className="flex-row items-start gap-2 border border-border bg-card p-3">
              <Disc size={14} color={C.orange} strokeWidth={1.5} />
              <Text className="flex-1 font-mono text-[10px] leading-4 text-muted-foreground">
                {recordMode === "system"
                  ? "系统内录（Android MediaProjection）→ HPF"
                  : "麦克风录制（expo-audio HIGH_QUALITY）→ HPF"
                } {masterParams.hpfFreq}Hz → 双级动态压缩（{masterParams.comp1Ratio}:1 + {masterParams.comp2Ratio}:1）
                → 增益 ×{masterParams.gain} → 限幅（{masterParams.limitLevel}dBFS）→ {masterParams.sampleRate}/{masterParams.bitDepth} 输出
              </Text>
            </View>
            {/* 系统内录平台限制说明 */}
            <View className="flex-row items-start gap-2 border border-border bg-card p-3">
              <Disc size={14} color={C.muted} strokeWidth={1.5} />
              <Text className="flex-1 font-mono text-[10px] leading-5 text-muted-foreground">
                <Text className="font-bold text-foreground">系统内录平台支持说明：{"\n"}</Text>
                🤖 <Text className="font-semibold">Android（支持）</Text>：通过 MediaProjection API 捕获内部音频，零外界噪音，Android 10+ 可用。{"\n"}
                🍎 <Text className="font-semibold">iOS（不支持）</Text>：系统不开放内录权限，仅可麦克风录制。{"\n"}
                🌐 <Text className="font-semibold">Web（不支持系统内录）</Text>：可通过 getDisplayMedia 屏幕共享音频，但非本 App 直录方案。{"\n"}
                🔴 <Text className="font-semibold">鸿蒙（不支持）</Text>：当前版本暂不支持系统内录，仅可麦克风录制。
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
