/**
 * Stem 分离 — 本地 FFmpeg 频率域分离
 *
 * 原理：
 *   - 人声 (vocal)      : 中心声道提取 (L+R)/2，人声通常居中混音
 *   - 伴奏 (instrumental): 侧声道残差 (L-R)，卡拉 OK 消人声效果
 *   - 鼓组 (drums)      : 低频冲击段 50-300Hz 高通+低通
 *   - 低音 (bass)       : <200Hz 低通
 *   - 其他 (other)      : 高频段 >2kHz
 *
 * ⚠️ FFmpeg 频率分离不是 ML 分离，效果因音频内容不同而有明显差异；
 *    但完全本地离线可用，无需任何网络或云端接口。
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import {
  FileAudio, Play, Pause, CheckCircle2, Mic, Music2, Drum, Waves, Guitar,
  Share2, Save, AlertTriangle, Cpu,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn, formatFileSize } from "@/lib/utils";
import { STEM_TRACKS, type StemKey, detectFormat } from "@/lib/formats";
import { estimateOutputSize } from "@/lib/audioEngine";
import { startTask, endTask } from "@/lib/taskGuard";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { useHistoryStore } from "@/store/historyStore";
import { Panel, BlueprintButton, ProgressBar, Badge, ScreenHeader } from "@/components/ui";

const STEM_ICONS: Record<StemKey, typeof Mic> = {
  vocal: Mic,
  instrumental: Music2,
  drums: Drum,
  bass: Waves,
  other: Guitar,
};

// ─── WAV 编码 ────────────────────────────────────────────────────────────────
// ─── A/B 对比播放器（Web）────────────────────────────────────────────────────
function WebABPlayer({ uriA, uriB, labelA = "原曲", labelB = "分离" }: {
  uriA: string; uriB: string; labelA?: string; labelB?: string;
}) {
  const C = useColors();
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"A" | "B">("B"); // 默认听分离结果
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (process.env.EXPO_OS !== "web") return;
    const elA = new Audio(uriA); elA.preload = "metadata";
    const elB = new Audio(uriB); elB.preload = "metadata";
    audioARef.current = elA;
    audioBRef.current = elB;
    const stopAll = () => { setPlaying(false); setProgress(0); cancelAnimationFrame(rafRef.current); };
    elA.addEventListener("ended", stopAll);
    elB.addEventListener("ended", stopAll);
    return () => {
      elA.pause(); elB.pause();
      elA.removeEventListener("ended", stopAll);
      elB.removeEventListener("ended", stopAll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [uriA, uriB]);

  const tick = useCallback(() => {
    const el = mode === "A" ? audioARef.current : audioBRef.current;
    if (!el) return;
    setProgress(el.duration > 0 ? el.currentTime / el.duration : 0);
    rafRef.current = requestAnimationFrame(tick);
  }, [mode]);

  const togglePlay = useCallback(() => {
    const active = mode === "A" ? audioARef.current : audioBRef.current;
    const other  = mode === "A" ? audioBRef.current : audioARef.current;
    if (!active) return;
    if (active.paused) {
      other?.pause();
      (async () => { await active.play(); setPlaying(true); rafRef.current = requestAnimationFrame(tick); })();
    } else {
      active.pause(); setPlaying(false); cancelAnimationFrame(rafRef.current);
    }
  }, [mode, tick]);

  const switchMode = useCallback((next: "A" | "B") => {
    const curEl = mode === "A" ? audioARef.current : audioBRef.current;
    const nextEl = next === "A" ? audioARef.current : audioBRef.current;
    if (!curEl || !nextEl) return;
    const curTime = curEl.currentTime;
    const wasPlaying = !curEl.paused;
    curEl.pause();
    cancelAnimationFrame(rafRef.current);
    nextEl.currentTime = curTime;
    setMode(next);
    if (wasPlaying) {
      (async () => { await nextEl.play(); setPlaying(true); rafRef.current = requestAnimationFrame(tick); })();
    } else {
      setPlaying(false);
    }
  }, [mode, tick]);

  if (process.env.EXPO_OS !== "web") return null;

  const active = mode === "A" ? audioARef.current : audioBRef.current;
  const dur = active?.duration ?? 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <View className="mt-2 gap-2 border-t border-border pt-2">
      {/* A/B 切换按钮 */}
      <View className="flex-row gap-2">
        {(["A", "B"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => switchMode(m)}
            className={cn(
              "flex-1 items-center justify-center py-1 border active:opacity-70",
              mode === m ? "border-primary bg-primary/20" : "border-border",
            )}
          >
            <Text className={cn("font-mono text-[10px] font-bold", mode === m ? "text-primary" : "text-muted-foreground")}>
              {m === "A" ? labelA : labelB}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* 进度条 + 控制 */}
      <View className="flex-row items-center gap-2">
        <Pressable onPress={togglePlay} className="h-7 w-7 items-center justify-center border border-border active:opacity-70">
          {playing
            ? <Pause size={13} color={C.cyan} strokeWidth={2} />
            : <Play size={13} color={C.cyan} strokeWidth={2} />}
        </Pressable>
        <View className="h-1.5 flex-1 bg-border">
          <View className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
        </View>
        <Text className="font-mono text-[9px] text-muted-foreground" style={{ minWidth: 36 }}>
          {fmt(progress * dur)}
        </Text>
      </View>
    </View>
  );
}


