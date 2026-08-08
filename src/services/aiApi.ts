import { baseApi, unwrap } from './baseApi';
import type { ApiResponse, GeofenceDto, PageResponse } from '@/src/types/api';

// ---------------------------------------------------------------------------
// DTOs — these mirror the Spring Boot com.glivt.ai.dto.* types exactly.
// The frontend talks ONLY to Spring Boot (/api/ai/*); it never calls Python
// or Ollama directly. Every response is tenant-scoped server-side.
// ---------------------------------------------------------------------------

/** Where an AI answer actually came from. Never guessed by the UI. */
export type AiSource = 'OLLAMA' | 'DETERMINISTIC' | 'PYTHON_AI' | 'RULE' | 'MODEL' | 'NONE';

/** Operating mode shown to the user so a degraded answer is never passed off as full AI. */
export type AiMode =
  | 'FULL_AI'
  | 'RULE_ENGINE_FALLBACK'
  | 'DEGRADED'
  | 'PYTHON_SERVICE_UNAVAILABLE'
  | 'UNKNOWN';

export type AiEventStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface AiEventDto {
  id: number;
  tenantId: number;
  vehicleId?: number | null;
  vehicleName?: string | null;
  deviceId?: number | null;
  driverId?: number | null;
  driverName?: string | null;
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
  // Incident view: repeats fold into one record instead of one row per packet.
  status?: AiEventStatus | null;
  occurrenceCount?: number | null;
  firstObservedAt?: string | null;
  lastObservedAt?: string | null;
  relatedEventTypes?: string[] | null;
  routeId?: number | null;
  distanceFromRouteMeters?: number | null;
  speedLimitKph?: number | null;
  /** ROUTE_RULE | GEOFENCE_RULE | ROAD_METADATA | TENANT_POLICY | VEHICLE_TYPE_DEFAULT */
  speedLimitSource?: string | null;
  source?: string | null;
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
  /** Real road-route distance when the caller resolved one. */
  roadDistanceKm?: number;
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
  source?: AiSource | null;
  /** ROAD_ROUTE or STRAIGHT_LINE_ADJUSTED — never implies routing that did not happen. */
  distanceSource?: string | null;
  trafficInput?: string | null;
  rangeMinutes?: number;
  lateProbability?: number;
  calculatedAt?: string | null;
}

export interface ChatMessageDto {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  source?: AiSource;
  mode?: AiMode;
  /** Why the model was skipped, so the UI can name the real cause. */
  fallbackReason?: string | null;
  citations?: ChatCitationDto[];
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
  /** Re-validated against the caller's tenant server-side. */
  selectedVehicleId?: number;
}

export interface ChatCitationDto {
  type: string;
  id: number | null;
  label: string;
}

export interface ChatSuggestedActionDto {
  action: string;
  label: string;
  targetType: string;
  targetId: number | null;
  requiresConfirmation: boolean;
}

export interface ChatResponseDto {
  reply: string;
  source: AiSource;
  mode: AiMode;
  model: string;
  durationMs: number;
  fallbackReason: string | null;
  citations: ChatCitationDto[];
  suggestedActions: ChatSuggestedActionDto[];
  timestamp?: string;
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
  riskLevel?: string | null;
  reasonsJson?: string | null;
  source?: AiSource | null;
  ruleVersion?: string | null;
  modelVersion?: string | null;
  calculatedAt?: string | null;
  /** False when no score has been calculated for this driver yet. */
  hasScore?: boolean;
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
  visitCount?: number;
  averageStopMinutes?: number;
  firstVisitAt?: string | null;
  lastVisitAt?: string | null;
  distinctVehicleCount?: number;
}

export interface GeofenceSuggestionApprovalDto {
  name?: string;
  radiusMeters?: number;
}

export interface RankedVehicleDto {
  vehicleId: number;
  name: string;
  matchScore: number;
  distanceToOriginKm: number;
  etaToOriginMinutes: number;
  rank: number;
  reasons: string[];
  eligible?: boolean;
  driverId?: number | null;
  driverSafetyScore?: number | null;
  maintenanceRiskLevel?: string | null;
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
  source?: AiSource | null;
  /** Always true — AI recommends, the user confirms. */
  requiresConfirmation?: boolean;
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
  predictedComponent?: string | null;
  remainingKm?: number | null;
  confidence?: number;
  /** MODEL only when a trained model contributed; RULE otherwise. */
  source?: AiSource | null;
  evaluatedAt?: string | null;
}

export interface SemanticSearchRequestDto {
  query: string;
  limit?: number;
  minScore?: number;
}

