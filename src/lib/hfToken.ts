/**
 * Hugging Face Access Token 管理
 *
 * Token 为用户免费获取的开源凭证（注册即得，无需付费 / 无需信用卡）。
 * 原生存储使用 expo-secure-store（iOS Keychain / Android Keystore）；
 * Web 预览环境 secure-store 不可用，回退到 localStorage（仅作凭证存储，非业务数据）。
 */
import * as SecureStore from "expo-secure-store";

const KEY = "hf_access_token";

export async function getHfToken(): Promise<string> {
  if (process.env.EXPO_OS === "web") {
    try {
      return localStorage.getItem(KEY) || "";
    } catch {
      return "";
    }
  }
  try {
    return (await SecureStore.getItemAsync(KEY)) || "";
  } catch {
    return "";
  }
}

export async function setHfToken(token: string): Promise<void> {
  const value = token.trim();
  if (process.env.EXPO_OS === "web") {
    try {
      if (value) localStorage.setItem(KEY, value);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    if (value) {
      await SecureStore.setItemAsync(KEY, value);
    } else {
      await SecureStore.deleteItemAsync(KEY);
    }
  } catch {
    /* ignore */
  }
}