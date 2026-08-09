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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useColors } from "@/lib/theme";
import { useLogStore } from "@/store/logStore";
import * as Sharing from "expo-sharing";

const APP_VERSION = "2.0.0";
const BUILD_NO    = "100";
const DEVELOPER   = "小布丁";
const WECHAT      = "ppppp2527";
const EMAIL       = "1020321644@qq.com";

// ── 更新日志数据 ──
const CHANGELOG = [
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
                    导入 / 删除本地 .onnx 模型
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