export interface SemanticSearchMatchDto {
  id: string;
  sourceType: string;
  sourceId: number | null;
  score: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface SemanticSearchResponseDto {
  query: string;
  matches: SemanticSearchMatchDto[];
  source?: string;
  degraded?: boolean;
  errorCode?: string | null;
}

export interface AiDiagnosticsDto {
  pythonService: string;
  ollama: string;
  chatModel: string;
  embeddingModel: string;
  mode: AiMode;
  lastCheckedAt: string;
  reason?: string | null;
  aiServiceChatModel?: string | null;
  aiServiceEmbeddingModel?: string | null;
  installedOllamaModels?: string[];
  localModelsLoaded?: string[];
  configuration?: Record<string, unknown>;
  circuitBreaker?: { open: boolean; consecutiveFailures: number };
  pipeline?: Record<string, number>;
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
      providesTags: ['AiEvent'],
    }),
    acknowledgeAiEvent: builder.mutation<AiEventDto, number>({
      query: (id) => ({ url: `/ai/events/${id}/acknowledge`, method: 'POST' }),
      transformResponse: (response: ApiResponse<AiEventDto>) => unwrap(response),
      invalidatesTags: ['AiEvent', 'Dashboard'],
    }),
    submitAiFeedback: builder.mutation<void, FeedbackRequestDto>({
      query: (body) => ({ url: '/ai/feedback', method: 'POST', body }),
    }),
    sendChatMessage: builder.mutation<ChatResponseDto, ChatRequestDto>({
      query: (body) => ({ url: '/ai/chat', method: 'POST', body }),
      transformResponse: (response: ApiResponse<ChatResponseDto>) => unwrap(response),
    }),
    // ETA is a user-triggered POST, so it is a mutation rather than a query
    // that RTK Query would cache and re-run on its own schedule.
    predictEta: builder.mutation<EtaResponseDto, EtaRequestDto>({
      query: (body) => ({ url: '/ai/predict/eta', method: 'POST', body }),
      transformResponse: (response: ApiResponse<EtaResponseDto>) => unwrap(response),
    }),
    getDriverScore: builder.query<DriverScoreDto, number>({
      query: (driverId) => `/ai/scoring/driver/${driverId}`,
      transformResponse: (response: ApiResponse<DriverScoreDto>) => unwrap(response),
      providesTags: ['Driver'],
    }),
    /** All drivers with their latest score - backs the driver picker. */
    getDriverScoreboard: builder.query<DriverScoreDto[], void>({
      query: () => '/ai/scoring/drivers',
      transformResponse: (response: ApiResponse<DriverScoreDto[]>) => unwrap(response),
      providesTags: ['Driver'],
    }),
    getDriverScoreTrend: builder.query<DriverScoreDto[], { driverId: number; days?: number }>({
      query: ({ driverId, days }) => ({
        url: `/ai/scoring/driver/${driverId}/trend`,
        params: { days: days ?? 14 },
      }),
      transformResponse: (response: ApiResponse<DriverScoreDto[]>) => unwrap(response),
      providesTags: ['Driver'],
    }),
    getGeofenceSuggestions: builder.query<GeofenceSuggestionDto[], void>({
      query: () => '/ai/geofence/suggestions',
      transformResponse: (response: ApiResponse<GeofenceSuggestionDto[]>) => unwrap(response),
      providesTags: ['Geofence'],
    }),
    approveGeofenceSuggestion: builder.mutation<
      GeofenceDto,
      { id: number; edits?: GeofenceSuggestionApprovalDto }
    >({
      query: ({ id, edits }) => ({
        url: `/ai/geofence/suggestions/${id}/approve`,
        method: 'POST',
        body: edits ?? {},
      }),
      transformResponse: (response: ApiResponse<GeofenceDto>) => unwrap(response),
      invalidatesTags: ['Geofence'],
    }),
    dismissGeofenceSuggestion: builder.mutation<void, number>({
      query: (id) => ({ url: `/ai/geofence/suggestions/${id}/dismiss`, method: 'POST' }),
      invalidatesTags: ['Geofence'],
    }),
    // Dispatch ranking is a user-triggered POST that also writes an audit
    // record, so it must be a mutation, not a cached read.
    recommendDispatch: builder.mutation<DispatchRecommendResponseDto, DispatchRecommendRequestDto>({
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
    searchAiRecords: builder.mutation<SemanticSearchResponseDto, SemanticSearchRequestDto>({
      query: (body) => ({ url: '/ai/search', method: 'POST', body }),
      transformResponse: (response: ApiResponse<SemanticSearchResponseDto>) => unwrap(response),
    }),
    getAiDiagnostics: builder.query<AiDiagnosticsDto, boolean | void>({
      query: (refresh) => ({ url: '/ai/diagnostics', params: { refresh: refresh ?? false } }),
      transformResponse: (response: ApiResponse<AiDiagnosticsDto>) => unwrap(response),
    }),
  }),
});

export const {
  useGetAiDashboardSummaryQuery,
  useGetAiEventsQuery,
  useAcknowledgeAiEventMutation,
  useSubmitAiFeedbackMutation,
  useSendChatMessageMutation,
  usePredictEtaMutation,
  useGetDriverScoreQuery,
  useGetDriverScoreboardQuery,
  useGetDriverScoreTrendQuery,
  useGetGeofenceSuggestionsQuery,
  useApproveGeofenceSuggestionMutation,
  useDismissGeofenceSuggestionMutation,
  useRecommendDispatchMutation,
  useGetMaintenancePredictionsQuery,
  useGetFleetMaintenanceQuery,
  useSearchAiRecordsMutation,
  useGetAiDiagnosticsQuery,
  useLazyGetAiDiagnosticsQuery,
} = aiApi;
