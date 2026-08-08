import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiStatusBadge, DemoDataBanner, NoDataYetView } from '@/src/components/AiStateViews';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Chip } from '@/src/components/ui/ModulePrimitives';
import { ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { TextField } from '@/src/components/ui/TextField';
import {
  useGetAiDiagnosticsQuery,
  usePredictEtaMutation,
  useRecommendDispatchMutation,
  useSearchAiRecordsMutation,
  type DispatchRecommendResponseDto,
  type EtaResponseDto,
  type SemanticSearchResponseDto,
} from '@/src/services/aiApi';
import { apiErrorMessage } from '@/src/services/apiError';
import { useAppSelector, useCanManageTenants } from '@/src/store/hooks';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

type Tab = 'ETA' | 'DISPATCH' | 'SEARCH' | 'DIAGNOSTICS';

/**
 * AI tools that were previously implemented in the API but unreachable from the
 * app: ETA prediction, dispatch recommendations, semantic search over the
 * tenant's own records, and (for platform operators) AI stack diagnostics.
 *
 * ETA and dispatch are user-triggered POSTs, so they use mutations rather than
 * cached queries that would re-fire on their own.
 */
export default function AiToolsScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const isSuperAdmin = useCanManageTenants();

  const [tab, setTab] = useState<Tab>('ETA');
  const tabs: Tab[] = isSuperAdmin
    ? ['ETA', 'DISPATCH', 'SEARCH', 'DIAGNOSTICS']
    : ['ETA', 'DISPATCH', 'SEARCH'];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      keyboardShouldPersistTaps="handled">
      <DemoDataBanner />

      <View style={styles.tabs}>
        {tabs.map((item) => (
          <Chip key={item} active={tab === item} label={titleFor(item)} onPress={() => setTab(item)} />
        ))}
      </View>

      {tab === 'ETA' && <EtaPanel styles={styles} colors={c} />}
      {tab === 'DISPATCH' && <DispatchPanel styles={styles} colors={c} />}
      {tab === 'SEARCH' && <SearchPanel styles={styles} colors={c} />}
      {tab === 'DIAGNOSTICS' && isSuperAdmin && <DiagnosticsPanel styles={styles} colors={c} />}
    </ScrollView>
  );
}

function titleFor(tab: Tab) {
  switch (tab) {
    case 'ETA':
      return 'ETA';
    case 'DISPATCH':
      return 'Dispatch';
    case 'SEARCH':
      return 'Search';
    default:
      return 'Diagnostics';
  }
}

type PanelProps = { styles: ReturnType<typeof makeStyles>; colors: ThemeColors };

// ---------------------------------------------------------------------------
// ETA
// ---------------------------------------------------------------------------

