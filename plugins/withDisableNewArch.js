/* eslint-disable no-undef */
/**
 * 自定义 Config Plugin：强制禁用 New Architecture
 *
 * 问题根因：
 *   - ffmpeg-kit-react-native 6.x 使用旧桥架构（ReactContextBaseJavaModule），不支持 TurboModules
 *   - onnxruntime-react-native 1.24 同样无 TurboModule 接口
 *   - expo prebuild 默认生成 newArchEnabled=true，导致两个模块均无法通过 Codegen 编译
 *
 * 解决方案：
 *   在 expo prebuild 的 Config Plugin 阶段修改 android/gradle.properties，
 *   确保 newArchEnabled=false 在任何 prebuild 重新生成后都生效。
 *   此插件注册在 app.json plugins 末尾，最后执行，保证不被其他插件覆盖。
 */
const { withGradleProperties } = require("@expo/config-plugins");

const withDisableNewArch = (config) => {
  return withGradleProperties(config, (config) => {
    const properties = config.modResults;

    // 查找现有的 newArchEnabled 属性并强制改为 false
    const index = properties.findIndex(
      (item) => item.type === "property" && item.key === "newArchEnabled"
    );

    if (index !== -1) {
      properties[index] = {
        type: "property",
        key: "newArchEnabled",
        value: "false",
      };
    } else {
      // 若不存在则追加
      properties.push({
        type: "property",
        key: "newArchEnabled",
        value: "false",
      });
    }

    return config;
  });
};

module.exports = withDisableNewArch;
