import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import {
  Sparkles,
  FileAudio,
  Star,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ChevronDown,
  ChevronUp,
  Music,
  Cloud,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn, formatFileSize, formatDuration } from "@/lib/utils";
import { detectFormat } from "@/lib/formats";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { useParamStore } from "@/store/paramStore";
import {
  rateAudio,
  fetchCloudRatingOverride,
  GRADE_COLOR,
  GRADE_LABEL,
  type AudioRatingResult,
  type RatingGrade,
} from "@/lib/audioRating";
import { getHfToken } from "@/lib/hfToken";
import { Panel, Badge, EmptyState, ScreenHeader } from "@/components/ui";
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

// 分数条
function ScoreBar({ score, max, color }: { score: number; max: number; color: string }) {
  const pct = Math.round((score / max) * 100);
  return (
    <View className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
      <View
        style={{ width: `${pct}%`, backgroundColor: color, height: "100%", borderRadius: 999 }}
      />
    </View>
  );
}

// 等级徽章
function GradeBadge({ grade }: { grade: RatingGrade }) {
  const color = GRADE_COLOR[grade];
  return (
    <View
      className="h-20 w-20 items-center justify-center border-2"
      style={{ borderColor: color }}
    >
      <Text className="font-mono text-4xl font-black" style={{ color }}>{grade}</Text>
    </View>
  );
}

