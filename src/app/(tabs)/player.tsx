import { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, ScrollView, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import {
  Play, Pause, SkipBack, SkipForward,
  Repeat, Repeat1, Volume2, ListMusic,
  Music, Disc3, User, AudioLines,
  Disc, StopCircle, CheckCircle2, AlertTriangle,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { cn, formatDuration, formatFileSize } from "@/lib/utils";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { usePlayerStore } from "@/store/playerStore";
import { getFormat } from "@/lib/formats";
import { Badge, EmptyState, ScreenHeader } from "@/components/ui";
import { useMasterRecord } from "@/hooks/useMasterRecord";


type LoopMode = "list" | "single" | "shuffle";

// ── Web: 检查 blob url 是否仍可访问 ──
// ── Web: 检测 URI 是否可播放 ──
// blob URL 不支持 HEAD 请求，改用 Audio 元素加载探测
async function checkUri(uri: string): Promise<boolean> {
  if (process.env.EXPO_OS !== "web") return true;
  if (!uri) return false;
  // http/https 永久 URL 直接认为有效（Supabase Storage）
  if (uri.startsWith("http://") || uri.startsWith("https://")) return true;
  // blob URL：用 Audio 元素 canplaythrough 事件探测可用性
  if (uri.startsWith("blob:")) {
    return new Promise((resolve) => {
      const a = new Audio();
      const onOk = () => { cleanup(); resolve(true); };
      const onErr = () => { cleanup(); resolve(false); };
      function cleanup() {
        a.removeEventListener("canplaythrough", onOk);
        a.removeEventListener("error", onErr);
        a.src = "";
      }
      a.addEventListener("canplaythrough", onOk);
      a.addEventListener("error", onErr);
      a.src = uri;
      // 5 秒超时兜底
      setTimeout(() => { cleanup(); resolve(false); }, 5000);
    });
  }
  // 其他协议（file://）也放行，交给播放器处理
  return true;
}

// ── Web: 获取可播放 URI，对失效 blob 返回 null ──
async function resolveUri(uri: string): Promise<string | null> {
  if (!uri) return null;
  if (process.env.EXPO_OS !== "web") return uri;
  // http/https 永久 URL 直接返回，无需检测
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  if (uri.startsWith("blob:")) {
    const ok = await checkUri(uri);
    return ok ? uri : null;
  }
  // file:// → fetch → blob
  try {
    const { fetch: expoFetch } = await import("expo/fetch");
    const res = await expoFetch(uri);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch { return null; }
}

function SpecRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View className="flex-row items-center gap-1">
      <Text className="font-mono text-[10px] text-muted-foreground">{label}:</Text>
      <Text className={cn("font-mono text-[10px] font-bold", accent ? "text-cyan" : "text-foreground")}>
        {value}
      </Text>
    </View>
  );
}

// ── AudioEngine: key 控制重建，稳定持有 player ──
function AudioEngine({
  uri, volume, autoPlay, onStatus, onPlayer,
}: {
  uri: string;
  volume: number;
  autoPlay: boolean;
  onStatus: (s: { position: number; duration: number; isPlaying: boolean }) => void;
  onPlayer: (p: ReturnType<typeof useAudioPlayer>) => void;
}) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  // ✅ 后台播放模式：iOS 静音不暂停 + 切后台继续播放 + 不抢占其他 App 音频
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "duckOthers",
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { onPlayer(player); }, [player, onPlayer]);

  useEffect(() => {
    onStatus({
      position: status.currentTime ?? 0,
      duration: status.duration ?? 0,
      isPlaying: status.playing ?? false,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.currentTime, status.duration, status.playing]);

  useEffect(() => {
    player.volume = volume;
    if (autoPlay) {
      const t = setTimeout(() => { try { player.play(); } catch {} }, 300);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}


function PlayerView({ playable }: {
  playable: AudioFile[];
}) {
  const insets = useSafeAreaInsets();
  const C = useColors();
  const [index, setIndex] = useState(0);
  const [playerKey, setPlayerKey] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [loop, setLoop] = useState<LoopMode>("list");
  const [showList, setShowList] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [uriError, setUriError] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [playerRef, setPlayerRef] = useState<ReturnType<typeof useAudioPlayer> | null>(null);
  const [playStatus, setPlayStatus] = useState({ position: 0, duration: 0, isPlaying: false });

  // 母带录制状态
  const { state: mrState, start: mrStart, stop: mrStop, reset: mrReset } = useMasterRecord();
  const isRecording = mrState.status === "recording";
  const isUploading = mrState.status === "uploading";
  const isBusy = isRecording || isUploading || mrState.status === "requesting";

  const current = playable[index];

  // ✅ 注册全局播放控制器（供 MiniPlayer 使用）
  const registerPlayer = usePlayerStore((s) => s.register);
  const updatePlayer = usePlayerStore((s) => s.update);

  // 同步当前曲目和播放状态到全局 store
  useEffect(() => {
    updatePlayer({
      current: current ?? null,
      isPlaying: playStatus.isPlaying,
      position: playStatus.position,
      duration: playStatus.duration,
    });
  }, [current, playStatus, updatePlayer]);

  useEffect(() => {
    if (!current?.uri) { setResolvedUri(null); setUriError(true); return; }
    setResolving(true);
    setUriError(false);
    let cancelled = false;
    (async () => {
      const r = await resolveUri(current.uri);
      if (!cancelled) {
        setResolvedUri(r);
        setUriError(r === null);
        setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [current?.uri, index]);

  const switchTo = useCallback((i: number, withAutoPlay = true) => {
    setAutoPlay(withAutoPlay);
    setIndex(i);
    setPlayerKey((k) => k + 1);
    setShowList(false);
  }, []);

  const toggle = useCallback(() => {
    if (!playerRef) return;
    try { if (playStatus.isPlaying) playerRef.pause(); else playerRef.play(); } catch {}
  }, [playerRef, playStatus.isPlaying]);

  const handleNext = useCallback(() => {
    if (!playable.length) return;
    if (loop === "single") { try { playerRef?.seekTo(0); playerRef?.play(); } catch {} return; }
    const ni = loop === "shuffle"
      ? Math.floor(Math.random() * playable.length)
      : (index + 1) % playable.length;
    switchTo(ni, true);
  }, [playable.length, loop, index, playerRef, switchTo]);

  const prev = useCallback(() => {
    if (!playable.length) return;
    switchTo((index - 1 + playable.length) % playable.length, true);
  }, [playable.length, index, switchTo]);

  // 开始后台录制母带
  const handleStartMaster = useCallback(async () => {
    if (!current) return;
    await mrStart(current);
  }, [current, mrStart]);

  // ✅ 将控制方法注册到全局 store，MiniPlayer 通过 store 调用
  useEffect(() => {
    registerPlayer({
      play:  () => { try { playerRef?.play();  } catch {} },
      pause: () => { try { playerRef?.pause(); } catch {} },
      next:  handleNext,
      prev,
    });
  }, [registerPlayer, playerRef, handleNext, prev]);

  const LoopIcon = loop === "single" ? Repeat1 : Repeat;
  const loopLabel = loop === "list" ? "列表循环" : loop === "single" ? "单曲循环" : "随机播放";
  const fmtInfo = current?.format ? getFormat(current.format) : null;
  const { position, duration, isPlaying } = playStatus;

  return (
    <View className="flex-1 bg-background">
      {resolvedUri ? (
        <AudioEngine
          key={`${playerKey}-${resolvedUri}`}
          uri={resolvedUri}
          volume={volume}
          autoPlay={autoPlay}
          onStatus={setPlayStatus}
          onPlayer={setPlayerRef}
        />
      ) : null}

      <ScreenHeader
        title="万能播放器"
        subtitle="UNIVERSAL PLAYER"
        right={
          <Pressable onPress={() => setShowList((v) => !v)} className="active:opacity-70">
            <ListMusic size={22} color={C.orange} strokeWidth={1.5} />
          </Pressable>
        }
      />

      {/* ── 后台录制状态浮层 ── */}
      {mrState.status !== "idle" && (
        <View className={cn(
          "mx-3 mt-2 border px-3 py-2.5 flex-row items-center gap-3",
          mrState.status === "done"  ? "border-cyan bg-cyan/10" :
          mrState.status === "error" ? "border-destructive bg-destructive/10" :
          "border-primary bg-primary/10",
        )}>
          {mrState.status === "requesting" && <ActivityIndicator size="small" color={C.orange} />}
          {isRecording && (
            <View className="h-2.5 w-2.5 rounded-full bg-destructive" />
          )}
          {isUploading && <ActivityIndicator size="small" color={C.cyan} />}
          {mrState.status === "done" && <CheckCircle2 size={16} color={C.cyan} strokeWidth={1.5} />}
          {mrState.status === "error" && <AlertTriangle size={16} color="#EF4444" strokeWidth={1.5} />}

          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text className="font-mono text-xs font-bold text-foreground">
              {mrState.status === "requesting" && "申请麦克风权限…"}
              {isRecording   && `🎙 后台录制中 · ${mrState.elapsed}s · 可切出去播放音乐`}
              {isUploading   && "上传中，请稍候…"}
              {mrState.status === "done"  && `✅ 母带版已保存 · ${mrState.elapsed}s`}
              {mrState.status === "error" && `❌ ${mrState.error}`}
            </Text>
            {isRecording && (
              <Text className="font-mono text-[10px] text-muted-foreground mt-0.5">
                切到其他音乐APP播放，本APP在后台录制
              </Text>
            )}
          </View>

          {isRecording && (
            <Pressable onPress={mrStop}
              className="flex-row items-center gap-1 border border-destructive px-2 py-1 active:opacity-70">
              <StopCircle size={13} color="#EF4444" strokeWidth={1.5} />
              <Text className="font-mono text-[10px] font-bold text-destructive">停止</Text>
            </Pressable>
          )}
          {(mrState.status === "done" || mrState.status === "error") && (
            <Pressable onPress={mrReset} className="active:opacity-70 px-2">
              <Text className="font-mono text-[10px] text-muted-foreground">关闭</Text>
            </Pressable>
          )}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>

        <View className="items-center gap-3 px-4 pt-6">
          <View className="h-44 w-44 items-center justify-center border border-border bg-card">
            <Music size={64} color={C.cyan} strokeWidth={1} />
          </View>

          <Text className="px-4 text-center font-mono text-lg font-bold text-foreground" numberOfLines={2}>
            {current?.title || current?.name || "—"}
          </Text>

          {(current?.artist || current?.album) ? (
            <View className="items-center gap-1">
              {current?.artist ? (
                <View className="flex-row items-center gap-1">
                  <User size={12} color={C.muted} />
                  <Text className="font-mono text-xs text-muted-foreground">{current.artist}</Text>
                </View>
              ) : null}
              {current?.album ? (
                <View className="flex-row items-center gap-1">
                  <Disc3 size={12} color={C.muted} />
                  <Text className="font-mono text-xs text-muted-foreground">
                    {current.album}{current.year ? `  ${current.year}` : ""}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="flex-row flex-wrap items-center justify-center gap-2">
            {current?.format ? <Badge text={current.format} tone="cyan" /> : null}
            {fmtInfo ? (
              <Badge text={fmtInfo.lossless ? "无损" : "有损"} tone={fmtInfo.lossless ? "orange" : "muted"} />
            ) : null}
            {current?.converted ? <Badge text="已转换" tone="orange" /> : null}
            {current?.masterEnhance ? <Badge text="母带级" tone="orange" /> : null}
          </View>

          {fmtInfo ? (
            <View className="w-full border border-border bg-card">
              <View className="flex-row items-center gap-1 border-b border-border bg-secondary px-3 py-1.5">
                <AudioLines size={10} color={C.muted} />
                <Text className="ml-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  规格信息 SPEC
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-x-6 gap-y-1 px-3 py-2">
                <SpecRow label="格式" value={fmtInfo.label} />
                <SpecRow label="品质" value={fmtInfo.desc} />
                {current?.sampleRate ? <SpecRow label="采样率" value={current.sampleRate} accent /> : null}
                {current?.bitDepth && fmtInfo.supportsBitDepth
                  ? <SpecRow label="位深" value={current.bitDepth} accent /> : null}
                {current?.bitrate && fmtInfo.supportsBitrate
                  ? <SpecRow label="码率" value={current.bitrate} accent /> : null}
                {current?.size ? <SpecRow label="文件" value={formatFileSize(current.size)} /> : null}
                {current?.duration ? <SpecRow label="时长" value={formatDuration(current.duration)} /> : null}
                {current?.genre ? <SpecRow label="流派" value={current.genre} /> : null}
              </View>
            </View>
          ) : null}

          {/* URI 失效提示 */}
          {uriError && !resolving ? (
            <View className="w-full border border-destructive bg-destructive/10 px-3 py-2">
              <Text className="font-mono text-xs text-destructive">
                ⚠ 文件链接已失效（应用重启后本地缓存丢失）
              </Text>
              <Text className="mt-1 font-mono text-[10px] text-muted-foreground">
                请前往「文件」页使用「重制」功能重新生成永久文件，或重新选择文件
              </Text>
            </View>
          ) : resolving ? (
            <ActivityIndicator color={C.cyan} />
          ) : null}
        </View>

        {/* 进度条 */}
        <View className="mx-4 mt-5 gap-1">
          <Slider
            value={position}
            maximumValue={duration > 0 ? duration : 1}
            minimumValue={0}
            minimumTrackTintColor={C.cyan}
            maximumTrackTintColor={C.border}
            thumbTintColor={C.orange}
            onSlidingComplete={(v) => { try { playerRef?.seekTo(v); } catch {} }}
          />
          <View className="flex-row justify-between">
            <Text className="font-mono text-[10px] text-cyan">{formatDuration(position)}</Text>
            <Text className="font-mono text-[10px] text-muted-foreground">{formatDuration(duration)}</Text>
          </View>
        </View>

        {/* 控制按钮 */}
        <View className="mx-4 mt-4 gap-4">
          <View className="flex-row items-center justify-center gap-8">
            <Pressable onPress={prev} className="active:opacity-70">
              <SkipBack size={30} color={C.foreground} strokeWidth={1.5} />
            </Pressable>
            <Pressable onPress={toggle}
              className="h-16 w-16 items-center justify-center bg-primary active:opacity-80">
              {isPlaying
                ? <Pause size={28} color="#FFFFFF" strokeWidth={2} fill="#FFFFFF" />
                : <Play size={28} color="#FFFFFF" strokeWidth={2} fill="#FFFFFF" />}
            </Pressable>
            <Pressable onPress={handleNext} className="active:opacity-70">
              <SkipForward size={30} color={C.foreground} strokeWidth={1.5} />
            </Pressable>
          </View>

          <View className="flex-row items-center gap-3">
            <Volume2 size={16} color={C.muted} strokeWidth={1.5} />
            <Slider
              value={volume}
              maximumValue={1} minimumValue={0}
              minimumTrackTintColor={C.orange}
              maximumTrackTintColor={C.border}
              thumbTintColor={C.orange}
              onValueChange={(v) => {
                setVolume(v);
                try { if (playerRef) playerRef.volume = v; } catch {}
              }}
              style={{ flex: 1 }}
            />
            <Text
              className="w-10 text-right font-mono text-[10px] text-muted-foreground"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {Math.round(volume * 100)}%
            </Text>
          </View>

          <Pressable
            onPress={() => setLoop((p) => p === "list" ? "single" : p === "single" ? "shuffle" : "list")}
            className="flex-row items-center justify-center gap-2 active:opacity-70">
            <LoopIcon size={16} color={C.orange} strokeWidth={1.5} />
            <Text className="font-mono text-[10px] uppercase text-primary">{loopLabel}</Text>
          </Pressable>

          {/* ── 生成母带按钮 ── */}
          <Pressable
            onPress={isBusy ? mrStop : handleStartMaster}
            disabled={mrState.status === "uploading" || mrState.status === "requesting"}
            className={cn(
              "flex-row items-center justify-center gap-2 border py-3 active:opacity-70",
              isBusy ? "border-destructive bg-destructive/10" : "border-primary bg-primary/10",
              (mrState.status === "uploading" || mrState.status === "requesting") && "opacity-50",
            )}
          >
            {isRecording ? (
              <>
                <View className="h-2 w-2 rounded-full bg-destructive" />
                <Text className="font-mono text-xs font-bold text-destructive">
                  录制中 {mrState.elapsed}s · 点击停止
                </Text>
              </>
            ) : isUploading ? (
              <>
                <ActivityIndicator size="small" color={C.cyan} />
                <Text className="font-mono text-xs font-bold text-cyan">上传中…</Text>
              </>
            ) : mrState.status === "done" ? (
              <>
                <CheckCircle2 size={16} color={C.cyan} strokeWidth={1.5} />
                <Text className="font-mono text-xs font-bold text-cyan">母带已保存 · 再次录制</Text>
              </>
            ) : (
              <>
                <Disc size={16} color={C.orange} strokeWidth={1.5} />
                <Text className="font-mono text-xs font-bold text-primary">
                  后台录制母带 · 切出去用音乐APP播放
                </Text>
              </>
            )}
          </Pressable>
          {mrState.status === "idle" && (
            <Text className="text-center font-mono text-[10px] text-muted-foreground">
              点击后切换到网易云/QQ音乐播放，本APP在后台录制并生成母带版本
            </Text>
          )}
        </View>
      </ScrollView>

      {showList ? (
        <View className="absolute inset-x-0 bottom-0 border-t border-border bg-card" style={{ height: "55%" }}>
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
              播放列表 ({playable.length})
            </Text>
            <Pressable onPress={() => setShowList(false)} className="active:opacity-70">
              <Text className="font-mono text-xs text-primary">收起</Text>
            </Pressable>
          </View>
          <FlatList
            data={playable}
            keyExtractor={(f) => f.id}
            renderItem={({ item: f, index: i }: { item: AudioFile; index: number }) => (
              <Pressable onPress={() => switchTo(i, true)}
                className={cn("flex-row items-center gap-3 border-b border-border px-4 py-3 active:opacity-70",
                  i === index && "bg-primary/10")}>
                <View className={cn("h-8 w-8 items-center justify-center border",
                  i === index ? "border-primary" : "border-border")}>
                  <Text className={cn("font-mono text-[10px] font-bold",
                    i === index ? "text-primary" : "text-muted-foreground")}>
                    {String(i + 1).padStart(2, "0")}
                  </Text>
                </View>
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <Text className="font-mono text-xs font-semibold text-foreground" numberOfLines={1}>
                    {f.title || f.name}
                  </Text>
                  <Text className="font-mono text-[10px] text-muted-foreground">
                    {f.artist ? `${f.artist}  ·  ` : ""}{f.format ?? "—"}  ·  {formatDuration(f.duration)}
                  </Text>
                </View>
                {i === index && isPlaying ? <View className="h-2 w-2 bg-cyan" /> : null}
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

export default function PlayerScreen() {
  const files = useFileStore((s) => s.files);
  const C = useColors();
  const playable = files.filter((f) => !!f.uri);

  if (playable.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="万能播放器" subtitle="UNIVERSAL PLAYER" />
        <EmptyState
          icon={<Music size={40} color={C.muted} strokeWidth={1} />}
          title="播放列表为空"
          desc="导入音频文件后即可在此播放所有格式音乐"
        />
      </View>
    );
  }

  return <PlayerView playable={playable} />;
}
