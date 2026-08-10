/**
 * 音乐解密页面
 * 支持：QQ音乐、网易云、酷狗、酷我等平台加密格式
 */

import { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Upload, Lock, Unlock, Download, CheckCircle2, AlertTriangle } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { useFileStore, type AudioFile } from "@/store/fileStore";
import { decryptMusicFile } from "@/lib/musicDecrypt";
import { startTask, endTask } from "@/lib/taskGuard";
import { Panel, ScreenHeader } from "@/components/ui";

type DecryptStatus = "idle" | "selecting" | "decrypting" | "done" | "error";

interface DecryptTask {
  sourceFile: { name: string; uri: string };
  status: DecryptStatus;
  progress: number;
  outputFormat?: "mp3" | "flac" | "ogg" | "m4a";
  outputUri?: string;
  error?: string;
}

const SUPPORTED_FORMATS = [
  { ext: ".qmc0", platform: "QQ音乐", desc: "QMC0 加密格式" },
  { ext: ".qmc3", platform: "QQ音乐", desc: "QMC3 加密格式" },
  { ext: ".qmcflac", platform: "QQ音乐", desc: "QMCFLAC 加密格式" },
  { ext: ".qmcogg", platform: "QQ音乐", desc: "QMCOGG 加密格式" },
  { ext: ".mflac", platform: "QQ音乐", desc: "MFLAC 加密格式" },
  { ext: ".mgg", platform: "QQ音乐", desc: "MGG 加密格式" },
  { ext: ".ncm", platform: "网易云", desc: "NCM 加密格式" },
  { ext: ".kgm", platform: "酷狗", desc: "KGM 加密格式" },
  { ext: ".kgma", platform: "酷狗", desc: "KGMA 加密格式" },
  { ext: ".vpr", platform: "酷狗", desc: "VPR 加密格式" },
  { ext: ".kwm", platform: "酷我", desc: "KWM 加密格式" },
  { ext: ".tm0", platform: "其他", desc: "TM0 加密格式" },
  { ext: ".tm2", platform: "其他", desc: "TM2 加密格式" },
  { ext: ".tm3", platform: "其他", desc: "TM3 加密格式" },
  { ext: ".tm6", platform: "其他", desc: "TM6 加密格式" },
];

