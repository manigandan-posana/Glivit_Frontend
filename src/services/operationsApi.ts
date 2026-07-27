import { baseApi, unwrap } from '@/src/services/baseApi';
import type {
  ApiResponse,
  AuditDto,
  CommandDto,
  DriverDto,
  EventDto,
  GeofenceDto,
  GroupDto,
  ManagedUserDto,
  PageResponse,
  ProjectDto,
  ReportContent,
  ReportDto,
  Role,
  SettingsDto,
} from '@/src/types/api';

export type ProjectRequest = { name: string; description?: string; status?: string };
export type DriverRequest = {
  name: string;
  identifier?: string;
  phone?: string;
  licenceNumber?: string;
  licenceExpiry?: string;
  projectId?: number;
  emergencyContact?: string;
  active?: boolean;
};
export type GroupRequest = { name: string; parentId?: number; managerId?: number };
export type UserRequest = {
  username: string;
  password?: string;
  name: string;
  email?: string;
  mobile?: string;
  address?: string;
  role: Role;
  managerId?: number;
  status?: string;
  accountExpiry?: string;
  permissions?: Record<string, boolean>;
};
export type ReportRequest = {
  reportType: string;
  fromTime: string;
  toTime: string;
  deviceIds?: number[];
  groupIds?: number[];
  projectIds?: number[];
  eventTypes?: string[];
  minimumStopMinutes?: number;
  minimumTripMinutes?: number;
  minimumTripDistance?: number;
  includeAddresses?: boolean;
  includeMapMarkers?: boolean;
  outputFormat?: string;
};
export type GeofenceRequest = {
  name: string;
  description?: string;
  color?: string;
  type: 'CIRCLE' | 'POLYGON' | 'POLYLINE';
  coordinates: number[][];
  radiusMeters?: number;
  corridorWidthMeters?: number;
  assignedDeviceIds?: number[];
  assignedGroupIds?: number[];
  enterAlert?: boolean;
  exitAlert?: boolean;
  activeSchedule?: string;
  active?: boolean;
};
export type CommandRequest = {
  deviceId: number;
  commandType: string;
  payload?: string;
  idempotencyKey: string;
  confirmed?: boolean;
};
export type SettingsRequest = Partial<Omit<SettingsDto, 'updatedAt'>>;

