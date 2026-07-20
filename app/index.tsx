import { Redirect } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { palette } from '@/src/theme/tokens';
import { useAuth } from '@/src/store/hooks';

/**
 * Startup gate. Routes according to persisted state:
 *   no company code   -> Company Code screen
 *   code but no session -> Login
 *   valid session      -> Dashboard
 * While bootstrapping it renders the splash-coloured background (native splash
 * is still visible until hydration completes).
 */
export default function Index() {
  const { bootstrapped, companyCode, accessToken, user } = useAuth();

  if (!bootstrapped) {
    return <View style={{ flex: 1, backgroundColor: palette.loginBackground }} />;
  }
  if (!companyCode) {
    return <Redirect href="/company-code" />;
  }
  if (!accessToken || !user) {
    return <Redirect href="/login" />;
  }
  return <Redirect href="/dashboard" />;
}
