import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import ColorPicker, { Panel1, HueSlider, Swatches, PreviewText } from 'reanimated-color-picker';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';
import { Button } from './Button';

interface ColorPickerModalProps {
  visible: boolean;
  onClose: () => void;
  color: string;
  onColorChange: (color: string) => void;
}

const PRESET_COLORS = [
  '#0F9D58', // Default Green
  '#2563EB', // Blue
  '#DC2626', // Red
  '#F59E0B', // Orange
  '#8B5CF6', // Purple
  '#10B981', // Emerald
];

export function ColorPickerModal({ visible, onClose, color, onColorChange }: ColorPickerModalProps) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [tempColor, setTempColor] = React.useState(color || '#0F9D58');

  // Reset temp color when opened
  React.useEffect(() => {
    if (visible) {
      setTempColor(color || '#0F9D58');
    }
  }, [visible, color]);

  const handleSelect = (result: { hex: string }) => {
    setTempColor(result.hex);
  };

  const handleSave = () => {
    onColorChange(tempColor);
    onClose();
  };

  const handleReset = () => {
    onColorChange(''); // empty string clears override
    onClose();
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.backdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.card}>
          <Text style={styles.title}>Application Color Theme</Text>
          <Text style={styles.subtitle}>Choose your preferred primary color</Text>
          
          <ColorPicker
            style={styles.pickerContainer}
            value={tempColor}
            onComplete={handleSelect}
          >
            <View style={styles.panelContainer}>
              <Panel1 style={styles.panel} />
            </View>
            <View style={styles.sliderContainer}>
              <HueSlider style={styles.slider} />
            </View>
            <Swatches style={styles.swatches} colors={PRESET_COLORS} />
            <View style={styles.previewContainer}>
              <PreviewText style={styles.previewText} />
            </View>
          </ColorPicker>

          <View style={styles.actions}>
            <Button
              label="Reset to Default"
              onPress={handleReset}
              style={[styles.button, styles.resetButton]}
              labelStyle={styles.resetButtonText}
            />
            <Button
              label="Apply Color"
              onPress={handleSave}
              style={styles.button}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      alignItems: 'center',
      backgroundColor: c.overlay,
      flex: 1,
      justifyContent: 'center',
      padding: spacing.md,
    },
    card: {
      backgroundColor: c.surfaceElevated,
      borderRadius: radius.xl,
      elevation: 6,
      padding: spacing.lg,
      shadowColor: c.shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      width: '100%',
      maxWidth: 400,
    },
    title: {
      color: c.textPrimary,
      fontSize: typography.h3,
      fontWeight: '800',
      marginBottom: spacing.xs,
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: typography.caption,
      marginBottom: spacing.lg,
    },
    pickerContainer: {
      width: '100%',
      gap: spacing.md,
    },
    panelContainer: {
      height: 200,
      width: '100%',
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    panel: {
      flex: 1,
    },
    sliderContainer: {
      height: 24,
      borderRadius: 12,
      overflow: 'hidden',
    },
    slider: {
      flex: 1,
    },
    swatches: {
      marginTop: spacing.sm,
    },
    previewContainer: {
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    previewText: {
      color: c.textPrimary,
      fontSize: typography.body,
      fontWeight: '600',
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xl,
    },
    button: {
      flex: 1,
    },
    resetButton: {
      backgroundColor: c.surfaceAlt,
    },
    resetButtonText: {
      color: c.textPrimary,
    },
  });
