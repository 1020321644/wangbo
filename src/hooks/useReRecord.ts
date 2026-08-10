/**
 * useReRecord — 后台录音重制 hook
 *
 * ⚠️ 重要说明：
 *  - Web/Expo 环境中 getDisplayMedia 系统音频捕获需要用户在弹窗勾选「共享音频」
 *  - 移动端（iOS/Android）原生不支持系统内录，必须使用麦克风（getUserMedia）
 *  - 本 hook 优先尝试 getDisplayMedia（桌面浏览器），移动端自动降级到麦克风
 *  - 录制前应确保手机开启麦克风并让声音清晰地进入
 */
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/client/supabase";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import type { AudioFormat } from "@/lib/formats";
import { logger } from "@/store/logStore";

export type ReRecordStatus = "idle" | "pending" | "recording" | "uploading" | "done" | "error";
export type ReRecordFormat = "webm" | "wav" | "mp3" | "ogg" | "flac";

export interface ReRecordTask {
  fileId: string;
  fileName: string;
  /** 用户自定义歌名（可选） */
  customTitle?: string;
  /** 用户自定义艺人（可选） */
  customArtist?: string;
  status: ReRecordStatus;
  elapsed: number;
  error?: string;
  format: ReRecordFormat;
}

// ── 专业母带处理链 ──
function buildMasterChain(ctx: AudioContext): {
  input: AudioNode;
  output: MediaStreamAudioDestinationNode;
} {
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 20;
  hpf.Q.value = 0.7;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 6;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const gain = ctx.createGain();
  gain.gain.value = 1.15;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -0.3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  const dest = ctx.createMediaStreamDestination();

  hpf.connect(compressor);
  compressor.connect(gain);
  gain.connect(limiter);
  limiter.connect(dest);

  return { input: hpf, output: dest };
}

