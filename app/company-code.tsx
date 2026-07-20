import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
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
import { useResolveTenantMutation } from '@/src/services/tenantApi';
import { setTenant } from '@/src/store/authSlice';
import { useAppDispatch } from '@/src/store/hooks';
import { palette, radius, spacing, typography } from '@/src/theme/tokens';

const schema = z.object({
  companyCode: z.string().trim().min(2, 'Enter your company code'),
});
type FormValues = z.infer<typeof schema>;

export default function CompanyCodeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [resolveTenant, { isLoading }] = useResolveTenantMutation();

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { companyCode: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const config = await resolveTenant(values.companyCode).unwrap();
      await authStorage.saveTenant(config.companyCode, config);
      dispatch(setTenant({ companyCode: config.companyCode, tenantConfig: config }));
      router.replace('/login');
    } catch (err) {
      setError('companyCode', { message: apiErrorMessage(err, 'Invalid company code') });
    }
  });

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
        <View style={styles.logoCircle}>
          <MaterialCommunityIcons color={palette.white} name="crosshairs-gps" size={48} />
        </View>
        <Text style={styles.title}>Enter Company Code</Text>
        <Text style={styles.subtitle}>
          Provided by your service provider to connect this app to your account.
        </Text>

        <View style={styles.form}>
          <Controller
            control={control}
            name="companyCode"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                autoCapitalize="characters"
                autoCorrect={false}
                error={errors.companyCode?.message}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="e.g. DEMO"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                value={value}
              />
            )}
          />
          <View style={styles.submit}>
            <Button label="Continue" loading={isLoading} onPress={onSubmit} />
          </View>
        </View>
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
  logoCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    height: 100,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    width: 100,
  },
  title: {
    color: '#FDFDFD',
    fontSize: typography.h1,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: typography.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  form: {
    backgroundColor: palette.cardBackground,
    borderRadius: radius.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    width: '100%',
  },
  submit: {
    marginTop: spacing.md,
  },
});
