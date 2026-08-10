/**
 * React Native 桥接层
 * 调用 Android 原生系统内录模块
 */

import { NativeModules, NativeEventEmitter, Platform } from "react-native";

const { AudioCaptureModule } = NativeModules;

// 创建事件发射器
const audioCaptureEmitter = AudioCaptureModule
  ? new NativeEventEmitter(AudioCaptureModule)
  : null;

export interface AudioCaptureSupport {
  supported: boolean;
  apiLevel: number;
}

export interface AudioCapturePermission {
  granted: boolean;
}

export interface AudioCaptureResult {
  success: boolean;
}

export interface AudioData {
  bytesRead: number;
}

/**
 * Android 系统内录 API
 */
export const AndroidAudioCapture = {
  /**
   * 检查是否支持系统内录
   * 需要 Android 10 (API 29) 或更高版本
   */
  async isSupported(): Promise<AudioCaptureSupport> {
    if (Platform.OS !== "android") {
      return { supported: false, apiLevel: 0 };
    }

    if (!AudioCaptureModule) {
      return { supported: false, apiLevel: 0 };
    }

    try {
      return await AudioCaptureModule.isSupported();
    } catch (error) {
      console.error("[AndroidAudioCapture] isSupported error:", error);
      return { supported: false, apiLevel: 0 };
    }
  },

  /**
   * 请求系统内录权限
   * 会弹出系统权限对话框
   */
  async requestPermission(): Promise<AudioCapturePermission> {
    if (Platform.OS !== "android") {
      throw new Error("系统内录仅支持 Android 平台");
    }

    if (!AudioCaptureModule) {
      throw new Error("AudioCaptureModule 未找到，请确保已正确配置 Config Plugin");
    }

    try {
      return await AudioCaptureModule.requestPermission();
    } catch (error) {
      console.error("[AndroidAudioCapture] requestPermission error:", error);
      throw error;
    }
  },

  /**
   * 开始捕获系统音频
   * 必须先调用 requestPermission 并获得授权
   */
  async startCapture(): Promise<AudioCaptureResult> {
    if (Platform.OS !== "android") {
      throw new Error("系统内录仅支持 Android 平台");
    }

    if (!AudioCaptureModule) {
      throw new Error("AudioCaptureModule 未找到");
    }

    try {
      return await AudioCaptureModule.startCapture();
    } catch (error) {
      console.error("[AndroidAudioCapture] startCapture error:", error);
      throw error;
    }
  },

  /**
   * 停止捕获系统音频
   */
  async stopCapture(): Promise<AudioCaptureResult> {
    if (Platform.OS !== "android") {
      throw new Error("系统内录仅支持 Android 平台");
    }

    if (!AudioCaptureModule) {
      throw new Error("AudioCaptureModule 未找到");
    }

    try {
      return await AudioCaptureModule.stopCapture();
    } catch (error) {
      console.error("[AndroidAudioCapture] stopCapture error:", error);
      throw error;
    }
  },

  /**
   * 监听权限授予事件
   */
  onPermissionGranted(callback: () => void): () => void {
    if (!audioCaptureEmitter) {
      return () => {};
    }

    const subscription = audioCaptureEmitter.addListener(
      "onPermissionGranted",
      callback
    );

    return () => subscription.remove();
  },

  /**
   * 监听音频数据事件
   */
  onAudioData(callback: (data: AudioData) => void): () => void {
    if (!audioCaptureEmitter) {
      return () => {};
    }

    const subscription = audioCaptureEmitter.addListener(
      "onAudioData",
      callback
    );

    return () => subscription.remove();
  },
};

/**
 * 使用示例：
 * 
 * ```typescript
 * import { AndroidAudioCapture } from "@/lib/androidAudioCapture";
 * 
 * // 1. 检查支持
 * const { supported } = await AndroidAudioCapture.isSupported();
 * if (!supported) {
 *   console.log("设备不支持系统内录");
 *   return;
 * }
 * 
 * // 2. 请求权限
 * try {
 *   const { granted } = await AndroidAudioCapture.requestPermission();
 *   if (!granted) {
 *     console.log("用户拒绝了权限");
 *     return;
 *   }
 * } catch (error) {
 *   console.error("权限请求失败:", error);
 *   return;
 * }
 * 
 * // 3. 监听音频数据
 * const unsubscribe = AndroidAudioCapture.onAudioData((data) => {
 *   console.log("收到音频数据:", data.bytesRead, "字节");
 * });
 * 
 * // 4. 开始录制
 * await AndroidAudioCapture.startCapture();
 * 
 * // 5. 停止录制
 * await AndroidAudioCapture.stopCapture();
 * unsubscribe();
 * ```
 */
