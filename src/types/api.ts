/** TypeScript mirrors of the backend (glivt) DTOs and response envelope. */

export type ApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
};

export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  correlationId?: string;
  timestamp?: string;
};

export type PageResponse<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
};

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'DRIVER';

export type TenantConfig = {
  companyCode: string;
  name: string;
  appName: string;
  logoUrl?: string | null;
  splashImageUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  supportPhone?: string | null;
  supportEmail?: string | null;
  privacyPolicyUrl?: string | null;
  termsUrl?: string | null;
  enabledModules: string[];
  paymentEnabled: boolean;
  maxHistoryDays: number;
  minAppVersion?: string | null;
  status: string;
};

export type AuthUser = {
  id: number;
  tenantId: number;
  username: string;
  name: string;
  email?: string | null;
  role: Role;
  permissions: Record<string, boolean>;
};

export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresInSeconds: number;
  user: AuthUser;
};

export type DashboardSummary = {
  counts: Record<string, number>;
  total: number;
  lastUpdated: string;
};

export type DeviceSummary = {
  id: number;
  name: string;
  imei: string;
  category: string;
  vehicleId?: number | null;
  state: string;
  latitude?: number | null;
  longitude?: number | null;
  speed: number;
  course: number;
  ignition?: boolean | null;
  gpsValid: boolean;
  address?: string | null;
  lastUpdate?: string | null;
  expiryDate?: string | null;
  status: string;
};

export type DeviceDetail = DeviceSummary & {
  model?: string | null;
  projectId?: number | null;
  groupId?: number | null;
  managerId?: number | null;
  simNumber?: string | null;
  simProvider?: string | null;
  simApn?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  remarks?: string | null;
  activatedAt?: string | null;
  timezone?: string | null;
  distanceUnit?: string | null;
  speedUnit?: string | null;
};
