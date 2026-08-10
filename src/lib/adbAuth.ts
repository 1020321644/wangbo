/**
 * ADB 无线授权 JS Bridge
 * 封装 AdbAuthModule 原生模块，提供权限检测、端口探测、一键授权功能
 */

import { NativeModules } from "react-native";

const { AdbAuthModule } = NativeModules as {
  AdbAuthModule: {
    checkCapturePermission(): Promise<{ granted: boolean }>;
    checkWirelessAdb(): Promise<{ available: boolean; port: number; reason?: string }>;
    runAdbGrant(): Promise<{ success: boolean; output: string; error?: string }>;
    isHarmonyOS(): Promise<{ isHarmony: boolean; manufacturer: string }>;
    getAdbCommand(): Promise<{ command: string }>;
  } | undefined;
};

/**
 * 检测 CAPTURE_AUDIO_OUTPUT 是否已授权
 * 非 Android 或模块不存在时返回 false
 */
export async function checkCapturePermission(): Promise<boolean> {
  if (!AdbAuthModule) return false;
  try {
    const result = await AdbAuthModule.checkCapturePermission();
    return result.granted;
  } catch {
    return false;
  }
}

/**
 * 探测无线 ADB 端口（localhost:5555）是否开放
 */
export async function checkWirelessAdb(): Promise<{ available: boolean; port: number }> {
  if (!AdbAuthModule) return { available: false, port: 5555 };
  try {
    return await AdbAuthModule.checkWirelessAdb();
  } catch {
    return { available: false, port: 5555 };
  }
}

/**
 * 执行一键授权：提取 adb 二进制 → connect → pm grant → verify
 * 返回 { success, output, error }
 */
export async function runAdbGrant(): Promise<{
  success: boolean;
  output: string;
  error?: string;
}> {
  if (!AdbAuthModule) return { success: false, output: "", error: "AdbAuthModule 未初始化" };
  try {
    return await AdbAuthModule.runAdbGrant();
  } catch (e: unknown) {
    return { success: false, output: "", error: String(e) };
  }
}

/**
 * 是否鸿蒙系统
 */
export async function isHarmonyOS(): Promise<boolean> {
  if (!AdbAuthModule) return false;
  try {
    const result = await AdbAuthModule.isHarmonyOS();
    return result.isHarmony;
  } catch {
    return false;
  }
}

/**
 * 获取完整 ADB 授权命令字符串（供复制）
 */
export async function getAdbCommand(): Promise<string> {
  if (!AdbAuthModule) {
    return "adb shell pm grant com.miaoda.appdk2quyiid79d android.permission.CAPTURE_AUDIO_OUTPUT";
  }
  try {
    const result = await AdbAuthModule.getAdbCommand();
    return result.command;
  } catch {
    return "adb shell pm grant com.miaoda.appdk2quyiid79d android.permission.CAPTURE_AUDIO_OUTPUT";
  }
}
