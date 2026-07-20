import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';

import { P } from '@/src/constants/permissions';
import type {
  ApiResponse,
  AuthUser,
  DashboardSummary,
  DeviceDetail,
  DeviceSummary,
  PageResponse,
  TenantConfig,
  TokenResponse,
} from '@/src/types/api';

/**
 * Offline demo/simulation data (brief section 28). Enabled by
 * EXPO_PUBLIC_DEMO_MODE=true so the app is fully navigable without a backend,
 * and never mixed with production data. The demo environment is identified
 * internally (this module) rather than with an intrusive on-screen banner.
 */

const DEMO_TENANT: TenantConfig = {
  companyCode: 'DEMO',
  name: 'Glivt Demo Fleet',
  appName: 'Glivt Demo',
  logoUrl: null,
  splashImageUrl: null,
  primaryColor: '#27D34D',
  secondaryColor: '#2A91BD',
  supportPhone: '+910000000000',
  supportEmail: 'support@example.com',
  privacyPolicyUrl: null,
  termsUrl: null,
  enabledModules: ['dashboard', 'map', 'reports', 'geofences', 'notifications'],
  paymentEnabled: false,
  maxHistoryDays: 90,
  minAppVersion: null,
  status: 'ACTIVE',
};

const DEMO_USER: AuthUser = {
  id: 1,
  tenantId: 1,
  username: 'admin',
  name: 'Demo Admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  permissions: {
    [P.VIEW_ALL_VEHICLES]: true,
    [P.VIEW_LIVE_LOCATION]: true,
    [P.MANAGE_DEVICES]: true,
    [P.CREATE_DEVICE]: true,
    [P.MANAGE_USERS]: true,
    [P.MANAGE_DRIVERS]: true,
    [P.MANAGE_GROUPS]: true,
    [P.MANAGE_PROJECTS]: true,
    [P.MANAGE_GEOFENCES]: true,
    [P.SEND_COMMANDS]: true,
    [P.VIEW_REPORTS]: true,
    [P.EXPORT_REPORTS]: true,
    [P.MANAGE_REPORT_SCHEDULES]: true,
    [P.MANAGE_NOTIFICATIONS]: true,
  },
};

const DEMO_TOKENS: TokenResponse = {
  accessToken: 'demo-access-token',
  refreshToken: 'demo-refresh-token',
  tokenType: 'Bearer',
  expiresInSeconds: 3600,
  user: DEMO_USER,
};

const NOW = Date.now();

const DEMO_DEVICES: DeviceDetail[] = [
  makeDevice(1, 'TN20CM7677', 'CAR', 'RUNNING', 12.9718, 77.5946, 46, 'MG Road, Bengaluru'),
  makeDevice(2, 'KA05MJ1234', 'TRUCK', 'STOPPED', 12.9352, 77.6245, 0, 'Koramangala, Bengaluru'),
  makeDevice(3, 'KA01AB9999', 'BUS', 'IDLE', 12.9611, 77.6387, 3, 'Indiranagar, Bengaluru'),
  makeDevice(4, 'TN09XY4321', 'BIKE', 'NO_DATA', 13.0102, 77.559, 0, 'Hebbal, Bengaluru'),
  makeDevice(5, 'KA53MX2200', 'MIXER_TRUCK', 'INACTIVE', 12.9081, 77.6476, 0, 'HSR Layout, Bengaluru'),
  makeDevice(6, 'KA02CJ7788', 'HEAVY_MACHINERY', 'EXPIRED', 12.9986, 77.5966, 0, 'Malleshwaram, Bengaluru'),
];

function makeDevice(
  id: number,
  name: string,
  category: string,
  state: string,
  latitude: number,
  longitude: number,
  speed: number,
  address: string
): DeviceDetail {
  return {
    id,
    name,
    imei: `86400000000000${id}`,
    category,
    vehicleId: id,
    state,
    latitude,
    longitude,
    speed,
    course: 90,
    ignition: state === 'RUNNING' || state === 'IDLE',
    gpsValid: state !== 'NO_DATA',
    address,
    lastUpdate: new Date(NOW - id * 60_000).toISOString(),
    expiryDate: state === 'EXPIRED' ? '2025-01-01' : '2026-12-31',
    status: state === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE',
    model: 'DEMO-GT06',
    projectId: 1,
    groupId: 1,
    managerId: 1,
    simNumber: `90000000${id}`,
    simProvider: 'Demo Telecom',
    simApn: 'internet',
    driverName: 'Demo Driver',
    driverPhone: '+910000000000',
    remarks: null,
    activatedAt: '2024-01-01',
    timezone: 'Asia/Kolkata',
    distanceUnit: 'KM',
    speedUnit: 'KMH',
  };
}

function toSummary(d: DeviceDetail): DeviceSummary {
  return {
    id: d.id,
    name: d.name,
    imei: d.imei,
    category: d.category,
    vehicleId: d.vehicleId,
    state: d.state,
    latitude: d.latitude,
    longitude: d.longitude,
    speed: d.speed,
    course: d.course,
    ignition: d.ignition,
    gpsValid: d.gpsValid,
    address: d.address,
    lastUpdate: d.lastUpdate,
    expiryDate: d.expiryDate,
    status: d.status,
  };
}

function demoSummary(): DashboardSummary {
  const counts: Record<string, number> = {
    RUNNING: 0,
    STOPPED: 0,
    IDLE: 0,
    INACTIVE: 0,
    NO_DATA: 0,
    EXPIRED: 0,
  };
  DEMO_DEVICES.forEach((d) => {
    counts[d.state] = (counts[d.state] ?? 0) + 1;
  });
  return { counts, total: DEMO_DEVICES.length, lastUpdated: new Date().toISOString() };
}

function envelope<T>(data: T): { data: ApiResponse<T> } {
  return { data: { success: true, data, error: null } };
}

function notFound(message: string): { error: FetchBaseQueryError } {
  return {
    error: {
      status: 404,
      data: { success: false, data: null, error: { code: 'NOT_FOUND', message } },
    } as FetchBaseQueryError,
  };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Canned baseQuery that serves demo data for the shell endpoints. */
export const demoBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args
) => {
  const url = typeof args === 'string' ? args : args.url;
  const params = (typeof args === 'string' ? undefined : args.params) ?? {};
  await delay(200);

  if (url === '/tenant/resolve' || /^\/tenant\/.+\/config$/.test(url)) {
    return envelope(DEMO_TENANT);
  }
  if (url === '/auth/login' || url === '/auth/refresh') {
    return envelope(DEMO_TOKENS);
  }
  if (url === '/auth/logout') {
    return envelope(null);
  }
  if (url === '/dashboard/summary') {
    return envelope(demoSummary());
  }
  if (url === '/devices') {
    const search = String((params as Record<string, unknown>).search ?? '').toLowerCase();
    const filtered = search
      ? DEMO_DEVICES.filter(
          (d) => d.name.toLowerCase().includes(search) || d.imei.toLowerCase().includes(search)
        )
      : DEMO_DEVICES;
    const page: PageResponse<DeviceSummary> = {
      content: filtered.map(toSummary),
      page: 0,
      size: filtered.length,
      totalElements: filtered.length,
      totalPages: 1,
      first: true,
      last: true,
    };
    return envelope(page);
  }
  const deviceMatch = url.match(/^\/devices\/(\d+)$/);
  if (deviceMatch) {
    const id = Number(deviceMatch[1]);
    const found = DEMO_DEVICES.find((d) => d.id === id);
    return found ? envelope(found) : notFound('Device not found');
  }

  return notFound(`No demo handler for ${url}`);
};
