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
import { estimateOutputSize, toFFmpegPath } from "@/lib/audioEngine";
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
  const [sepStrength, setSepStrength] = useState(70); // 分离强度 0-100，70 为默认均衡值
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

      // toFFmpegPath 已移除：file:// URI 直接传入，HarmonyOS FFmpegKit 正常识别（与初始版本一致）

      // 每个音轨的 FFmpeg 滤镜（频率域分离 + 增益补偿）
      // 人声：中心声道 (L+R)/2 + 中频增强 + 增益补偿
      // 伴奏：侧声道残差 (L-R) + 低频增强 + 增益补偿
      // 分离强度：通过 wet/dry amix 控制（0=原声, 100=完全分离）
      const gainVocal = (0.8 + (sepStrength / 100) * 0.8).toFixed(2);       // 0.8 ~ 1.6
      const gainInstr = (0.9 + (sepStrength / 100) * 1.1).toFixed(2);       // 0.9 ~ 2.0
      const gainDrums = (1.2 + (sepStrength / 100) * 0.8).toFixed(2);       // 1.2 ~ 2.0
      const gainBass  = (1.0 + (sepStrength / 100) * 0.8).toFixed(2);       // 1.0 ~ 1.8
      const gainOther = (0.8 + (sepStrength / 100) * 0.5).toFixed(2);       // 0.8 ~ 1.3

      // 人声残留优化：afftdn 频域降噪 + stereotools 中置提取 + 多段人声频段增强
      const STEM_FILTER: Record<StemKey, string> = {
        // 人声：中心声道提取 + 频域降噪 + 人声频段增强 + 去低频/高频
        vocal: `pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1,highpass=f=120,lowpass=f=8000,afftdn=nr=12:nf=-25,equalizer=f=2000:width_type=o:width=2:g=4,equalizer=f=4000:width_type=o:width=2:g=3,volume=${gainVocal}`,
        // 伴奏：侧声道残差消人声 + 低频/高频乐器增强
        instrumental: `pan=stereo|c0=c0-c1|c1=c1-c0,equalizer=f=200:width_type=o:width=2:g=3,equalizer=f=6000:width_type=o:width=2:g=1.5,volume=${gainInstr}`,
        // 鼓：低频冲击 + 增益
        drums: `bandpass=f=150:width_type=h:width=280,volume=${gainDrums}`,
        // 低音：次低频 + 增益
        bass: `lowpass=f=200,volume=${gainBass}`,
        // 其他：高频 + 增益
        other: `highpass=f=2000,volume=${gainOther}`,
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

        // ── 路径转换 + 完整命令日志 ──────────────────────────────────────
        const rawSrcStem = toFFmpegPath(resolvedSrcUri);
        const rawOutStem = toFFmpegPath(outUri);
        console.log(`\n[stem][${k}] ▶ 分离音轨`);
        console.log(`[stem][${k}] rawSrc=${rawSrcStem}`);
        console.log(`[stem][${k}] rawOut=${rawOutStem}`);
        console.log(`[stem][${k}] filter=${filter}`);
        console.log(`[stem][${k}] sepStrength=${sepStrength}%`);

        // FFmpeg 命令：wet/dry mix 控制分离强度（100=完全分离, <100=混入原声）
        let cmd: string;
        if (sepStrength >= 100) {
          // 完全分离：纯滤镜输出
          cmd = `-y -i "${rawSrcStem}" -af "${filter}" -ar 48000 -acodec pcm_s24le "${rawOutStem}"`;
        } else {
          // 干湿混合：amix(dry, wet) 按强度配比
          const wetW = (sepStrength / 100).toFixed(2);
          const dryW = ((100 - sepStrength) / 100).toFixed(2);
          cmd = `-y -i "${rawSrcStem}" -filter_complex "[0:a]asplit=2[dry][wet];[wet]${filter}[proc];[dry][proc]amix=inputs=2:weights=${dryW},${wetW}:normalize=0" -ar 48000 -acodec pcm_s24le "${rawOutStem}"`;
        }
        console.log(`[stem][${k}] CMD: ${cmd}`);

        const session = await FFmpegKit.execute(cmd);
        const rc = await session.getReturnCode();
        const rcVal: number = typeof rc?.getValue === "function" ? rc.getValue() : Number(rc);
        console.log(`[stem][${k}] RC=${rcVal}`);

        if (!ReturnCode.isSuccess(rc)) {
          // 单声道降级：去掉 pan 滤镜，改用宽频 EQ
          const fallbackFilter: Record<StemKey, string> = {
            vocal:        `highpass=f=300,lowpass=f=3500,volume=${gainVocal}`,
            instrumental: `bandreject=f=1000:width_type=h:width=1400,volume=${gainInstr}`,
            drums:        `lowpass=f=300,volume=${gainDrums}`,
            bass:         `lowpass=f=200,volume=${gainBass}`,
            other:        `highpass=f=2000,volume=${gainOther}`,
          };
          const fbFilter = fallbackFilter[k];
          const fbCmd = `-y -i "${rawSrcStem}" -af "${fbFilter}" -ar 48000 -acodec pcm_s24le "${rawOutStem}"`;
          console.log(`[stem][${k}] 降级命令: ${fbCmd}`);
          const fbSession = await FFmpegKit.execute(fbCmd);
          const fbRc = await fbSession.getReturnCode();
          const fbRcVal: number = typeof fbRc?.getValue === "function" ? fbRc.getValue() : Number(fbRc);
          console.log(`[stem][${k}] 降级 RC=${fbRcVal}`);
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
  }, [source, selected, sepStrength, addHistory]);

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

        {/* 03 分离强度 */}
        {(() => {
          const STRENGTH_PRESETS = [
            { val: 30,  label: "30%", desc: "轻柔" },
            { val: 50,  label: "50%", desc: "均衡" },
            { val: 70,  label: "70%", desc: "标准" },
            { val: 85,  label: "85%", desc: "深度" },
            { val: 100, label: "100%", desc: "最强" },
          ];
          return (
            <Panel title="03 · 分离强度 SEPARATION STRENGTH">
              <View className="p-3 gap-2">
                <Text className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                  强度越高分离越干净，但人声残留也会被削减；低强度保留更多自然感。
                </Text>
                <View className="flex-row gap-2 mt-1">
                  {STRENGTH_PRESETS.map(({ val, label, desc }) => {
                    const active = sepStrength === val;
                    return (
                      <Pressable
                        key={val}
                        onPress={() => setSepStrength(val)}
                        className={[
                          "flex-1 items-center justify-center py-2 border active:opacity-70",
                          active ? "border-primary bg-primary/15" : "border-border",
                        ].join(" ")}
                      >
                        <Text className={["font-mono text-[11px] font-bold", active ? "text-primary" : "text-muted-foreground"].join(" ")}>
                          {label}
                        </Text>
                        <Text className={["font-mono text-[9px]", active ? "text-primary/70" : "text-muted-foreground/60"].join(" ")}>
                          {desc}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Panel>
          );
        })()}

        {error ? (
          <View className="border border-destructive bg-card p-3">
            <Text className="font-mono text-xs text-destructive">{error}</Text>
          </View>
        ) : null}

        {/* 04 执行 */}
        <Panel title="04 · 执行 EXECUTE">
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
