import { useColorScheme } from "react-native";

export const NAV_THEME = {
  dark: {
    background: "#0A1128",
    border: "#1E2A4F",
    card: "#0F1830",
    notification: "#FF5E00",
    primary: "#FF5E00",
    text: "#E8ECF5",
  },
  light: {
    background: "#F4F6FC",
    border: "#D4DAEA",
    card: "#FFFFFF",
    notification: "#FF5E00",
    primary: "#FF5E00",
    text: "#0A1128",
  },
};

/** 固定品牌色（两套主题下均不变） */
export const COLORS = {
  blueprint: "#0A1128",
  panel: "#0F1830",
  border: "#1E2A4F",
  orange: "#FF5E00",
  primary: "#FF5E00",
  cyan: "#00F0FF",
  muted: "#5A6A8C",
  foreground: "#E8ECF5",
  text: "#E8ECF5",
  destructive: "#EF4444",
  green: "#22c55e",
  purple: "#a855f7",
};

/** 响应式颜色 hook：随系统亮/暗模式自动切换 */
export function useColors() {
  const scheme = useColorScheme();
  const dark = scheme !== "light"; // 未知/null 时默认深色

  return {
    // 品牌色，两套主题不变
    orange:      "#FF5E00",
    primary:     "#FF5E00",
    cyan:        "#00F0FF",
    destructive: "#EF4444",
    green:       "#22c55e",
    purple:      "#a855f7",
    // 随主题切换的语义色
    background:  dark ? "#0A1128" : "#F4F6FC",
    panel:       dark ? "#0F1830" : "#FFFFFF",
    blueprint:   dark ? "#0A1128" : "#F4F6FC",
    border:      dark ? "#1E2A4F" : "#D4DAEA",
    foreground:  dark ? "#E8ECF5" : "#0A1128",
    text:        dark ? "#E8ECF5" : "#0A1128",
    muted:       dark ? "#5A6A8C" : "#6B7A9A",
    isDark:      dark,
  };
}