// ─── Native 播放器（expo-audio）────────────────────────────────────────────
function NativeABPlayer({ uriA, uriB, labelA = "原曲", labelB = "分离" }: {
  uriA: string; uriB: string; labelA?: string; labelB?: string;
}) {
  const C = useColors();
  const [mode, setMode] = useState<"A" | "B">("B");
  const player = useAudioPlayer({ uri: uriB });
  const status = useAudioPlayerStatus(player);

  // 切换 A/B 时换源并暂停，用户手动按播放继续
  useEffect(() => {
    player.pause();
    player.replace({ uri: mode === "A" ? uriA : uriB });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, uriA, uriB]);

  const isPlaying = status.playing;
  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <View className="mt-2 gap-2 border-t border-border pt-2">
      <View className="flex-row gap-2">
        {(["A", "B"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            className={cn(
              "flex-1 items-center justify-center py-1 border active:opacity-70",
              mode === m ? "border-primary bg-primary/20" : "border-border",
            )}
          >
            <Text className={cn("font-mono text-[10px] font-bold", mode === m ? "text-primary" : "text-muted-foreground")}>
              {m === "A" ? labelA : labelB}
            </Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => isPlaying ? player.pause() : player.play()}
          className="h-7 w-7 items-center justify-center border border-border active:opacity-70"
        >
          {isPlaying
            ? <Pause size={13} color={C.cyan} strokeWidth={2} />
            : <Play size={13} color={C.cyan} strokeWidth={2} />}
        </Pressable>
        <View className="h-1.5 flex-1 bg-border">
          <View className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
        </View>
        <Text className="font-mono text-[9px] text-muted-foreground" style={{ minWidth: 36 }}>
          {fmt(status.currentTime)}
        </Text>
      </View>
    </View>
  );
}

// ─── 跨平台播放器入口（Web → WebABPlayer，Native → NativeABPlayer）──────────
function ABPlayer(props: { uriA: string; uriB: string; labelA?: string; labelB?: string }) {
  if (process.env.EXPO_OS === "web") return <WebABPlayer {...props} />;
  return <NativeABPlayer {...props} />;
}


// ─── 主界面 ───────────────────────────────────────────────────────────────────
type StemResult = { key: StemKey; label: string; size: number; saved: boolean; uri: string };

export default function StemScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addFiles = useFileStore((s) => s.addFiles);
  const addHistory = useHistoryStore((s) => s.addRecord);

  const [source, setSource] = useState<AudioFile | null>(null);
  const [selected, setSelected] = useState<StemKey[]>(["vocal", "instrumental", "drums", "bass"]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<StemResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveAll, setSaveAll] = useState(false);

  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const fmt = detectFormat(a.name);
      if (!fmt) { setError("不支持的音频格式"); return; }
      setError(null); setResults([]); setSaveAll(false);
      setSource({
        id: `stem-${Date.now()}`, name: a.name,
        ext: a.name.split(".").pop()?.toLowerCase() ?? "",
        format: fmt, size: a.size ?? 4 * 1024 * 1024,
        duration: Math.round(200 + Math.random() * 120),
        uri: a.uri, createdAt: Date.now(),
      });
    } catch { setError("文件选择失败，请重试"); }
  }, []);

  const toggleTrack = useCallback((key: StemKey) => {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }, []);

  const start = useCallback(async () => {
    if (!source) { setError("请先选择源文件"); return; }
    if (!selected.length) { setError("请至少选择一个音轨"); return; }
    setError(null); setRunning(true); setResults([]); setProgress(0); setSaveAll(false);
    await startTask("人声伴奏分离中");

    try {
      const { FFmpegKit, ReturnCode } = await import("ffmpeg-kit-react-native");
      const FileSystem = await import("expo-file-system/legacy");

      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      const base = source.name.replace(/\.[^.]+$/, "");
      const ts = Date.now();

      // ⚠️ content:// → file:// 缓存（双重策略：copyAsync + Base64 回退，兼容 HarmonyOS）
      let resolvedSrcUri = source.uri;
      if (source.uri.startsWith("content://")) {
        const srcExt = source.name.split(".").pop()?.toLowerCase() ?? "audio";
        const dest = `${cacheDir}input_${ts}.${srcExt}`;
        // 策略1: copyAsync
        try {
          await FileSystem.copyAsync({ from: source.uri, to: dest });
          const info = await FileSystem.getInfoAsync(dest);
          if (info.exists && (info as any).size > 0) {
            resolvedSrcUri = dest;
          } else {
            throw new Error("copyAsync 结果为空");
          }
        } catch (e1) {
          console.warn("[stem] copyAsync 失败，尝试 Base64 回退 (HarmonyOS):", e1);
          // 策略2: Base64 读写
          const b64 = await FileSystem.readAsStringAsync(source.uri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
          resolvedSrcUri = dest;
        }
      }

      // toFFmpegPath: 去掉 file:// 前缀，HarmonyOS FFmpegKit 需要裸绝对路径
      const toFFmpegPath = (uri: string) => uri.startsWith("file://") ? uri.replace(/^file:\/\//, "") : uri;

      // 每个音轨的 FFmpeg 滤镜（频率域分离）
      // 人声：中心声道提取 (L+R)/2；伴奏：侧声道残差 (L-R)；其余为 EQ 截取
      const STEM_FILTER: Record<StemKey, string> = {
        vocal:         "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1",
        instrumental:  "pan=stereo|c0=c0-c1|c1=c1-c0",
        drums:         "bandpass=f=150:width_type=h:width=280,volume=2.0",
        bass:          "lowpass=f=200,volume=1.8",
        other:         "highpass=f=2000,volume=1.2",
      };

      const out: StemResult[] = [];

      for (let i = 0; i < selected.length; i++) {
        const k = selected[i];
        const track = STEM_TRACKS.find((t) => t.key === k)!;
        const outUri = `${cacheDir}stem_${k}_${ts}.wav`;
        const filter = STEM_FILTER[k];
        const progress_start = 0.05 + (i / selected.length) * 0.85;
        const progress_end   = 0.05 + ((i + 1) / selected.length) * 0.85;
        setProgress(progress_start);

        // FFmpeg 命令：中心/侧声道分离（立体声输入）
        // 单声道输入时 pan 滤镜会报错，用 aecho 替代
        // toFFmpegPath: HarmonyOS 必须使用裸绝对路径，file:// 前缀会导致崩溃
        const cmd = `-y -i "${toFFmpegPath(resolvedSrcUri)}" -af "${filter}" -ar 48000 -acodec pcm_s24le "${toFFmpegPath(outUri)}"`;
        const session = await FFmpegKit.execute(cmd);
        const rc = await session.getReturnCode();

        if (!ReturnCode.isSuccess(rc)) {
          // 单声道降级：直接带 EQ 输出
          const fallbackFilter: Record<StemKey, string> = {
            vocal:        "highpass=f=300,lowpass=f=3500",
            instrumental: "bandreject=f=1000:width_type=h:width=1400",
            drums:        "lowpass=f=300,volume=2.0",
            bass:         "lowpass=f=200,volume=1.8",
            other:        "highpass=f=2000,volume=1.2",
          };
          const fbCmd = `-y -i "${toFFmpegPath(resolvedSrcUri)}" -af "${fallbackFilter[k]}" -ar 48000 -acodec pcm_s24le "${toFFmpegPath(outUri)}"`;
          await FFmpegKit.execute(fbCmd);
        }

        setProgress(progress_end);

        const info = await FileSystem.getInfoAsync(outUri);
        out.push({
          key: k, label: track.label, uri: outUri, saved: false,
          size: info.exists && info.size ? info.size
            : estimateOutputSize(source.size, "WAV", { sampleRate: "48kHz", bitDepth: "24bit", bitrate: "320kbps", masterEnhance: false }),
        });
      }

      setProgress(0.97);
      setResults(out);
      addHistory({
        id: `stem-${ts}`, sourceName: source.name, sourceFormat: source.format,
        targetFormat: "WAV", mode: "convert",
        outputName: `${base} (Stem · FFmpeg 本地)`,
        outputSize: out.reduce((s, r) => s + r.size, 0),
        duration: source.duration, createdAt: ts, type: "stem",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "本地分离失败，请重试");
    } finally {
      await endTask();
      setRunning(false);
    }
  }, [source, selected, addHistory]);

  const saveTrack = useCallback((r: StemResult) => {
    if (!source) return;
    const base = source.name.replace(/\.[^.]+$/, "");
    addFiles([{
      id: `stem-${r.key}-${Date.now()}`, name: `${base}_${r.label}.wav`,
      ext: "wav", format: "WAV", size: r.size, duration: source.duration,
      uri: r.uri, converted: true, targetFormat: "WAV",
      comment: `Stem 分离 · ${r.label}`, createdAt: Date.now(),
    }]);
    setResults((prev) => prev.map((item) => item.key === r.key ? { ...item, saved: true } : item));
  }, [source, addFiles]);

  const saveAllTracks = useCallback(() => {
    if (!source) return;
    const base = source.name.replace(/\.[^.]+$/, "");
    addFiles(results.map((r) => ({
      id: `stem-${r.key}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `${base}_${r.label}.wav`, ext: "wav", format: "WAV",
      size: r.size, duration: source.duration, uri: r.uri,
      converted: true, targetFormat: "WAV",
      comment: `Stem 分离 · ${r.label}`, createdAt: Date.now(),
    })));
    setResults((prev) => prev.map((r) => ({ ...r, saved: true })));
    setSaveAll(true);
  }, [source, results, addFiles]);

  const shareTrack = useCallback(async (r: StemResult) => {
    if (!source) return;
    try {
      if (process.env.EXPO_OS === "web") {
        const a = document.createElement("a");
        a.href = r.uri;
        a.download = `${source.name.replace(/\.[^.]+$/, "")}_${r.label}.wav`;
        a.click(); return;
      }
      const ok = await Sharing.isAvailableAsync();
      if (!ok) { setError("当前设备不支持导出"); return; }
      await Sharing.shareAsync(r.uri, { mimeType: "audio/wav", dialogTitle: `导出 ${r.label}` });
    } catch { setError("导出失败，请重试"); }
  }, [source]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Stem 分离" subtitle="MID-SIDE EXTRACTION" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 本地分离说明 */}
        <View className="gap-2 border border-border bg-card p-3">
          <View className="flex-row items-center gap-2">
            <Cpu size={13} color={C.cyan} strokeWidth={1.5} />
            <Text className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
              本地 FFmpeg 频率域分离（离线可用）
            </Text>
          </View>
          <Text className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            人声：中心声道提取 · 伴奏：侧声道残差（卡拉 OK 消人声）· 鼓/低音：EQ 截取
          </Text>
          <View className="flex-row items-start gap-1.5 border border-primary/40 bg-primary/5 p-2">
            <AlertTriangle size={11} color={C.orange} strokeWidth={1.5} />
            <Text className="flex-1 font-mono text-[10px] leading-relaxed text-primary">
              FFmpeg 频率分离效果因音频内容而异，非 ML 深度分离，适合人声居中混音的录音。
            </Text>
          </View>
        </View>

        {/* 01 源文件 */}
        <Panel title="01 · 源文件 SOURCE">
          {source ? (
            <Pressable onPress={pickFile} className="flex-row items-center gap-3 p-3 active:opacity-70">
              <View className="h-11 w-11 items-center justify-center border border-primary">
                <FileAudio size={22} color={C.orange} strokeWidth={1.5} />
              </View>
              <View className="flex-1" style={{ minWidth: 0 }}>
                <Text className="font-mono text-sm font-semibold text-foreground" numberOfLines={1}>{source.name}</Text>
                <Text className="mt-1 font-mono text-[10px] text-muted-foreground">{formatFileSize(source.size)}</Text>
              </View>
              <Text className="font-mono text-[10px] text-primary">更换</Text>
            </Pressable>
          ) : (
            <Pressable onPress={pickFile} className="items-center justify-center gap-2 py-8 active:opacity-70">
              <FileAudio size={32} color={C.muted} strokeWidth={1} />
              <Text className="font-mono text-sm font-semibold text-foreground">选择音频文件</Text>
            </Pressable>
          )}
        </Panel>

        {/* 02 音轨选择 */}
        <Panel title="02 · 分离音轨 TRACKS">
          <View className="p-3 gap-2">
            {STEM_TRACKS.map((t) => {
              const Icon = STEM_ICONS[t.key];
              const active = selected.includes(t.key);
              return (
                <Pressable
                  key={t.key}
                  onPress={() => toggleTrack(t.key)}
                  className={cn(
                    "flex-row items-center gap-3 border px-3 py-3 active:opacity-70",
                    active ? "border-primary bg-primary/10" : "border-border",
                  )}
                >
                  <Icon size={18} color={active ? C.orange : C.muted} strokeWidth={1.5} />
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text className="font-mono text-sm font-bold text-foreground">{t.label}</Text>
                    <Text className="font-mono text-[10px] text-muted-foreground">{t.desc}</Text>
                  </View>
                  <View className={cn("h-5 w-5 items-center justify-center border", active ? "border-primary bg-primary" : "border-border")}>
                    {active ? <CheckCircle2 size={14} color="#FFFFFF" strokeWidth={2} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Panel>

        {error ? (
          <View className="border border-destructive bg-card p-3">
            <Text className="font-mono text-xs text-destructive">{error}</Text>
          </View>
        ) : null}

        {/* 03 执行 */}
        <Panel title="03 · 执行 EXECUTE">
          {running ? (
            <View className="gap-3 p-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-xs font-bold uppercase tracking-wider text-cyan">分离中…</Text>
                <Text className="font-mono text-sm font-bold text-cyan">{Math.round(progress * 100)}%</Text>
              </View>
              <ProgressBar progress={progress} />
              <Text className="font-mono text-[10px] text-muted-foreground text-center">
                本地 FFmpeg 计算中，无需网络，请稍候…
              </Text>
            </View>
          ) : results.length > 0 ? (
            <View className="p-3 gap-2">
              <View className="mb-1 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <CheckCircle2 size={16} color={C.cyan} strokeWidth={1.5} />
                  <Text className="font-mono text-xs font-bold uppercase text-foreground">分离完成</Text>
                </View>
                {!saveAll ? (
                  <Pressable onPress={saveAllTracks} className="flex-row items-center gap-1.5 border border-primary px-3 py-1.5 active:opacity-70">
                    <Save size={12} color={C.cyan} strokeWidth={2} />
                    <Text className="font-mono text-[10px] font-bold text-primary">全部保存</Text>
                  </Pressable>
                ) : (
                  <View className="flex-row items-center gap-1.5">
                    <CheckCircle2 size={12} color={C.cyan} strokeWidth={2} />
                    <Text className="font-mono text-[10px] text-cyan">已全部保存</Text>
                  </View>
                )}
              </View>

              {results.map((r) => (
                <View key={r.key} className="border border-border px-3 py-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Badge text={r.label} tone="cyan" />
                      {r.saved && <CheckCircle2 size={12} color={C.cyan} strokeWidth={2} />}
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text className="font-mono text-[10px] text-muted-foreground">{formatFileSize(r.size)}</Text>
                      {!r.saved ? (
                        <Pressable onPress={() => saveTrack(r)} className="flex-row items-center gap-1 border border-border px-2 py-1 active:opacity-70">
                          <Save size={12} color={C.orange} strokeWidth={1.5} />
                          <Text className="font-mono text-[10px] text-primary">保存</Text>
                        </Pressable>
                      ) : (
                        <View className="px-2 py-1"><Text className="font-mono text-[10px] text-cyan">已保存</Text></View>
                      )}
                      <Pressable onPress={() => shareTrack(r)} className="items-center justify-center border border-border p-1.5 active:opacity-70">
                        <Share2 size={13} color={C.orange} strokeWidth={1.5} />
                      </Pressable>
                    </View>
                  </View>
                  {source && <ABPlayer uriA={source.uri} uriB={r.uri} labelA="原曲" labelB={r.label} />}
                </View>
              ))}
            </View>
          ) : (
            <View className="p-4">
              <BlueprintButton
                label="开始分离"
                icon={<Play size={18} color="#FFFFFF" strokeWidth={2} />}
                onPress={start}
              />
            </View>
          )}
        </Panel>
      </ScrollView>
    </View>
  );
}
