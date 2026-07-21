import { baseApi, unwrap } from '@/src/services/baseApi';
import type { ApiResponse, DeviceDetail, DeviceSummary, PageResponse } from '@/src/types/api';

export type DeviceListArgs = {
  search?: string;
  projectId?: number;
  groupId?: number;
  page?: number;
  size?: number;
};

export type DeviceUpsertRequest = {
  name: string;
  imei: string;
  simNumber?: string;
  model?: string;
  port?: number;
  category: string;
  projectId?: number;
  groupId?: number;
  vehicleId?: number;
  managerId?: number;
  driverName?: string;
  driverPhone?: string;
  remarks?: string;
  address?: string;
  simProvider?: string;
  simApn?: string;
  expiryDate?: string;
  activatedAt?: string;
  timezone?: string;
  distanceUnit?: string;
  speedUnit?: string;
};

export const devicesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDevices: build.query<PageResponse<DeviceSummary>, DeviceListArgs>({
      query: ({ search, projectId, groupId, page = 0, size = 20 }) => ({
        url: '/devices',
        params: {
          ...(search ? { search } : {}),
          ...(projectId != null ? { projectId } : {}),
          ...(groupId != null ? { groupId } : {}),
          page,
          size,
        },
      }),
      transformResponse: (response: ApiResponse<PageResponse<DeviceSummary>>) => unwrap(response),
      providesTags: ['Device'],
    }),
    getDevice: build.query<DeviceDetail, number>({
      query: (id) => ({ url: `/devices/${id}` }),
      transformResponse: (response: ApiResponse<DeviceDetail>) => unwrap(response),
      providesTags: (_result, _error, id) => [{ type: 'Device', id }],
    }),
    createDevice: build.mutation<DeviceDetail, DeviceUpsertRequest>({
      query: (body) => ({ url: '/devices', method: 'POST', body }),
      transformResponse: (response: ApiResponse<DeviceDetail>) => unwrap(response),
      invalidatesTags: ['Dashboard', 'Device'],
    }),
    updateDevice: build.mutation<DeviceDetail, { id: number; body: DeviceUpsertRequest }>({
      query: ({ id, body }) => ({ url: `/devices/${id}`, method: 'PUT', body }),
      transformResponse: (response: ApiResponse<DeviceDetail>) => unwrap(response),
      invalidatesTags: (_result, _error, { id }) => ['Dashboard', 'Device', { type: 'Device', id }],
    }),
    deleteDevice: build.mutation<void, number>({
      query: (id) => ({ url: `/devices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Dashboard', 'Device'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useCreateDeviceMutation,
  useDeleteDeviceMutation,
  useGetDeviceQuery,
  useGetDevicesQuery,
  useUpdateDeviceMutation,
} = devicesApi;
