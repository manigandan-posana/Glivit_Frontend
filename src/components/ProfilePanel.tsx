import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLogoutMutation } from '@/src/services/authApi';
import { authStorage } from '@/src/services/authStorage';
import { baseApi } from '@/src/services/baseApi';
import { clearSession } from '@/src/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { clearActiveTenant } from '@/src/store/tenantSlice';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';
import { ColorPickerModal } from './ui/ColorPickerModal';

const PROFILE_IMG_KEY = 'glivt.profile.imageUri';

interface ProfilePanelProps {
  visible: boolean;
  onClose: () => void;
}

export function ProfilePanel({ visible, onClose }: ProfilePanelProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors: c, mode, setMode, colors, setPrimaryColor } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c, insets), [c, insets]);
  const user = useAppSelector((s) => s.auth.user);
  
  const [logout] = useLogoutMutation();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [profileUri, setProfileUri] = useState<string | null>(null);

  // Load saved profile image
  useEffect(() => {
    SecureStore.getItemAsync(PROFILE_IMG_KEY).then(uri => {
      if (uri) setProfileUri(uri);
    });
  }, []);

  const handlePickImage = useCallback(async (fromCamera: boolean) => {
    try {
      let result;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };

      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Denied', 'Camera access is required to take a photo.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Denied', 'Gallery access is required to select a photo.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        // Move to document directory to persist
        const fileName = asset.uri.split('/').pop() || 'profile.jpg';
        const newPath = FileSystem.documentDirectory + fileName;
        await FileSystem.copyAsync({ from: asset.uri, to: newPath });
        
        setProfileUri(newPath);
        await SecureStore.setItemAsync(PROFILE_IMG_KEY, newPath);
        // TODO: Sync newPath with backend /api/users/profile-image
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to pick image.');
    }
  }, []);

  const promptImageChoice = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: () => handlePickImage(true) },
      { text: 'Choose from Gallery', onPress: () => handlePickImage(false) },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const onLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout().unwrap();
          } catch {
            // Best-effort
          }
          dispatch(clearSession());
          dispatch(clearActiveTenant());
          dispatch(baseApi.util.resetApiState());
          await authStorage.clearSession().catch(() => undefined);
          onClose();
          router.replace('/login');
        },
      },
    ]);
  };

  if (!visible) return null;

  const displayName = user?.name ?? user?.username ?? 'Demo Admin';
  const roleLabel = user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Member';
  const initials = displayName.substring(0, 2).toUpperCase();

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible={visible} onRequestClose={onClose}>
      <Animated.View style={styles.backdrop} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        
        <Animated.View style={styles.panel} entering={SlideInUp.springify().damping(18).stiffness(150)} exiting={SlideOutUp.duration(200)}>
          <View style={styles.header}>
            <View style={styles.avatarContainer}>
              <Pressable onPress={promptImageChoice}>
                {profileUri ? (
                  <Image source={{ uri: profileUri }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.cameraBadge}>
                  <MaterialCommunityIcons name="camera" size={14} color="#FFF" />
                </View>
              </Pressable>
            </View>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.role}>{roleLabel} • ID: {user?.userId ?? 'Unknown'}</Text>
          </View>

          <View style={styles.menu}>
            {user?.role === 'SUPER_ADMIN' && (
              <Pressable style={styles.menuItem} onPress={() => { onClose(); router.push('/manage-tenants' as never); }}>
                <MaterialCommunityIcons name="office-building-cog" size={24} color={c.textSecondary} />
                <Text style={styles.menuItemText}>Switch Tenant</Text>
              </Pressable>
            )}

            <Pressable style={styles.menuItem} onPress={() => { onClose(); router.push('/timeline' as never); }}>
              <MaterialCommunityIcons name="chart-timeline-variant" size={24} color={c.textSecondary} />
              <Text style={styles.menuItemText}>Your Timeline</Text>
            </Pressable>

            <View style={styles.menuItem}>
              <MaterialCommunityIcons name="theme-light-dark" size={24} color={c.textSecondary} />
              <Text style={styles.menuItemText}>Dark Mode</Text>
              <Switch 
                value={mode === 'dark'} 
                onValueChange={(val) => setMode(val ? 'dark' : 'light')} 
                trackColor={{ true: c.primary, false: c.borderStrong }} 
              />
            </View>

            <Pressable style={styles.menuItem} onPress={() => setShowColorPicker(true)}>
              <MaterialCommunityIcons name="palette" size={24} color={c.textSecondary} />
              <Text style={styles.menuItemText}>Application Color Theme</Text>
              <View style={[styles.colorPreview, { backgroundColor: colors.primary }]} />
            </Pressable>

            <View style={styles.divider} />

            <Pressable style={styles.menuItem} onPress={onLogout}>
              <MaterialCommunityIcons name="logout" size={24} color={c.danger} />
              <Text style={[styles.menuItemText, { color: c.danger }]}>Logout</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>

      <ColorPickerModal 
        visible={showColorPicker} 
        onClose={() => setShowColorPicker(false)} 
        color={colors.primary} 
        onColorChange={setPrimaryColor} 
      />
    </Modal>
  );
}

const makeStyles = (c: ThemeColors, insets: any) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: c.overlay,
    },
    panel: {
      backgroundColor: c.surfaceElevated,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      paddingTop: insets.top + spacing.md,
      paddingBottom: spacing.lg,
      elevation: 8,
      shadowColor: c.shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
    },
    header: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    avatarContainer: {
      marginBottom: spacing.sm,
      position: 'relative',
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 2,
      borderColor: c.borderStrong,
    },
    avatarPlaceholder: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      color: '#FFF',
      fontSize: 28,
      fontWeight: '800',
    },
    cameraBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: c.secondary,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.surfaceElevated,
    },
    name: {
      fontSize: typography.h2,
      fontWeight: '800',
      color: c.textPrimary,
    },
    role: {
      fontSize: typography.caption,
      color: c.textSecondary,
      marginTop: 2,
    },
    menu: {
      paddingHorizontal: spacing.lg,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    menuItemText: {
      flex: 1,
      fontSize: typography.body,
      fontWeight: '600',
      color: c.textPrimary,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.divider,
      marginVertical: spacing.sm,
    },
    colorPreview: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
  });
