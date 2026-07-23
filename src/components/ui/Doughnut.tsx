import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { AnimatedCount } from '@/src/components/ui/Motion';
import { useTheme } from '@/src/theme/ThemeProvider';
import { typography, type ThemeColors } from '@/src/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type DoughnutSegment = {
  label: string;
  value: number;
  color: string;
};

type DoughnutProps = {
  segments: DoughnutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string | number;
  /** Animate a clockwise draw-in when the data changes. Default true. */
  animate?: boolean;
};

/**
 * Lightweight SVG doughnut chart (no heavy chart dependency). Renders one arc
 * per segment proportional to its share of the total, then sweeps them in
 * clockwise on the UI thread via a single shared `sweep` value.
 */
export function Doughnut({
  segments,
  size = 190,
  strokeWidth = 26,
  centerLabel,
  centerValue,
  animate = true,
}: DoughnutProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let offset = 0;
    return segments
      .filter((s) => s.value > 0)
      .map((segment) => {
        const dash = (segment.value / total) * circumference;
        const arc = { key: segment.label, color: segment.color, start: offset, dash };
        offset += dash;
        return arc;
      });
  }, [segments, total, circumference]);

  // 0 → circumference sweep drives every arc's reveal in lockstep.
  const sweep = useSharedValue(animate ? 0 : circumference);
  useEffect(() => {
    sweep.value = animate ? 0 : circumference;
    if (animate) {
      sweep.value = withTiming(circumference, { duration: 950, reduceMotion: ReduceMotion.System });
    }
  }, [arcs, animate, circumference, sweep]);

  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.divider}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {arcs.map((arc) => (
            <Arc
              key={arc.key}
              cx={center}
              cy={center}
              r={radius}
              color={arc.color}
              strokeWidth={strokeWidth}
              start={arc.start}
              dash={arc.dash}
              circumference={circumference}
              sweep={sweep}
            />
          ))}
        </G>
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {typeof centerValue === 'number' ? (
          <AnimatedCount value={centerValue} style={styles.centerValue} />
        ) : (
          <Text style={styles.centerValue}>{centerValue ?? total}</Text>
        )}
        {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
      </View>
    </View>
  );
}

type ArcProps = {
  cx: number;
  cy: number;
  r: number;
  color: string;
  strokeWidth: number;
  start: number;
  dash: number;
  circumference: number;
  sweep: ReturnType<typeof useSharedValue<number>>;
};

/** One animated segment; reveals the portion of its arc the global sweep has reached. */
function Arc({ cx, cy, r, color, strokeWidth, start, dash, circumference, sweep }: ArcProps) {
  const animatedProps = useAnimatedProps(() => {
    const visible = Math.max(0, Math.min(dash, sweep.value - start));
    return { strokeDasharray: `${visible} ${circumference}`, strokeDashoffset: -start };
  });
  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={r}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="butt"
      fill="none"
      animatedProps={animatedProps}
    />
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    center: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerValue: {
      color: c.textPrimary,
      fontSize: typography.h1,
      fontWeight: '800',
      textAlign: 'center',
    },
    centerLabel: {
      color: c.textSecondary,
      fontSize: typography.caption,
      marginTop: 2,
      textTransform: 'uppercase',
    },
  });
