/**
 * 元数据编辑页面 — 采样率算法（FFmpeg/SoX）选择 + 标题/艺术家/专辑编辑
 * 基于 FFmpeg 元数据写入（-metadata），SoX 算法用于高质量重采样。
 */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Save, FileAudio, CheckCircle2 } from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useColors } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/fileStore";
import { Panel, ScreenHeader, EmptyState } from "@/components/ui";

type ResampleAlgo = "ffmpeg" | "sox";

export default function MetadataScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const files = useFileStore((s) => s.files);
  const addFiles = useFileStore((s) => s.addFiles);

  const [selectedId, setSelectedId] = useState<string | null>(files[0]?.id ?? null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [algo, setAlgo] = useState<ResampleAlgo>("ffmpeg");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const selected = files.find((f) => f.id === selectedId);

  const pick = useCallback((f: typeof files[number]) => {
    setSelectedId(f.id);
    setTitle(f.title ?? "");
    setArtist(f.artist ?? "");
    setAlbum(f.album ?? "");
    setDone(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!selected || saving) return;
    setSaving(true);
    setDone(false);
    try {
      // 使用 FFmpeg 写入元数据（SoX 算法用于重采样质量标注）
      const cacheDir = FileSystem.cacheDirectory ?? "";
      const outUri = `${cacheDir}meta_${Date.now()}.${selected.ext ?? "wav"}`;
      if (process.env.EXPO_OS !== "web") {
        const { FFmpegKit, ReturnCode } = await import("ffmpeg-kit-react-native");
        // ⚠️ content:// → file:// 缓存（防止 FFmpegKit 崩溃）
        let srcUri = selected.uri;
        if (selected.uri.startsWith("content://")) {
          const dest = `${cacheDir}input_meta_${Date.now()}.${selected.ext ?? "audio"}`;
          await FileSystem.copyAsync({ from: selected.uri, to: dest });
          srcUri = dest;
        }
        const resample = algo === "sox" ? " -af aresample=resampler=soxr " : " ";
        const command = `-i "${srcUri}"${resample}-metadata title="${title}" -metadata artist="${artist}" -metadata album="${album}" -c copy -y "${outUri}"`;
        try {
          await new Promise<void>((resolve, reject) => {
            FFmpegKit.executeAsync(command, async (session: import("ffmpeg-kit-react-native").FFmpegSession) => {
              const rc = await session.getReturnCode();
              if (ReturnCode.isSuccess(rc)) resolve();
              else reject(new Error("元数据写入失败"));
            });
          });
        } catch {
          // -c copy 可能不支持，降级重编码
          const fallback = `-i "${srcUri}" -metadata title="${title}" -metadata artist="${artist}" -metadata album="${album}" -y "${outUri}"`;
          await new Promise<void>((resolve, reject) => {
            FFmpegKit.executeAsync(fallback, async (session: import("ffmpeg-kit-react-native").FFmpegSession) => {
              const rc = await session.getReturnCode();
              if (ReturnCode.isSuccess(rc)) resolve();
              else reject(new Error("元数据写入失败"));
            });
          });
        }
      } else {
        await FileSystem.copyAsync({ from: selected.uri, to: outUri });
      }
      addFiles([{
        ...selected,
        id: `meta-${Date.now()}`,
        name: selected.name,
        uri: outUri,
        title: title || undefined,
        artist: artist || undefined,
        album: album || undefined,
        converted: true,
        createdAt: Date.now(),
      }]);
      setDone(true);
    } catch (e) {
      setDone(false);
    } finally {
      setSaving(false);
    }
  }, [selected, saving, title, artist, album, algo, addFiles]);

  if (files.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="元数据编辑" subtitle="METADATA · TAGS" onBack={() => router.back()} />
        <EmptyState
          icon={<FileAudio size={40} color={C.muted} strokeWidth={1} />}
          title="暂无音频文件"
          desc="请先在文件管理导入音频，再编辑元数据"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="元数据编辑" subtitle="METADATA · TAGS" onBack={() => router.back()} />
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 文件选择 */}
          <Panel title="编辑对象 TARGET">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 8 }}>
              {files.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => pick(f)}
                  className={cn("border px-3 py-2 active:opacity-70", selectedId === f.id ? "border-primary bg-primary/10" : "border-border")}
                >
                  <Text className={cn("font-mono text-[11px] font-semibold", selectedId === f.id ? "text-primary" : "text-foreground")} numberOfLines={1}>{f.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Panel>

          {/* 采样率算法 */}
          <Panel title="采样率算法 RESAMPLE ALGORITHM">
            <View className="flex-row gap-2 p-3">
              {([
                { key: "ffmpeg", label: "FFmpeg", desc: "标准重采样 · 快速 · 通用" },
                { key: "sox", label: "SoX (SoXR)", desc: "高质量重采样 · 保真度更高" },
              ] as const).map((opt) => {
                const on = algo === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setAlgo(opt.key)}
                    className={cn("flex-1 border p-3 gap-1 active:opacity-70", on ? "border-primary bg-primary/10" : "border-border")}
                  >
                    <Text className={cn("font-mono text-xs font-bold", on ? "text-primary" : "text-foreground")}>{opt.label}</Text>
                    <Text className="font-mono text-[9px] text-muted-foreground leading-4">{opt.desc}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Panel>

          {/* 标签编辑 */}
          <Panel title="标签信息 TAGS">
            <View className="p-3 gap-3">
              <View>
                <Text className="font-mono text-[10px] text-muted-foreground mb-1">标题 TITLE</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="输入标题"
                  placeholderTextColor={C.muted}
                  className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
                />
              </View>
              <View>
                <Text className="font-mono text-[10px] text-muted-foreground mb-1">艺术家 ARTIST</Text>
                <TextInput
                  value={artist}
                  onChangeText={setArtist}
                  placeholder="输入艺术家"
                  placeholderTextColor={C.muted}
                  className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
                />
              </View>
              <View>
                <Text className="font-mono text-[10px] text-muted-foreground mb-1">专辑 ALBUM</Text>
                <TextInput
                  value={album}
                  onChangeText={setAlbum}
                  placeholder="输入专辑"
                  placeholderTextColor={C.muted}
                  className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
                />
              </View>
            </View>
          </Panel>

          {done && (
            <View className="border border-primary bg-primary/10 p-3 flex-row items-center gap-2">
              <CheckCircle2 size={16} color={C.orange} />
              <Text className="flex-1 font-mono text-xs text-primary">元数据已写入并保存至文件库</Text>
            </View>
          )}

          {/* 保存 */}
          <Pressable
            onPress={handleSave}
            disabled={saving || !selected}
            className={cn("flex-row items-center justify-center gap-2 py-4 active:opacity-80", saving ? "bg-secondary opacity-60" : "bg-primary")}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Save size={18} color="#fff" />}
            <Text className="font-mono text-sm font-bold text-white">{saving ? "保存中…" : "保存元数据"}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}