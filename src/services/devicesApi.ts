import { baseApi, unwrap } from '@/src/services/baseApi';
import type { ApiResponse, DeviceDetail, DeviceSummary, PageResponse } from '@/src/types/api';

export type DeviceListArgs = {
  search?: string;
  projectId?: number;
  groupId?: number;
  page?: number;
  size?: number;
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
  }),
  overrideExisting: false,
});

export const { useGetDevicesQuery, useGetDeviceQuery } = devicesApi;
