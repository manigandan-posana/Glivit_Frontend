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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Button } from '@/src/components/ui/Button';
import { TextField } from '@/src/components/ui/TextField';
import { apiErrorMessage } from '@/src/services/apiError';
import { authStorage } from '@/src/services/authStorage';
import { useLoginMutation } from '@/src/services/authApi';
import { clearTenant, setCredentials } from '@/src/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { palette, radius, spacing, typography } from '@/src/theme/tokens';

const schema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useAppDispatch();
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
      await authStorage.saveTokens(result.accessToken, result.refreshToken);
      await authStorage.saveUser(result.user);
      dispatch(
        setCredentials({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        })
      );
      router.replace('/dashboard');
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
    await authStorage.clearAll();
    dispatch(clearTenant());
    router.replace('/company-code');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          {tenant?.logoUrl ? (
            <Image contentFit="contain" source={{ uri: tenant.logoUrl }} style={styles.logoImage} />
          ) : (
            <MaterialCommunityIcons color={palette.white} name="crosshairs-gps" size={54} />
          )}
        </View>
        <Text style={styles.appName}>{tenant?.appName ?? 'Glivt'}</Text>

        <View style={styles.form}>
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
            <Button label="Login" loading={isLoading} onPress={onSubmit} />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => Alert.alert('Forgot Password', 'Please contact your service provider to reset your password.')}
            style={styles.link}>
            <Text style={styles.linkText}>Forgot Password?</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" onPress={contactProvider} style={styles.contactCard}>
          <MaterialCommunityIcons color={palette.primaryGreen} name="headset" size={22} />
          <Text style={styles.contactText}>Contact Service Provider</Text>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={clearCompanyCode} style={styles.clearCode}>
          <Text style={styles.clearCodeText}>
            Company code: <Text style={styles.clearCodeStrong}>{companyCode ?? '—'}</Text> · Change
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.loginBackground },
  content: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  logo: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    height: 100,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 100,
  },
  logoImage: { height: 100, width: 100 },
  appName: {
    color: '#FDFDFD',
    fontSize: typography.h1,
    fontWeight: '800',
    marginTop: spacing.md,
  },
  form: {
    backgroundColor: palette.cardBackground,
    borderRadius: radius.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    width: '100%',
  },
  gap: { height: spacing.md },
  formError: {
    color: palette.errorRed,
    fontSize: typography.label,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  submit: { marginTop: spacing.lg },
  link: { alignSelf: 'center', marginTop: spacing.md, padding: spacing.xs },
  linkText: { color: palette.blue, fontSize: typography.label, fontWeight: '600' },
  contactCard: {
    alignItems: 'center',
    backgroundColor: palette.cardBackground,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    width: '100%',
  },
  contactText: { color: palette.textPrimary, fontSize: typography.body, fontWeight: '700' },
  clearCode: { marginTop: spacing.lg, padding: spacing.sm },
  clearCodeText: { color: 'rgba(255,255,255,0.85)', fontSize: typography.caption },
  clearCodeStrong: { color: palette.white, fontWeight: '800' },
});
