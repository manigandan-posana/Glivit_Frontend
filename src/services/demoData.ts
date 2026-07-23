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
  PlaybackResponse,
  PlaybackTrackPoint,
  PositionDto,
  ProjectDto,
  ReportContent,
  ReportDto,
  SettingsDto,
  TenantConfig,
  TokenResponse,
} from '@/src/types/api';
// Type-only import (erased at compile time), so no runtime import cycle with
// aiApi -> baseApi -> demoData.
import type {
  AiDashboardSummaryDto,
  AiEventDto,
  DispatchRecommendResponseDto,
  DriverScoreDto,
  EtaResponseDto,
  GeofenceSuggestionDto,
  MaintenancePredictionDto,
} from '@/src/services/aiApi';

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

// A compact Bengaluru loop used to synthesize timestamped history and positions.
const DEMO_PATH: [number, number][] = [
  [77.594634, 12.971873],
  [77.59475, 12.973084],
  [77.596943, 12.97502],
  [77.599195, 12.976672],
  [77.601809, 12.976843],
  [77.603454, 12.978999],
  [77.606737, 12.977919],
  [77.608755, 12.977055],
  [77.611112, 12.974442],
  [77.610576, 12.971895],
  [77.611784, 12.969826],
  [77.612712, 12.972735],
  [77.612127, 12.974084],
  [77.608919, 12.974849],
  [77.608556, 12.976775],
  [77.609666, 12.97991],
  [77.610971, 12.980775],
  [77.612275, 12.982204],
  [77.61431, 12.982561],
  [77.615667, 12.982699],
];

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Timestamped demo history for a device: points spaced ~90s apart ending "now",
 * with per-segment recorded speed/course so the truthful playback engine and the
 * live features have real fields to render (not fabricated on the client).
 */
function demoTrackPoints(): PlaybackTrackPoint[] {
  const points: PlaybackTrackPoint[] = [];
  const stepMs = 90_000;
  const startMs = NOW - (DEMO_PATH.length - 1) * stepMs;
  for (let i = 0; i < DEMO_PATH.length; i += 1) {
    const [lng, lat] = DEMO_PATH[i];
    const next = DEMO_PATH[Math.min(i + 1, DEMO_PATH.length - 1)];
    const segKm = i > 0 ? haversineKm(DEMO_PATH[i - 1][1], DEMO_PATH[i - 1][0], lat, lng) : 0;
    const speed = i === 0 ? 0 : Math.round((segKm / (stepMs / 3_600_000)) * 10) / 10;
    points.push({
      t: new Date(startMs + i * stepMs).toISOString(),
      lat,
      lng,
      speed: Math.min(speed, 68),
      course: bearingDeg(lat, lng, next[1], next[0]),
      ignition: true,
      gpsValid: true,
    });
  }
  return points;
}

