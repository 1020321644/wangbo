const { getDefaultConfig } = require('expo/metro-config');
const { withDevkit } = require('miaoda-expo-devkit/metro');

const config = getDefaultConfig(__dirname);

// 允许打包 ONNX 模型文件（AI 推理用）
config.resolver.assetExts.push('onnx');

module.exports = withDevkit(config);
