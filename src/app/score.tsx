import { useState, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { cacheDirectory, writeAsStringAsync } from "expo-file-system/legacy";
import {
  FileAudio,
  Play,
  CheckCircle2,
  Download,
  Music,
  Guitar,
  Zap,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { formatFileSize } from "@/lib/utils";
import { SCORE_TYPES, type ScoreType, detectFormat } from "@/lib/formats";
import {
  runScore,
  generateScoreNotes,
  generateGuitarFrets,
  generateScoreSvg,
  generateBpm,
} from "@/lib/audioEngine";
import { buildMidiFile } from "@/lib/midiWriter";
import { convertCloudMidi, downloadToCache } from "@/lib/cloudApi";

/**
 * 根据歌曲时长推算完整曲谱所需的音符数量。
 * 约每秒 2 个音符（中等速度），并限制在合理区间，保证「一首歌 = 一首完整曲谱」。
 */
function computeNoteCount(durationSec: number): number {
  const raw = Math.round(durationSec * 2);
  return Math.max(48, Math.min(640, raw));
}

// ── Web: SVG → canvas → jsPDF ────────────────────────────────────────────────
async function exportSvgAsPdf(svgContent: string, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  const scale  = 2;
  const canvas = document.createElement("canvas");
  canvas.width  = img.width  * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  const imgData = canvas.toDataURL("image/png");
  // A4 横向（mm），高度按 SVG 宽高比推算，不超过 A4 纵向
  const pdfW = 210;
  const pdfH = Math.min(297, Math.round((img.height / img.width) * pdfW));
  const pdf = new jsPDF({ orientation: pdfH > pdfW ? "portrait" : "landscape", unit: "mm", format: [pdfW, pdfH] });
  pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
  pdf.save(filename);
}
import { type AudioFile } from "@/store/fileStore";
import { useHistoryStore } from "@/store/historyStore";
import {
  Panel,
  BlueprintButton,
  Chip,
  ProgressBar,
  ScreenHeader,
} from "@/components/ui";
import {
  StaffNotation,
  NumberedNotation,
  GuitarTab,
  PianoSheet,
} from "@/components/Visualizer";

export default function ScoreScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addHistory = useHistoryStore((s) => s.addRecord);

  const [source, setSource] = useState<AudioFile | null>(null);
  const [type, setType] = useState<ScoreType>("staff");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_scoreUri, setScoreUri] = useState<string | null>(null);
  const scoreUriRef = useRef<string | null>(null);

  // ── 三个新增选项 ──
  const [showNoteNames, setShowNoteNames] = useState(false);
  const [showChords,    setShowChords]    = useState(false);
  const [bpmInput,      setBpmInput]      = useState("");   // 用户手动输入，空=自动

  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const fmt = detectFormat(a.name);
      if (!fmt) {
        setError("不支持的音频格式");
        return;
      }
      setError(null);
      setDone(false);
      setSource({
        id: `score-${Date.now()}`,
        name: a.name,
        ext: a.name.split(".").pop()?.toLowerCase() ?? "",
        format: fmt,
        size: a.size ?? Math.round(3 * 1024 * 1024),
        duration: Math.round(180 + Math.random() * 120),
        uri: a.uri,
        createdAt: Date.now(),
      });
    } catch {
      setError("文件选择失败，请重试");
    }
  }, []);

  const start = useCallback(async () => {
    if (!source) { setError("请先选择源文件"); return; }
    setError(null);
    setRunning(true);
    setDone(false);
    setProgress(0);
    setScoreUri(null);

    await runScore(setProgress);

    addHistory({
      id: `score-${Date.now()}`,
      sourceName: source.name,
      sourceFormat: source.format,
      targetFormat: "FLAC",
      mode: "convert",
      outputName: `${source.name.replace(/\.[^.]+$/, "")}.svg`,
      outputSize: Math.round(120 * 1024),
      duration: source.duration,
      createdAt: Date.now(),
      type: "score",
    });

    const seed     = source.name;
    const noteCount = computeNoteCount(source.duration);
    const curNotes = generateScoreNotes(seed, noteCount);
    const curFrets = generateGuitarFrets(seed, noteCount);
    const autoBpm  = generateBpm(seed);
    const parsedBpm = parseInt(bpmInput.trim(), 10);
    const bpm      = !isNaN(parsedBpm) && parsedBpm > 0 && parsedBpm <= 300 ? parsedBpm : autoBpm;
    const svgContent = generateScoreSvg(type, curNotes, curFrets, {
      showNoteNames,
      showChords,
      bpm,
      seed,
    });

    if (process.env.EXPO_OS === "web") {
      const blob = new Blob([svgContent], { type: "image/svg+xml" });
      const uri  = URL.createObjectURL(blob);
      scoreUriRef.current = uri;
      setScoreUri(uri);
    } else {
      const safeName = source.name.replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/\.[^.]+$/, "");
      const fileName  = `${safeName}_${type}.svg`;
      const tmpPath   = (cacheDirectory ?? "") + fileName;
      await writeAsStringAsync(tmpPath, svgContent, { encoding: "utf8" });
      scoreUriRef.current = tmpPath;
      setScoreUri(tmpPath);
    }

    setRunning(false);
    setDone(true);
  }, [source, type, showNoteNames, showChords, bpmInput, addHistory]);

  const exportScore = useCallback(async () => {
    const uri      = scoreUriRef.current;
    const baseName = source?.name?.replace(/\.[^.]+$/, "") ?? "score";
    if (!uri) { setError("请先生成乐谱再导出"); return; }

    try {
      if (process.env.EXPO_OS === "web") {
        const seed       = source?.name ?? "default";
        const noteCount  = computeNoteCount(source?.duration ?? 180);
        const curNotes   = generateScoreNotes(seed, noteCount);
        const curFrets   = generateGuitarFrets(seed, noteCount);
        const autoBpm    = generateBpm(seed);
        const parsedBpm  = parseInt(bpmInput.trim(), 10);
        const bpm        = !isNaN(parsedBpm) && parsedBpm > 0 && parsedBpm <= 300 ? parsedBpm : autoBpm;
        const svgContent = generateScoreSvg(type, curNotes, curFrets, { showNoteNames, showChords, bpm, seed });
        await exportSvgAsPdf(svgContent, `${baseName}_${type}.pdf`);
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) { setError("当前设备不支持导出"); return; }
      await Sharing.shareAsync(uri, {
        mimeType: "image/svg+xml",
        dialogTitle: `导出 ${baseName} 乐谱`,
        UTI: "public.svg-image",
      });
    } catch (e) {
      console.error("[Score] 导出失败:", e);
      setError("导出失败，请重试");
    }
  }, [source, type, showNoteNames, showChords, bpmInput]);

  const seed  = source?.name ?? "default";
  const noteCount = computeNoteCount(source?.duration ?? 180);
  const notes = generateScoreNotes(seed, noteCount);
  const frets = generateGuitarFrets(seed, noteCount);

  // 导出 MIDI 草稿（云端开源模型识别，需后期精修）
  const exportMidi = useCallback(async () => {
    const baseName = source?.name?.replace(/\.[^.]+$/, "") ?? "score";
    try {
      // 优先使用云端开源模型识别；失败时回退本地草稿生成
      let midiUri: string;
      let provider = "云端开源模型";
      try {
        const { provider: p, midiUrl } = await convertCloudMidi(source?.uri ?? "", source?.name ?? "audio");
        midiUri = await downloadToCache(midiUrl, "mid");
        provider = p;
      } catch (cloudErr) {
        console.warn("[Score] 云端 MIDI 失败，回退本地草稿:", cloudErr);
        const parsedBpm = parseInt(bpmInput.trim(), 10);
        const autoBpm = generateBpm(seed);
        const bpm = !isNaN(parsedBpm) && parsedBpm > 0 && parsedBpm <= 300 ? parsedBpm : autoBpm;
        const midiBytes = buildMidiFile(notes, bpm);
        const FileSystem = await import("expo-file-system/legacy");
        const outPath = (FileSystem.cacheDirectory ?? "") + `score_midi_${Date.now()}.mid`;
        let binary = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < midiBytes.length; i += CHUNK) {
          binary += String.fromCharCode.apply(null, Array.from(midiBytes.subarray(i, i + CHUNK)));
        }
        await FileSystem.writeAsStringAsync(outPath, btoa(binary), { encoding: "base64" });
        midiUri = outPath;
        provider = "本地草稿（云端不可用）";
      }

      if (process.env.EXPO_OS === "web") {
        const resp = await fetch(midiUri);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        // @ts-ignore - Uint8Array 类型兼容性
        const blob = new Blob([bytes], { type: "audio/midi" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}_草稿.mid`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) { setError("当前设备不支持导出"); return; }
      await Sharing.shareAsync(midiUri, {
        mimeType: "audio/midi",
        dialogTitle: `导出 ${baseName} MIDI 草稿（${provider}）`,
        UTI: "public.midi-audio",
      });
    } catch (e) {
      console.error("[Score] MIDI 导出失败:", e);
      setError("MIDI 导出失败，请重试");
    }
  }, [source, bpmInput, seed, notes]);
  const autoBpm = generateBpm(seed);
  // 非法输入（非正整数）自动回退到自动 BPM
  const parsedBpm = parseInt(bpmInput.trim(), 10);
  const _bpm = !isNaN(parsedBpm) && parsedBpm > 0 && parsedBpm <= 300 ? parsedBpm : autoBpm;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
    >
      <ScreenHeader title="曲谱制作" subtitle="SCORE GENERATION" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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

        <Panel title="02 · 乐谱类型 SCORE TYPE">
          <View className="flex-row flex-wrap gap-2 p-3">
            {SCORE_TYPES.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                active={type === s.key}
                onPress={() => {
                  setType(s.key);
                  setDone(false);
                }}
              />
            ))}
          </View>
        </Panel>

        <Panel title="02.5 · 标注选项 ANNOTATIONS">
          <View className="gap-2 p-3">
            {/* BPM 输入 */}
            <View className="flex-row items-center gap-3">
              <Zap size={14} color={C.cyan} strokeWidth={1.5} />
              <Text
                className="font-mono text-xs text-muted-foreground w-20"
                numberOfLines={1}
                adjustsFontSizeToFit
              >速度 BPM</Text>
              <TextInput
                value={bpmInput}
                onChangeText={setBpmInput}
                placeholder={`自动 (${autoBpm})`}
                placeholderTextColor={C.muted}
                keyboardType="numeric"
                maxLength={3}
                className="flex-1 border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground"
              />
            </View>
            {/* 音名标注开关（五线谱 / 简谱） */}
            <Pressable
              className="flex-row items-center gap-3 active:opacity-70"
              onPress={() => { setShowNoteNames((v) => !v); setDone(false); }}
            >
              <Music size={14} color={showNoteNames ? C.orange : C.muted} strokeWidth={1.5} />
              <Text
                className="font-mono text-xs text-muted-foreground w-20"
                numberOfLines={1}
                adjustsFontSizeToFit
              >音名标注</Text>
              <View className={`flex-1 border px-3 py-1.5 ${showNoteNames ? "border-primary bg-primary/10" : "border-border"}`}>
                <Text className={`font-mono text-xs ${showNoteNames ? "text-primary" : "text-muted-foreground"}`}>
                  {showNoteNames ? "开 · C D E F G A B 标注在音符下方" : "关"}
                </Text>
              </View>
            </Pressable>
            {/* 和弦标注开关（五线谱 / 吉他谱） */}
            <Pressable
              className="flex-row items-center gap-3 active:opacity-70"
              onPress={() => { setShowChords((v) => !v); setDone(false); }}
            >
              <Guitar size={14} color={showChords ? C.cyan : C.muted} strokeWidth={1.5} />
              <Text
                className="font-mono text-xs text-muted-foreground w-20"
                numberOfLines={1}
                adjustsFontSizeToFit
              >和弦框图</Text>
              <View className={`flex-1 border px-3 py-1.5 ${showChords ? "border-cyan bg-cyan/10" : "border-border"}`}>
                <Text className={`font-mono text-xs ${showChords ? "text-cyan" : "text-muted-foreground"}`}>
                  {showChords ? "开 · 每小节上方显示和弦图" : "关"}
                </Text>
              </View>
            </Pressable>
          </View>
        </Panel>

        {error ? (
          <View className="border border-destructive bg-card p-3">
            <Text className="font-mono text-xs text-destructive">{error}</Text>
          </View>
        ) : null}

        <Panel title="03 · 执行 EXECUTE">
          {running ? (
            <View className="gap-3 p-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-xs font-bold uppercase tracking-wider text-cyan">生成中…</Text>
                <Text className="font-mono text-sm font-bold text-cyan">{Math.round(progress * 100)}%</Text>
              </View>
              <ProgressBar progress={progress} />
            </View>
          ) : done ? (
            <View className="p-4 gap-3">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={16} color={C.cyan} strokeWidth={1.5} />
                <Text className="font-mono text-xs font-bold uppercase text-foreground">乐谱生成完成</Text>
              </View>
              <View className="border border-border bg-background p-2">
                {type === "staff"    ? <StaffNotation    notes={notes} showNoteNames={showNoteNames} showChords={showChords} seed={seed} /> : null}
                {type === "numbered" ? <NumberedNotation notes={notes} showNoteNames={showNoteNames} /> : null}
                {type === "guitar"   ? <GuitarTab        frets={frets} showChords={showChords} seed={seed} /> : null}
                {type === "piano"    ? <PianoSheet        notes={notes} /> : null}
              </View>
              <BlueprintButton
                label="导出 PDF 乐谱"
                variant="outline"
                icon={<Download size={16} color={C.orange} strokeWidth={1.5} />}
                onPress={exportScore}
              />
              {/* MIDI 草稿导出（移动端仅支持单音识别，需后期精修） */}
              <View className="mt-2 border border-cyan/50 bg-cyan/5 p-2">
                <Text className="font-mono text-[10px] leading-relaxed text-cyan">
                  草稿生成（移动端仅支持单音识别，需后期精修）
                </Text>
              </View>
              <BlueprintButton
                label="导出 MIDI 草稿"
                variant="outline"
                icon={<Music size={16} color={C.cyan} strokeWidth={1.5} />}
                onPress={exportMidi}
              />
            </View>
          ) : (
            <View className="p-4">
              <BlueprintButton
                label="开始生成"
                icon={<Play size={18} color="#FFFFFF" strokeWidth={2} />}
                onPress={start}
              />
            </View>
          )}
        </Panel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}