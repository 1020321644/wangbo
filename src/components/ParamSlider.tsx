/**
 * ParamSlider — 工程蓝图风格自定义滑块（基于 GestureHandler）
 * 支持任意 min/max/step，实时回调 onChange。
 */
import { useState, useCallback, useRef } from "react";
import { View, Text } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useColors } from "@/lib/theme";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

export function ParamSlider({ label, value, min, max, step = 1, unit = "", onChange }: Props) {
  const C = useColors();
  const widthRef = useRef(0);
  const [, force] = useState(0);
  const range = max - min;
  const pct = range === 0 ? 0 : Math.max(0, Math.min(1, (value - min) / range));

  const updateFromX = useCallback(
    (x: number) => {
      const width = widthRef.current;
      if (width <= 0) return;
      const ratio = Math.max(0, Math.min(1, x / width));
      const raw = min + ratio * range;
      const stepped = Math.round(raw / step) * step;
      const clamped = Math.max(min, Math.min(max, stepped));
      onChange(Number(clamped.toFixed(2)));
    },
    [min, max, range, step, onChange],
  );

  const pan = Gesture.Pan()
    .onBegin((e) => runOnJS(updateFromX)(e.x))
    .onUpdate((e) => runOnJS(updateFromX)(e.x));

  const tap = Gesture.Tap().onEnd((e) => runOnJS(updateFromX)(e.x));

  const gesture = Gesture.Race(pan, tap);

  const display = unit === "dB"
    ? `${value > 0 ? "+" : ""}${value}${unit}`
    : `${value}${unit}`;

  return (
    <View className="py-2">
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="font-mono text-[11px] text-foreground">{label}</Text>
        <Text className="font-mono text-[11px] font-bold" style={{ color: C.orange }}>
          {display}
        </Text>
      </View>
      <GestureDetector gesture={gesture}>
        <View
          className="h-8 justify-center"
          onLayout={(e) => {
            widthRef.current = e.nativeEvent.layout.width;
            force((n) => n + 1);
          }}
        >
          <View className="h-1.5 w-full bg-border">
            <View
              className="h-1.5"
              style={{ width: `${pct * 100}%`, backgroundColor: C.orange }}
            />
          </View>
          <View
            className="absolute h-4 w-4 border border-foreground bg-background"
            style={{ left: `${pct * 100}%`, marginLeft: -8 }}
          />
        </View>
      </GestureDetector>
    </View>
  );
}