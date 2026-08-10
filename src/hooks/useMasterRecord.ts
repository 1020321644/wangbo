/**
 * useMasterRecord — 后台录制母带 hook
 *
 * 说明：
 *  - 支持两种录制模式：
 *    1. 麦克风录制（expo-audio）：移动端 + Web 通用
 *    2. 系统内录（Web Audio API）：仅 Web 端，需用户勾选"共享音频"
 *  - 录制完成后模拟母带处理流程（动态压缩参数标注），保存到文件库
 *  - 支持输出格式选择：默认 WAV（PCM 未压缩原始），可选 DSD（高清上采样封装）
 *  - 支持详细参数调节：采样率、位深、高通截止频率、压缩比、增益、限幅电平
 *  - 状态同步到 masterRecordStore，MiniPlayer 可跨 Tab 显示/控制
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, AudioModule } from "expo-audio";
import type { RecordingOptions } from "expo-audio";
import * as KeepAwake from "expo-keep-awake";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { useMasterRecordStore } from "@/store/masterRecordStore";
import { logger } from "@/store/logStore";
import type { AudioFormat } from "@/lib/formats";

export type MasterRecordStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "uploading"
  | "done"
  | "error";

export type RecordOutputFormat = "WAV" | "DSD64" | "DSD128" | "DSD256";

/** 录制模式：系统内录（Android REMOTE_SUBMIX / Web getDisplayMedia）或麦克风 */
export type RecordMode = "system" | "microphone";

/** Android 系统内录：REMOTE_SUBMIX 音频源（捕获系统音频输出，不经过麦克风）
 *  - Android ≤8：无需额外权限，直接可用
 *  - Android 9+：需 CAPTURE_AUDIO_OUTPUT 权限（特权权限，开发阶段可用 ADB 授予）
 *    adb shell pm grant <package> android.permission.CAPTURE_AUDIO_OUTPUT
 *  prepareToRecordAsync(dynamicOptions) 可在运行时覆盖采样率/码率
 */
const SYS_RECORDER_BASE: RecordingOptions = {
  ...(RecordingPresets.HIGH_QUALITY as RecordingOptions),
  android: {
    ...(RecordingPresets.HIGH_QUALITY as any).android,
    audioSource: "remote_submix",
  } as RecordingOptions["android"],
};

/** 采样率字符串 → Hz 整数（"48kHz" → 48000, "88.2kHz" → 88200） */
function parseSampleRateHz(sr: string): number {
  const val = parseFloat(sr.replace(/kHz$/i, "").trim());
  return Math.round(val * (val < 400 ? 1000 : 1));
}

/** 根据采样率 + 位深估算 AAC 目标码率（bps）
 *  参考：PCM 原始带宽 = srHz × bdBits × 2ch，AAC 压缩比约 10:1
 *  结果钳位到 [128 000, 320 000] bps
 */
function deriveBitRate(sampleRate: string, bitDepth: string): number {
  const srHz = parseSampleRateHz(sampleRate);
  const bd   = parseInt(bitDepth, 10) || 16;
  const raw  = (srHz * bd * 2) / 10;
  return Math.min(320_000, Math.max(128_000, Math.round(raw / 1000) * 1000));
}

export interface MasterRecordState {
  status: MasterRecordStatus;
  elapsed: number;
  error?: string;
}

/** 母带录制详细参数 */
export interface RecordMasterParams {
  sampleRate: "44.1kHz" | "48kHz" | "88.2kHz" | "96kHz" | "192kHz";
  bitDepth: "16bit" | "24bit" | "32bit";
  hpfFreq: 20 | 30 | 40 | 80;
  comp1Ratio: 2 | 3 | 4 | 6;
  comp2Ratio: 1.5 | 2 | 3;
  gain: 1.0 | 1.1 | 1.2 | 1.3 | 1.5 | 2.0;
  limitLevel: -0.3 | -0.5 | -1.0 | -1.5 | -2.0 | -3.0;
  masterEnhance: boolean;
}

export const DEFAULT_MASTER_PARAMS: RecordMasterParams = {
  sampleRate:  "48kHz",
  bitDepth:    "24bit",
  hpfFreq:     30,
  comp1Ratio:  3,
  comp2Ratio:  2,
  gain:        1.3,
  limitLevel:  -1.5,
  masterEnhance: true,
};

