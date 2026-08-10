/* eslint-disable no-undef */
/**
 * Expo Config Plugin for Android Audio Capture
 * 注入 Android 原生代码以支持系统内录（MediaProjection）
 *
 * 说明：本文件为 CommonJS 格式，由 Expo CLI 在 Node 环境执行，
 * 因此使用 require / module.exports / __dirname，需禁用 no-undef 规则。
 */

const {
  withAndroidManifest,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * 添加 Android 权限
 */
function withAudioCapturePermissions(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application?.[0];

    if (!mainApplication) {
      throw new Error("Cannot find <application> in AndroidManifest.xml");
    }

    // 添加必要的权限
    if (!androidManifest.manifest["uses-permission"]) {
      androidManifest.manifest["uses-permission"] = [];
    }

    const permissions = [
      "android.permission.RECORD_AUDIO",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
    ];

    permissions.forEach((permission) => {
      const exists = androidManifest.manifest["uses-permission"].some(
        (p) => p.$["android:name"] === permission
      );
      if (!exists) {
        androidManifest.manifest["uses-permission"].push({
          $: { "android:name": permission },
        });
      }
    });

    return config;
  });
}

/**
 * 注入原生模块代码
 */
function withAudioCaptureNativeCode(config) {
  return withMainApplication(config, async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const androidProjectPath = path.join(
      projectRoot,
      "android",
      "app",
      "src",
      "main",
      "java",
      config.android?.package?.split(".").join("/") || "anonymous"
    );

    // 确保目录存在
    if (!fs.existsSync(androidProjectPath)) {
      console.warn(
        `[android-audio-capture] Android project path not found: ${androidProjectPath}`
      );
      console.warn(
        "[android-audio-capture] Native code will be injected during build"
      );
      return config;
    }

    // 复制原生模块文件
    const pluginDir = path.join(__dirname, "android");
    const files = ["AudioCaptureModule.java", "AudioCapturePackage.java"];

    files.forEach((file) => {
      const sourcePath = path.join(pluginDir, file);
      const destPath = path.join(androidProjectPath, file);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`[android-audio-capture] Copied ${file}`);
      }
    });

    return config;
  });
}

/**
 * 主 Config Plugin 函数
 */
module.exports = function withAndroidAudioCapture(config) {
  // 添加权限
  config = withAudioCapturePermissions(config);

  // 注入原生代码
  config = withAudioCaptureNativeCode(config);

  return config;
};
