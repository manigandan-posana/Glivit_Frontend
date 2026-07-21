import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';

import { P } from '@/src/constants/permissions';
import type {
  ApiResponse,
  AuthUser,
  AuditDto,
  CommandDto,
  DashboardSummary,
  DeviceDetail,
  DeviceSummary,
  DriverDto,
  EventDto,
  GeofenceDto,
  GroupDto,
  ManagedUserDto,
  PageResponse,
  ProjectDto,
  ReportContent,
  ReportDto,
  SettingsDto,
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
    [P.MANAGE_BILLING]: true,
    [P.MANAGE_EXPIRY]: true,
    [P.VIEW_POINTS]: true,
    [P.VIEW_AUDIT_LOGS]: true,
    [P.MANAGE_SERVER_SETTINGS]: true,
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

const DEMO_PROJECTS: ProjectDto[] = [
  { id: 1, name: 'Bengaluru Distribution', description: 'City fleet operations', status: 'ACTIVE' },
];

const DEMO_DRIVERS: DriverDto[] = [
  {
    id: 1,
    projectId: 1,
    name: 'Demo Driver',
    identifier: 'DRV-001',
    phone: '+910000000000',
    licenceNumber: 'KA01DEMO2026',
    licenceExpiry: '2027-12-31',
    emergencyContact: '+910000000001',
    active: true,
  },
];

const DEMO_GROUPS: GroupDto[] = [
  { id: 1, name: 'City Vehicles', parentId: null, managerId: 1 },
];

const DEMO_USERS: ManagedUserDto[] = [
  {
    id: 1,
    username: 'admin',
    name: 'Demo Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    permissions: DEMO_USER.permissions,
  },
];

const DEMO_EVENTS: EventDto[] = [
  {
    id: 1,
    deviceId: 1,
    vehicleId: 1,
    eventType: 'OVERSPEED',
    severity: 'WARNING',
    latitude: 12.9718,
    longitude: 77.5946,
    speed: 72,
    address: 'MG Road, Bengaluru',
    serverTime: new Date(NOW - 30 * 60_000).toISOString(),
    acknowledged: false,
    detail: 'Vehicle exceeded configured speed threshold.',
  },
  {
    id: 2,
    deviceId: 2,
    vehicleId: 2,
    eventType: 'IGNITION_OFF',
    severity: 'INFO',
    latitude: 12.9352,
    longitude: 77.6245,
    speed: 0,
    address: 'Koramangala, Bengaluru',
    serverTime: new Date(NOW - 90 * 60_000).toISOString(),
    acknowledged: true,
    acknowledgedAt: new Date(NOW - 80 * 60_000).toISOString(),
  },
];

const DEMO_GEOFENCES: GeofenceDto[] = [
  {
    id: 1,
    name: 'Central Depot',
    description: 'Demo circular yard fence',
    color: '#27D34D',
    type: 'CIRCLE',
    coordinates: [[77.5946, 12.9718]],
    radiusMeters: 350,
    corridorWidthMeters: null,
    assignedDeviceIds: [1, 2],
    assignedGroupIds: [1],
    enterAlert: true,
    exitAlert: true,
    activeSchedule: null,
    active: true,
  },
];

const DEMO_COMMANDS: CommandDto[] = [];
const DEMO_REPORTS: ReportDto[] = [];
const DEMO_AUDIT: AuditDto[] = [];

let DEMO_SETTINGS: SettingsDto = {
  distanceUnit: 'KM',
  speedUnit: 'KMH',
  timeFormat: '24H',
  mapStyle: 'street',
  trafficEnabled: false,
  routeColorMode: 'speed',
  notificationSound: true,
  language: 'en',
  dateFormat: 'dd-MMM-yyyy',
  defaultHistoryRange: 'today',
  autoFollowVehicle: true,
  refreshFrequencySeconds: 30,
  privacyOptions: null,
  updatedAt: new Date(NOW).toISOString(),
};

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

function pageOf<T>(content: T[], page = 0, size = 20): PageResponse<T> {
  const start = page * size;
  const pageContent = content.slice(start, start + size);
  return {
    content: pageContent,
    page,
    size,
    totalElements: content.length,
    totalPages: Math.max(1, Math.ceil(content.length / size)),
    first: page === 0,
    last: start + size >= content.length,
  };
}

function audit(action: string, entityType: string, entityId: string, detail?: string) {
  DEMO_AUDIT.unshift({
    id: DEMO_AUDIT.length + 1,
    userId: DEMO_USER.id,
    username: DEMO_USER.username,
    action,
    entityType,
    entityId,
    outcome: 'SUCCESS',
    correlationId: 'demo',
    detail,
    createdAt: new Date().toISOString(),
  });
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
  const method = typeof args === 'string' ? 'GET' : (args.method ?? 'GET').toUpperCase();
  const params = (typeof args === 'string' ? undefined : args.params) ?? {};
  const body = typeof args === 'string' ? undefined : (args.body as Record<string, unknown> | undefined);
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
    if (method === 'POST' && body) {
      const id = DEMO_DEVICES.length + 1;
      const created = makeDevice(
        id,
        String(body.name ?? `Demo Vehicle ${id}`),
        String(body.category ?? 'GPS'),
        'NO_DATA',
        12.97 + id * 0.005,
        77.59 + id * 0.005,
        0,
        String(body.address ?? 'Address unavailable')
      );
      created.imei = String(body.imei ?? created.imei);
      created.model = String(body.model ?? 'DEMO-GT06');
      DEMO_DEVICES.unshift(created);
      audit('CREATE_DEVICE', 'DEVICE', String(id));
      return envelope(created);
    }
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
    if (found && method === 'DELETE') {
      found.status = 'SUSPENDED';
      audit('DELETE_DEVICE', 'DEVICE', String(id));
      return envelope(null);
    }
    return found ? envelope(found) : notFound('Device not found');
  }
  if (url === '/projects') {
    if (method === 'POST' && body) {
      const created: ProjectDto = {
        id: DEMO_PROJECTS.length + 1,
        name: String(body.name ?? 'New Project'),
        description: (body.description as string) ?? null,
        status: String(body.status ?? 'ACTIVE'),
      };
      DEMO_PROJECTS.unshift(created);
      audit('CREATE_PROJECT', 'PROJECT', String(created.id));
      return envelope(created);
    }
    return envelope(DEMO_PROJECTS);
  }
  if (url === '/drivers') {
    if (method === 'POST' && body) {
      const created: DriverDto = {
        id: DEMO_DRIVERS.length + 1,
        projectId: (body.projectId as number) ?? null,
        name: String(body.name ?? 'New Driver'),
        identifier: (body.identifier as string) ?? null,
        phone: (body.phone as string) ?? null,
        licenceNumber: (body.licenceNumber as string) ?? null,
        licenceExpiry: (body.licenceExpiry as string) ?? null,
        emergencyContact: (body.emergencyContact as string) ?? null,
        active: body.active == null ? true : Boolean(body.active),
      };
      DEMO_DRIVERS.unshift(created);
      audit('CREATE_DRIVER', 'DRIVER', String(created.id));
      return envelope(created);
    }
    return envelope(DEMO_DRIVERS);
  }
  if (url === '/groups') {
    if (method === 'POST' && body) {
      const created: GroupDto = {
        id: DEMO_GROUPS.length + 1,
        name: String(body.name ?? 'New Group'),
        parentId: (body.parentId as number) ?? null,
        managerId: (body.managerId as number) ?? null,
      };
      DEMO_GROUPS.unshift(created);
      audit('CREATE_GROUP', 'GROUP', String(created.id));
      return envelope(created);
    }
    return envelope(DEMO_GROUPS);
  }
  if (url === '/users') {
    if (method === 'POST' && body) {
      const created: ManagedUserDto = {
        id: DEMO_USERS.length + 1,
        username: String(body.username ?? `user${DEMO_USERS.length + 1}`),
        name: String(body.name ?? 'New User'),
        email: (body.email as string) ?? null,
        mobile: (body.mobile as string) ?? null,
        role: (body.role as ManagedUserDto['role']) ?? 'ADMIN',
        status: String(body.status ?? 'ACTIVE'),
        permissions: (body.permissions as Record<string, boolean>) ?? {},
      };
      DEMO_USERS.unshift(created);
      audit('CREATE_USER', 'USER', String(created.id));
      return envelope(created);
    }
    return envelope(pageOf(DEMO_USERS, Number(params.page ?? 0), Number(params.size ?? 20)));
  }
  if (url === '/events') {
    return envelope(pageOf(DEMO_EVENTS, Number(params.page ?? 0), Number(params.size ?? 20)));
  }
  const eventAckMatch = url.match(/^\/events\/(\d+)\/acknowledge$/);
  if (eventAckMatch) {
    const found = DEMO_EVENTS.find((e) => e.id === Number(eventAckMatch[1]));
    if (!found) return notFound('Event not found');
    found.acknowledged = true;
    found.acknowledgedAt = new Date().toISOString();
    audit('ACK_EVENT', 'EVENT', String(found.id), found.eventType);
    return envelope(found);
  }
  if (url === '/geofences') {
    if (method === 'POST' && body) {
      const created: GeofenceDto = {
        id: DEMO_GEOFENCES.length + 1,
        name: String(body.name ?? 'New Geofence'),
        description: (body.description as string) ?? null,
        color: String(body.color ?? '#27D34D'),
        type: String(body.type ?? 'CIRCLE'),
        coordinates: (body.coordinates as number[][]) ?? [[77.5946, 12.9718]],
        radiusMeters: (body.radiusMeters as number) ?? 250,
        corridorWidthMeters: (body.corridorWidthMeters as number) ?? null,
        assignedDeviceIds: (body.assignedDeviceIds as number[]) ?? [],
        assignedGroupIds: (body.assignedGroupIds as number[]) ?? [],
        enterAlert: body.enterAlert == null ? true : Boolean(body.enterAlert),
        exitAlert: body.exitAlert == null ? true : Boolean(body.exitAlert),
        activeSchedule: (body.activeSchedule as string) ?? null,
        active: body.active == null ? true : Boolean(body.active),
      };
      DEMO_GEOFENCES.unshift(created);
      audit('CREATE_GEOFENCE', 'GEOFENCE', String(created.id));
      return envelope(created);
    }
    return envelope(pageOf(DEMO_GEOFENCES, Number(params.page ?? 0), Number(params.size ?? 20)));
  }
  if (url === '/commands') {
    if (method === 'POST' && body) {
      const existing = DEMO_COMMANDS.find((c) => c.idempotencyKey === body.idempotencyKey);
      if (existing) return envelope(existing);
      const created: CommandDto = {
        id: DEMO_COMMANDS.length + 1,
        deviceId: Number(body.deviceId),
        commandType: String(body.commandType ?? 'REQUEST_LOCATION').toUpperCase(),
        payload: (body.payload as string) ?? null,
        status: 'REQUESTED',
        idempotencyKey: String(body.idempotencyKey),
        responseMessage: null,
        requestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      DEMO_COMMANDS.unshift(created);
      audit('SEND_COMMAND', 'DEVICE', String(created.deviceId), created.commandType);
      return envelope(created);
    }
    return envelope(pageOf(DEMO_COMMANDS, Number(params.page ?? 0), Number(params.size ?? 20)));
  }
  if (url === '/reports') {
    if (method === 'POST' && body) {
      const id = DEMO_REPORTS.length + 1;
      const created: ReportDto = {
        id,
        reportType: String(body.reportType ?? 'SUMMARY').toUpperCase(),
        status: 'COMPLETED',
        fromTime: String(body.fromTime),
        toTime: String(body.toTime),
        outputFormat: String(body.outputFormat ?? 'CSV'),
        fileName: `demo_report_${id}.csv`,
        fileSize: 96,
        downloadUrl: `/api/reports/${id}/content`,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      DEMO_REPORTS.unshift(created);
      audit('CREATE_REPORT', 'REPORT', String(id), created.reportType);
      return envelope(created);
    }
    return envelope(pageOf(DEMO_REPORTS, Number(params.page ?? 0), Number(params.size ?? 20)));
  }
  const reportContentMatch = url.match(/^\/reports\/(\d+)\/content$/);
  if (reportContentMatch) {
    const id = Number(reportContentMatch[1]);
    const report = DEMO_REPORTS.find((r) => r.id === id);
    if (!report) return notFound('Report not found');
    const content: ReportContent = {
      fileName: report.fileName ?? `demo_report_${id}.csv`,
      contentType: 'text/csv',
      content: 'device_id,name,imei,status\n1,TN20CM7677,864000000000001,ACTIVE\n',
    };
    return envelope(content);
  }
  if (url === '/settings') {
    if (method === 'PUT' && body) {
      DEMO_SETTINGS = { ...DEMO_SETTINGS, ...body, updatedAt: new Date().toISOString() };
      audit('UPDATE_SETTINGS', 'USER', String(DEMO_USER.id));
    }
    return envelope(DEMO_SETTINGS);
  }
  if (url === '/audit') {
    return envelope(pageOf(DEMO_AUDIT, Number(params.page ?? 0), Number(params.size ?? 20)));
  }

  return notFound(`No demo handler for ${url}`);
};
