/* eslint-disable no-undef */
/**
 * Expo Config Plugin for Android Audio Capture
 * 注入 AudioCaptureModule 原生代码以支持系统内录（MediaProjection）
 *
 * 说明：本文件为 CommonJS 格式，由 Expo CLI 在 Node 环境执行。
 */

const {
  withAndroidManifest,
  withMainApplication,
} = require("@expo/config-plugins");
const fs   = require("fs");
const path = require("path");

// ─── 1. 添加 Android 权限 ─────────────────────────────────────────────────────

function withAudioCapturePermissions(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

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

// ─── 2. 注入 Java 原生模块文件 ────────────────────────────────────────────────

function withAudioCaptureNativeCode(config) {
  return withMainApplication(config, async (config) => {
    const projectRoot       = config.modRequest.projectRoot;
    const androidProjectPath = path.join(
      projectRoot, "android", "app", "src", "main", "java",
      (config.android?.package || "com.miaoda.appdk2quyiid79d").split(".").join("/")
    );

    if (!fs.existsSync(androidProjectPath)) {
      console.warn(`[android-audio-capture] path not found: ${androidProjectPath}`);
      return config;
    }

    const pluginJavaDir = path.join(__dirname, "android");
    const files = ["AudioCaptureModule.java", "AudioCapturePackage.java"];

    files.forEach((file) => {
      const src  = path.join(pluginJavaDir, file);
      const dest = path.join(androidProjectPath, file);
      if (fs.existsSync(src)) {
        let content = fs.readFileSync(src, "utf8");
        const actualPkg = config.android?.package || "com.miaoda.appdk2quyiid79d";
        content = content.replace(/^package\s+[\w.]+;/m, `package ${actualPkg};`);
        fs.writeFileSync(dest, content, "utf8");
        console.log(`[android-audio-capture] Injected ${file} (pkg=${actualPkg})`);
      }
    });

    return config;
  });
}

// ─── 主 Config Plugin ─────────────────────────────────────────────────────────

module.exports = function withAndroidAudioCapture(config) {
  config = withAudioCapturePermissions(config);
  config = withAudioCaptureNativeCode(config);
  return config;
};