function EtaPanel({ styles, colors: c }: PanelProps) {
  const selectedVehicleId = useAppSelector((s) => s.vehiclePreferences.selectedVehicleId);
  const selectedVehicleName = useAppSelector((s) => s.vehiclePreferences.selectedVehicleName);

  const [vehicleId, setVehicleId] = useState(selectedVehicleId ? String(selectedVehicleId) : '');
  const [originLat, setOriginLat] = useState('');
  const [originLng, setOriginLng] = useState('');
  const [destinationLat, setDestinationLat] = useState('');
  const [destinationLng, setDestinationLng] = useState('');
  const [result, setResult] = useState<EtaResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [predictEta, { isLoading }] = usePredictEtaMutation();

  const submit = useCallback(async () => {
    setError(null);
    const numbers = {
      vehicleId: Number(vehicleId),
      originLat: Number(originLat),
      originLng: Number(originLng),
      destinationLat: Number(destinationLat),
      destinationLng: Number(destinationLng),
    };
    if (Object.values(numbers).some((value) => !Number.isFinite(value))) {
      setError('Enter a vehicle id and valid origin and destination coordinates.');
      return;
    }
    try {
      setResult(await predictEta(numbers).unwrap());
    } catch (err) {
      setError(apiErrorMessage(err));
      setResult(null);
    }
  }, [vehicleId, originLat, originLng, destinationLat, destinationLng, predictEta]);

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Predict arrival time</Text>
      {selectedVehicleName ? (
        <Text style={styles.cardSubtitle}>Selected vehicle: {selectedVehicleName}</Text>
      ) : null}

      <TextField label="Vehicle ID" value={vehicleId} onChangeText={setVehicleId} keyboardType="numeric" />
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField label="Origin latitude" value={originLat} onChangeText={setOriginLat} keyboardType="numeric" />
        </View>
        <View style={styles.half}>
          <TextField label="Origin longitude" value={originLng} onChangeText={setOriginLng} keyboardType="numeric" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label="Destination latitude"
            value={destinationLat}
            onChangeText={setDestinationLat}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Destination longitude"
            value={destinationLng}
            onChangeText={setDestinationLng}
            keyboardType="numeric"
          />
        </View>
      </View>

      <Button label={isLoading ? 'Calculating…' : 'Predict ETA'} icon="clock-fast" onPress={submit} disabled={isLoading} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result ? (
        <View style={styles.result} testID="eta-result">
          <AiStatusBadge source={result.source} />
          <Text style={styles.resultHeadline}>
            {result.estimatedDurationMinutes.toFixed(0)} min
            {result.rangeMinutes ? ` (±${result.rangeMinutes.toFixed(0)})` : ''}
          </Text>
          <Text style={styles.resultLine}>Distance: {result.estimatedDistanceKm.toFixed(1)} km</Text>
          <Text style={styles.resultLine}>
            Distance source:{' '}
            {result.distanceSource === 'ROAD_ROUTE'
              ? 'actual road route'
              : 'straight line adjusted for road curvature'}
          </Text>
          <Text style={styles.resultLine}>
            Traffic input: {formatTrafficInput(result.trafficInput)}
          </Text>
          <Text style={styles.resultLine}>Confidence: {(result.confidence * 100).toFixed(0)}%</Text>
          {result.lateProbability != null ? (
            <Text style={styles.resultLine}>
              Probability of arriving late: {(result.lateProbability * 100).toFixed(0)}%
            </Text>
          ) : null}
          <Text style={styles.resultMeta}>
            Calculated {formatTime(result.calculatedAt ?? new Date().toISOString())}
          </Text>
          <Text style={styles.resultExplanation}>{result.structuredExplanation}</Text>
        </View>
      ) : null}
    </Card>
  );
}

