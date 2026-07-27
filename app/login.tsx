import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Button } from '@/src/components/ui/Button';
import { GlivtLogo } from '@/src/components/GlivtLogo';
import { TextField } from '@/src/components/ui/TextField';
import { apiErrorMessage } from '@/src/services/apiError';
import { authStorage } from '@/src/services/authStorage';
import { useLoginMutation } from '@/src/services/authApi';
import { baseApi } from '@/src/services/baseApi';
import { normalizeCompanyCode } from '@/src/services/tenantIdentity';
import { clearTenant, setCredentials } from '@/src/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { store } from '@/src/store/store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

const schema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors: c } = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const tenant = useAppSelector((s) => s.auth.tenantConfig);
  const companyCode = useAppSelector((s) => s.auth.companyCode);
  const [login, { isLoading }] = useLoginMutation();
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (!companyCode) {
      router.replace('/company-code');
      return;
    }
    try {
      const result = await login({
        companyCode,
        username: values.username,
        password: values.password,
      }).unwrap();
      if (
        normalizeCompanyCode(store.getState().auth.companyCode) !==
        normalizeCompanyCode(companyCode)
      ) {
        return;
      }
      await authStorage.saveSession({
        accessToken: result.accessToken,
        companyCode,
        refreshToken: result.refreshToken,
        user: result.user,
      });
      if (
        normalizeCompanyCode(store.getState().auth.companyCode) !==
        normalizeCompanyCode(companyCode)
      ) {
        return;
      }
      dispatch(baseApi.util.resetApiState());
      dispatch(
        setCredentials({
          accessToken: result.accessToken,
          companyCode,
          refreshToken: result.refreshToken,
          user: result.user,
        })
      );
      router.replace('/map');
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Unable to sign in'));
    }
  });

  const contactProvider = () => {
    const phone = tenant?.supportPhone;
    const email = tenant?.supportEmail;
    if (phone) {
      Linking.openURL(`tel:${phone}`).catch(() => undefined);
    } else if (email) {
      Linking.openURL(`mailto:${email}`).catch(() => undefined);
    } else {
      Alert.alert('Contact Service Provider', 'No support contact configured for this account.');
    }
  };

  const clearCompanyCode = async () => {
    dispatch(clearTenant());
    dispatch(baseApi.util.resetApiState());
    await authStorage.clearAll().catch(() => undefined);
    router.replace('/company-code');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <View pointerEvents="none" style={styles.ambient}>
        <View style={styles.ambientOrbOne} />
        <View style={styles.ambientOrbTwo} />
        <View style={styles.roadLineOne} />
        <View style={styles.roadLineTwo} />
      </View>
      <SafeAreaView edges={['bottom']} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.xl, paddingBottom: spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            {tenant?.logoUrl ? (
              <Image contentFit="contain" source={{ uri: tenant.logoUrl }} style={styles.logoImage} />
            ) : (
              <GlivtLogo size={72} />
            )}
          </View>
          <View style={styles.heroCopy}>
            <View style={styles.liveEyebrow}>
              <View style={styles.liveDot} />
              <Text style={styles.eyebrowText}>FLEET COMMAND ACCESS</Text>
            </View>
            <Text style={styles.appName}>Welcome back</Text>
            <Text style={styles.heroSubtitle}>
              Sign in to monitor every vehicle, route and alert in real time.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.formHeadingRow}>
              <View style={styles.formIcon}>
                <MaterialCommunityIcons color="#2BE6A6" name="shield-lock-outline" size={21} />
              </View>
              <View style={styles.formHeadingCopy}>
                <Text style={styles.formTitle}>Secure sign in</Text>
                <Text numberOfLines={1} style={styles.formSubtitle}>
                  {tenant?.name ?? 'Glivt Fleet Management'}
                </Text>
              </View>
              <View style={styles.companyBadge}>
                <Text numberOfLines={1} style={styles.companyBadgeText}>
                  {companyCode ?? '-'}
                </Text>
              </View>
            </View>
            <View style={styles.formRule} />
            <Controller
              control={control}
              name="username"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errors.username?.message}
                  label="Username"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Username"
                  value={value}
                />
              )}
            />
            <View style={styles.gap} />
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  error={errors.password?.message}
                  label="Password"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Password"
                  secure
                  value={value}
                  onSubmitEditing={onSubmit}
                  returnKeyType="go"
                />
              )}
            />

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <View style={styles.submit}>
              <Button label="Enter Fleet Command" loading={isLoading} onPress={onSubmit} />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  'Forgot Password',
                  'Please contact your service provider to reset your password.'
                )
              }
              style={styles.link}>
              <Text style={styles.linkText}>Forgot Password?</Text>
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" onPress={contactProvider} style={styles.contactCard}>
            <View style={styles.contactIcon}>
              <MaterialCommunityIcons color="#2BE6A6" name="headset" size={20} />
            </View>
            <View style={styles.contactCopy}>
              <Text style={styles.contactText}>Need help signing in?</Text>
              <Text style={styles.contactSubtext}>Contact your service provider</Text>
            </View>
            <MaterialCommunityIcons color="rgba(255,255,255,0.62)" name="chevron-right" size={20} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isLoading }}
            disabled={isLoading}
            onPress={clearCompanyCode}
            style={[styles.clearCode, isLoading && styles.clearCodeDisabled]}>
            <Text style={styles.clearCodeText}>
              Company code: <Text style={styles.clearCodeStrong}>{companyCode ?? '-'}</Text> | Change
            </Text>
          </Pressable>
          <View style={styles.securityNote}>
            <MaterialCommunityIcons
              color="rgba(255,255,255,0.48)"
              name="lock-check-outline"
              size={13}
            />
            <Text style={styles.securityNoteText}>Encrypted tenant-secured session</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.loginBackground },
    ambient: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.loginBackground,
      overflow: 'hidden',
    },
    ambientOrbOne: {
      backgroundColor: 'rgba(0, 190, 143, 0.18)',
      borderRadius: 220,
      height: 360,
      position: 'absolute',
      right: -170,
      top: -120,
      width: 360,
    },
    ambientOrbTwo: {
      backgroundColor: 'rgba(0, 120, 196, 0.13)',
      borderRadius: 180,
      bottom: -150,
      height: 320,
      left: -170,
      position: 'absolute',
      width: 320,
    },
    roadLineOne: {
      backgroundColor: 'rgba(43, 230, 166, 0.09)',
      borderRadius: 8,
      height: 2,
      left: -70,
      position: 'absolute',
      right: -70,
      top: '36%',
      transform: [{ rotate: '-12deg' }],
    },
    roadLineTwo: {
      backgroundColor: 'rgba(67, 188, 226, 0.08)',
      borderRadius: 8,
      height: 1,
      left: -70,
      position: 'absolute',
      right: -70,
      top: '41%',
      transform: [{ rotate: '-12deg' }],
    },
    content: {
      alignItems: 'center',
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    logo: {
      alignItems: 'center',
      minHeight: 76,
      justifyContent: 'center',
    },
    logoImage: { height: 72, width: 230 },
    heroCopy: {
      alignItems: 'center',
      marginTop: spacing.lg,
      maxWidth: 390,
    },
    liveEyebrow: {
      alignItems: 'center',
      backgroundColor: 'rgba(43,230,166,0.08)',
      borderColor: 'rgba(43,230,166,0.22)',
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 7,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    liveDot: {
      backgroundColor: '#2BE6A6',
      borderRadius: 4,
      height: 7,
      shadowColor: '#2BE6A6',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 6,
      width: 7,
    },
    eyebrowText: {
      color: '#9BEED1',
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    appName: {
      color: '#FFFFFF',
      fontSize: 31,
      fontWeight: '900',
      letterSpacing: -0.6,
      marginTop: spacing.md,
    },
    heroSubtitle: {
      color: 'rgba(226,239,247,0.68)',
      fontSize: typography.body,
      lineHeight: 21,
      marginTop: 7,
      textAlign: 'center',
    },
    form: {
      backgroundColor: 'rgba(10, 20, 32, 0.92)',
      borderColor: 'rgba(255,255,255,0.13)',
      borderRadius: 24,
      borderWidth: 1,
      elevation: 8,
      maxWidth: 470,
      marginTop: spacing.xl,
      padding: 20,
      shadowColor: '#02070D',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.36,
      shadowRadius: 28,
      width: '100%',
    },
    formHeadingRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    formHeadingCopy: { flex: 1, minWidth: 0 },
    formIcon: {
      alignItems: 'center',
      backgroundColor: 'rgba(43,230,166,0.1)',
      borderColor: 'rgba(43,230,166,0.2)',
      borderRadius: 12,
      borderWidth: 1,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    formTitle: { color: '#F4FAFE', fontSize: 16, fontWeight: '900' },
    formSubtitle: {
      color: '#8299AA',
      fontSize: 10,
      fontWeight: '700',
      marginTop: 2,
    },
    companyBadge: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderColor: 'rgba(255,255,255,0.11)',
      borderRadius: 9,
      borderWidth: 1,
      maxWidth: 88,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    companyBadgeText: {
      color: '#AFC0CC',
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    formRule: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      height: 1,
      marginBottom: spacing.lg,
      marginTop: spacing.md,
    },
    gap: { height: spacing.md },
    formError: {
      color: c.danger,
      fontSize: typography.label,
      marginTop: spacing.md,
      textAlign: 'center',
    },
    submit: { marginTop: spacing.lg },
    link: { alignSelf: 'center', marginTop: spacing.md, padding: spacing.xs },
    linkText: { color: '#69D9F3', fontSize: typography.label, fontWeight: '700' },
    contactCard: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.055)',
      borderColor: 'rgba(255,255,255,0.11)',
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 11,
      maxWidth: 470,
      marginTop: spacing.lg,
      padding: 12,
      width: '100%',
    },
    contactIcon: {
      alignItems: 'center',
      backgroundColor: 'rgba(43,230,166,0.09)',
      borderRadius: 11,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    contactCopy: { flex: 1 },
    contactText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    contactSubtext: {
      color: 'rgba(226,239,247,0.55)',
      fontSize: 10,
      marginTop: 2,
    },
    clearCode: { marginTop: spacing.md, padding: spacing.sm },
    clearCodeDisabled: { opacity: 0.45 },
    clearCodeText: { color: 'rgba(255,255,255,0.64)', fontSize: typography.caption },
    clearCodeStrong: { color: '#FFFFFF', fontWeight: '800' },
    securityNote: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 5,
      marginTop: 2,
    },
    securityNoteText: {
      color: 'rgba(255,255,255,0.4)',
      fontSize: 9,
      fontWeight: '600',
    },
  });
