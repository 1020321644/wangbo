/**
 * Android 系统内录测试页面
 * ⚠️ 仅 Android 10+ 支持，iOS 不支持系统内录
 */

import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Radio, Play, Square, CheckCircle2, AlertTriangle, Info } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { Panel, ScreenHeader } from "@/components/ui";
import { AndroidAudioCapture } from "@/lib/androidAudioCapture";

export default function AndroidAudioCaptureTestScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ⚠️ iOS 不支持系统内录，直接显示提示
  if (process.env.EXPO_OS === "ios") {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader
          title="Android 系统内录测试"
          subtitle="ANDROID AUDIO CAPTURE TEST"
          onBack={() => router.back()}
        />
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <Panel title="不支持 iOS">
            <View className="p-6 gap-4 items-center">
              <View className="h-20 w-20 items-center justify-center rounded-full border-2 border-muted bg-muted/10">
                <AlertTriangle size={32} color={C.muted} strokeWidth={1.5} />
              </View>
              <Text className="font-mono text-sm font-bold text-foreground text-center">
                iOS 不支持系统内录
              </Text>
              <Text className="font-mono text-xs text-muted-foreground text-center leading-5">
                系统内录功能仅支持 Android 10 (API 29) 或更高版本。
                {"\n\n"}
                iOS 系统不提供系统内录 API，无法录制系统音频。
                {"\n\n"}
                如需录制音频，请使用"后台录制母带"功能（麦克风录制）。
              </Text>
              <Pressable
                onPress={() => router.back()}
                className="border border-primary bg-primary px-6 py-3 active:opacity-70"
              >
                <Text className="font-mono text-xs font-semibold text-primary-foreground">返回</Text>
              </Pressable>
            </View>
          </Panel>
        </ScrollView>
      </View>
    );
  }

  const [supported, setSupported] = useState(false);
  const [apiLevel, setApiLevel] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioDataCount, setAudioDataCount] = useState(0);
  const [status, setStatus] = useState<string>("未初始化");

  // 检查支持
  useEffect(() => {
    (async () => {
      try {
        const result = await AndroidAudioCapture.isSupported();
        setSupported(result.supported);
        setApiLevel(result.apiLevel);
        setStatus(
          result.supported
            ? `支持系统内录 (API ${result.apiLevel})`
            : `不支持系统内录 (API ${result.apiLevel}，需要 API 29+)`
        );
      } catch (error) {
        setStatus(`检查失败: ${error}`);
      }
    })();
  }, []);

  // 监听权限授予
  useEffect(() => {
    const unsubscribe = AndroidAudioCapture.onPermissionGranted(() => {
      setPermissionGranted(true);
      setStatus("权限已授予");
    });

    return unsubscribe;
  }, []);

  // 监听音频数据
  useEffect(() => {
    const unsubscribe = AndroidAudioCapture.onAudioData((_data) => {
      setAudioDataCount((prev) => prev + 1);
      setStatus(`正在录制... 已接收 ${audioDataCount + 1} 个音频包`);
    });

    return unsubscribe;
  }, [audioDataCount]);

  // 请求权限
  const handleRequestPermission = async () => {
    try {
      setStatus("正在请求权限...");
      const result = await AndroidAudioCapture.requestPermission();
      
      if (result.granted) {
        setPermissionGranted(true);
        setStatus("权限已授予");
      } else {
        setStatus("权限被拒绝");
      }
    } catch (error: any) {
      setStatus(`权限请求失败: ${error.message}`);
    }
  };

  // 开始录制
  const handleStartCapture = async () => {
    try {
      setStatus("正在启动录制...");
      await AndroidAudioCapture.startCapture();
      setIsRecording(true);
      setAudioDataCount(0);
      setStatus("录制中...");
    } catch (error: any) {
      setStatus(`启动失败: ${error.message}`);
    }
  };

  // 停止录制
  const handleStopCapture = async () => {
    try {
      setStatus("正在停止录制...");
      await AndroidAudioCapture.stopCapture();
      setIsRecording(false);
      setStatus(`录制已停止，共接收 ${audioDataCount} 个音频包`);
    } catch (error: any) {
      setStatus(`停止失败: ${error.message}`);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Android 系统内录测试"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerClassName="p-4 gap-4"
        contentInsetAdjustmentBehavior="automatic"
        style={{ paddingBottom: insets.bottom }}
      >
        {/* 系统支持状态 */}
        <Panel>
          <View className="flex-row items-center gap-3 mb-3">
            <Info size={20} color={C.cyan} />
            <Text className="text-lg font-semibold text-foreground">
              系统支持检测
            </Text>
          </View>
          <View className="gap-2">
            <View className="flex-row justify-between items-center">
              <Text className="text-muted-foreground">Android API 版本</Text>
              <Text className="text-foreground font-medium">
                {apiLevel > 0 ? apiLevel : "检测中..."}
              </Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-muted-foreground">系统内录支持</Text>
              <View className="flex-row items-center gap-2">
                {supported ? (
                  <>
                    <CheckCircle2 size={16} color={C.green} />
                    <Text className="text-foreground font-medium">支持</Text>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} color={C.destructive} />
                    <Text className="text-foreground font-medium">不支持</Text>
                  </>
                )}
              </View>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-muted-foreground">权限状态</Text>
              <Text
                className="font-medium"
                style={{
                  color: permissionGranted ? C.green : C.muted,
                }}
              >
                {permissionGranted ? "已授权" : "未授权"}
              </Text>
            </View>
          </View>
        </Panel>

        {/* 当前状态 */}
        <Panel>
          <View className="flex-row items-center gap-3 mb-3">
            <Radio size={20} color={C.orange} />
            <Text className="text-lg font-semibold text-foreground">
              当前状态
            </Text>
          </View>
          <Text className="text-foreground">{status}</Text>
          {isRecording && (
            <View className="mt-3 p-3 bg-card rounded-lg border border-border">
              <Text className="text-sm text-muted-foreground">
                已接收音频包: {audioDataCount}
              </Text>
            </View>
          )}
        </Panel>

        {/* 操作按钮 */}
        <Panel>
          <Text className="text-lg font-semibold text-foreground mb-3">
            操作步骤
          </Text>
          <View className="gap-3">
            {/* 步骤 1: 请求权限 */}
            <View>
              <Text className="text-sm text-muted-foreground mb-2">
                步骤 1: 请求系统内录权限
              </Text>
              <Pressable
                onPress={handleRequestPermission}
                disabled={!supported || permissionGranted}
                className={`rounded-xl p-4 items-center ${
                  !supported || permissionGranted
                    ? "bg-muted"
                    : "bg-primary"
                }`}
              >
                <Text
                  className={`font-semibold ${
                    !supported || permissionGranted
                      ? "text-muted-foreground"
                      : "text-primary-foreground"
                  }`}
                >
                  {permissionGranted ? "✓ 权限已授予" : "请求权限"}
                </Text>
              </Pressable>
            </View>

            {/* 步骤 2: 开始录制 */}
            <View>
              <Text className="text-sm text-muted-foreground mb-2">
                步骤 2: 开始捕获系统音频
              </Text>
              <Pressable
                onPress={handleStartCapture}
                disabled={!permissionGranted || isRecording}
                className={`rounded-xl p-4 items-center flex-row justify-center gap-2 ${
                  !permissionGranted || isRecording
                    ? "bg-muted"
                    : "bg-green"
                }`}
              >
                <Play
                  size={20}
                  color={
                    !permissionGranted || isRecording
                      ? C.muted
                      : "#ffffff"
                  }
                />
                <Text
                  className={`font-semibold ${
                    !permissionGranted || isRecording
                      ? "text-muted-foreground"
                      : "text-white"
                  }`}
                >
                  {isRecording ? "录制中..." : "开始录制"}
                </Text>
              </Pressable>
            </View>

            {/* 步骤 3: 停止录制 */}
            <View>
              <Text className="text-sm text-muted-foreground mb-2">
                步骤 3: 停止录制
              </Text>
              <Pressable
                onPress={handleStopCapture}
                disabled={!isRecording}
                className={`rounded-xl p-4 items-center flex-row justify-center gap-2 ${
                  !isRecording ? "bg-muted" : "bg-destructive"
                }`}
              >
                <Square
                  size={20}
                  color={!isRecording ? C.muted : "#ffffff"}
                />
                <Text
                  className={`font-semibold ${
                    !isRecording ? "text-muted-foreground" : "text-white"
                  }`}
                >
                  停止录制
                </Text>
              </Pressable>
            </View>
          </View>
        </Panel>

        {/* 使用说明 */}
        <Panel>
          <Text className="text-base font-semibold text-foreground mb-2">
            使用说明
          </Text>
          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">
              • 系统内录需要 Android 10 (API 29) 或更高版本
            </Text>
            <Text className="text-sm text-muted-foreground">
              • 首次使用需要授予屏幕录制权限
            </Text>
            <Text className="text-sm text-muted-foreground">
              • 系统会弹出权限对话框，请点击"立即开始"
            </Text>
            <Text className="text-sm text-muted-foreground">
              • 录制时会捕获系统播放的所有音频
            </Text>
            <Text className="text-sm text-muted-foreground">
              • 此功能仅在真机上可用，模拟器不支持
            </Text>
          </View>
        </Panel>

        {/* 技术说明 */}
        <Panel>
          <Text className="text-base font-semibold text-foreground mb-2">
            技术实现
          </Text>
          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">
              • 使用 Android MediaProjection API
            </Text>
            <Text className="text-sm text-muted-foreground">
              • 通过 Expo Config Plugin 注入原生代码
            </Text>
            <Text className="text-sm text-muted-foreground">
              • ActivityEventListener 处理权限回调
            </Text>
            <Text className="text-sm text-muted-foreground">
              • AudioRecord 捕获系统音频流
            </Text>
            <Text className="text-sm text-muted-foreground">
              • 采样率: 48kHz, 立体声, 16-bit PCM
            </Text>
          </View>
        </Panel>
      </ScrollView>
    </View>
  );
}