export const operationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProjects: build.query<ProjectDto[], void>({
      query: () => ({ url: '/projects' }),
      transformResponse: (response: ApiResponse<ProjectDto[]>) => unwrap(response),
      providesTags: ['Project'],
    }),
    createProject: build.mutation<ProjectDto, ProjectRequest>({
      query: (body) => ({ url: '/projects', method: 'POST', body }),
      transformResponse: (response: ApiResponse<ProjectDto>) => unwrap(response),
      invalidatesTags: ['Project'],
    }),
    getDrivers: build.query<DriverDto[], void>({
      query: () => ({ url: '/drivers' }),
      transformResponse: (response: ApiResponse<DriverDto[]>) => unwrap(response),
      providesTags: ['Driver'],
    }),
    createDriver: build.mutation<DriverDto, DriverRequest>({
      query: (body) => ({ url: '/drivers', method: 'POST', body }),
      transformResponse: (response: ApiResponse<DriverDto>) => unwrap(response),
      invalidatesTags: ['Driver'],
    }),
    getGroups: build.query<GroupDto[], void>({
      query: () => ({ url: '/groups' }),
      transformResponse: (response: ApiResponse<GroupDto[]>) => unwrap(response),
      providesTags: ['Group'],
    }),
    createGroup: build.mutation<GroupDto, GroupRequest>({
      query: (body) => ({ url: '/groups', method: 'POST', body }),
      transformResponse: (response: ApiResponse<GroupDto>) => unwrap(response),
      invalidatesTags: ['Group'],
    }),
    getUsers: build.query<PageResponse<ManagedUserDto>, { search?: string; page?: number; size?: number }>({
      query: ({ search, page = 0, size = 20 }) => ({
        url: '/users',
        params: { ...(search ? { search } : {}), page, size },
      }),
      transformResponse: (response: ApiResponse<PageResponse<ManagedUserDto>>) => unwrap(response),
      providesTags: ['User'],
    }),
    createUser: build.mutation<ManagedUserDto, UserRequest>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      transformResponse: (response: ApiResponse<ManagedUserDto>) => unwrap(response),
      invalidatesTags: ['User'],
    }),
    getEvents: build.query<PageResponse<EventDto>, { page?: number; size?: number; deviceId?: number }>({
      query: ({ page = 0, size = 20, deviceId }) => ({
        url: '/events',
        params: { page, size, ...(deviceId ? { deviceId } : {}) },
      }),
      transformResponse: (response: ApiResponse<PageResponse<EventDto>>) => unwrap(response),
      providesTags: ['Event'],
    }),
    acknowledgeEvent: build.mutation<EventDto, number>({
      query: (id) => ({ url: `/events/${id}/acknowledge`, method: 'PATCH' }),
      transformResponse: (response: ApiResponse<EventDto>) => unwrap(response),
      invalidatesTags: ['Event'],
    }),
    getGeofences: build.query<PageResponse<GeofenceDto>, { page?: number; size?: number }>({
      query: ({ page = 0, size = 20 }) => ({ url: '/geofences', params: { page, size } }),
      transformResponse: (response: ApiResponse<PageResponse<GeofenceDto>>) => unwrap(response),
      providesTags: ['Geofence'],
    }),
    createGeofence: build.mutation<GeofenceDto, GeofenceRequest>({
      query: (body) => ({ url: '/geofences', method: 'POST', body }),
      transformResponse: (response: ApiResponse<GeofenceDto>) => unwrap(response),
      invalidatesTags: ['Geofence'],
    }),
    getCommands: build.query<PageResponse<CommandDto>, { page?: number; size?: number }>({
      query: ({ page = 0, size = 20 }) => ({ url: '/commands', params: { page, size } }),
      transformResponse: (response: ApiResponse<PageResponse<CommandDto>>) => unwrap(response),
      providesTags: ['Command'],
    }),
    submitCommand: build.mutation<CommandDto, CommandRequest>({
      query: (body) => ({ url: '/commands', method: 'POST', body }),
      transformResponse: (response: ApiResponse<CommandDto>) => unwrap(response),
      // LOCK / UNLOCK / ENGINE_CUT / ENGINE_RESTORE change the device's derived
      // state and speed server-side, so the device caches must be refetched --
      // without this the fleet map and live-track screens kept showing the
      // vehicle running after it had been immobilised.
      invalidatesTags: (_result, _error, arg) => [
        'Command',
        'Audit',
        'Dashboard',
        'Device',
        { type: 'Device' as const, id: arg.deviceId },
      ],
    }),
    getReports: build.query<PageResponse<ReportDto>, { page?: number; size?: number }>({
      query: ({ page = 0, size = 20 }) => ({ url: '/reports', params: { page, size } }),
      transformResponse: (response: ApiResponse<PageResponse<ReportDto>>) => unwrap(response),
      providesTags: ['Report'],
    }),
    createReport: build.mutation<ReportDto, ReportRequest>({
      query: (body) => ({ url: '/reports', method: 'POST', body }),
      transformResponse: (response: ApiResponse<ReportDto>) => unwrap(response),
      invalidatesTags: ['Report', 'Audit'],
    }),
    getReportContent: build.query<ReportContent, number>({
      query: (id) => ({ url: `/reports/${id}/content` }),
      transformResponse: (response: ApiResponse<ReportContent>) => unwrap(response),
    }),
    getSettings: build.query<SettingsDto, void>({
      query: () => ({ url: '/settings' }),
      transformResponse: (response: ApiResponse<SettingsDto>) => unwrap(response),
      providesTags: ['Settings'],
    }),
    updateSettings: build.mutation<SettingsDto, SettingsRequest>({
      query: (body) => ({ url: '/settings', method: 'PUT', body }),
      transformResponse: (response: ApiResponse<SettingsDto>) => unwrap(response),
      invalidatesTags: ['Settings', 'Audit'],
    }),
    getAudit: build.query<PageResponse<AuditDto>, { page?: number; size?: number }>({
      query: ({ page = 0, size = 20 }) => ({ url: '/audit', params: { page, size } }),
      transformResponse: (response: ApiResponse<PageResponse<AuditDto>>) => unwrap(response),
      providesTags: ['Audit'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useAcknowledgeEventMutation,
  useCreateDriverMutation,
  useCreateGeofenceMutation,
  useCreateGroupMutation,
  useCreateProjectMutation,
  useCreateReportMutation,
  useCreateUserMutation,
  useGetAuditQuery,
  useGetCommandsQuery,
  useGetDriversQuery,
  useGetEventsQuery,
  useGetGeofencesQuery,
  useGetGroupsQuery,
  useGetProjectsQuery,
  useGetReportContentQuery,
  useGetReportsQuery,
  useLazyGetReportContentQuery,
  useGetSettingsQuery,
  useGetUsersQuery,
  useSubmitCommandMutation,
  useUpdateSettingsMutation,
} = operationsApi;
