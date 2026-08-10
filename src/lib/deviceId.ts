import * as Crypto from "expo-crypto";

const KEY = "audio_converter_device_id";

// 获取或生成持久化设备 ID
// 匿名应用：用 device_id 区分不同设备的数据
let _cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (_cached) return _cached;

  // Web：使用 window.localStorage
  if (process.env.EXPO_OS === "web") {
    const stored = window.localStorage.getItem(KEY);
    if (stored) { _cached = stored; return stored; }
    const id = await Crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
    _cached = id;
    return id;
  }

  // Native：使用 expo-sqlite 持久化 KV
  try {
    const { openDatabaseAsync } = await import("expo-sqlite");
    const db = await openDatabaseAsync("device_meta.db");
    await db.runAsync(
      "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    );
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM kv WHERE key = ?",
      [KEY]
    );
    if (row?.value) { _cached = row.value; return row.value; }
    const id = await Crypto.randomUUID();
    await db.runAsync("INSERT INTO kv (key, value) VALUES (?, ?)", [KEY, id]);
    _cached = id;
    return id;
  } catch {
    const id = await Crypto.randomUUID();
    _cached = id;
    return id;
  }
}