// 单条自动修复项
function AutoFixRow({
  label, current, suggested, reason, applied, onApply,
}: {
  label: string; current: string; suggested: string; reason: string;
  applied: boolean; onApply: () => void;
}) {
  const C = useColors();
  return (
    <View className="border-b border-border px-3 py-2.5">
      <View className="flex-row items-center justify-between">
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text className="font-mono text-xs font-bold text-foreground">{label}</Text>
          <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground" numberOfLines={2}>
            {current} → <Text style={{ color: C.cyan }}>{suggested}</Text>
          </Text>
          <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground" numberOfLines={2}>
            {reason}
          </Text>
        </View>
        <Pressable
          onPress={onApply}
          disabled={applied}
          className={cn(
            "ml-3 items-center justify-center border px-3 py-1.5 active:opacity-70",
            applied ? "border-border opacity-50" : "border-primary",
          )}
        >
          {applied ? (
            <CheckCircle2 size={14} color={C.cyan} />
          ) : (
            <Text className="font-mono text-[10px] font-bold text-primary">应用</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function AudioRatingScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const files = useFileStore((s) => s.files);
  const updateFile = useFileStore((s) => s.updateFile);
  // 每个 setter 单独订阅，避免 selector 每次返回新对象导致无限重渲染（黑屏根因）
  const setSampleRate   = useParamStore((s) => s.setSampleRate);
  const setBitDepth     = useParamStore((s) => s.setBitDepth);
  const setBitrate      = useParamStore((s) => s.setBitrate);
  const setMasterEnhance = useParamStore((s) => s.setMasterEnhance);
  const _paramSampleRate  = useParamStore((s) => s.sampleRate);
  const _paramBitDepth    = useParamStore((s) => s.bitDepth);
  const _paramBitrate     = useParamStore((s) => s.bitrate);
  const _paramMasterEnhance = useParamStore((s) => s.masterEnhance);

  const [selectedId, setSelectedId] = useState<string | null>(files[0]?.id ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AudioRatingResult | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());
  const [showIssues, setShowIssues] = useState(true);
  const [showSuggest, setShowSuggest] = useState(true);
  const [importedFile, setImportedFile] = useState<AudioFile | null>(null);
  const [showAiEnhanceDialog, setShowAiEnhanceDialog] = useState(false);
  // 云端评级状态
  const [hasHfToken, setHasHfToken] = useState(false);
  const [cloudAnalyzing, setCloudAnalyzing] = useState(false);
  const [cloudModel, setCloudModel] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // 挂载时检测 HF Token
  useEffect(() => {
    (async () => {
      const t = await getHfToken();
      setHasHfToken(!!t);
    })();
  }, []);

  // 当前分析目标（文件库已有 或 临时导入）
  const targetFile = useMemo(() => {
    if (importedFile) return importedFile;
    return files.find((f) => f.id === selectedId) ?? files[0] ?? null;
  }, [importedFile, files, selectedId]);

  // 开始本地 AI 分析
  const analyze = useCallback(async () => {
    if (!targetFile) return;
    setAnalyzing(true);
    setResult(null);
    setAppliedFixes(new Set());
    setCloudModel(null);
    setCloudError(null);
    await new Promise((r) => setTimeout(r, 1400));
    const r = rateAudio({
      name: targetFile.name,
      format: targetFile.format,
      sampleRate: targetFile.sampleRate,
      bitDepth: targetFile.bitDepth,
      bitrate: targetFile.bitrate,
      masterEnhance: targetFile.masterEnhance,
    });
    setResult(r);
    setAnalyzing(false);
  }, [targetFile]);

  // 云端 AI 分析（HF 文本生成，覆盖 verdict + suggestions）
  const analyzeCloud = useCallback(async () => {
    if (!targetFile) return;
    setCloudAnalyzing(true);
    setCloudError(null);
    setCloudModel(null);
    try {
      // 先确保本地评分存在（提供 autoFix / dimensions 基础）
      let base = result;
      if (!base) {
        await new Promise((r) => setTimeout(r, 800));
        base = rateAudio({
          name: targetFile.name,
          format: targetFile.format,
          sampleRate: targetFile.sampleRate,
          bitDepth: targetFile.bitDepth,
          bitrate: targetFile.bitrate,
          masterEnhance: targetFile.masterEnhance,
        });
        setResult(base);
        setAppliedFixes(new Set());
      }
      const token = await getHfToken();
      if (!token) {
        setCloudError("未配置 HF Token，请前往「AI 音质提升」页面保存 Token");
        return;
      }
      const override = await fetchCloudRatingOverride(
        {
          name: targetFile.name,
          format: targetFile.format,
          sampleRate: targetFile.sampleRate,
          bitDepth: targetFile.bitDepth,
          bitrate: targetFile.bitrate,
          size: targetFile.size,
          duration: targetFile.duration,
        },
        token,
      );
      if (!override) {
        setCloudError("云端模型暂不可用，已显示本地评估结果");
        return;
      }
      // 用 AI 生成的文案覆盖 verdict 和 suggestions
      setResult({ ...base, verdict: override.verdict, suggestions: override.suggestions });
      setCloudModel(override.model ?? "AI 模型");
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : "云端分析失败");
    } finally {
      setCloudAnalyzing(false);
    }
  }, [targetFile, result]);

  // 导入新文件
  const importFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const fmt = detectFormat(a.name);
      setImportedFile({
        id: `rate-${Date.now()}`,
        name: a.name,
        ext: a.name.split(".").pop()?.toLowerCase() ?? "",
        format: fmt,
        size: a.size ?? 0,
        duration: 0,
        uri: a.uri,
        createdAt: Date.now(),
      });
      setResult(null);
      setAppliedFixes(new Set());
    } catch { /* ignore */ }
  }, []);

  // 一键应用单个修复参数
  const applyFix = useCallback((param: string, suggestedValue: string) => {
    if (param === "sampleRate") setSampleRate(suggestedValue);
    else if (param === "bitDepth") setBitDepth(suggestedValue);
    else if (param === "masterEnhance") setMasterEnhance(suggestedValue === "开启");
    else if (param === "bitrate") setBitrate(suggestedValue);
    // 同步到当前文件元数据
    if (targetFile && param !== "targetFormat") {
      const patch: Partial<Omit<AudioFile, "id">> = {};
      if (param === "sampleRate") patch.sampleRate = suggestedValue;
      else if (param === "bitDepth") patch.bitDepth = suggestedValue;
      else if (param === "masterEnhance") patch.masterEnhance = suggestedValue === "开启";
      else if (param === "bitrate") patch.bitrate = suggestedValue;
      if (Object.keys(patch).length > 0) updateFile(targetFile.id, patch);
    }
    setAppliedFixes((prev) => new Set([...prev, param]));
  }, [targetFile, setSampleRate, setBitDepth, setBitrate, setMasterEnhance, updateFile]);

  // 一键应用全部
  const applyAll = useCallback(() => {
    if (!result) return;
    result.autoFix.forEach((f) => applyFix(f.param, f.suggestedValue));
  }, [result, applyFix]);

  const gradeColor = result ? GRADE_COLOR[result.grade] : C.muted;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="AI 音质评级"
        subtitle="AUDIO QUALITY RATING"
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── 文件选择 ── */}
        <Panel title="01 · 评级目标 TARGET">
          {/* 文件库中选择 */}
          {files.length > 0 && !importedFile && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ padding: 8, gap: 8 }}>
              {files.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => { setSelectedId(f.id); setResult(null); setAppliedFixes(new Set()); }}
                  className={cn(
                    "flex-row items-center gap-2 border px-3 py-2 active:opacity-70",
                    selectedId === f.id && !importedFile ? "border-primary bg-primary/10" : "border-border",
                  )}
                >
                  <FileAudio size={13} color={C.cyan} strokeWidth={1.5} />
                  <Text className="font-mono text-[10px] text-foreground" numberOfLines={1}
                    style={{ maxWidth: 120 }}>{f.name}</Text>
                  {f.masterEnhance && <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: C.orange }} />}
                </Pressable>
              ))}
            </ScrollView>
          )}
          {/* 导入外部文件 / 重置 */}
          <View className="flex-row gap-2 border-t border-border p-3">
            <Pressable onPress={importFile}
              className="flex-1 flex-row items-center justify-center gap-2 border border-border py-2.5 active:opacity-70">
              <FileAudio size={14} color={C.orange} strokeWidth={1.5} />
              <Text className="font-mono text-[10px] font-bold text-primary">导入文件评级</Text>
            </Pressable>
            {importedFile && (
              <Pressable onPress={() => { setImportedFile(null); setResult(null); }}
                className="items-center justify-center border border-border px-4 active:opacity-70">
                <Text className="font-mono text-[10px] text-muted-foreground">重置</Text>
              </Pressable>
            )}
          </View>
          {/* 当前目标文件信息 */}
          {targetFile && (
            <View className="flex-row items-center gap-3 border-t border-border bg-card p-3">
              <View className="h-10 w-10 items-center justify-center border border-border">
                <Music size={18} color={C.cyan} strokeWidth={1} />
              </View>
              <View className="flex-1" style={{ minWidth: 0 }}>
                <Text className="font-mono text-sm font-semibold text-foreground" numberOfLines={1}>
                  {targetFile.name}
                </Text>
                <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                  {targetFile.format && <Badge text={targetFile.format} tone="cyan" />}
                  {targetFile.masterEnhance && <Badge text="母带级" tone="orange" />}
                  <Text className="font-mono text-[10px] text-muted-foreground">
                    {formatFileSize(targetFile.size)}{targetFile.duration ? ` · ${formatDuration(targetFile.duration)}` : ""}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </Panel>

        {/* ── 开始分析 ── */}
        {!result && (
          <View className="gap-2">
            {/* 本地评级按钮 */}
            <Pressable
              onPress={analyze}
              disabled={!targetFile || analyzing || cloudAnalyzing}
              className={cn(
                "flex-row items-center justify-center gap-3 py-4 active:opacity-80",
                targetFile && !analyzing && !cloudAnalyzing ? "bg-primary" : "bg-secondary",
              )}
            >
              {analyzing ? (
                <>
                  <ActivityIndicator color="#fff" />
                  <Text className="font-mono text-sm font-bold text-white">本地分析中…</Text>
                </>
              ) : (
                <>
                  <Sparkles size={20} color="#fff" strokeWidth={2} />
                  <Text className="font-mono text-sm font-bold text-white">本地 AI 音质评级</Text>
                </>
              )}
            </Pressable>
            {/* 云端 AI 评级按钮（仅 HF Token 已配置时显示） */}
            {hasHfToken && (
              <Pressable
                onPress={analyzeCloud}
                disabled={!targetFile || analyzing || cloudAnalyzing}
                className={cn(
                  "flex-row items-center justify-center gap-3 border py-3.5 active:opacity-80",
                  targetFile && !cloudAnalyzing ? "border-primary" : "border-border",
                )}
              >
                {cloudAnalyzing ? (
                  <>
                    <ActivityIndicator color={C.cyan} size="small" />
                    <Text className="font-mono text-sm font-bold" style={{ color: C.cyan }}>云端 AI 分析中…</Text>
                  </>
                ) : (
                  <>
                    <Cloud size={18} color={C.cyan} strokeWidth={1.5} />
                    <Text className="font-mono text-sm font-bold" style={{ color: C.cyan }}>☁ 云端 AI 深度评级</Text>
                  </>
                )}
              </Pressable>
            )}
            {cloudError ? (
              <View className="flex-row items-center gap-2 border border-destructive/40 bg-card px-3 py-2">
                <AlertTriangle size={13} color={C.orange} strokeWidth={1.5} />
                <Text className="flex-1 font-mono text-[10px] text-muted-foreground">{cloudError}</Text>
              </View>
            ) : null}
            <Text className="px-1 text-center font-mono text-[9px] text-muted-foreground">
              本地：基于元数据频谱推算 · 云端：HF 开源模型生成个性化诊断文案（需 HF Token）
            </Text>
          </View>
        )}

        {/* ── 评级结果 ── */}
        {result && (
          <>
            {/* AI 联动推荐卡：当评级建议开启母带增强时显示 */}
            {result.autoFix.some((f) => f.param === "masterEnhance") &&
              !appliedFixes.has("masterEnhance") && (
              <View className="flex-row items-center gap-3 border border-primary/60 bg-primary/5 p-4">
                <Sparkles size={22} color={C.orange} strokeWidth={1.5} />
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <Text className="font-mono text-xs font-bold text-primary">
                    AI 建议：启用标准AI增强
                  </Text>
                  <Text className="mt-0.5 font-mono text-[10px] leading-4 text-muted-foreground">
                    当前音质评级低于最优水平，AI 母带增强可提升频谱与动态，使输出达到发行级标准
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowAiEnhanceDialog(true)}
                  className="items-center justify-center border border-primary bg-primary/10 px-3 py-2 active:opacity-70"
                >
                  <Text className="font-mono text-[10px] font-bold text-primary">一键启用</Text>
                </Pressable>
              </View>
            )}
            {appliedFixes.has("masterEnhance") && (
              <View className="flex-row items-center gap-2 border border-border bg-card p-3">
                <CheckCircle2 size={14} color={C.cyan} strokeWidth={1.5} />
                <Text className="font-mono text-[10px] text-cyan">
                  标准AI增强已同步 → 返回主界面转换时自动生效
                </Text>
              </View>
            )}

            {/* AI 联动确认弹窗 */}
            <AlertDialog open={showAiEnhanceDialog} onOpenChange={setShowAiEnhanceDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>AI 建议：启用标准AI增强</AlertDialogTitle>
                  <AlertDialogDescription>
                    根据音质评级结果，AI 母带增强可显著改善本文件的动态范围和频谱质量，使输出达到发行级标准。{"\n\n"}
                    启用后将同步到主界面转换参数，下次转换时自动使用 AI 增强。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>暂不启用</AlertDialogCancel>
                  <AlertDialogAction onPress={() => applyFix("masterEnhance", "开启")}>
                    启用标准AI增强
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* 总分 & 等级 + 个性化诊断短语 */}
            <Panel title="02 · 评级结果 RESULT">
              <View className="flex-row items-center gap-5 p-4">
                <GradeBadge grade={result.grade} />
                <View className="flex-1 gap-1">
                  <Text className="font-mono text-3xl font-black" style={{ color: gradeColor }}>
                    {result.totalScore}
                    <Text className="text-base text-muted-foreground"> / 100</Text>
                  </Text>
                  <Text className="font-mono text-base font-bold" style={{ color: gradeColor }}>
                    {GRADE_LABEL[result.grade]}
                  </Text>
                  <Text className="font-mono text-[10px] text-muted-foreground">
                    {result.grade === "S" ? "超越 95% 的音频文件" :
                     result.grade === "A" ? "超越 80% 的音频文件" :
                     result.grade === "B" ? "超越 60% 的音频文件" :
                     result.grade === "C" ? "需要优化提升" : "建议重新处理"}
                  </Text>
                </View>
              </View>
              {/* 个性化诊断短语 + 来源标注 */}
              <View className="border-t border-border px-4 py-3 bg-card/60 gap-2">
                {cloudModel ? (
                  <View className="flex-row items-center gap-1.5 mb-1">
                    <Cloud size={11} color={C.cyan} strokeWidth={2} />
                    <Text className="font-mono text-[9px] font-bold" style={{ color: C.cyan }}>
                      AI 文案由 {cloudModel.split("/").pop()} 生成
                    </Text>
                  </View>
                ) : null}
                <Text className="font-mono text-[11px] leading-5 text-foreground">
                  {result.verdict}
                </Text>
              </View>
              {/* 重新分析按钮 */}
              <View className="flex-row gap-2 border-t border-border p-3">
                <Pressable
                  onPress={() => { setResult(null); setCloudModel(null); setCloudError(null); setAppliedFixes(new Set()); }}
                  className="flex-1 flex-row items-center justify-center gap-2 border border-border py-2 active:opacity-70"
                >
                  <Sparkles size={13} color={C.orange} strokeWidth={1.5} />
                  <Text className="font-mono text-[10px] font-bold text-primary">重新评级</Text>
                </Pressable>
                {hasHfToken && (
                  <Pressable
                    onPress={analyzeCloud}
                    disabled={cloudAnalyzing}
                    className="flex-1 flex-row items-center justify-center gap-2 border border-border py-2 active:opacity-70"
                  >
                    {cloudAnalyzing ? (
                      <ActivityIndicator size={13} color={C.cyan} />
                    ) : (
                      <Cloud size={13} color={C.cyan} strokeWidth={1.5} />
                    )}
                    <Text className="font-mono text-[10px] font-bold" style={{ color: C.cyan }}>
                      {cloudAnalyzing ? "云端分析中…" : "☁ 云端重分析"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Panel>

            {/* 七维评分 */}
            <Panel title="03 · 评分维度 DIMENSIONS">
              <View className="p-3 gap-3">
                {result.dimensions.map((d) => (
                  <View key={d.key} className="gap-1.5">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-mono text-xs font-bold text-foreground">{d.label}</Text>
                        <Text className="font-mono text-[10px] text-muted-foreground">{d.labelEn}</Text>
                      </View>
                      <Text className="font-mono text-xs font-bold" style={{ color: gradeColor }}>
                        {d.score}<Text className="text-muted-foreground">/{d.max}</Text>
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <ScoreBar score={d.score} max={d.max} color={gradeColor} />
                    </View>
                    <Text className="font-mono text-[10px] text-muted-foreground">{d.desc}</Text>
                  </View>
                ))}
              </View>
            </Panel>

            {/* 问题检测 */}
            {result.issues.length > 0 && (
              <Panel title="04 · 问题检测 ISSUES">
                <Pressable onPress={() => setShowIssues((v) => !v)}
                  className="flex-row items-center justify-between p-3 active:opacity-70">
                  <View className="flex-row items-center gap-2">
                    <AlertTriangle size={14} color={C.orange} strokeWidth={1.5} />
                    <Text className="font-mono text-xs font-bold text-foreground">
                      发现 {result.issues.length} 个问题
                    </Text>
                  </View>
                  {showIssues
                    ? <ChevronUp size={16} color={C.muted} />
                    : <ChevronDown size={16} color={C.muted} />}
                </Pressable>
                {showIssues && (
                  <View className="border-t border-border p-3 gap-2">
                    {result.issues.map((issue, i) => (
                      <Text key={i} className="font-mono text-[11px] leading-5 text-foreground">
                        {issue}
                      </Text>
                    ))}
                  </View>
                )}
              </Panel>
            )}

            {/* AI 专业建议 */}
            <Panel title="05 · AI 专业建议 SUGGESTIONS">
              <Pressable onPress={() => setShowSuggest((v) => !v)}
                className="flex-row items-center justify-between p-3 active:opacity-70">
                <View className="flex-row items-center gap-2">
                  <TrendingUp size={14} color={C.cyan} strokeWidth={1.5} />
                  <Text className="font-mono text-xs font-bold text-foreground">
                    {result.suggestions.length} 条专业建议
                  </Text>
                </View>
                {showSuggest
                  ? <ChevronUp size={16} color={C.muted} />
                  : <ChevronDown size={16} color={C.muted} />}
              </Pressable>
              {showSuggest && (
                <View className="border-t border-border p-3 gap-2.5">
                  {result.suggestions.map((s, i) => (
                    <Text key={i} className="font-mono text-[11px] leading-5 text-foreground">
                      {s}
                    </Text>
                  ))}
                </View>
              )}
            </Panel>

            {/* 自动修复参数 */}
            {result.autoFix.length > 0 && (
              <Panel title="06 · 自动优化参数 AUTO-FIX">
                <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
                  <View className="flex-row items-center gap-2">
                    <Zap size={13} color={C.orange} strokeWidth={1.5} />
                    <Text className="font-mono text-[10px] text-muted-foreground">
                      AI 建议 {result.autoFix.length} 项优化，一键应用到转换参数
                    </Text>
                  </View>
                  {appliedFixes.size < result.autoFix.length && (
                    <Pressable onPress={applyAll} className="active:opacity-70">
                      <Text className="font-mono text-[10px] font-bold text-primary">全部应用</Text>
                    </Pressable>
                  )}
                </View>
                {result.autoFix.map((fix) => (
                  <AutoFixRow
                    key={fix.param}
                    label={fix.label}
                    current={fix.currentValue}
                    suggested={fix.suggestedValue}
                    reason={fix.reason}
                    applied={appliedFixes.has(fix.param)}
                    onApply={() => applyFix(fix.param, fix.suggestedValue)}
                  />
                ))}
                {appliedFixes.size > 0 && (
                  <View className="flex-row items-center gap-2 p-3">
                    <CheckCircle2 size={14} color={C.cyan} />
                    <Text className="font-mono text-[10px] text-cyan">
                      已应用 {appliedFixes.size} 项优化 → 转换时将自动使用新参数
                    </Text>
                  </View>
                )}
              </Panel>
            )}

            {/* 满分提示 */}
            {result.autoFix.length === 0 && (
              <View className="flex-row items-center gap-3 border border-border bg-card p-3">
                <Star size={18} color={C.cyan} strokeWidth={1.5} />
                <Text className="flex-1 font-mono text-[10px] leading-4 text-muted-foreground">
                  当前文件各项参数已达最优，无需调整。可直接用于专业发行。
                </Text>
              </View>
            )}

            {/* 重新评级 */}
            <Pressable onPress={() => { setResult(null); setAppliedFixes(new Set()); }}
              className="flex-row items-center justify-center gap-2 border border-border py-3 active:opacity-70">
              <Sparkles size={14} color={C.muted} />
              <Text className="font-mono text-[10px] text-muted-foreground">重新评级</Text>
            </Pressable>
          </>
        )}

        {/* 无文件空状态 */}
        {!targetFile && !analyzing && (
          <EmptyState
            icon={<Star size={40} color={C.muted} strokeWidth={1} />}
            title="请选择评级文件"
            desc="从文件库选择或导入新文件，AI 将分析音质并给出专业建议"
          />
        )}
      </ScrollView>
    </View>
  );
}