export default function DecryptScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addFiles = useFileStore((s) => s.addFiles);
  
  const [task, setTask] = useState<DecryptTask | null>(null);
  const [decryptedFiles, setDecryptedFiles] = useState<AudioFile[]>([]);

  const handleSelectFile = async () => {
    try {
      setTask({ sourceFile: { name: "", uri: "" }, status: "selecting", progress: 0 });
      
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setTask(null);
        return;
      }

      const file = result.assets[0];
      
      // 检查文件扩展名
      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      const isSupported = SUPPORTED_FORMATS.some(f => f.ext === ext);
      
      if (!isSupported) {
        setTask({
          sourceFile: { name: file.name, uri: file.uri },
          status: "error",
          progress: 0,
          error: `不支持的文件格式：${ext}`,
        });
        return;
      }

      // 开始解密
      setTask({
        sourceFile: { name: file.name, uri: file.uri },
        status: "decrypting",
        progress: 0,
      });

      // 保活防杀：解密期间禁止息屏 + 状态栏「AI 计算中」提示
      await startTask("加密格式解密中");

      // 模拟进度
      const progressInterval = setInterval(() => {
        setTask(prev => prev ? { ...prev, progress: Math.min(prev.progress + 10, 90) } : null);
      }, 200);

      const result2 = await decryptMusicFile(file.uri);
      clearInterval(progressInterval);

      if (!result2.success) {
        await endTask();
        setTask({
          sourceFile: { name: file.name, uri: file.uri },
          status: "error",
          progress: 0,
          error: result2.error || "解密失败",
        });
        return;
      }

      // 创建解密后的文件
      const outputExt = result2.outputFormat || "mp3";
      const outputName = file.name.replace(/\.[^.]+$/, `.${outputExt}`);
      // @ts-ignore - Uint8Array 类型兼容性
      const blob = new Blob([result2.audioData], { type: `audio/${outputExt}` });
      const outputUri = URL.createObjectURL(blob);

      const decryptedFile: AudioFile = {
        id: `decrypted-${Date.now()}`,
        name: outputName,
        ext: outputExt,
        format: outputExt.toUpperCase() as any,
        size: blob.size,
        duration: 0,
        uri: outputUri,
        title: result2.metadata?.title,
        artist: result2.metadata?.artist,
        album: result2.metadata?.album,
        createdAt: Date.now(),
      };

      addFiles([decryptedFile]);
      setDecryptedFiles(prev => [...prev, decryptedFile]);

      setTask({
        sourceFile: { name: file.name, uri: file.uri },
        status: "done",
        progress: 100,
        outputFormat: result2.outputFormat,
        outputUri,
      });

      await endTask();
    } catch (error) {
      await endTask();
      setTask(prev => prev ? {
        ...prev,
        status: "error",
        progress: 0,
        error: String(error),
      } : null);
    }
  };

  const handleExport = async (file: AudioFile) => {
    try {
      if (process.env.EXPO_OS === "web") {
        // Web 端：直接下载
        const a = document.createElement("a");
        a.href = file.uri;
        a.download = file.name;
        a.click();
      } else {
        // 移动端：使用 Sharing API
        // @ts-ignore - 动态导入类型问题
        const FileSystem = await import("expo-file-system");
        // @ts-ignore - 动态导入类型问题
        const fileUri = `${FileSystem.documentDirectory}${file.name}`;
        
        // 下载文件
        const response = await fetch(file.uri);
        const blob = await response.blob();
        const reader = new FileReader();
        
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          // @ts-ignore - 动态导入类型问题
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            // @ts-ignore - 动态导入类型问题
            encoding: "base64",
          });

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: `audio/${file.ext}`,
              dialogTitle: "导出解密文件",
            });
          }
        };
        
        reader.readAsDataURL(blob);
      }
    } catch (error) {
      console.error("导出失败:", error);
    }
  };

  const handleReset = () => {
    setTask(null);
  };

  const isIdle = !task || task.status === "idle";
  const isDecrypting = task?.status === "decrypting";
  const isDone = task?.status === "done";
  const isError = task?.status === "error";

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="音乐解密"
        subtitle="MUSIC DECRYPTION"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 支持格式说明 */}
        {isIdle && (
          <Panel title="支持格式 SUPPORTED FORMATS">
            <View className="p-3 gap-2">
              {SUPPORTED_FORMATS.map((fmt, idx) => (
                <View key={idx} className="flex-row items-center gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0">
                  <View className="h-8 w-20 items-center justify-center border border-primary bg-primary/10">
                    <Text className="font-mono text-[10px] font-bold text-primary">{fmt.ext}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-mono text-xs font-semibold text-foreground">{fmt.platform}</Text>
                    <Text className="font-mono text-[10px] text-muted-foreground">{fmt.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View className="border-t border-border px-3 py-2">
              <Text className="font-mono text-[10px] text-muted-foreground">
                💡 支持 QQ音乐、网易云、酷狗、酷我等平台的加密音乐文件解密
              </Text>
            </View>
          </Panel>
        )}

        {/* 选择文件按钮 */}
        {isIdle && (
          <Pressable
            onPress={handleSelectFile}
            className="flex-row items-center justify-center gap-3 border-2 border-dashed border-primary bg-primary/5 p-6 active:opacity-70"
          >
            <Upload size={24} color={C.primary} strokeWidth={1.5} />
            <Text className="font-mono text-sm font-bold text-primary">选择加密音乐文件</Text>
          </Pressable>
        )}

        {/* 解密进度 */}
        {isDecrypting && task && (
          <Panel title="解密中 DECRYPTING">
            <View className="p-4 gap-4 items-center">
              <View className="h-20 w-20 items-center justify-center rounded-full border-2 border-primary">
                <Lock size={32} color={C.primary} strokeWidth={1.5} />
              </View>
              <Text className="font-mono text-xs text-muted-foreground">{task.sourceFile.name}</Text>
              <View className="w-full h-2 border border-border bg-secondary">
                <View
                  className="h-full bg-primary"
                  style={{ width: `${task.progress}%` }}
                />
              </View>
              <Text className="font-mono text-sm font-bold text-primary">{task.progress}%</Text>
            </View>
          </Panel>
        )}

        {/* 解密成功 */}
        {isDone && task && (
          <Panel title="解密成功 SUCCESS">
            <View className="p-4 gap-4 items-center">
              <View className="h-20 w-20 items-center justify-center rounded-full border-2 border-green-500 bg-green-500/10">
                <Unlock size={32} color="#22c55e" strokeWidth={1.5} />
              </View>
              <View className="items-center gap-1">
                <Text className="font-mono text-xs text-muted-foreground">原文件</Text>
                <Text className="font-mono text-sm font-semibold text-foreground">{task.sourceFile.name}</Text>
              </View>
              <View className="items-center gap-1">
                <Text className="font-mono text-xs text-muted-foreground">解密后</Text>
                <Text className="font-mono text-sm font-semibold text-primary">
                  {task.sourceFile.name.replace(/\.[^.]+$/, `.${task.outputFormat}`)}
                </Text>
              </View>
              <View className="flex-row gap-2 w-full">
                <Pressable
                  onPress={handleReset}
                  className="flex-1 border border-border bg-transparent p-3 items-center active:opacity-70"
                >
                  <Text className="font-mono text-xs font-semibold text-foreground">继续解密</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.back()}
                  className="flex-1 border border-primary bg-primary p-3 items-center active:opacity-70"
                >
                  <Text className="font-mono text-xs font-semibold text-primary-foreground">返回播放器</Text>
                </Pressable>
              </View>
            </View>
          </Panel>
        )}

        {/* 解密失败 */}
        {isError && task && (
          <Panel title="解密失败 ERROR">
            <View className="p-4 gap-4 items-center">
              <View className="h-20 w-20 items-center justify-center rounded-full border-2 border-destructive bg-destructive/10">
                <AlertTriangle size={32} color={C.destructive} strokeWidth={1.5} />
              </View>
              <Text className="font-mono text-xs text-muted-foreground">{task.sourceFile.name}</Text>
              <Text className="font-mono text-sm text-destructive text-center">{task.error}</Text>
              <Pressable
                onPress={handleReset}
                className="border border-primary bg-primary px-6 py-3 active:opacity-70"
              >
                <Text className="font-mono text-xs font-semibold text-primary-foreground">重新选择</Text>
              </Pressable>
            </View>
          </Panel>
        )}

        {/* 已解密文件列表 */}
        {decryptedFiles.length > 0 && (
          <Panel title={`已解密文件 (${decryptedFiles.length})`}>
            <View className="gap-2 p-3">
              {decryptedFiles.map((file) => (
                <View key={file.id} className="flex-row items-center gap-3 border border-border bg-card p-3">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <CheckCircle2 size={20} color={C.primary} strokeWidth={1.5} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-mono text-xs font-semibold text-foreground" numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text className="font-mono text-[10px] text-muted-foreground">
                      {file.format} · {(file.size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleExport(file)}
                    className="h-8 w-8 items-center justify-center border border-primary bg-primary/10 active:opacity-70"
                  >
                    <Download size={14} color={C.primary} strokeWidth={1.5} />
                  </Pressable>
                </View>
              ))}
            </View>
          </Panel>
        )}

        {/* 使用说明 */}
        <Panel title="使用说明 INSTRUCTIONS">
          <View className="p-3 gap-2">
            <Text className="font-mono text-xs leading-5 text-foreground">
              1. 点击「选择加密音乐文件」按钮
            </Text>
            <Text className="font-mono text-xs leading-5 text-foreground">
              2. 选择需要解密的音乐文件（支持 QMC/NCM/KGM/KWM 等格式）
            </Text>
            <Text className="font-mono text-xs leading-5 text-foreground">
              3. 等待解密完成，解密后的文件会自动添加到文件库
            </Text>
            <Text className="font-mono text-xs leading-5 text-foreground">
              4. 可以在播放器中直接播放，或导出到本地
            </Text>
          </View>
          <View className="border-t border-border px-3 py-2">
            <Text className="font-mono text-[10px] text-muted-foreground">
              ⚠️ 解密功能仅供学习交流使用，请勿用于商业用途
            </Text>
          </View>
        </Panel>
      </ScrollView>
    </View>
  );
}
