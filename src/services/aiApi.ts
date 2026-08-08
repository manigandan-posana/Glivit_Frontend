import { baseApi, unwrap } from './baseApi';
import type { ApiResponse, GeofenceDto, PageResponse } from '@/src/types/api';

// ---------------------------------------------------------------------------
// DTOs — these mirror the Spring Boot com.glivt.ai.dto.* records exactly.
// The frontend talks ONLY to Spring Boot (/api/ai/*); it never calls Python
// or Ollama directly. Every response is tenant-scoped server-side.
// ---------------------------------------------------------------------------

export interface AiEventDto {
  id: number;
  tenantId: number;
  vehicleId?: number | null;
  vehicleName?: string | null;
  deviceId?: number | null;
  driverId?: number | null;
  eventType: string;
  severity: string;
  score: number;
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
  deviationPathJson?: string | null;
  reentryPointJson?: string | null;
  explanation?: string | null;
  evidenceJson?: string | null;
  acknowledged: boolean;
  acknowledgedBy?: number | null;
  acknowledgedAt?: string | null;
  createdAt: string;
}

export interface AiDashboardSummaryDto {
  fleetHealthScore: number;
  totalActiveVehicles: number;
  unacknowledgedAiAlerts: number;
  criticalRiskVehicles: number;
  highRiskMaintenanceCount: number;
  riskyDriversCount: number;
  activeRouteDeviationsCount: number;
  recentCriticalEvents: AiEventDto[];
  executiveAiSummary: string;
}

export interface FeedbackRequestDto {
  aiEventId?: number | null;
  featureType: string;
  isCorrect: boolean;
  feedbackType?: string;
  comments?: string;
}

export interface EtaRequestDto {
  vehicleId: number;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  currentSpeedKph?: number;
}

export interface EtaResponseDto {
  vehicleId: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  predictedArrivalTime: string;
  trafficDelayMinutes: number;
  confidence: number;
  factors: Record<string, unknown>;
  structuredExplanation: string;
}

