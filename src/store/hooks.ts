import { useDispatch, useSelector } from 'react-redux';

import { hasValidTenantSelection, hasValidTenantSession } from '@/src/services/tenantIdentity';
import type { AppDispatch, RootState } from '@/src/store/store';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** Derived auth selectors. */
export const useAuth = () => useAppSelector((s) => s.auth);
export const useHasTenant = () => useAppSelector((s) => hasValidTenantSelection(s.auth));
export const useIsAuthenticated = () => useAppSelector((s) => hasValidTenantSession(s.auth));
export const usePermissions = () => useAppSelector((s) => s.auth.user?.permissions ?? {});
export const useHasPermission = (key: string) =>
  useAppSelector((s) => {
    const user = s.auth.user;
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    return Boolean(user.permissions?.[key]);
  });