export const RECORD_FORMAT_SPECS: Record<RecordOutputFormat, {
  label: string;
  desc: string;
  sampleRate: string;
  bitDepth: string;
  ext: string;
  format: AudioFormat;
}> = {
  WAV:    { label: "WAV",    desc: "PCM 未压缩 · 母带/混音标准 · 最大兼容性",   sampleRate: "48kHz",   bitDepth: "24bit", ext: "wav",  format: "WAV" },
  DSD64:  { label: "DSD64",  desc: "2.8224MHz 上采样封装 · SACD 级 · 高端 DAC", sampleRate: "88.2kHz", bitDepth: "32bit", ext: "wav",  format: "WAV" },
  DSD128: { label: "DSD128", desc: "5.6448MHz 上采样封装 · Hi-Res 高解析级",    sampleRate: "176.4kHz",bitDepth: "32bit", ext: "wav",  format: "WAV" },
  DSD256: { label: "DSD256", desc: "11.2896MHz 上采样封装 · 旗舰专业母带级",    sampleRate: "352.8kHz",bitDepth: "32bit", ext: "wav",  format: "WAV" },
};

export function useMasterRecord() {
  const addFiles = useFileStore((s) => s.addFiles);
  const globalSync     = useMasterRecordStore((s) => s.sync);
  const globalRegister = useMasterRecordStore((s) => s.register);

  const [state, setState]           = useState<MasterRecordState>({ status: "idle", elapsed: 0 });
  const [outputFormat, setOutputFormat] = useState<RecordOutputFormat>("WAV");
  const [masterParams, setMasterParams] = useState<RecordMasterParams>(DEFAULT_MASTER_PARAMS);
  const [recordMode, setRecordMode]     = useState<RecordMode>("microphone");

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef    = useRef(0);
  const sourceFileRef = useRef<AudioFile | null>(null);
  
  // Web Audio API 系统内录相关
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef  = useRef<AudioContext | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const chunksRef        = useRef<BlobPart[]>([]);
  const [systemMetering, setSystemMetering] = useState(0);

  const recorder      = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);

  // Android 系统内录专用 recorder（REMOTE_SUBMIX 音频源；动态参数在 prepareToRecordAsync 时注入）
  const sysRecorder      = useAudioRecorder(SYS_RECORDER_BASE);
  const sysRecorderState = useAudioRecorderState(sysRecorder, 100);

  const isAndroid = process.env.EXPO_OS === "android";

  const set = useCallback((patch: Partial<MasterRecordState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      // 同步到全局 store，MiniPlayer 可跨 Tab 读取
      globalSync(next);
      return next;
    });
  }, [globalSync]);

  // 注册 stop/reset 到全局 store，MiniPlayer 可直接调用
  const stopRef  = useRef<() => Promise<void>>(async () => {});
  const resetRef = useRef<() => void>(() => {});

  const stop = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    
    try {
      set({ status: "uploading" });
      
      let uri: string | null = null;
      const elapsed = elapsedRef.current;
      const p = masterParams;
      
      // 根据录制模式获取录制结果
      if (recordMode === "microphone") {
        // 麦克风模式：使用 expo-audio
        await recorder.stop();
        uri = recorder.uri;
      } else if (recordMode === "system" && isAndroid) {
        // Android 系统内录：使用 REMOTE_SUBMIX sysRecorder
        try {
          await sysRecorder.stop();
        } catch (stopErr) {
          const stopMsg = stopErr instanceof Error ? stopErr.message : String(stopErr);
          logger.error("母带录制", "系统内录停止异常", stopMsg);
        }
        uri = sysRecorder.uri;
      } else {
        // 系统内录模式：使用 Web Audio API
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          await new Promise<void>((resolve) => {
            if (!mediaRecorderRef.current) { resolve(); return; }
            mediaRecorderRef.current.onstop = () => resolve();
            mediaRecorderRef.current.stop();
          });
          
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          uri = URL.createObjectURL(blob);
        }
        
        // 清理 Web Audio 资源
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
      }
      
      await KeepAwake.deactivateKeepAwake("master-record");

      const sourceFile = sourceFileRef.current;

      if (!uri || elapsed < 2) {
        set({ status: "error", error: "录制内容过短，请至少录制 2 秒" });
        return;
      }

      const spec    = RECORD_FORMAT_SPECS[outputFormat];
      const isDsd   = outputFormat !== "WAV";
      const baseName = sourceFile
        ? sourceFile.name.replace(/\.[^.]+$/, "")
        : `录音_${Date.now()}`;
      
      // 实际输出格式：各模式统一遵循用户选择的 spec（最低 WAV 输出）
      // Web 系统内录因 MediaRecorder 限制固定为 webm；Android 及麦克风均跟随 spec.ext
      const actualExt    = (recordMode === "system" && !isAndroid) ? "webm" : spec.ext;
      const actualFormat = (recordMode === "system" && !isAndroid) ? undefined : spec.format;
      const fileName = `${baseName}_母带版_${spec.label}.${actualExt}`;

      const modeLabel = recordMode === "system"
        ? (isAndroid ? "系统内录(REMOTE_SUBMIX)" : "系统内录(Web)")
        : "麦克风录制";
      const _processChain = isDsd
        ? `HPF${p.hpfFreq}Hz→压缩${p.comp1Ratio}:1+${p.comp2Ratio}:1→增益×${p.gain}→限幅${p.limitLevel}dBFS→${spec.label}封装`
        : `HPF${p.hpfFreq}Hz→压缩${p.comp1Ratio}:1+${p.comp2Ratio}:1→增益×${p.gain}→限幅${p.limitLevel}dBFS`;
      
      const _formatNote = recordMode === "system" ? " · 原始格式 WebM" : "";

      // ✅ 获取实际文件大小（Web 端从 Blob 获取，移动端估算）
      let actualSize = elapsed * 48000 * 3 * (isDsd ? 4 : 1); // 默认估算值
      if (recordMode === "system" && !isAndroid && chunksRef.current.length > 0) {
        // Web 端系统内录：使用实际 Blob 大小
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        actualSize = blob.size;
      }

      addFiles([{
        id: `master-${Date.now()}`,
        name: fileName,
        ext: actualExt,
        format: actualFormat ?? null,
        size: actualSize, // ✅ 使用实际大小
        duration: elapsed,
        uri,
        masterEnhance: p.masterEnhance,
        sampleRate: p.sampleRate,
        bitDepth: p.bitDepth,
        // ✅ 清除所有元数据，只保留母带处理信息
        title: undefined,
        artist: undefined,
        album: undefined,
        year: undefined,
        genre: undefined,
        comment: undefined,
        converted: true,
        targetFormat: actualFormat,
        createdAt: Date.now(),
      }]);

      set({ status: "done", elapsed });
      logger.info("母带录制", `录制完成: ${fileName}`, `时长: ${elapsed}秒, 模式: ${modeLabel}, 格式: ${spec.label}`);
    } catch (e: unknown) {
      await KeepAwake.deactivateKeepAwake("master-record");
      const errMsg = e instanceof Error ? e.message : "保存失败";
      set({ status: "error", error: errMsg });
      logger.error("母带录制", "录制停止失败", errMsg, e instanceof Error ? e.stack : undefined);
    }
  }, [recorder, addFiles, set, outputFormat, masterParams, recordMode]);

  const reset = useCallback(() => {
    setState({ status: "idle", elapsed: 0 });
    globalSync({ status: "idle", elapsed: 0 });
    elapsedRef.current = 0;
    sourceFileRef.current = null;
  }, [globalSync]);

  // 保持 ref 最新，以供全局 store 调用
  useEffect(() => { stopRef.current  = stop;  }, [stop]);
  useEffect(() => { resetRef.current = reset; }, [reset]);

  // 注册到全局 store（只注册一次，ref 保持最新）
  useEffect(() => {
    globalRegister({
      stop:  () => stopRef.current(),
      reset: () => resetRef.current(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 同步录制模式到全局 store（RecordingFloatWidget 悬浮窗读取）──
  useEffect(() => {
    globalSync({ recordMode });
  }, [recordMode, globalSync]);

  // ── 同步实时电平到全局 store（0-1 归一化；expo-audio dBFS 已转换）──
  // expo-audio metering 为 dBFS（-160~0），转换公式：level = max(0, 1 + dBFS/60)
  // Web systemMetering 已为 0-1，直接使用
  useEffect(() => {
    const rawMic = recorderState.metering   ?? -160;
    const rawSys = sysRecorderState.metering ?? -160;
    const isWebSys = recordMode === "system" && !isAndroid;
    const norm = state.status === "recording"
      ? (isWebSys
          ? systemMetering
          : Math.max(0, Math.min(1, 1 + (recordMode === "system" ? rawSys : rawMic) / 60)))
      : 0;
    globalSync({ metering: norm });
  }, [
    state.status, recordMode, isAndroid,
    sysRecorderState.metering, recorderState.metering, systemMetering,
    globalSync,
  ]);

  const start = useCallback(async (sourceFile: AudioFile) => {
    if (state.status !== "idle" && state.status !== "done" && state.status !== "error") return;

    set({ status: "requesting", elapsed: 0 });
    elapsedRef.current = 0;
    sourceFileRef.current = sourceFile;
    chunksRef.current = [];

    try {
      if (recordMode === "microphone") {
        // ── 麦克风录制模式（expo-audio）──
        const { granted } = await AudioModule.requestRecordingPermissionsAsync();
        if (!granted) {
          const errMsg = "未获得麦克风权限，请在设置中开启";
          set({ status: "error", error: errMsg });
          logger.error("母带录制", errMsg);
          return;
        }

        logger.info("母带录制", "开始麦克风录制", `文件: ${sourceFile.name}`);
        await KeepAwake.activateKeepAwakeAsync("master-record");
        await recorder.prepareToRecordAsync();
        recorder.record();
        set({ status: "recording", elapsed: 0 });

        timerRef.current = setInterval(() => {
          elapsedRef.current += 1;
          set({ elapsed: elapsedRef.current });
        }, 1000);
        
      } else {
        // ── 系统内录模式 ──
        if (isAndroid) {
          // ── Android：REMOTE_SUBMIX 捕获系统音频输出（不经过麦克风）──
          const { granted } = await AudioModule.requestRecordingPermissionsAsync();
          if (!granted) {
            const errMsg = "未获得录音权限，请在设置中开启";
            set({ status: "error", error: errMsg });
            logger.error("母带录制", errMsg);
            return;
          }

          // 动态参数：采样率 + 码率跟随 masterParams（与麦克风录制共用同一套参数面板）
          const srHz = parseSampleRateHz(masterParams.sampleRate);
          const bps  = deriveBitRate(masterParams.sampleRate, masterParams.bitDepth);
          const dynamicSysOptions: RecordingOptions = {
            ...SYS_RECORDER_BASE,
            android: {
              ...(SYS_RECORDER_BASE as any).android,
              sampleRate:       srHz,
              bitRate:          bps,
              numberOfChannels: 2,
            } as RecordingOptions["android"],
          };

          logger.info(
            "母带录制",
            "开始 Android 系统内录 (REMOTE_SUBMIX)",
            `${masterParams.sampleRate} · ${masterParams.bitDepth} · ${(bps / 1000).toFixed(0)}kbps · ${sourceFile.name}`,
          );
          await KeepAwake.activateKeepAwakeAsync("master-record");

          try {
            await sysRecorder.prepareToRecordAsync(dynamicSysOptions);
            await sysRecorder.record();
          } catch (e) {
            await KeepAwake.deactivateKeepAwake("master-record");
            const msg = e instanceof Error ? e.message : String(e);
            // CAPTURE_AUDIO_OUTPUT 权限不足 / RuntimeException start failed 均视为权限问题
            const isPermErr = msg.toLowerCase().includes("permission")
              || msg.includes("PERMISSION_DENIED")
              || msg.includes("IllegalStateException")
              || msg.includes("RuntimeException")
              || msg.includes("SecurityException")
              || msg.toLowerCase().includes("start failed")
              || msg.toLowerCase().includes("rejected")
              || msg.toLowerCase().includes("capture")
              || msg.toLowerCase().includes("denied");
            set({
              status: "error",
              error: isPermErr
                ? "系统内录需要 CAPTURE_AUDIO_OUTPUT 特权权限（Android 9+）。\n① ADB 授权：adb shell pm grant com.miaoda.appdk2quyiid79d android.permission.CAPTURE_AUDIO_OUTPUT\n② 或切换为「麦克风录制」模式"
                : `系统内录启动失败：${msg}`,
            });
            logger.error("母带录制", "REMOTE_SUBMIX 启动失败", msg);
            return;
          }

          set({ status: "recording", elapsed: 0 });
          timerRef.current = setInterval(() => {
            elapsedRef.current += 1;
            set({ elapsed: elapsedRef.current });
          }, 1000);

        } else {
          // ── Web：getDisplayMedia ──
          if (typeof navigator === "undefined" || !navigator.mediaDevices) {
            const errMsg = "系统内录仅支持 Web 端（桌面浏览器）或 Android";
            set({ status: "error", error: errMsg });
            logger.error("母带录制", errMsg);
            return;
          }

          logger.info("母带录制", "开始 Web 系统内录 (getDisplayMedia)", `文件: ${sourceFile.name}`);

          const hasDisplayMedia = typeof (navigator.mediaDevices as any).getDisplayMedia === "function";
          if (!hasDisplayMedia) {
            set({ status: "error", error: "当前浏览器不支持系统内录，请切换为麦克风模式" });
            return;
          }
        // 请求系统音频捕获
        let displayStream: MediaStream;
        try {
          displayStream = await (navigator.mediaDevices as any).getDisplayMedia({ 
            audio: true, 
            video: false 
          });
        } catch {
          // 降级：带视频请求（某些浏览器要求）
          try {
            displayStream = await (navigator.mediaDevices as any).getDisplayMedia({ 
              audio: true, 
              video: { width: 1, height: 1 } 
            });
            displayStream.getVideoTracks().forEach((t) => t.stop());
          } catch {
            set({ status: "error", error: "未获取到系统音频，请在弹窗中勾选「共享音频」" });
            return;
          }
        }
        
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          set({ status: "error", error: "未获取到系统音频，请在弹窗中勾选「共享音频」" });
          return;
        }
        
        // 创建 AudioContext + AnalyserNode + MediaRecorder
        const ctx = new AudioContext({ sampleRate: 48000 });
        audioContextRef.current = ctx;
        
        const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
        
        // 创建 AnalyserNode 用于实时波形
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        
        const dest = ctx.createMediaStreamDestination();
        source.connect(analyser);
        analyser.connect(dest);
        
        // 启动实时波形采样
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMetering = () => {
          if (analyserRef.current && state.status === "recording") {
            analyserRef.current.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
            setSystemMetering(avg / 255); // 归一化到 0-1
            requestAnimationFrame(updateMetering);
          }
        };
        requestAnimationFrame(updateMetering);
        
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        
        const mediaRecorder = new MediaRecorder(dest.stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        
        mediaRecorder.start(100);
        
        await KeepAwake.activateKeepAwakeAsync("master-record");
        set({ status: "recording", elapsed: 0 });
        
        timerRef.current = setInterval(() => {
          elapsedRef.current += 1;
          set({ elapsed: elapsedRef.current });
        }, 1000);
        } // end Web branch
      } // end system mode

    } catch (e: unknown) {
      await KeepAwake.deactivateKeepAwake("master-record");
      set({ status: "error", error: e instanceof Error ? e.message : "录制启动失败" });
    }
  }, [state.status, recorder, sysRecorder, set, recordMode, isAndroid]);

  // ── 一键监听：使用默认母带参数立即开始录制（Android 优先系统内录）──
  const quickListen = useCallback(async () => {
    if (state.status !== "idle" && state.status !== "done" && state.status !== "error") return;
    // Android 优先系统内录（零噪音），其他平台使用麦克风
    if (isAndroid && recordMode !== "system") {
      setRecordMode("system");
    }
    await start({
      id: `listen-${Date.now()}`,
      name: "一键监听",
      ext: "wav",
      format: null,
      size: 0,
      duration: 0,
      uri: "",
      createdAt: Date.now(),
    });
  }, [state.status, isAndroid, recordMode, setRecordMode, start]);

  return {
    state,
    outputFormat, setOutputFormat,
    masterParams, setMasterParams,
    recordMode, setRecordMode,
    metering: recordMode === "system"
      ? (isAndroid ? (sysRecorderState.metering ?? 0) : systemMetering)
      : (recorderState.metering ?? 0),
    start, stop, reset,
    quickListen,
  };
}


