import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '@/src/theme/ThemeProvider';
import { typography, type ThemeColors } from '@/src/theme/tokens';

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
};

/**
 * Lightweight SVG doughnut chart (no heavy chart dependency). Renders one arc
 * per segment proportional to its share of the total.
 */
export function Doughnut({
  segments,
  size = 190,
  strokeWidth = 26,
  centerLabel,
  centerValue,
}: DoughnutProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;
  const arcs =
    total > 0
      ? segments
          .filter((s) => s.value > 0)
          .map((segment) => {
            const fraction = segment.value / total;
            const dash = fraction * circumference;
            const arc = {
              key: segment.label,
              color: segment.color,
              dashArray: `${dash} ${circumference - dash}`,
              dashOffset: -offset,
            };
            offset += dash;
            return arc;
          })
      : [];

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
            <Circle
              key={arc.key}
              cx={center}
              cy={center}
              r={radius}
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={arc.dashArray}
              strokeDashoffset={arc.dashOffset}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
        </G>
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.centerValue}>{centerValue ?? total}</Text>
        {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
      </View>
    </View>
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
    },
    centerLabel: {
      color: c.textSecondary,
      fontSize: typography.caption,
      marginTop: 2,
      textTransform: 'uppercase',
    },
  });
