/**
 * 音频增强测试页面
 * 用于测试 FFmpeg DSP 滤镜和 AI 超分功能
 */

import { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Wand2, Zap, Download } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { Panel, ScreenHeader } from "@/components/ui";
import {
  analyzeAudioQuality,
  processWithFFmpeg,
  processWithAI,
  
} from "@/lib/audioProcessor";

export default function AudioEnhanceTestScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string } | null>(null);
  const [quality, setQuality] = useState<any>(null);
  const [progress, setProgress] = useState<any | null>(null);
  const [outputUri, setOutputUri] = useState<string | null>(null);

  // 选择文件
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        setSelectedFile({ uri: file.uri, name: file.name });
        setQuality(null);
        setProgress(null);
        setOutputUri(null);

        // 分析音频质量
        const q = await analyzeAudioQuality(file.uri);
        setQuality(q);
      }
    } catch (error) {
      console.error("选择文件失败:", error);
    }
  };

  // 使用 FFmpeg 处理
  const handleFFmpegProcess = async () => {
    if (!selectedFile) return;

    try {
      const output = `${selectedFile.uri}.enhanced.mp3`;
      setOutputUri(null);
      
      await processWithFFmpeg(selectedFile.uri, output, (p) => {
        setProgress(p);
      });

      setOutputUri(output);
    } catch (error) {
      console.error("FFmpeg 处理失败:", error);
    }
  };

  // 使用 AI 超分处理
  const handleAIProcess = async () => {
    if (!selectedFile) return;

    try {
      const output = `${selectedFile.uri}.ai-enhanced.mp3`;
      setOutputUri(null);
      
      await processWithAI(selectedFile.uri, output, (p) => {
        setProgress(p);
      });

      setOutputUri(output);
    } catch (error) {
      console.error("AI 处理失败:", error);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="音频增强测试"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerClassName="p-4 gap-4"
        contentInsetAdjustmentBehavior="automatic"
        style={{ paddingBottom: insets.bottom }}
      >
        {/* 文件选择 */}
        <Panel>
          <Text className="text-lg font-semibold text-foreground mb-3">
            1. 选择音频文件
          </Text>
          <Pressable
            onPress={handlePickFile}
            className="bg-primary rounded-xl p-4 items-center"
          >
            <Text className="text-primary-foreground font-semibold">
              {selectedFile ? "重新选择文件" : "选择音频文件"}
            </Text>
          </Pressable>
          {selectedFile && (
            <Text className="text-sm text-muted-foreground mt-2">
              已选择: {selectedFile.name}
            </Text>
          )}
        </Panel>

        {/* 音频质量分析 */}
        {quality && (
          <Panel>
            <Text className="text-lg font-semibold text-foreground mb-3">
              2. 音频质量分析
            </Text>
            <View className="gap-2">
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground">采样率</Text>
                <Text className="text-foreground font-medium">
                  {quality.sampleRate} Hz
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground">比特率</Text>
                <Text className="text-foreground font-medium">
                  {quality.bitrate} kbps
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground">质量评级</Text>
                <Text
                  className="font-semibold"
                  style={{
                    color:
                      quality.quality === "low"
                        ? C.destructive
                        : quality.quality === "medium"
                        ? C.orange
                        : C.green,
                  }}
                >
                  {quality.quality === "low"
                    ? "低质量"
                    : quality.quality === "medium"
                    ? "中等质量"
                    : "高质量"}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground">推荐方案</Text>
                <Text className="text-foreground font-medium">
                  {quality.recommendedMethod === "ffmpeg"
                    ? "FFmpeg DSP 滤镜"
                    : "AI 超分模型"}
                </Text>
              </View>
            </View>
          </Panel>
        )}

        {/* 处理选项 */}
        {selectedFile && quality && (
          <Panel>
            <Text className="text-lg font-semibold text-foreground mb-3">
              3. 选择处理方案
            </Text>
            <View className="gap-3">
              {/* FFmpeg 方案 */}
              <Pressable
                onPress={handleFFmpegProcess}
                disabled={progress?.status === "processing"}
                className="bg-card border border-border rounded-xl p-4"
              >
                <View className="flex-row items-center gap-3 mb-2">
                  <Zap size={20} color={C.orange} />
                  <Text className="text-base font-semibold text-foreground">
                    FFmpeg DSP 滤镜（快速）
                  </Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                  适用于普通质量音频，处理速度快（1-3秒/分钟）
                </Text>
              </Pressable>

              {/* AI 超分方案 */}
              <Pressable
                onPress={handleAIProcess}
                disabled={progress?.status === "processing"}
                className="bg-card border border-border rounded-xl p-4"
              >
                <View className="flex-row items-center gap-3 mb-2">
                  <Wand2 size={20} color={C.purple} />
                  <Text className="text-base font-semibold text-foreground">
                    AI 超分模型（高质量）
                  </Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                  适用于低质量音频，效果更好但较慢（10-30秒/分钟）
                </Text>
              </Pressable>
            </View>
          </Panel>
        )}

        {/* 处理进度 */}
        {progress && (
          <Panel>
            <Text className="text-lg font-semibold text-foreground mb-3">
              4. 处理进度
            </Text>
            <View className="gap-3">
              {/* 进度条 */}
              <View className="h-2 bg-muted rounded-full overflow-hidden">
                <View
                  className="h-full bg-primary"
                  style={{ width: `${progress.progress}%` }}
                />
              </View>

              {/* 状态信息 */}
              <View className="gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">状态</Text>
                  <Text className="text-foreground font-medium">
                    {progress.message}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">进度</Text>
                  <Text className="text-foreground font-medium">
                    {progress.progress}%
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">已用时间</Text>
                  <Text className="text-foreground font-medium">
                    {progress.elapsed.toFixed(1)} 秒
                  </Text>
                </View>
                {progress.estimated > 0 && (
                  <View className="flex-row justify-between">
                    <Text className="text-muted-foreground">预计剩余</Text>
                    <Text className="text-foreground font-medium">
                      {progress.estimated.toFixed(1)} 秒
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Panel>
        )}

        {/* 处理结果 */}
        {outputUri && progress?.status === "done" && (
          <Panel>
            <Text className="text-lg font-semibold text-foreground mb-3">
              5. 处理完成
            </Text>
            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <Download size={20} color={C.green} />
                <Text className="text-foreground">
                  增强后的音频已保存
                </Text>
              </View>
              <Text className="text-sm text-muted-foreground">
                输出路径: {outputUri}
              </Text>
              <Pressable
                onPress={() => {
                  // TODO: 播放或分享增强后的音频
                  console.log("播放增强后的音频:", outputUri);
                }}
                className="bg-primary rounded-xl p-3 items-center"
              >
                <Text className="text-primary-foreground font-semibold">
                  播放增强后的音频
                </Text>
              </Pressable>
            </View>
          </Panel>
        )}

        {/* 说明 */}
        <Panel>
          <Text className="text-base font-semibold text-foreground mb-2">
            功能说明
          </Text>
          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">
              • FFmpeg DSP 滤镜：使用高通滤波、动态压缩、均衡器和限幅器组合，快速增强音频质量
            </Text>
            <Text className="text-sm text-muted-foreground">
              • AI 超分模型：使用深度学习模型进行音频超分辨率处理，适合修复低质量音频
            </Text>
            <Text className="text-sm text-muted-foreground">
              • 系统会根据音频质量自动推荐最佳处理方案
            </Text>
          </View>
        </Panel>
      </ScrollView>
    </View>
  );
}
