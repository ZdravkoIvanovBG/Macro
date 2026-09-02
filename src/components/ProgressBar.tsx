import { View, Text } from 'react-native';

interface ProgressBarProps {
  value: number;
  max: number;
  color: string;
  /** Shown above the bar on the left. */
  label?: string;
  /** Shown above the bar on the right. Defaults to "value / max". */
  detail?: string;
  height?: number;
}

/**
 * A single target bar. Overshoot is drawn in red past the target rather than
 * clipped, so going over is visible at a glance instead of looking "complete".
 */
export default function ProgressBar({
  value,
  max,
  color,
  label,
  detail,
  height = 8,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const ratio = value / safeMax;
  const filled = Math.min(1, Math.max(0, ratio));
  const over = ratio > 1;

  return (
    <View>
      {label || detail ? (
        <View className="mb-1.5 flex-row items-baseline justify-between">
          {label ? <Text className="text-xs text-neutral-400">{label}</Text> : <View />}
          {detail ? (
            <Text className={`text-xs ${over ? 'text-red-400' : 'text-neutral-500'}`}>
              {detail}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View className="overflow-hidden rounded-full bg-ink-line" style={{ height }}>
        <View
          style={{
            height,
            width: `${filled * 100}%`,
            backgroundColor: over ? '#f87171' : color,
          }}
        />
      </View>
    </View>
  );
}