function demoPlayback(deviceId: number): PlaybackResponse {
  const points = demoTrackPoints();
  let distanceKm = 0;
  for (let i = 1; i < points.length; i += 1) {
    distanceKm += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return {
    deviceId,
    from: points[0].t,
    to: points[points.length - 1].t,
    totalPoints: points.length,
    returnedPoints: points.length,
    distanceKm: Math.round(distanceKm * 10) / 10,
    points,
    events: [
      {
        t: points[Math.floor(points.length / 2)].t,
        lat: points[Math.floor(points.length / 2)].lat,
        lng: points[Math.floor(points.length / 2)].lng,
        eventType: 'OVERSPEED',
      },
    ],
    stops: [
      {
        from: points[0].t,
        to: points[1].t,
        lat: points[0].lat,
        lng: points[0].lng,
        minutes: 4,
      },
    ],
  };
}

function demoPositions(): PositionDto[] {
  return demoTrackPoints()
    .map((p, index) => ({
      id: index + 1,
      deviceTime: p.t,
      serverTime: p.t,
      latitude: p.lat,
      longitude: p.lng,
      speed: p.speed,
      course: p.course,
      ignition: p.ignition,
      gpsValid: p.gpsValid,
      satellites: 11,
      networkSignal: 24,
      fuelLevel: 62,
      eventType: null,
      address: 'Demo location, Bengaluru',
    }))
    .reverse(); // newest first, like the real positions endpoint
}

const DEMO_AI_DASHBOARD: AiDashboardSummaryDto = {
  fleetHealthScore: 82,
  totalActiveVehicles: 4,
  unacknowledgedAiAlerts: 2,
  criticalRiskVehicles: 1,
  highRiskMaintenanceCount: 1,
  riskyDriversCount: 1,
  activeRouteDeviationsCount: 1,
  executiveAiSummary:
    'Fleet health is stable. One vehicle shows elevated maintenance risk and one driver trend needs coaching. No critical safety incidents in the last 24 hours.',
  recentCriticalEvents: [],
};

const DEMO_AI_EVENTS: AiEventDto[] = [
  {
    id: 1,
    tenantId: 1,
    vehicleId: 1,
    vehicleName: 'TN20CM7677',
    deviceId: 1,
    driverId: 1,
    eventType: 'OVERSPEED',
    severity: 'WARNING',
    score: 0.78,
    latitude: 12.9718,
    longitude: 77.5946,
    speed: 72,
    explanation: 'Sustained speed 20% above the corridor limit for 40s near MG Road.',
    acknowledged: false,
    createdAt: new Date(NOW - 25 * 60_000).toISOString(),
  },
  {
    id: 2,
    tenantId: 1,
    vehicleId: 2,
    vehicleName: 'KA05MJ1234',
    deviceId: 2,
    driverId: 1,
    eventType: 'ROUTE_DEVIATION',
    severity: 'CRITICAL',
    score: 0.91,
    latitude: 12.9352,
    longitude: 77.6245,
    speed: 34,
    explanation: 'Vehicle left the planned corridor by 480m for over 3 minutes.',
    acknowledged: false,
    createdAt: new Date(NOW - 55 * 60_000).toISOString(),
  },
  {
    id: 3,
    tenantId: 1,
    vehicleId: 3,
    vehicleName: 'KA01AB9999',
    deviceId: 3,
    driverId: 1,
    eventType: 'HARSH_BRAKING',
    severity: 'INFO',
    score: 0.42,
    latitude: 12.9611,
    longitude: 77.6387,
    speed: 18,
    explanation: 'Moderate deceleration event; within acceptable range.',
    acknowledged: true,
    acknowledgedAt: new Date(NOW - 60 * 60_000).toISOString(),
    createdAt: new Date(NOW - 70 * 60_000).toISOString(),
  },
];

function demoDriverScore(driverId: number): DriverScoreDto {
  return {
    driverId,
    driverName: 'Demo Driver',
    vehicleId: 1,
    scoreDate: new Date(NOW).toISOString(),
    scorePeriod: 'WEEK',
    safetyScore: 81,
    efficiencyScore: 74,
    complianceScore: 88,
    overallScore: 78,
    grade: 'B',
    totalDistanceKm: 412.6,
    totalDrivingMinutes: 640,
    harshAccelCount: 6,
    harshBrakeCount: 9,
    sharpTurnCount: 4,
    speedingSeconds: 320,
    excessiveIdleMinutes: 22,
    anomaliesCount: 3,
    aiCoachingAdvice:
      'Main improvement: reduce harsh braking above 60 km/h. Positive: idle time improved 14% this week.',
  };
}

const DEMO_GEOFENCE_SUGGESTIONS: GeofenceSuggestionDto[] = [
  {
    id: 1,
    suggestedName: 'Frequent Stop — Koramangala',
    centerLatitude: 12.9352,
    centerLongitude: 77.6245,
    suggestedRadiusMeters: 180,
    clusterPointCount: 34,
    confidence: 0.86,
    reasoning: 'Vehicles stopped here 34 times over 14 days — likely a customer or depot.',
    status: 'PENDING',
  },
];

function demoMaintenance(): MaintenancePredictionDto[] {
  return [
    {
      id: 1,
      vehicleId: 5,
      vehicleName: 'KA53MX2200',
      riskScore: 0.73,
      riskLevel: 'HIGH',
      predictedFailureDate: new Date(NOW + 12 * 24 * 60 * 60_000).toISOString(),
      predictedDaysRemaining: 12,
      odometerAtPrediction: 148230,
      engineHoursAtPrediction: 5120,
      batteryHealth: 0.61,
      drivingStressFactor: 0.68,
      recommendedActions: ['Schedule brake inspection', 'Check battery health', 'Engine oil service'],
      reasoning: 'Rising engine stress and declining battery health across the last 30 days.',
      status: 'OPEN',
    },
  ];
}

function demoEta(body: Record<string, unknown> | undefined): EtaResponseDto {
  return {
    vehicleId: Number(body?.vehicleId ?? 1),
    estimatedDistanceKm: 8.4,
    estimatedDurationMinutes: 17,
    predictedArrivalTime: new Date(NOW + 17 * 60_000).toISOString(),
    trafficDelayMinutes: 4,
    confidence: 0.84,
    structuredExplanation:
      'ETA 17 min (±6). Late probability 31% — long idle at the previous stop and below-corridor speed.',
    factors: { lateProbability: 0.31, rangeMinutes: 6, corridorSpeedKph: 38 },
  };
}

function demoDispatch(): DispatchRecommendResponseDto {
  return {
    rankedVehicles: [
      {
        vehicleId: 1,
        name: 'TN20CM7677',
        matchScore: 0.92,
        distanceToOriginKm: 2.1,
        etaToOriginMinutes: 6,
        rank: 1,
        reasons: ['Closest available', 'Category match', 'Driver within duty hours'],
      },
      {
        vehicleId: 3,
        name: 'KA01AB9999',
        matchScore: 0.71,
        distanceToOriginKm: 5.8,
        etaToOriginMinutes: 15,
        rank: 2,
        reasons: ['Available', 'Higher maintenance risk'],
      },
    ],
    topRecommendationReason: 'TN20CM7677 is closest, category-matched, and its driver is within duty hours.',
  };
}

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

  // Route playback + raw positions (Phase 1 truthful playback in demo mode).
  const playbackMatch = url.match(/^\/devices\/(\d+)\/playback$/);
  if (playbackMatch) {
    return envelope(demoPlayback(Number(playbackMatch[1])));
  }
  const positionsMatch = url.match(/^\/devices\/(\d+)\/positions$/);
  if (positionsMatch) {
    return envelope(pageOf(demoPositions(), Number(params.page ?? 0), Number(params.size ?? 100)));
  }

  // AI Fleet Intelligence.
  if (url === '/ai/dashboard') {
    return envelope(DEMO_AI_DASHBOARD);
  }
  if (url === '/ai/events') {
    const severity = String((params as Record<string, unknown>).severity ?? '').toUpperCase();
    const vehicleId = (params as Record<string, unknown>).vehicleId;
    let filtered = DEMO_AI_EVENTS;
    if (severity) filtered = filtered.filter((e) => e.severity.toUpperCase() === severity);
    if (vehicleId != null) filtered = filtered.filter((e) => e.vehicleId === Number(vehicleId));
    return envelope(pageOf(filtered, Number(params.page ?? 0), Number(params.size ?? 20)));
  }
  const aiAckMatch = url.match(/^\/ai\/events\/(\d+)\/acknowledge$/);
  if (aiAckMatch) {
    const found = DEMO_AI_EVENTS.find((e) => e.id === Number(aiAckMatch[1]));
    if (!found) return notFound('AI event not found');
    found.acknowledged = true;
    found.acknowledgedAt = new Date().toISOString();
    audit('ACK_AI_EVENT', 'AI_EVENT', String(found.id), found.eventType);
    return envelope(found);
  }
  if (url === '/ai/feedback') {
    audit('AI_FEEDBACK', 'AI_EVENT', String((body?.aiEventId as number) ?? 0));
    return envelope(null);
  }
  if (url === '/ai/predict/eta') {
    return envelope(demoEta(body));
  }
  const driverScoreMatch = url.match(/^\/ai\/scoring\/driver\/(\d+)$/);
  if (driverScoreMatch) {
    return envelope(demoDriverScore(Number(driverScoreMatch[1])));
  }
  if (url === '/ai/geofence/suggestions') {
    return envelope(DEMO_GEOFENCE_SUGGESTIONS);
  }
  const geofenceSuggestActionMatch = url.match(/^\/ai\/geofence\/suggestions\/(\d+)\/(approve|dismiss)$/);
  if (geofenceSuggestActionMatch) {
    const id = Number(geofenceSuggestActionMatch[1]);
    const found = DEMO_GEOFENCE_SUGGESTIONS.find((s) => s.id === id);
    if (found) found.status = geofenceSuggestActionMatch[2] === 'approve' ? 'APPROVED' : 'DISMISSED';
    audit('AI_GEOFENCE_' + geofenceSuggestActionMatch[2].toUpperCase(), 'GEOFENCE', String(id));
    return envelope(null);
  }
  if (url === '/ai/dispatch/recommend') {
    return envelope(demoDispatch());
  }
  if (url === '/ai/maintenance') {
    return envelope(demoMaintenance());
  }
  const maintenancePredictMatch = url.match(/^\/ai\/maintenance\/predict\/(\d+)$/);
  if (maintenancePredictMatch) {
    return envelope(demoMaintenance());
  }

  return notFound(`No demo handler for ${url}`);
};
