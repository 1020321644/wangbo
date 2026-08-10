/**
 * 设置页面
 * 包含：更新日志、关于软件、日志报告、法律条款
 */

import { View, Text, ScrollView, Pressable } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type RelativePathString } from "expo-router";
import {
  ChevronRight, Download, Trash2, Shield, FileText, Scale,
  Sparkles, Wrench, Star, History, Info, Cpu,
  AlertTriangle, CheckCircle, Smartphone, Bot, Zap, Cloud, CloudOff,
} from "lucide-react-native";
import { useSettingsStore } from "@/store/settingsStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useColors } from "@/lib/theme";
import { useLogStore } from "@/store/logStore";
import * as Sharing from "expo-sharing";

const APP_VERSION = "3.0.8";
const BUILD_NO    = "308";
const DEVELOPER   = "小布丁";
const WECHAT      = "ppppp2527";
const EMAIL       = "1020321644@qq.com";

// ── 更新日志数据 ──
const CHANGELOG = [
  {
    version: "3.0.8",
    date: "2026-08-10",
    tag: "major" as const,
    features: [
      "应用更名为「ai音乐音频处理Pro」",
      "参数调节：降噪强度 / Dry-Wet / 增益 / 6段EQ（±12dB）",
      "动态处理：LUFS标准化(-14) / 压缩器 / 限幅器（开关）",
      "AI智能调参：自动分析内容类型并推荐最优参数",
      "批处理：多文件队列 + 预设（人声/古典/直播）+ 自定义保存",
      "分析工具：响度历史曲线 / 削波标记 / A/B 对比",
      "元数据编辑：FFmpeg/SoX 采样率算法 + 标题/艺术家/专辑",
      "所有参数实时生效、默认关闭，基于本地 FFmpeg + ONNX",
    ],
    fixes: [],
  },
  {
    version: "2.1.0",
    date: "2026-08-10",
    tag: "major" as const,
    features: [
      "内置 ONNX 本地 AI 引擎，无需联网即可运行",
      "GTCRN-16k 神经网络降噪（简单模式）",
      "HiFi-GAN+ BWE 带宽扩展 + GTCRN 串联（困难模式）",
      "NovaSR 轻量超分模型（16kHz → 48kHz）",
      "Stem 分离改为本地 FFmpeg 频率域算法（离线可用）",
      "支持热插拔替换 .onnx 模型文件",
      "设置页新增 AI 引擎说明与设备适配建议",
    ],
    fixes: [
      "修复 stem.tsx 云端接口不可用导致分离失败",
      "修复 ai-enhance 参数签名不匹配",
      "修复 ONNX 缓存更新 Float32Array 类型错误",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-08-03",
    tag: "major" as const,
    features: [
      "主题跟随系统自动切换（白天亮色 / 夜晚深色）",
      "新增标准 AI 增强模式（云端开源模型增强）",
      "AI 评级联动推荐：评分完成后一键启用 AI 增强",
      "全新并排 Tab 按钮（标准AI增强 / AI超分修复）",
      "设置页快捷入口，支持从主界面直达",
    ],
    fixes: [
      "修复转换异常时界面死锁（startConvert 缺少 try/catch）",
      "修复 AAC 格式播放静音问题",
      "修复音频转换速度与格式兼容性",
      "修复深色/浅色模式下图标颜色适配",
    ],
  },
  {
    version: "1.5.x",
    date: "2026-07",
    tag: "minor" as const,
    features: [
      "母带级音频录制（麦克风 + 系统内录）",
      "音频 AI 评级与质量分析",
      "DSD 格式解码与转换支持",
    ],
    fixes: [
      "修复解密模块兼容性问题",
      "优化文件管理列表性能",
    ],
  },
  {
    version: "1.0.x",
    date: "2026-06",
    tag: "minor" as const,
    features: [
      "多格式音频互转（MP3 / FLAC / WAV / AAC / OGG / ALAC）",
      "FFmpeg 专业音频引擎集成",
      "歌曲元数据嵌入（标题/艺人/专辑/封面）",
    ],
    fixes: [],
  },
];

const TAG_STYLE: Record<string, { label: string; color: string }> = {
  major: { label: "MAJOR", color: "#FF5E00" },
  minor: { label: "MINOR", color: "#00F0FF" },
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const { logs, clearLogs, exportLogs } = useLogStore();

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount  = logs.filter((l) => l.level === "warn").length;

  const [exportPressed,    setExportPressed]    = useState(false);
  const [clearPressed,     setClearPressed]     = useState(false);
  const [privacyPressed,   setPrivacyPressed]   = useState(false);
  const [agreementPressed, setAgreementPressed] = useState(false);
  const [legalPressed,     setLegalPressed]     = useState(false);
  const [modelPressed,    setModelPressed]    = useState(false);
  const [changelogOpen,    setChangelogOpen]    = useState(true);  // 默认展开最新

  const [exportMsg,   setExportMsg]   = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportLogs = async () => {
    setExportMsg(null);
    setExportError(null);
    try {
      const content  = exportLogs();
      const fileName = `音乐格式转换器_日志报告_${new Date().toISOString().slice(0, 10)}.txt`;

      if (process.env.EXPO_OS === "web") {
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
        setExportMsg("日志报告已下载");
      } else {
        const FileSystem = await import("expo-file-system");
        // @ts-ignore
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;
        // @ts-ignore
        await FileSystem.writeAsStringAsync(fileUri, content, {
          // @ts-ignore
          encoding: "utf8",
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: "text/plain", dialogTitle: "导出日志报告" });
        } else {
          setExportMsg(`日志已保存：${fileUri}`);
        }
      }
    } catch (err) {
      setExportError(String(err));
    }
  };

  const handleClearLogs = () => {
    clearLogs();
    setExportMsg(null);
    setExportError(null);
  };

  return (
    <View className="flex-1" style={{ paddingTop: insets.top, backgroundColor: C.background }}>
      {/* 标题栏 */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "bold", color: C.orange }}>设置</Text>
        <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>SETTINGS · v{APP_VERSION}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* ── 更新日志 ── */}
        <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
          {/* 区块标题 - 可折叠 */}
          <Pressable
            onPress={() => setChangelogOpen((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              borderBottomWidth: changelogOpen ? 1 : 0, borderBottomColor: C.border,
              paddingHorizontal: 16, paddingVertical: 10 }}
            className="active:opacity-70"
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <History size={14} color={C.orange} />
              <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>
                更新日志
              </Text>
            </View>
            <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>
              {changelogOpen ? "▲" : "▼"}
            </Text>
          </Pressable>

          {changelogOpen && CHANGELOG.map((log, idx) => {
            const tagStyle = TAG_STYLE[log.tag];
            const isLatest = idx === 0;
            return (
              <View key={log.version} style={{
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: C.border,
                padding: 16, gap: 10,
              }}>
                {/* 版本行 */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "bold", color: C.text }}>
                    v{log.version}
                  </Text>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: tagStyle.color }}>
                    <Text style={{ fontFamily: "monospace", fontSize: 8, fontWeight: "bold", color: tagStyle.color }}>
                      {tagStyle.label}
                    </Text>
                  </View>
                  {isLatest && (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: C.orange }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 8, fontWeight: "bold", color: "#fff" }}>LATEST</Text>
                    </View>
                  )}
                  <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, marginLeft: "auto" }}>
                    {log.date}
                  </Text>
                </View>

                {/* 新功能 */}
                {log.features.length > 0 && (
                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Sparkles size={11} color={C.cyan} />
                      <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: C.cyan }}>
                        新功能
                      </Text>
                    </View>
                    {log.features.map((f, i) => (
                      <View key={i} style={{ flexDirection: "row", gap: 6 }}>
                        <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.cyan }}>+</Text>
                        <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.text, flex: 1, lineHeight: 14 }}>{f}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* 修复 */}
                {log.fixes.length > 0 && (
                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Wrench size={11} color={C.muted} />
                      <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: C.muted }}>
                        修复
                      </Text>
                    </View>
                    {log.fixes.map((fix, i) => (
                      <View key={i} style={{ flexDirection: "row", gap: 6 }}>
                        <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>✓</Text>
                        <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, flex: 1, lineHeight: 14 }}>{fix}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── 关于软件 ── */}
        <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
            borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Info size={14} color={C.orange} />
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>关于软件</Text>
          </View>

          <View style={{ padding: 16, gap: 14 }}>
            {/* Logo 区 */}
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 8 }}>
              <View style={{ width: 64, height: 64, borderWidth: 1, borderColor: C.orange,
                alignItems: "center", justifyContent: "center", backgroundColor: `${C.orange}15` }}>
                <Text style={{ fontSize: 32 }}>🎵</Text>
              </View>
              <Text style={{ fontFamily: "monospace", fontSize: 18, fontWeight: "bold", color: C.text }}>
                音乐格式转换器
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.orange }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.orange }}>
                    v{APP_VERSION}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>
                    Build {BUILD_NO}
                  </Text>
                </View>
              </View>
            </View>

            {/* AI 模型管理入口 */}
            <Pressable
              onPress={() => router.push("/model-import" as RelativePathString)}
              onPressIn={() => setModelPressed(true)}
              onPressOut={() => setModelPressed(false)}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                borderWidth: 1, borderColor: C.orange,
                backgroundColor: modelPressed ? `${C.orange}20` : `${C.orange}10`,
                paddingHorizontal: 12, paddingVertical: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Cpu size={16} color={C.orange} />
                <View>
                  <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.text }}>
                    AI 模型管理
                  </Text>
                  <Text style={{ fontFamily: "monospace", fontSize: 8, color: C.muted }}>
                    内置默认模型 · 已锁定
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={C.orange} />
            </Pressable>

            {/* 功能简介 */}
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, gap: 6 }}>
              {[
                "🎛  FFmpeg 专业音频引擎，支持 10+ 格式互转",
                "🤖  云端 AI 增强（Hugging Face 开源模型）",
                "🎚  母带级录制，支持系统内录与麦克风",
                "⭐  AI 音质评级与自动修复建议",
                "🌓  主题跟随系统，支持亮色 / 深色",
              ].map((item, i) => (
                <Text key={i} style={{ fontFamily: "monospace", fontSize: 10, color: C.text, lineHeight: 16 }}>
                  {item}
                </Text>
              ))}
            </View>

            {/* 开发者信息 */}
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Star size={11} color={C.orange} />
                <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: C.muted }}>
                  开发者
                </Text>
              </View>
              {[
                { label: "作者", value: DEVELOPER },
                { label: "微信", value: WECHAT },
                { label: "邮箱", value: EMAIL },
              ].map(({ label, value }) => (
                <View key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>{label}</Text>
                  <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text }}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── 云端增强 ── */}
        <CloudEnhanceSection />

        {/* ── AI 引擎与内置模型 ── */}
        <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
            borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Bot size={14} color={C.orange} />
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>
              AI 引擎与内置模型
            </Text>
          </View>

          <View style={{ padding: 16, gap: 10 }}>
            {/* 标题说明 */}
            <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, lineHeight: 14 }}>
              所有 AI 模型在本地设备运行，无需联网，使用内置默认模型在应用启动时一次性加载。
            </Text>

            {/* 模型列表 */}
            {[
              {
                name: "GTCRN-16k",
                role: "神经网络实时语音降噪",
                detail: "简单模式 · STFT 流式降噪 · 输入 16kHz · 输出增强频谱",
                size: "535 KB",
                builtin: true,
                color: C.cyan,
              },
              {
                name: "HiFi-GAN+ BWE",
                role: "带宽扩展 / 音频超分辨率",
                detail: "困难模式 · 波形域超分 · 补全高频谐波 · 输出 48kHz",
                size: "4.2 MB",
                builtin: true,
                color: C.cyan,
              },
              {
                name: "NovaSR",
                role: "轻量超分（16kHz → 48kHz）",
                detail: "备选超分模型 · opset 18 · 适合低内存设备",
                size: "229 KB",
                builtin: true,
                color: C.cyan,
              },
              {
                name: "ONNX Runtime",
                role: "本地 AI 推理框架",
                detail: "v1.17 · CPU/NNAPI 推理 · 无需 GPU",
                size: "运行时",
                builtin: true,
                color: C.muted,
              },
              {
                name: "FFmpeg 音频引擎",
                role: "格式转换 / DSP / Stem 分离",
                detail: "本地编译 · 支持 10+ 格式 · 频率域信号处理",
                size: "内置",
                builtin: true,
                color: C.muted,
              },
            ].map((m) => (
              <View key={m.name} style={{
                borderWidth: 1, borderColor: C.border, padding: 10, gap: 4,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Cpu size={11} color={m.color} />
                    <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.text }}>
                      {m.name}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    {m.builtin && (
                      <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: C.cyan }}>
                        <Text style={{ fontFamily: "monospace", fontSize: 7, color: C.cyan }}>内置</Text>
                      </View>
                    )}
                    <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>{m.size}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: "monospace", fontSize: 9, color: m.color }}>{m.role}</Text>
                <Text style={{ fontFamily: "monospace", fontSize: 8, color: C.muted, lineHeight: 12 }}>{m.detail}</Text>
              </View>
            ))}

            {/* 模式说明 */}
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, gap: 6 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: C.muted }}>推理模式对照</Text>
              {[
                { mode: "简单模式", pipeline: "GTCRN-16k → FFmpeg DSP 输出", cost: "低功耗，约 1–3 秒" },
                { mode: "困难模式", pipeline: "GTCRN-16k → HiFi-GAN+ BWE → 48kHz 输出", cost: "高精度，约 5–20 秒" },
              ].map((row) => (
                <View key={row.mode} style={{ borderLeftWidth: 2, borderLeftColor: C.orange, paddingLeft: 8, gap: 2 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: C.orange }}>{row.mode}</Text>
                  <Text style={{ fontFamily: "monospace", fontSize: 8, color: C.text }}>{row.pipeline}</Text>
                  <Text style={{ fontFamily: "monospace", fontSize: 8, color: C.muted }}>{row.cost}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── 设备适配建议 ── */}
        <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
            borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Smartphone size={14} color={C.orange} />
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>
              设备适配建议
            </Text>
          </View>

          <View style={{ padding: 16, gap: 12 }}>
            {/* 推荐 */}
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <CheckCircle size={12} color="#22c55e" />
                <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: "#22c55e" }}>
                  推荐配置（全部功能流畅运行）
                </Text>
              </View>
              {[
                "Android 12 及以上系统",
                "运行内存 8 GB 及以上",
                "2022 年后发布的旗舰或次旗舰处理器",
                "存储空间剩余 2 GB 以上",
                "处理器支持 NNAPI 或 Vulkan 计算加速",
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 6, paddingLeft: 4 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 8, color: "#22c55e" }}>✓</Text>
                  <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.text, flex: 1 }}>{item}</Text>
                </View>
              ))}
            </View>

            {/* 可用但受限 */}
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Zap size={12} color={C.orange} />
                <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: C.orange }}>
                  可用（AI 困难模式速度较慢）
                </Text>
              </View>
              {[
                "Android 10–11，运行内存 6 GB",
                "2020–2021 年旗舰处理器",
                "AI 困难模式推理时间约 15–40 秒",
                "建议仅使用简单模式或 FFmpeg 标准转换",
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 6, paddingLeft: 4 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 8, color: C.orange }}>△</Text>
                  <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.text, flex: 1 }}>{item}</Text>
                </View>
              ))}
            </View>

            {/* 不推荐 */}
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={12} color="#ef4444" />
                <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: "#ef4444" }}>
                  不推荐使用
                </Text>
              </View>
              {[
                "运行内存 4 GB 及以下",
                "Android 9 以下系统（系统内录不可用）",
                "4 核及以下低频处理器（发热严重）",
                "2019 年及更早发布的中低端处理器",
                "内置存储只剩 500 MB 以下的设备",
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 6, paddingLeft: 4 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 8, color: "#ef4444" }}>✗</Text>
                  <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, flex: 1 }}>{item}</Text>
                </View>
              ))}
            </View>

            {/* 系统内录特别说明 */}
            <View style={{
              borderWidth: 1, borderColor: C.orange, backgroundColor: `${C.orange}10`,
              padding: 10, gap: 4,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Info size={11} color={C.orange} />
                <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "bold", color: C.orange }}>
                  系统内录（REMOTE_SUBMIX）特别说明
                </Text>
              </View>
              <Text style={{ fontFamily: "monospace", fontSize: 8, color: C.text, lineHeight: 13 }}>
                系统内录功能需要 Android 10 及以上系统，并需在使用时授予「录音」与「录制屏幕」权限。
                部分厂商深度定制系统可能限制该权限，如遇无声请在系统设置中手动开启。
              </Text>
            </View>
          </View>
        </View>

        {/* 日志报告 */}
        <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>日志报告</Text>
          </View>

          <View style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text }}>日志记录</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>{logs.length} 条</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text }}>错误</Text>
              <Text style={{ 
                fontFamily: "monospace", 
                fontSize: 10, 
                fontWeight: "bold",
                color: errorCount > 0 ? "#ef4444" : C.muted
              }}>
                {errorCount} 条
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text }}>警告</Text>
              <Text style={{ 
                fontFamily: "monospace", 
                fontSize: 10, 
                fontWeight: "bold",
                color: warnCount > 0 ? "#eab308" : C.muted
              }}>
                {warnCount} 条
              </Text>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, flexDirection: "row", gap: 8 }}>
              {/* 导出日志按钮 */}
              <Pressable
                onPress={handleExportLogs}
                disabled={logs.length === 0}
                onPressIn={() => setExportPressed(true)}
                onPressOut={() => setExportPressed(false)}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center",
                  justifyContent: "center", gap: 8, borderWidth: 1,
                  borderColor: logs.length === 0 ? C.border : C.orange,
                  backgroundColor: logs.length === 0 ? C.panel : `${C.orange}20`,
                  padding: 12, opacity: exportPressed ? 0.7 : 1,
                }}
              >
                <Download size={14} color={logs.length === 0 ? C.muted : C.orange} />
                <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: logs.length === 0 ? C.muted : C.orange }}>
                  导出日志
                </Text>
              </Pressable>

              {/* 清空日志按钮 — AlertDialog 确认 */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Pressable
                    onPress={() => {}}
                    disabled={logs.length === 0}
                    onPressIn={() => setClearPressed(true)}
                    onPressOut={() => setClearPressed(false)}
                    style={{
                      flex: 1, flexDirection: "row", alignItems: "center",
                      justifyContent: "center", gap: 8, borderWidth: 1,
                      borderColor: logs.length === 0 ? C.border : "#ef4444",
                      backgroundColor: logs.length === 0 ? C.panel : "#ef444420",
                      padding: 12, opacity: clearPressed ? 0.7 : 1,
                    }}
                  >
                    <Trash2 size={14} color={logs.length === 0 ? C.muted : "#ef4444"} />
                    <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: logs.length === 0 ? C.muted : "#ef4444" }}>
                      清空日志
                    </Text>
                  </Pressable>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>清空日志</AlertDialogTitle>
                    <AlertDialogDescription>
                      确定要清空所有日志记录吗？此操作不可恢复。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onPress={handleClearLogs}>清空</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </View>

            {/* 导出反馈 */}
            {exportMsg && (
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.orange, paddingTop: 8 }}>
                ✅ {exportMsg}
              </Text>
            )}
            {exportError && (
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: "#ef4444", paddingTop: 8 }}>
                ❌ 导出失败：{exportError}
              </Text>
            )}

            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, lineHeight: 14 }}>
                💡 日志系统会自动记录应用运行过程中的错误、警告和关键操作，
                方便排查问题。建议在遇到问题时导出日志并发送给开发者。
              </Text>
            </View>
          </View>
        </View>

        {/* 法律条款 */}
        <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>法律条款</Text>
          </View>

          <Pressable
            onPress={() => router.push("/privacy-policy" as RelativePathString)}
            onPressIn={() => setPrivacyPressed(true)}
            onPressOut={() => setPrivacyPressed(false)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              borderBottomWidth: 1, borderBottomColor: C.border,
              paddingHorizontal: 16, paddingVertical: 12,
              backgroundColor: privacyPressed ? `${C.orange}10` : "transparent",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Shield size={18} color={C.text} />
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text }}>隐私政策</Text>
            </View>
            <ChevronRight size={16} color={C.muted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/user-agreement" as RelativePathString)}
            onPressIn={() => setAgreementPressed(true)}
            onPressOut={() => setAgreementPressed(false)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              borderBottomWidth: 1, borderBottomColor: C.border,
              paddingHorizontal: 16, paddingVertical: 12,
              backgroundColor: agreementPressed ? `${C.orange}10` : "transparent",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <FileText size={18} color={C.text} />
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text }}>用户协议</Text>
            </View>
            <ChevronRight size={16} color={C.muted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/legal-terms" as RelativePathString)}
            onPressIn={() => setLegalPressed(true)}
            onPressOut={() => setLegalPressed(false)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 16, paddingVertical: 12,
              backgroundColor: legalPressed ? `${C.orange}10` : "transparent",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Scale size={18} color={C.text} />
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: C.text }}>法律法规</Text>
            </View>
            <ChevronRight size={16} color={C.muted} />
          </Pressable>
        </View>

        {/* 版权声明 */}
        <View style={{ alignItems: "center", paddingVertical: 16 }}>
          <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>
            © 2026 {DEVELOPER}. All rights reserved.
          </Text>
          <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>
            Made with ❤️ in China · v{APP_VERSION} (Build {BUILD_NO})
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function CloudEnhanceSection() {
  const C = useColors();
  const cloudEnhance = useSettingsStore((s) => s.cloudEnhance);
  const setCloudEnhance = useSettingsStore((s) => s.setCloudEnhance);
  return (
    <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.panel }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
        borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 10 }}>
        {cloudEnhance ? <Cloud size={14} color={C.orange} /> : <CloudOff size={14} color={C.muted} />}
        <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", color: C.muted }}>
          云端增强 CLOUD ENHANCE
        </Text>
      </View>
      <View style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold", color: C.text }}>
              启用云端增强
            </Text>
            <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, marginTop: 2, lineHeight: 14 }}>
              开启后，困难模式本地处理完成将自动调用外网 AI 二次优化（默认关闭）
            </Text>
          </View>
          <Pressable
            onPress={() => setCloudEnhance(!cloudEnhance)}
            style={{
              width: 48, height: 28, justifyContent: "center", paddingHorizontal: 2,
              backgroundColor: cloudEnhance ? C.orange : C.border,
            }}
          >
            <View style={{
              width: 24, height: 24, backgroundColor: C.background,
              marginLeft: cloudEnhance ? "auto" : 0,
            }} />
          </Pressable>
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }}>
          <Text style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, lineHeight: 14 }}>
            🔒 隐私：仅上传本地处理后的临时音频，不上传原始文件；处理完成后自动删除云端临时文件。
          </Text>
        </View>
      </View>
    </View>
  );
}
