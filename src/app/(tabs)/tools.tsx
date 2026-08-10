import { View, Text, ScrollView, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Scissors,
  ShieldCheck,
  Music4,
  AudioLines,
  ChevronRight,
  Cpu,
  Sparkles,
  Mic,
  ExternalLink,
  Wand2,
  SlidersHorizontal,
  Brain,
  Layers,
  Tag,
} from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { useRouter, type RelativePathString } from "expo-router";
import { Panel, ScreenHeader } from "@/components/ui";

const TOOLS = [
  {
    key: "bgrecord",
    title: "后台录制母带",
    desc: "切到音乐APP播放，后台录制并生成母带版本",
    icon: Mic,
    route: "/bg-record",
  },
  {
    key: "rating",
    title: "AI 音质评级",
    desc: "多维度评分 · 专业建议 · 一键优化参数",
    icon: Sparkles,
    route: "/audio-rating",
  },
  {
    key: "aienhance",
    title: "AI 音质提升",
    desc: "云端 AI 引擎 · 降噪 / 超分 / 响度标准化",
    icon: Wand2,
    route: "/ai-enhance",
  },
  {
    key: "stem",
    title: "Stem 分离",
    desc: "分离人声 / 伴奏 / 鼓点 / 低音等音轨",
    icon: Scissors,
    route: "/stem",
  },
  {
    key: "decrypt",
    title: "加密格式解密",
    desc: "自动识别并解密 QQ / 网易 / 酷狗 / 酷我",
    icon: ShieldCheck,
    route: "/decrypt",
  },
  {
    key: "score",
    title: "曲谱制作",
    desc: "生成五线谱 / 简谱 / 吉他谱 / 钢琴谱",
    icon: Music4,
    route: "/score",
  },
  {
    key: "analysis",
    title: "预览分析",
    desc: "波形图 · 频谱图 · 转换前后对比",
    icon: AudioLines,
    route: "/analysis",
  },
  {
    key: "paramstune",
    title: "参数调节",
    desc: "降噪 / Dry-Wet / 增益 / 6段EQ / 动态处理",
    icon: SlidersHorizontal,
    route: "/params-tune",
  },
  {
    key: "aitune",
    title: "AI 智能调参",
    desc: "自动分析内容 · 推荐最优参数 · 一键应用",
    icon: Brain,
    route: "/ai-tune",
  },
  {
    key: "batch",
    title: "批处理",
    desc: "多文件队列 · 预设批量转换 · 自定义保存",
    icon: Layers,
    route: "/batch",
  },
  {
    key: "analyzer",
    title: "分析工具",
    desc: "响度曲线 · 削波标记 · A/B 对比",
    icon: AudioLines,
    route: "/analyzer",
  },
  {
    key: "metadata",
    title: "元数据编辑",
    desc: "采样率算法 FFmpeg/SoX · 标题/艺术家/专辑",
    icon: Tag,
    route: "/metadata",
  },
] as const;

export default function ToolsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="工具箱" subtitle="TOOLBOX · PRO FEATURES" />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="border border-border bg-card p-4">
          <View className="flex-row items-center gap-2">
            <Cpu size={16} color={C.orange} strokeWidth={1.5} />
            <Text className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
              专业工具集
            </Text>
          </View>
          <Text className="mt-2 font-mono text-[10px] leading-4 text-muted-foreground">
            为音乐发烧友与专业音频工程师打造，所有处理均以母带制作标准执行，确保音质绝对不降低。
          </Text>
        </View>

        <Panel title="功能模块">
          {TOOLS.map((t, i) => {
            const Icon = t.icon;
            return (
              <Pressable
                key={t.key}
                onPress={() => router.push(t.route as RelativePathString)}
                className={`flex-row items-center gap-3 p-4 active:opacity-70 ${
                  i < TOOLS.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <View className="h-11 w-11 items-center justify-center border border-border">
                  <Icon size={20} color={C.cyan} strokeWidth={1.5} />
                </View>
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <Text className="font-mono text-sm font-bold text-foreground">{t.title}</Text>
                  <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground" numberOfLines={1}>
                    {t.desc}
                  </Text>
                </View>
                <ChevronRight size={18} color={C.muted} strokeWidth={1.5} />
              </Pressable>
            );
          })}
        </Panel>

        {/* 在线 AI 人声分离 */}
        <Panel title="在线 AI 人声分离">
          <View className="p-3 border-b border-border">
            <Text className="font-mono text-[10px] leading-4 text-muted-foreground">
              以下工具在浏览器内本地运行神经网络，无需上传到服务器，完全免费使用。
            </Text>
          </View>
          {[
            {
              key: "removevocals",
              title: "Remove Vocals",
              desc: "remove-vocals.com · 浏览器端 AI · 免费无限制",
              url: "https://www.remove-vocals.com",
            },
            {
              key: "vocalremover",
              title: "Vocal Remover",
              desc: "vocalremover.org · WASM 本地算力 · 免费",
              url: "https://vocalremover.org",
            },
          ].map((item, i, arr) => (
            <Pressable
              key={item.key}
              onPress={() => Linking.openURL(item.url)}
              className={`flex-row items-center gap-3 p-4 active:opacity-70 ${
                i < arr.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <View className="h-11 w-11 items-center justify-center border border-border">
                <ExternalLink size={20} color={C.orange} strokeWidth={1.5} />
              </View>
              <View className="flex-1" style={{ minWidth: 0 }}>
                <Text className="font-mono text-sm font-bold text-foreground">{item.title}</Text>
                <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground" numberOfLines={1}>
                  {item.desc}
                </Text>
              </View>
              <ChevronRight size={18} color={C.muted} strokeWidth={1.5} />
            </Pressable>
          ))}
        </Panel>
      </ScrollView>
    </View>
  );
}