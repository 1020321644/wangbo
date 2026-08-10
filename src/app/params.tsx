import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Save, Sparkles } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { SAMPLE_RATES, BIT_DEPTHS, BITRATES } from "@/lib/formats";
import { useParamStore } from "@/store/paramStore";
import {
  Panel,
  Chip,
  Toggle,
  DataRow,
  BlueprintButton,
  ScreenHeader,
} from "@/components/ui";
import { useState } from "react";
import { type RelativePathString } from "expo-router";

export default function ParamsScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useParamStore();
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => router.back(), 600);
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="参数设置" subtitle="PARAMETERS" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* AI 评级快捷入口 */}
        <Pressable
          onPress={() => router.push("/audio-rating" as RelativePathString)}
          className="flex-row items-center gap-3 border border-primary bg-primary/10 p-4 active:opacity-70"
        >
          <View className="h-10 w-10 items-center justify-center border border-primary bg-primary/20">
            <Sparkles size={20} color={C.cyan} strokeWidth={1.5} />
          </View>
          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text className="font-mono text-sm font-bold text-primary">AI 音质评级 & 自动优化</Text>
            <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              上传音频 → AI 分析 → 一键把建议参数自动填入此页
            </Text>
          </View>
          <Text className="font-mono text-lg text-primary">›</Text>
        </Pressable>
        <Panel title="采样率 SAMPLE RATE">
          <View className="flex-row flex-wrap gap-2 p-3">
            {SAMPLE_RATES.map((sr) => (
              <Chip
                key={sr}
                label={sr}
                active={params.sampleRate === sr}
                onPress={() => params.setSampleRate(sr)}
              />
            ))}
          </View>
        </Panel>

        <Panel title="位深 BIT DEPTH">
          <View className="flex-row flex-wrap gap-2 p-3">
            {BIT_DEPTHS.map((bd) => (
              <Chip
                key={bd}
                label={bd}
                active={params.bitDepth === bd}
                onPress={() => params.setBitDepth(bd)}
              />
            ))}
          </View>
        </Panel>

        <Panel title="码率 BITRATE">
          <View className="flex-row flex-wrap gap-2 p-3">
            {BITRATES.map((br) => (
              <Chip
                key={br}
                label={br}
                active={params.bitrate === br}
                onPress={() => params.setBitrate(br)}
              />
            ))}
          </View>
        </Panel>

        <Panel title="母带级品质提升 MASTER ENHANCE">
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-1 pr-3" style={{ minWidth: 0 }}>
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} color={C.orange} strokeWidth={1.5} />
                <Text className="font-mono text-sm font-bold text-foreground">母带制作标准</Text>
              </View>
              <Text className="mt-1 font-mono text-[10px] leading-4 text-muted-foreground">
                启用后以 AI 模型进行母带级降噪/超分增强，确保转换绝对不降低音质。
              </Text>
            </View>
            <Toggle value={params.masterEnhance} onValueChange={params.setMasterEnhance} />
          </View>

          {/* AI 增强模式选择（仅 masterEnhance 开启时有意义） */}
          <View
            className="flex-row gap-2 px-4 pb-4"
            style={{ opacity: params.masterEnhance ? 1 : 0.4 }}
            pointerEvents={params.masterEnhance ? "auto" : "none"}
          >
            <Chip
              label="简单模式 · DeepFilterNet 8.6MB"
              active={params.enhanceLevel === "simple"}
              onPress={() => params.setEnhanceLevel("simple")}
            />
            <Chip
              label="困难模式 · AudioSR ≤20MB"
              active={params.enhanceLevel === "advanced"}
              onPress={() => params.setEnhanceLevel("advanced")}
            />
          </View>
        </Panel>

        <Panel title="当前配置 SUMMARY">
          <DataRow label="采样率" value={params.sampleRate} valueColor={C.cyan} />
          <DataRow label="位深" value={params.bitDepth} valueColor={C.cyan} />
          <DataRow label="码率" value={params.bitrate} valueColor={C.cyan} />
          <DataRow
            label="母带级提升"
            value={params.masterEnhance ? "ON" : "OFF"}
            valueColor={params.masterEnhance ? C.orange : C.muted}
          />
        </Panel>

        <BlueprintButton
          label={saved ? "已保存" : "保存设置"}
          icon={<Save size={18} color="#FFFFFF" strokeWidth={1.5} />}
          onPress={save}
        />
      </ScrollView>
    </View>
  );
}