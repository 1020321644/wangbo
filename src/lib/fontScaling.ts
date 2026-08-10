/**
 * 全局字体缩放配置
 *
 * 开启后，所有 Text / TextInput 默认 allowFontScaling=true，
 * 字号会跟随系统字体大小设置自动缩放（辅助功能友好）。
 *
 * 单个组件可通过显式设置 allowFontScaling={false} 关闭（如刻意固定的小徽章）。
 */
import { Text, TextInput } from "react-native";

export function enableFontScaling() {
  try {
    (Text as any).defaultProps = {
      ...(Text as any).defaultProps,
      allowFontScaling: true,
    };
    (TextInput as any).defaultProps = {
      ...(TextInput as any).defaultProps,
      allowFontScaling: true,
    };
  } catch {
    // 部分 RN 版本不支持 defaultProps 赋值，忽略即可
  }
}