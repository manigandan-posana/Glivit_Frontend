import type { AuthUser, TenantConfig } from '@/src/types/api';

export type TenantSelection = {
  companyCode: string | null;
  tenantConfig: TenantConfig | null;
};

export type TenantSession = TenantSelection & {
  accessToken: string | null;
  refreshToken: string | null;
  sessionCompanyCode: string | null;
  user: AuthUser | null;
};

export function normalizeCompanyCode(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? '';
  return normalized || null;
}

export function hasValidTenantSelection(value: TenantSelection): boolean {
  const selectedCode = normalizeCompanyCode(value.companyCode);
  const configuredCode = normalizeCompanyCode(value.tenantConfig?.companyCode);
  return Boolean(
    selectedCode &&
      configuredCode === selectedCode &&
      value.tenantConfig?.status?.toUpperCase() === 'ACTIVE'
  );
}

export function hasValidTenantSession(value: TenantSession): boolean {
  return Boolean(
    hasValidTenantSelection(value) &&
      value.accessToken &&
      value.refreshToken &&
      value.user &&
      Number.isSafeInteger(value.user.tenantId) &&
      value.user.tenantId > 0 &&
      normalizeCompanyCode(value.sessionCompanyCode) === normalizeCompanyCode(value.companyCode)
  );
}
