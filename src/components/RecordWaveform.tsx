/**
 * RecordWaveform — 录制中实时波形可视化
 *
 * 使用 metering（分贝值）驱动柱状波形动画。
 * metering 范围约 -160dBFS（静音）~ 0dBFS（峰值），归一化到 0~1 后渲染。
 * 无实时 metering 时（Web / 权限未开启）使用伪随机动画兜底。
 */

import { useEffect, useRef } from "react";
import { View } from "react-native";
import Svg, { Rect as SvgRect, Line as SvgLine } from "react-native-svg";
import Animated, {
  useSharedValue, useAnimatedProps, withSpring,
} from "react-native-reanimated";
import { COLORS, useColors } from "@/lib/theme";

const AnimatedRect = Animated.createAnimatedComponent(SvgRect);

const BAR_COUNT  = 40;   // 柱数
const BAR_GAP    = 2;    // 间距
const SVG_W      = 320;
const MIN_H      = 3;    // 最小柱高

/** 分贝值 (-160~0) → 归一化高度 (0~1) */
function dbToHeight(db: number | undefined): number {
  if (db === undefined || db === null) return 0;
  const clamped = Math.max(-80, Math.min(0, db));
  return (clamped + 80) / 80;
}

/** 单根动画柱 */
function AnimBar({
  index, barW, totalH, value, color,
}: {
  index: number; barW: number; totalH: number; value: number; color: string;
}) {
  const h = useSharedValue(MIN_H);

  useEffect(() => {
    const target = Math.max(MIN_H, value * (totalH - 4));
    h.value = withSpring(target, { damping: 12, stiffness: 180 });
  }, [value, totalH]);

  const animProps = useAnimatedProps(() => ({
    height: h.value,
    y: (totalH - h.value) / 2,
  }));

  return (
    <AnimatedRect
      animatedProps={animProps}
      x={index * (barW + BAR_GAP)}
      width={barW}
      fill={color}
      rx={1}
    />
  );
}

interface RecordWaveformProps {
  /** 当前 metering（分贝，由 useAudioRecorderState 提供，undefined 时用随机动画） */
  metering?: number;
  height?: number;
  color?: string;
  active?: boolean;
}

export function RecordWaveform({
  metering,
  height = 64,
  color = COLORS.orange,
  active = true,
}: RecordWaveformProps) {
  const C = useColors();
  // 保存历史柱高值（滚动队列）
  const historyRef = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const frameRef   = useRef(0);

  // 随机动画兜底（Web / 无 metering）
  const fakeValues = useRef<number[]>(Array(BAR_COUNT).fill(0));
  useEffect(() => {
    if (!active || metering !== undefined) return;
    const tick = () => {
      fakeValues.current = fakeValues.current.map((_, i) => {
        const base = 0.3 + 0.5 * Math.abs(Math.sin(Date.now() / 600 + i * 0.4));
        return Math.min(1, Math.max(0.05, base + (Math.random() - 0.5) * 0.3));
      });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active, metering]);

  // 用 metering 推入滚动队列
  if (active && metering !== undefined) {
    const h = dbToHeight(metering);
    historyRef.current = [...historyRef.current.slice(1), h];
  }

  const barW = (SVG_W - BAR_COUNT * BAR_GAP) / BAR_COUNT;
  const values = metering !== undefined ? historyRef.current : fakeValues.current;

  return (
    <View style={{ height, width: "100%" }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${SVG_W} ${height}`} preserveAspectRatio="none">
        {/* 中轴线 */}
        <SvgLine x1="0" y1={height / 2} x2={SVG_W} y2={height / 2}
          stroke={C.border} strokeWidth={0.5} />
        {values.map((v, i) => (
          <AnimBar
            key={i}
            index={i}
            barW={barW}
            totalH={height}
            value={v}
            color={color}
          />
        ))}
      </Svg>
    </View>
  );
}
