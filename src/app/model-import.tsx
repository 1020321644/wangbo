/**
 * AI 模型管理页面
 *
 * App 内置三个默认模型（GTCRN / NovaSR / HiFi-GAN+ BWE），开箱即用。
 * 用户也可从手机外部导入自定义 .onnx 文件覆盖默认模型（热插拔）。
 *
 *   - gtcrn      : GTCRN 16kHz 降噪（535 KB）— 简单/困难模式
 *   - hifiganbwe : HiFi-GAN+ BWE 带宽扩展（4.2 MB）— 困难模式超分
 *   - novasr     : NovaSR 16k→48k（229 KB）— 轻量超分备选
 */
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  ChevronLeft, Upload, Trash2, Cpu, CheckCircle2, AlertCircle, Package,
} from "lucide-react-native";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useColors } from "@/lib/theme";
import { useModelStore, type ModelEntry } from "@/store/modelStore";
import { BUNDLED_MODEL_URIS } from "@/lib/modelBootstrap";

interface ModelSlot {
  id: ModelEntry["id"];
  label: string;
  desc: string;
  sizeHint: string;
  mode: string;
}

const MODEL_SLOTS: ModelSlot[] = [
  {
    id: "gtcrn",
    label: "GTCRN 降噪",
    desc: "STFT 流式降噪 · 16kHz · 简单/困难模式",
    sizeHint: "内置 535 KB",
    mode: "简单 & 困难",
  },
  {
    id: "hifiganbwe",
    label: "HiFi-GAN+ BWE",
    desc: "WaveNet 带宽扩展 · 任意SR→48kHz · 困难模式",
    sizeHint: "内置 4.2 MB",
    mode: "困难模式",
  },
  {
    id: "novasr",
    label: "NovaSR 超分",
    desc: "极速超分辨率 · 16k→48k · 轻量备选",
    sizeHint: "内置 229 KB",
    mode: "备选",
  },
];

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "未知";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ModelImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();

  const models = useModelStore((s) => s.models);
  const setModel = useModelStore((s) => s.setModel);
  const removeModel = useModelStore((s) => s.removeModel);

  const [importingId, setImportingId] = useState<ModelEntry["id"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModelEntry["id"] | null>(null);

  // 每次进入页面时清空提示
  useFocusEffect(
    useCallback(() => {
      setError(null);
      setInfo(null);
    }, []),
  );

  const handleImport = async (slot: ModelSlot) => {
    setError(null);
    setInfo(null);
    setImportingId(slot.id);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/octet-stream", "model/onnx", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) {
        setImportingId(null);
        return;
      }

      const picked = result.assets[0];
      const name = picked.name ?? `${slot.id}.onnx`;

      // 仅允许 .onnx 文件
      if (!name.toLowerCase().endsWith(".onnx")) {
        setError(`仅支持导入 .onnx 模型文件，所选文件「${name}」不符合要求`);
        setImportingId(null);
        return;
      }

      // 复制到应用私有目录持久保存（documentDirectory）
      const srcUri = picked.uri;
      const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
      const destUri = `${dir}models/${slot.id}.onnx`;

      // 确保目录存在
      const dirInfo = await FileSystem.getInfoAsync(`${dir}models`);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${dir}models`, { intermediates: true });
      }

      // 若已存在则先删除旧文件
      const existInfo = await FileSystem.getInfoAsync(destUri);
      if (existInfo.exists) {
        await FileSystem.deleteAsync(destUri, { idempotent: true });
      }

      await FileSystem.copyAsync({ from: srcUri, to: destUri });

      const finalInfo = await FileSystem.getInfoAsync(destUri);
      const size = finalInfo.exists && finalInfo.size ? finalInfo.size : (picked.size ?? 0);

      setModel({
        id: slot.id,
        localUri: destUri,
        size,
        importedAt: Date.now(),
        label: name,
      });

      setInfo(`「${slot.label}」模型导入成功（${formatSize(size)}）`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "导入失败";
      setError(`导入失败：${msg}`);
    } finally {
      setImportingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const entry = models[deleteTarget];
    try {
      if (entry?.localUri) {
        await FileSystem.deleteAsync(entry.localUri, { idempotent: true });
      }
    } catch {
      /* 删除文件失败不阻塞 store 清理 */
    }
    removeModel(deleteTarget);
    setInfo(`已移除「${MODEL_SLOTS.find((s) => s.id === deleteTarget)?.label ?? "模型"}」`);
    setDeleteTarget(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* 顶部导航 */}
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: C.panel,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 4 }}
          >
            <ChevronLeft size={22} color={C.text} />
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: C.text }}>返回</Text>
          </Pressable>
          <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.text }}>
            AI 模型管理
          </Text>
          <View style={{ width: 60 }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 说明 */}
        <View
          style={{
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: C.panel,
            padding: 12,
            gap: 6,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Cpu size={14} color={C.orange} />
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>
              本地 AI 模型
            </Text>
          </View>
          <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, lineHeight: 14 }}>
            App 已内置三个默认 ONNX 模型（GTCRN / HiFi-GAN+ BWE / NovaSR），开箱即用。
            如需使用更新版本，可从手机本地导入 .onnx 文件覆盖内置版本（热插拔）。
          </Text>
        </View>

        {/* 提示信息 */}
        {error ? (
          <View style={{ borderWidth: 1, borderColor: C.destructive, backgroundColor: `${C.destructive}10`, padding: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AlertCircle size={14} color={C.destructive} />
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.destructive }}>{error}</Text>
            </View>
          </View>
        ) : null}
        {info ? (
          <View style={{ borderWidth: 1, borderColor: C.orange, backgroundColor: `${C.orange}10`, padding: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={14} color={C.orange} />
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text }}>{info}</Text>
            </View>
          </View>
        ) : null}

        {/* 模型槽位列表 */}
        {MODEL_SLOTS.map((slot) => {
          const entry = models[slot.id];
          const imported = !!entry;
          const importing = importingId === slot.id;

          return (
            <View
              key={slot.id}
              style={{
                borderWidth: 1,
                borderColor: imported ? C.orange : C.border,
                backgroundColor: C.panel,
              }}
            >
              <View
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: C.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderWidth: 1,
                      borderColor: imported ? C.orange : C.border,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: imported ? `${C.orange}15` : "transparent",
                    }}
                  >
                    <Cpu size={14} color={imported ? C.orange : C.muted} />
                  </View>
                  <View>
                    <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "bold", color: C.text }}>
                      {slot.label}
                    </Text>
                    <Text style={{ fontFamily: "monospace", fontSize: 8, color: C.muted }}>
                      {slot.sizeHint}
                    </Text>
                  </View>
                </View>
                {imported ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={12} color={C.orange} />
                    <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: C.orange }}>
                      已自定义
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Package size={12} color={C.muted} />
                    <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>内置版本</Text>
                  </View>
                )}
              </View>

              <View style={{ padding: 14, gap: 10 }}>
                <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, lineHeight: 14 }}>
                  {slot.desc}
                </Text>

                {imported && entry ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: C.border,
                      padding: 10,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>文件</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.text }} numberOfLines={1}>
                        {entry.label}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>大小</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.text }}>
                        {formatSize(entry.size)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>导入时间</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.text }}>
                        {formatDate(entry.importedAt)}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => handleImport(slot)}
                    disabled={importing}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      borderWidth: 1,
                      borderColor: C.orange,
                      backgroundColor: importing ? `${C.orange}30` : `${C.orange}15`,
                      paddingVertical: 10,
                      opacity: importing ? 0.7 : 1,
                    }}
                  >
                    {importing ? (
                      <ActivityIndicator size="small" color={C.orange} />
                    ) : (
                      <Upload size={14} color={C.orange} />
                    )}
                    <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.orange }}>
                      {imported ? "重新导入" : "导入模型"}
                    </Text>
                  </Pressable>

                  {imported ? (
                    <Pressable
                      onPress={() => setDeleteTarget(slot.id)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        borderWidth: 1,
                        borderColor: C.destructive,
                        backgroundColor: `${C.destructive}10`,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}
                    >
                      <Trash2 size={14} color={C.destructive} />
                      <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.destructive }}>
                        删除
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模型</AlertDialogTitle>
            <AlertDialogDescription>
              确定要移除「{MODEL_SLOTS.find((s) => s.id === deleteTarget)?.label ?? "模型"}」吗？
              删除后相关 AI 功能将降级为 FFmpeg DSP 处理，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>取消</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleDelete}>
              <Text>删除</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}