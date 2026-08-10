import { supabase } from "@/client/supabase";
import { getDeviceId } from "@/lib/deviceId";
import type { AudioFile } from "@/store/fileStore";
import type { HistoryRecord } from "@/store/historyStore";
import type { ConvertParams } from "@/lib/audioEngine";

// ─────────────────────────────────────────────
// audio_files
// ─────────────────────────────────────────────

export async function dbLoadFiles(): Promise<AudioFile[]> {
  const deviceId = await getDeviceId();
  const { data, error } = await supabase
    .from("audio_files")
    .select("id,name,ext,format,size,duration,uri,converted,target_format,created_at,title,artist,album,year,genre,comment,sample_rate,bit_depth,bitrate,master_enhance")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.map(rowToFile) : [];
}

export async function dbInsertFiles(files: AudioFile[]): Promise<void> {
  const deviceId = await getDeviceId();
  const rows = files.map((f) => fileToRow(f, deviceId));
  const { error } = await supabase.from("audio_files").insert(rows);
  if (error) throw new Error(error.message);
}

export async function dbDeleteFile(id: string): Promise<void> {
  const { error } = await supabase.from("audio_files").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function dbUpdateFile(
  id: string,
  patch: Partial<Omit<AudioFile, "id">>
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.ext !== undefined) row.ext = patch.ext;
  if (patch.format !== undefined) row.format = patch.format;
  if (patch.size !== undefined) row.size = patch.size;
  if (patch.duration !== undefined) row.duration = patch.duration;
  if (patch.uri !== undefined) row.uri = patch.uri;
  if (patch.converted !== undefined) row.converted = patch.converted;
  if (patch.targetFormat !== undefined) row.target_format = patch.targetFormat;
  if (patch.createdAt !== undefined) row.created_at = patch.createdAt;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.artist !== undefined) row.artist = patch.artist;
  if (patch.album !== undefined) row.album = patch.album;
  if (patch.year !== undefined) row.year = patch.year;
  if (patch.genre !== undefined) row.genre = patch.genre;
  if (patch.comment !== undefined) row.comment = patch.comment;
  if (patch.sampleRate !== undefined) row.sample_rate = patch.sampleRate;
  if (patch.bitDepth !== undefined) row.bit_depth = patch.bitDepth;
  if (patch.bitrate !== undefined) row.bitrate = patch.bitrate;
  if (patch.masterEnhance !== undefined) row.master_enhance = patch.masterEnhance;
  const { error } = await supabase.from("audio_files").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function dbClearFiles(): Promise<void> {
  const deviceId = await getDeviceId();
  const { error } = await supabase
    .from("audio_files")
    .delete()
    .eq("device_id", deviceId);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// history_records
// ─────────────────────────────────────────────

export async function dbLoadHistory(): Promise<HistoryRecord[]> {
  const deviceId = await getDeviceId();
  const { data, error } = await supabase
    .from("history_records")
    .select(
      "id,source_name,source_format,target_format,mode,output_name,output_size,duration,type,created_at"
    )
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.map(rowToHistory) : [];
}

export async function dbInsertHistory(r: HistoryRecord): Promise<void> {
  const deviceId = await getDeviceId();
  const { error } = await supabase.from("history_records").insert({
    id: r.id,
    device_id: deviceId,
    source_name: r.sourceName,
    source_format: r.sourceFormat ?? null,
    target_format: r.targetFormat,
    mode: r.mode,
    output_name: r.outputName,
    output_size: r.outputSize,
    duration: r.duration,
    type: r.type,
    created_at: r.createdAt,
  });
  if (error) throw new Error(error.message);
}

export async function dbClearHistory(): Promise<void> {
  const deviceId = await getDeviceId();
  const { error } = await supabase
    .from("history_records")
    .delete()
    .eq("device_id", deviceId);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// user_params
// ─────────────────────────────────────────────

export async function dbLoadParams(): Promise<ConvertParams | null> {
  const deviceId = await getDeviceId();
  const { data, error } = await supabase
    .from("user_params")
    .select("sample_rate,bit_depth,bitrate,master_enhance,enhance_level")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    sampleRate: data.sample_rate,
    bitDepth: data.bit_depth,
    bitrate: data.bitrate,
    masterEnhance: data.master_enhance,
    // 旧记录可能无 enhance_level（migration 前的数据），回落默认 simple
    enhanceLevel: (data.enhance_level === "advanced" ? "advanced" : "simple"),
  };
}

export async function dbUpsertParams(params: ConvertParams): Promise<void> {
  const deviceId = await getDeviceId();
  const { error } = await supabase.from("user_params").upsert(
    {
      device_id: deviceId,
      sample_rate: params.sampleRate,
      bit_depth: params.bitDepth,
      bitrate: params.bitrate,
      master_enhance: params.masterEnhance,
      enhance_level: params.enhanceLevel ?? "simple",
      updated_at: Date.now(),
    },
    { onConflict: "device_id" }
  );
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// 数据映射
// ─────────────────────────────────────────────

function rowToFile(r: Record<string, unknown>): AudioFile {
  return {
    id: r.id as string,
    name: r.name as string,
    ext: r.ext as string,
    format: (r.format as AudioFile["format"]) ?? null,
    size: Number(r.size),
    duration: Number(r.duration),
    uri: (r.uri as string) || "",
    converted: Boolean(r.converted),
    targetFormat: (r.target_format as AudioFile["targetFormat"]) ?? undefined,
    createdAt: Number(r.created_at),
    title: (r.title as string) || undefined,
    artist: (r.artist as string) || undefined,
    album: (r.album as string) || undefined,
    year: (r.year as string) || undefined,
    genre: (r.genre as string) || undefined,
    comment: (r.comment as string) || undefined,
    sampleRate: (r.sample_rate as string) || undefined,
    bitDepth: (r.bit_depth as string) || undefined,
    bitrate: (r.bitrate as string) || undefined,
    masterEnhance: r.master_enhance != null ? Boolean(r.master_enhance) : undefined,
  };
}

function fileToRow(f: AudioFile, deviceId: string): Record<string, unknown> {
  return {
    id: f.id,
    device_id: deviceId,
    name: f.name,
    ext: f.ext,
    format: f.format ?? null,
    size: f.size,
    duration: f.duration,
    uri: f.uri,
    converted: f.converted ?? false,
    target_format: f.targetFormat ?? null,
    created_at: f.createdAt,
    title: f.title ?? null,
    artist: f.artist ?? null,
    album: f.album ?? null,
    year: f.year ?? null,
    genre: f.genre ?? null,
    comment: f.comment ?? null,
    sample_rate: f.sampleRate ?? null,
    bit_depth: f.bitDepth ?? null,
    bitrate: f.bitrate ?? null,
    master_enhance: f.masterEnhance ?? false,
  };
}

function rowToHistory(r: Record<string, unknown>): HistoryRecord {
  return {
    id: r.id as string,
    sourceName: r.source_name as string,
    sourceFormat: (r.source_format as HistoryRecord["sourceFormat"]) ?? null,
    targetFormat: r.target_format as HistoryRecord["targetFormat"],
    mode: r.mode as HistoryRecord["mode"],
    outputName: r.output_name as string,
    outputSize: Number(r.output_size),
    duration: Number(r.duration),
    type: r.type as HistoryRecord["type"],
    createdAt: Number(r.created_at),
  };
}