export function useReRecord() {
  const updateFile = useFileStore((s) => s.updateFile);
  const addFiles = useFileStore((s) => s.addFiles);
  const [tasks, setTasks] = useState<Map<string, ReRecordTask>>(new Map());
  const cleanupMap = useRef<Map<string, () => void>>(new Map());

  const updateTask = useCallback((id: string, patch: Partial<ReRecordTask>) => {
    setTasks((prev) => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, ...patch });
      return next;
    });
  }, []);

  const reRecord = useCallback(async (
    file: AudioFile,
    format: ReRecordFormat = "webm",
    customTitle?: string,
    customArtist?: string,
  ) => {
    if (!file.uri) {
      logger.error("重制功能", "文件 URI 为空", `文件: ${file.name}`);
      return;
    }

    logger.info("重制功能", `开始重制: ${file.name}`, `目标格式: ${format.toUpperCase()}`);

    setTasks((prev) => {
      const next = new Map(prev);
      next.set(file.id, {
        fileId: file.id,
        fileName: file.name,
        customTitle,
        customArtist,
        status: "pending",
        elapsed: 0,
        format,
      });
      return next;
    });

    try {
      const ctx = new AudioContext({ sampleRate: 48000 });
      const { input, output } = buildMasterChain(ctx);
      const streams: MediaStream[] = [];

      const hasDisplayMedia = !!(
        navigator.mediaDevices &&
        typeof (navigator.mediaDevices as unknown as Record<string, unknown>).getDisplayMedia === "function"
      );

      if (hasDisplayMedia) {
        type Ext = MediaDevices & { getDisplayMedia(c: object): Promise<MediaStream> };
        let ds: MediaStream;
        try {
          ds = await (navigator.mediaDevices as Ext).getDisplayMedia({ audio: true, video: false });
        } catch {
          ds = await (navigator.mediaDevices as Ext).getDisplayMedia({ audio: true, video: { width: 1, height: 1 } });
        }
        ds.getVideoTracks().forEach((t) => t.stop());
        const aTracks = ds.getAudioTracks();
        if (aTracks.length === 0) {
          ctx.close();
          const errMsg = "未获取到系统音频，请在弹窗中勾选「共享音频」";
          logger.error("重制功能", errMsg, `文件: ${file.name}`);
          throw new Error(errMsg);
        }
        streams.push(ds);
        ctx.createMediaStreamSource(new MediaStream(aTracks)).connect(input);
      } else {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 2 },
        });
        streams.push(mic);
        ctx.createMediaStreamSource(mic).connect(input);
      }

      const audio = new Audio(file.uri);
      let elapsedSec = 0;

      // MediaRecorder 实际只支持 webm/ogg，其余格式录制后以 webm 存储
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      // 文件扩展名：WAV/FLAC/MP3 均以 webm 容器保存，标注目标格式
      const fileExt = (format === "wav" || format === "flac" || format === "mp3") ? "webm" : format;
      const formatLabel = format.toUpperCase();

      const doCleanup = () => {
        audio.pause();
        clearInterval(timer);
        streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
        ctx.close().catch(() => {});
      };
      cleanupMap.current.set(file.id, doCleanup);

      audio.play().catch(() => {});

      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(output.stream, { mimeType });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      updateTask(file.id, { status: "recording" });

      const timer = setInterval(() => {
        elapsedSec += 1;
        updateTask(file.id, { elapsed: elapsedSec });
      }, 1000);

      audio.onended = () => { if (rec.state === "recording") rec.stop(); };

      await new Promise<void>((resolve, reject) => {
        rec.onstop = () => resolve();
        rec.onerror = () => reject(new Error("录制失败"));
        rec.start(100);
      });

      clearInterval(timer);
      doCleanup();
      cleanupMap.current.delete(file.id);

      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 5000) {
        const errMsg = "录制内容过短或为空，请重试";
        logger.error("重制功能", errMsg, `文件: ${file.name}, Blob大小: ${blob.size}`);
        throw new Error(errMsg);
      }

      updateTask(file.id, { status: "uploading" });

      const storeName = `rerecord_${file.id}_${Date.now()}.${fileExt}`;
      const arrayBuf = await blob.arrayBuffer();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("audio-files")
        .upload(storeName, arrayBuf, { contentType: mimeType, upsert: false });

      if (uploadError) {
        const errMsg = `上传失败：${uploadError.message}`;
        logger.error("重制功能", errMsg, `文件: ${file.name}`);
        throw new Error(errMsg);
      }

      const { data: urlData } = supabase.storage
        .from("audio-files")
        .getPublicUrl(uploadData.path);

      const permanentUri = urlData?.publicUrl ?? URL.createObjectURL(blob);

      // 更新原文件的 uri + 母带标注 + 自定义元信息
      updateFile(file.id, {
        uri: permanentUri,
        duration: elapsedSec,
        masterEnhance: true,
        sampleRate: "48kHz",
        bitDepth: "24bit",
        ...(customTitle  ? { title:  customTitle  } : {}),
        ...(customArtist ? { artist: customArtist } : {}),
        comment: undefined,
        converted: true,
        targetFormat: formatLabel as AudioFormat,
      });

      // 同时在文件库追加一条独立的重制副本（使用实际 Blob 大小）
      addFiles([{
        id: `rr-${file.id}-${Date.now()}`,
        name: customTitle
          ? `${customTitle}.${fileExt}`
          : `${file.name.replace(/\.[^.]+$/, "")}_重制.${fileExt}`,
        ext: fileExt,
        format: formatLabel as AudioFormat,
        size: blob.size, // ✅ 使用实际 Blob 大小，不是估算值
        duration: elapsedSec,
        uri: permanentUri,
        masterEnhance: true,
        sampleRate: "48kHz",
        bitDepth: "24bit",
        // ✅ 清除所有原始元数据，不保留 AI 属性
        title: customTitle || undefined,
        artist: customArtist || undefined,
        album: undefined,
        year: undefined,
        genre: undefined,
        comment: undefined,
        converted: true,
        targetFormat: formatLabel as AudioFormat,
        createdAt: Date.now(),
      }]);

      updateTask(file.id, { status: "done", elapsed: elapsedSec });

      setTimeout(() => {
        setTasks((prev) => { const next = new Map(prev); next.delete(file.id); return next; });
      }, 5000);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "未知错误";
      updateTask(file.id, { status: "error", error: msg });
      cleanupMap.current.get(file.id)?.();
      cleanupMap.current.delete(file.id);
    }
  }, [updateFile, addFiles, updateTask]);

  const cancel = useCallback((fileId: string) => {
    cleanupMap.current.get(fileId)?.();
    cleanupMap.current.delete(fileId);
    setTasks((prev) => { const next = new Map(prev); next.delete(fileId); return next; });
  }, []);

  return { reRecord, cancel, tasks };
}
