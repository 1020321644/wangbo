/* eslint-disable no-undef */
/**
 * Expo config plugin：在 android/build.gradle 的 allprojects 块中
 * 注入 ext.ffmpegKitPackage = "audio"，让 ffmpeg-kit-react-native 使用
 * 包含 lame / libvorbis / flac 编解码库的 audio 包。
 *
 * audio 包支持：MP3 (lame)、OGG (libvorbis)、FLAC、AAC、WAV、ALAC
 * 以及 DSF/DFF 文件的解码（内置 dsd_lsbf/dsd_msbf decoder）。
 *
 * 说明：本文件为 CommonJS 格式，由 Expo CLI 在 Node 环境执行，
 * 因此使用 require / module.exports，需禁用 no-undef 规则。
 */
const { withProjectBuildGradle } = require("@expo/config-plugins");

const withFfmpegKitPackage = (config) => {
  return withProjectBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes("ffmpegKitPackage")) return cfg;
    cfg.modResults.contents = contents.replace(
      /allprojects\s*\{/,
      `ext {\n    ffmpegKitPackage = "audio"\n}\n\nallprojects {`
    );
    return cfg;
  });
};

module.exports = withFfmpegKitPackage;