function formatTrafficInput(value?: string | null) {
  switch (value) {
    case 'LIVE':
      return 'live traffic';
    case 'TIME_OF_DAY_PROFILE':
      return 'time-of-day profile (no live traffic feed)';
    default:
      return 'none';
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function DispatchPanel({ styles, colors: c }: PanelProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [originLat, setOriginLat] = useState('');
  const [originLng, setOriginLng] = useState('');
  const [destinationLat, setDestinationLat] = useState('');
  const [destinationLng, setDestinationLng] = useState('');
  const [result, setResult] = useState<DispatchRecommendResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recommend, { isLoading }] = useRecommendDispatchMutation();

  const submit = useCallback(async () => {
    setError(null);
    const numbers = {
      originLat: Number(originLat),
      originLng: Number(originLng),
      destinationLat: Number(destinationLat),
      destinationLng: Number(destinationLng),
    };
    if (!jobDescription.trim() || Object.values(numbers).some((v) => !Number.isFinite(v))) {
      setError('Describe the job and enter valid pickup and drop-off coordinates.');
      return;
    }
    try {
      setResult(await recommend({ jobDescription: jobDescription.trim(), ...numbers }).unwrap());
    } catch (err) {
      setError(apiErrorMessage(err));
      setResult(null);
    }
  }, [jobDescription, originLat, originLng, destinationLat, destinationLng, recommend]);

  // Assignment is deliberately a separate, explicitly confirmed action: the
  // assistant recommends, a human decides.
  const confirmAssignment = useCallback((vehicleName: string) => {
    Alert.alert(
      'Confirm dispatch',
      `Assign ${vehicleName} to this job? The assistant only recommends — you are making this assignment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () =>
            Alert.alert(
              'Confirmation recorded',
              `${vehicleName} was selected. Complete the assignment from the vehicle's job screen.`
            ),
        },
      ]
    );
  }, []);

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Dispatch recommendation</Text>
      <Text style={styles.cardSubtitle}>
        Ranks available vehicles for a job. Recommendations only — nothing is assigned until you
        confirm it.
      </Text>

      <TextField label="Job description" value={jobDescription} onChangeText={setJobDescription} />
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField label="Pickup latitude" value={originLat} onChangeText={setOriginLat} keyboardType="numeric" />
        </View>
        <View style={styles.half}>
          <TextField label="Pickup longitude" value={originLng} onChangeText={setOriginLng} keyboardType="numeric" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label="Drop-off latitude"
            value={destinationLat}
            onChangeText={setDestinationLat}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Drop-off longitude"
            value={destinationLng}
            onChangeText={setDestinationLng}
            keyboardType="numeric"
          />
        </View>
      </View>

      <Button
        label={isLoading ? 'Ranking…' : 'Get recommendations'}
        icon="truck-fast-outline"
        onPress={submit}
        disabled={isLoading}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result ? (
        <View style={styles.result} testID="dispatch-result">
          <AiStatusBadge source={result.source} />
          <Text style={styles.resultLine}>{result.topRecommendationReason}</Text>
          {result.rankedVehicles.length === 0 ? (
            <NoDataYetView
              title="No dispatchable vehicle"
              message="No vehicle in your fleet has a live position available for this job."
            />
          ) : (
            result.rankedVehicles.map((vehicle) => (
              <View key={vehicle.vehicleId} style={styles.rankedRow}>
                <View style={styles.rankedHeader}>
                  <Text style={styles.rankedName}>
                    #{vehicle.rank} {vehicle.name}
                  </Text>
                  <Text
                    style={[
                      styles.rankedScore,
                      { color: vehicle.eligible === false ? c.textMuted : c.primary },
                    ]}>
                    {vehicle.eligible === false ? 'Not eligible' : `${vehicle.matchScore.toFixed(0)}%`}
                  </Text>
                </View>
                {vehicle.reasons.map((reason, index) => (
                  <Text key={index} style={styles.rankedReason}>
                    • {reason}
                  </Text>
                ))}
                {vehicle.eligible !== false ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm dispatch of ${vehicle.name}`}
                    onPress={() => confirmAssignment(vehicle.name)}
                    style={styles.confirmButton}>
                    <Text style={styles.confirmText}>Confirm this vehicle</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </View>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Semantic search
// ---------------------------------------------------------------------------

function SearchPanel({ styles }: PanelProps) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SemanticSearchResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, { isLoading }] = useSearchAiRecordsMutation();

  const submit = useCallback(async () => {
    setError(null);
    if (!query.trim()) {
      setError('Enter something to search for.');
      return;
    }
    try {
      setResult(await search({ query: query.trim(), limit: 10 }).unwrap());
    } catch (err) {
      setError(apiErrorMessage(err));
      setResult(null);
    }
  }, [query, search]);

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Search your fleet records</Text>
      <Text style={styles.cardSubtitle}>
        Searches your own AI events, trips, alerts and maintenance predictions.
      </Text>
      <TextField label="Search" value={query} onChangeText={setQuery} onSubmitEditing={submit} />
      <Button label={isLoading ? 'Searching…' : 'Search'} icon="magnify" onPress={submit} disabled={isLoading} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result ? (
        <View style={styles.result} testID="search-result">
          {result.degraded ? (
            <AiStatusBadge source="RULE" fallbackReason={result.errorCode ?? undefined} />
          ) : (
            <AiStatusBadge source="MODEL" />
          )}
          {result.matches.length === 0 ? (
            <NoDataYetView
              title="No matches"
              message="Nothing in your fleet records matches that search."
            />
          ) : (
            result.matches.map((match) => (
              <View key={match.id} style={styles.matchRow}>
                <Text style={styles.matchType}>
                  {match.sourceType} #{match.sourceId} · {(match.score * 100).toFixed(0)}%
                </Text>
                <Text style={styles.matchContent}>{match.content}</Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Diagnostics (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

function DiagnosticsPanel({ styles, colors: c }: PanelProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = useGetAiDiagnosticsQuery(undefined);

  if (isLoading) return <LoadingView label="Checking AI services…" />;
  if (isError || !data) return <ErrorRetryView message={apiErrorMessage(error)} onRetry={refetch} />;

  const rows: { label: string; value: string; ok: boolean }[] = [
    { label: 'Python AI service', value: data.pythonService, ok: data.pythonService === 'UP' },
    { label: 'Ollama', value: data.ollama, ok: data.ollama === 'UP' },
    { label: 'Chat model', value: data.chatModel, ok: data.chatModel === 'AVAILABLE' },
    { label: 'Embedding model', value: data.embeddingModel, ok: data.embeddingModel === 'AVAILABLE' },
  ];

  return (
    <Card style={styles.card}>
      <View style={styles.diagHeader}>
        <Text style={styles.cardTitle}>AI diagnostics</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh diagnostics" onPress={() => refetch()}>
          <MaterialCommunityIcons
            name="refresh"
            size={20}
            color={isFetching ? c.textMuted : c.primary}
          />
        </Pressable>
      </View>

      <AiStatusBadge mode={data.mode} source={data.mode === 'FULL_AI' ? 'MODEL' : 'RULE'} />

      {rows.map((row) => (
        <View key={row.label} style={styles.diagRow}>
          <Text style={styles.diagLabel}>{row.label}</Text>
          <Text style={[styles.diagValue, { color: row.ok ? c.primary : c.danger }]}>{row.value}</Text>
        </View>
      ))}

      {data.reason ? <Text style={styles.resultLine}>{data.reason}</Text> : null}

      <View style={styles.diagRow}>
        <Text style={styles.diagLabel}>Configured chat model</Text>
        <Text style={styles.diagValue}>{String(data.configuration?.configuredChatModel ?? '—')}</Text>
      </View>
      <View style={styles.diagRow}>
        <Text style={styles.diagLabel}>Token fingerprint</Text>
        {/* Fingerprint only: the shared secret itself is never sent to the app. */}
        <Text style={styles.diagValue}>
          {String(data.configuration?.internalTokenFingerprint ?? 'unset')}
        </Text>
      </View>
      {data.circuitBreaker ? (
        <View style={styles.diagRow}>
          <Text style={styles.diagLabel}>Circuit breaker</Text>
          <Text
            style={[styles.diagValue, { color: data.circuitBreaker.open ? c.danger : c.primary }]}>
            {data.circuitBreaker.open ? 'OPEN' : 'closed'}
          </Text>
        </View>
      ) : null}
      {data.pipeline
        ? Object.entries(data.pipeline).map(([key, value]) => (
            <View key={key} style={styles.diagRow}>
              <Text style={styles.diagLabel}>{humanise(key)}</Text>
              <Text style={styles.diagValue}>{String(value)}</Text>
            </View>
          ))
        : null}

      <Text style={styles.resultMeta}>Last checked {formatTime(data.lastCheckedAt)}</Text>
    </Card>
  );
}

function humanise(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (ch) => ch.toUpperCase());
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    content: { gap: spacing.md, padding: spacing.md },
    tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    card: { gap: spacing.sm },
    cardTitle: { color: c.textPrimary, fontSize: typography.title, fontWeight: '800' },
    cardSubtitle: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 18 },
    row: { flexDirection: 'row', gap: spacing.sm },
    half: { flex: 1 },
    error: { color: c.danger, fontSize: typography.caption },
    result: {
      backgroundColor: c.pageBackground,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth * 2,
      gap: spacing.xs,
      marginTop: spacing.sm,
      padding: spacing.md,
    },
    resultHeadline: {
      color: c.textPrimary,
      fontSize: typography.h2,
      fontVariant: ['tabular-nums'],
      fontWeight: '900',
    },
    resultLine: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 18 },
    resultMeta: { color: c.textMuted, fontSize: 10 },
    resultExplanation: { color: c.textSecondary, fontSize: typography.caption, marginTop: spacing.xs },
    rankedRow: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      gap: 2,
      paddingTop: spacing.sm,
    },
    rankedHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    rankedName: { color: c.textPrimary, fontSize: typography.body, fontWeight: '800' },
    rankedScore: { fontSize: typography.body, fontWeight: '900' },
    rankedReason: { color: c.textSecondary, fontSize: 11, lineHeight: 16 },
    confirmButton: {
      alignSelf: 'flex-start',
      borderColor: c.primary,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth * 2,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    confirmText: { color: c.primary, fontSize: typography.caption, fontWeight: '800' },
    matchRow: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      gap: 2,
      paddingTop: spacing.sm,
    },
    matchType: { color: c.textMuted, fontSize: 10, fontWeight: '800' },
    matchContent: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 18 },
    diagHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    diagRow: {
      alignItems: 'center',
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    diagLabel: { color: c.textSecondary, fontSize: typography.caption },
    diagValue: { color: c.textPrimary, fontSize: typography.caption, fontWeight: '800' },
  });