export interface ChatMessageDto {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface EventChatContextDto {
  source: 'STANDARD' | 'AI';
  eventId: number;
  type: string;
  vehicle: string;
  deviceId: string;
  time: string;
  severity: string;
  location: string;
  description: string;
}

export interface ChatRequestDto {
  message: string;
  history?: ChatMessageDto[];
  eventContext?: EventChatContextDto;
}

export interface ChatResponseDto {
  message: string;
  timestamp: string;
}

export interface DriverScoreDto {
  id?: number | null;
  driverId: number;
  driverName: string;
  vehicleId?: number | null;
  scoreDate: string;
  scorePeriod: string;
  safetyScore: number;
  efficiencyScore: number;
  complianceScore: number;
  overallScore: number;
  grade: string;
  totalDistanceKm: number;
  totalDrivingMinutes: number;
  harshAccelCount: number;
  harshBrakeCount: number;
  sharpTurnCount: number;
  speedingSeconds: number;
  excessiveIdleMinutes: number;
  anomaliesCount: number;
  breakdownJson?: string | null;
  aiCoachingAdvice: string;
}

export interface GeofenceSuggestionDto {
  id: number;
  suggestedName: string;
  centerLatitude: number;
  centerLongitude: number;
  suggestedRadiusMeters: number;
  clusterPointCount: number;
  confidence: number;
  reasoning?: string | null;
  polygonJson?: string | null;
  status: string;
}

export interface RankedVehicleDto {
  vehicleId: number;
  name: string;
  matchScore: number;
  distanceToOriginKm: number;
  etaToOriginMinutes: number;
  rank: number;
  reasons: string[];
}

export interface DispatchRecommendRequestDto {
  jobDescription: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  requiredCategory?: string;
  candidateVehicleIds?: number[];
}

export interface DispatchRecommendResponseDto {
  rankedVehicles: RankedVehicleDto[];
  topRecommendationReason: string;
}

export interface MaintenancePredictionDto {
  id: number;
  vehicleId: number;
  vehicleName: string;
  riskScore: number;
  riskLevel: string;
  predictedFailureDate?: string | null;
  predictedDaysRemaining?: number | null;
  odometerAtPrediction: number;
  engineHoursAtPrediction: number;
  batteryHealth: number;
  drivingStressFactor: number;
  recommendedActions: string[];
  reasoning?: string | null;
  status: string;
}

export interface AiEventQuery {
  vehicleId?: number;
  severity?: string;
  eventType?: string;
  page?: number;
  size?: number;
}

export const aiApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getAiDashboardSummary: builder.query<AiDashboardSummaryDto, void>({
      query: () => '/ai/dashboard',
      transformResponse: (response: ApiResponse<AiDashboardSummaryDto>) => unwrap(response),
      providesTags: ['Dashboard'],
    }),
    getAiEvents: builder.query<PageResponse<AiEventDto>, AiEventQuery | void>({
      query: (params) => {
        const q = (params ?? {}) as AiEventQuery;
        return {
          url: '/ai/events',
          params: {
            ...(q.vehicleId != null ? { vehicleId: q.vehicleId } : {}),
            ...(q.severity ? { severity: q.severity } : {}),
            ...(q.eventType ? { eventType: q.eventType } : {}),
            page: q.page ?? 0,
            size: q.size ?? 20,
          },
        };
      },
      transformResponse: (response: ApiResponse<PageResponse<AiEventDto>>) => unwrap(response),
      providesTags: ['Event'],
    }),
    acknowledgeAiEvent: builder.mutation<AiEventDto, number>({
      query: (id) => ({ url: `/ai/events/${id}/acknowledge`, method: 'POST' }),
      transformResponse: (response: ApiResponse<AiEventDto>) => unwrap(response),
      invalidatesTags: ['Event', 'Dashboard'],
    }),
    submitAiFeedback: builder.mutation<void, FeedbackRequestDto>({
      query: (body) => ({ url: '/ai/feedback', method: 'POST', body }),
    }),
    sendChatMessage: builder.mutation<ChatResponseDto, ChatRequestDto>({
      query: (body) => ({ url: '/ai/chat', method: 'POST', body }),
      transformResponse: (response: ApiResponse<ChatResponseDto>) => unwrap(response),
    }),
    getEtaPrediction: builder.query<EtaResponseDto, EtaRequestDto>({
      query: (body) => ({ url: '/ai/predict/eta', method: 'POST', body }),
      transformResponse: (response: ApiResponse<EtaResponseDto>) => unwrap(response),
    }),
    getDriverScore: builder.query<DriverScoreDto, number>({
      query: (driverId) => `/ai/scoring/driver/${driverId}`,
      transformResponse: (response: ApiResponse<DriverScoreDto>) => unwrap(response),
      providesTags: ['Driver'],
    }),
    getGeofenceSuggestions: builder.query<GeofenceSuggestionDto[], void>({
      query: () => '/ai/geofence/suggestions',
      transformResponse: (response: ApiResponse<GeofenceSuggestionDto[]>) => unwrap(response),
      providesTags: ['Geofence'],
    }),
    approveGeofenceSuggestion: builder.mutation<GeofenceDto, number>({
      query: (id) => ({ url: `/ai/geofence/suggestions/${id}/approve`, method: 'POST' }),
      transformResponse: (response: ApiResponse<GeofenceDto>) => unwrap(response),
      invalidatesTags: ['Geofence'],
    }),
    dismissGeofenceSuggestion: builder.mutation<void, number>({
      query: (id) => ({ url: `/ai/geofence/suggestions/${id}/dismiss`, method: 'POST' }),
      invalidatesTags: ['Geofence'],
    }),
    getDispatchRecommendations: builder.query<DispatchRecommendResponseDto, DispatchRecommendRequestDto>({
      query: (body) => ({ url: '/ai/dispatch/recommend', method: 'POST', body }),
      transformResponse: (response: ApiResponse<DispatchRecommendResponseDto>) => unwrap(response),
    }),
    getMaintenancePredictions: builder.query<MaintenancePredictionDto[], number>({
      query: (deviceId) => `/ai/maintenance/predict/${deviceId}`,
      transformResponse: (response: ApiResponse<MaintenancePredictionDto[]>) => unwrap(response),
      providesTags: ['Device'],
    }),
    getFleetMaintenance: builder.query<MaintenancePredictionDto[], void>({
      query: () => '/ai/maintenance',
      transformResponse: (response: ApiResponse<MaintenancePredictionDto[]>) => unwrap(response),
      providesTags: ['Device'],
    }),
  }),
});

export const {
  useGetAiDashboardSummaryQuery,
  useGetAiEventsQuery,
  useAcknowledgeAiEventMutation,
  useSubmitAiFeedbackMutation,
  useSendChatMessageMutation,
  useGetEtaPredictionQuery,
  useLazyGetEtaPredictionQuery,
  useGetDriverScoreQuery,
  useGetGeofenceSuggestionsQuery,
  useApproveGeofenceSuggestionMutation,
  useDismissGeofenceSuggestionMutation,
  useGetDispatchRecommendationsQuery,
  useLazyGetDispatchRecommendationsQuery,
  useGetMaintenancePredictionsQuery,
  useGetFleetMaintenanceQuery,
} = aiApi;
