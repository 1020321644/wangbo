import { View, Text, Pressable } from "react-native";
import { cn } from "@/lib/utils";
import { useColors } from "@/lib/theme";

// 工程蓝图风格面板：1px 实线边框，无投影
export function Panel({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <View
      className={cn("border border-border bg-card", className)}
      style={{ borderCurve: "continuous" }}
    >
      {title ? (
        <View className="border-b border-border bg-secondary px-3 py-2">
          <Text className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {title}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

// 直角按钮：按压时背景色反转
export function BlueprintButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  className,
  icon,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "outline";
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}) {
  const base =
    "flex-row items-center justify-center gap-2 px-4 py-3 active:opacity-80";
  const variants: Record<string, string> = {
    primary: "bg-primary",
    ghost: "bg-transparent",
    outline: "border border-border bg-transparent",
  };
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={cn(
        base,
        variants[variant],
        disabled && "opacity-40",
        className,
      )}
    >
      {icon}
      <Text
        className={cn(
          "font-mono text-sm font-bold uppercase tracking-wider",
          variant === "primary" ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// 选项芯片
export function Chip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "border px-3 py-2 active:opacity-70",
        active ? "border-primary bg-primary" : "border-border bg-transparent",
        disabled && "opacity-30",
      )}
    >
      <Text
        className={cn(
          "font-mono text-xs font-semibold",
          active ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// 标签-数值行
export function DataRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const C = useColors();
  return (
    <View className="flex-row items-center justify-between border-b border-border px-3 py-2.5">
      <Text className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
      <Text
        className="font-mono text-sm font-semibold"
        style={{ color: valueColor ?? C.foreground }}
      >
        {value}
      </Text>
    </View>
  );
}

// 物理拨动开关
export function Toggle({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      className={cn(
        "h-7 w-14 flex-row items-center border px-1",
        value ? "border-primary" : "border-border",
      )}
      style={{ justifyContent: value ? "flex-end" : "flex-start" }}
    >
      <View
        className={cn("h-5 w-5", value ? "bg-primary" : "bg-muted-foreground")}
      />
    </Pressable>
  );
}

// 进度条（荧光青）
export function ProgressBar({ progress }: { progress: number }) {
  const C = useColors();
  return (
    <View className="h-2 w-full border border-border bg-secondary">
      <View
        className="h-full"
        style={{
          width: `${Math.round(progress * 100)}%`,
          backgroundColor: C.cyan,
        }}
      />
    </View>
  );
}

// 状态徽标
export function Badge({
  text,
  tone = "cyan",
}: {
  text: string;
  tone?: "cyan" | "orange" | "muted";
}) {
  const C = useColors();
  const color =
    tone === "cyan"
      ? C.cyan
      : tone === "orange"
        ? C.orange
        : C.muted;
  return (
    <View className="border px-2 py-0.5" style={{ borderColor: color }}>
      <Text className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
        {text}
      </Text>
    </View>
  );
}

// 空状态
export function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
}) {
  return (
    <View className="items-center justify-center gap-3 py-20">
      {icon}
      <Text className="font-mono text-base font-semibold text-foreground">{title}</Text>
      {desc ? (
        <Text className="px-8 text-center font-mono text-xs text-muted-foreground">
          {desc}
        </Text>
      ) : null}
    </View>
  );
}

// 屏幕标题栏
export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <View className="flex-row items-center border-b border-border bg-card px-4 pb-3 pt-12">
      {onBack ? (
        <Pressable onPress={onBack} className="mr-3 active:opacity-60">
          <Text className="font-mono text-sm font-bold text-primary">‹ 返回</Text>
        </Pressable>
      ) : null}
      <View className="flex-1">
        <Text className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
          {title}
        </Text>
        {subtitle ? (
          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}