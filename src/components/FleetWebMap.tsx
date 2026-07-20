import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { MapStyleSpec } from '@/src/services/mapStyle';

export type WebMapMarker = {
  id: string | number;
  lat: number;
  lng: number;
  color: string;
  heading?: number;
};

export type FleetWebMapHandle = {
  fitAll: () => void;
};

type FleetWebMapProps = {
  markers: WebMapMarker[];
  mapStyle: MapStyleSpec;
  polyline?: [number, number][]; // [lng, lat] pairs
  selectedId?: string | number | null;
  onSelect?: (id: string | number) => void;
  style?: ViewStyle;
};

const WEB_MAP_LOAD_TIMEOUT_MS = 15000;

type WebMapStatus = 'loading' | 'ready' | 'error';

/**
 * MapLibre GL JS rendered inside a WebView. This is the fallback used when the
 * native MapLibre module isn't in the binary (e.g. Expo Go), so maps work
 * without a development build. Still MapLibre + Geoapify - no Google Maps.
 */
export const FleetWebMap = forwardRef<FleetWebMapHandle, FleetWebMapProps>(function FleetWebMap(
  { markers, mapStyle, polyline, selectedId, onSelect, style },
  ref
) {
  const webRef = useRef<WebView>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<WebMapStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useImperativeHandle(
    ref,
    () => ({
      fitAll: () => webRef.current?.injectJavaScript('window.__glivtFit && window.__glivtFit(); true;'),
    }),
    []
  );

  // HTML is rebuilt only when the map data changes, not on selection - so
  // selecting a vehicle flies the camera without reloading the whole map.
  const html = useMemo(() => buildHtml(markers, mapStyle, polyline), [markers, mapStyle, polyline]);

  useEffect(() => {
    setStatus('loading');
    setErrorMessage('');
  }, [html, reloadKey]);

  useEffect(() => {
    if (status !== 'loading') return;

    const timeout = setTimeout(() => {
      setStatus('error');
      setErrorMessage('Map tiles are taking too long to load. Check the style URL and network connection.');
    }, WEB_MAP_LOAD_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [reloadKey, status]);

  useEffect(() => {
    if (selectedId == null) return;
    const marker = markers.find((m) => m.id === selectedId);
    if (!marker) return;
    webRef.current?.injectJavaScript(
      `window.__glivtSelect && window.__glivtSelect(${JSON.stringify(String(selectedId))}, ${marker.lng}, ${marker.lat}); true;`
    );
  }, [selectedId, markers]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; id?: string; message?: string };
      if (msg.type === 'ready') {
        setStatus('ready');
        setErrorMessage('');
        return;
      }
      if (msg.type === 'error') {
        setStatus('error');
        setErrorMessage(msg.message || 'Map tiles could not be loaded.');
        return;
      }
      if (msg.type === 'select' && msg.id != null) {
        const original = markers.find((m) => String(m.id) === msg.id);
        onSelect?.(original ? original.id : msg.id);
      }
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        key={reloadKey}
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        onError={(event) => {
          setStatus('error');
          setErrorMessage(event.nativeEvent.description || 'Map WebView failed to load.');
        }}
        onHttpError={(event) => {
          setStatus('error');
          setErrorMessage(`Map request failed with HTTP ${event.nativeEvent.statusCode}.`);
        }}
        onLoadStart={() => {
          setStatus('loading');
          setErrorMessage('');
        }}
        onMessage={handleMessage}
        style={styles.web}
        mixedContentMode="never"
      />
      {status === 'error' ? (
        <WebMapStateOverlay
          message={errorMessage}
          onRetry={() => {
            setStatus('loading');
            setErrorMessage('');
            setReloadKey((current) => current + 1);
          }}
          status="error"
        />
      ) : status === 'loading' ? (
        <WebMapStateOverlay message="Loading road map" status="loading" />
      ) : null}
    </View>
  );
});

function buildHtml(
  markers: WebMapMarker[],
  mapStyle: MapStyleSpec,
  polyline?: [number, number][]
): string {
  const markersJson = JSON.stringify(
    markers
      .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng))
      .map((m) => ({ id: String(m.id), lat: m.lat, lng: m.lng, color: m.color, heading: m.heading ?? 0 }))
  );
  const polylineJson = JSON.stringify(polyline ?? []);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #E9EEF2; }
    .glivt-marker {
      width: 26px; height: 26px; border-radius: 14px; border: 2px solid #fff;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35); transition: transform 0.15s ease;
    }
    .glivt-marker span { color: #fff; font-size: 13px; line-height: 1; }
    .glivt-marker.selected { transform: scale(1.35); border-color: #2A91BD; }
    #err { position:absolute; top:0; left:0; right:0; padding:10px; font-family:sans-serif;
           font-size:12px; color:#FF432F; background:#fff; display:none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="err"></div>
  <script>
    (function () {
      function post(obj) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
      function reportError(message) {
        var err = document.getElementById('err');
        err.style.display = 'block';
        err.textContent = 'Map error: ' + message;
        post({ type:'error', message: message });
      }
      try {
        var MARKERS = ${markersJson};
        var LINE = ${polylineJson};
        var STYLE = ${JSON.stringify(mapStyle)};
        var BASE_READY = false;
        if (!window.maplibregl) throw new Error('MapLibre GL JS did not load.');
        if (typeof STYLE === 'string' && STYLE.indexOf('https://') !== 0) {
          throw new Error('Map style URL must use HTTPS.');
        }
        var map = new maplibregl.Map({
          container: 'map',
          style: STYLE,
          center: MARKERS.length ? [MARKERS[0].lng, MARKERS[0].lat] : [77.59, 12.97],
          zoom: 10,
          attributionControl: false
        });
        var markerEls = {};

        function fitToData() {
          var pts = MARKERS.map(function (m) { return [m.lng, m.lat]; }).concat(LINE);
          if (pts.length === 1) { map.setCenter(pts[0]); map.setZoom(14); }
          else if (pts.length > 1) {
            var b = pts.reduce(function (acc, p) { return acc.extend(p); }, new maplibregl.LngLatBounds(pts[0], pts[0]));
            map.fitBounds(b, { padding: { top: 90, bottom: 220, left: 60, right: 60 }, duration: 400 });
          }
        }

        function firstLabelLayerId() {
          var layers = (map.getStyle() && map.getStyle().layers) || [];
          for (var i = 0; i < layers.length; i += 1) {
            var layer = layers[i];
            if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) return layer.id;
          }
          return undefined;
        }

        map.on('error', function (event) {
          if (BASE_READY) return;
          var message =
            event && event.error && event.error.message
              ? event.error.message
              : 'Base map tiles failed to load.';
          reportError(message);
        });

        map.on('load', function () {
          var labelLayerId = firstLabelLayerId();
          if (LINE.length > 1) {
            map.addSource('route', { type: 'geojson', data: { type:'Feature', properties:{}, geometry:{ type:'LineString', coordinates: LINE } } });
            map.addLayer({ id:'route-shadow', type:'line', source:'route',
              layout:{ 'line-cap':'round','line-join':'round' },
              paint:{ 'line-color':'rgba(15, 125, 56, 0.22)','line-width':12 } }, labelLayerId);
            map.addLayer({ id:'route', type:'line', source:'route',
              layout:{ 'line-cap':'round','line-join':'round' },
              paint:{ 'line-color':'#088A29','line-width':5 } }, labelLayerId);
          }
          MARKERS.forEach(function (m) {
            var el = document.createElement('div');
            el.className = 'glivt-marker';
            el.style.background = m.color;
            var arrow = document.createElement('span');
            arrow.textContent = '\\u25B2';
            arrow.style.transform = 'rotate(' + m.heading + 'deg)';
            el.appendChild(arrow);
            el.addEventListener('click', function () { post({ type:'select', id: m.id }); });
            markerEls[m.id] = el;
            new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map);
          });
          fitToData();
          map.once('idle', function () {
            BASE_READY = true;
            post({ type:'ready' });
          });
        });

        window.__glivtFit = fitToData;
        window.__glivtSelect = function (id, lng, lat) {
          Object.keys(markerEls).forEach(function (k) { markerEls[k].classList.remove('selected'); });
          if (markerEls[id]) markerEls[id].classList.add('selected');
          map.flyTo({ center: [lng, lat], zoom: 14, duration: 500 });
        };
      } catch (e) {
        reportError(e && e.message ? e.message : String(e));
      }
    })();
  </script>
</body>
</html>`;
}

function WebMapStateOverlay({
  message,
  onRetry,
  status,
}: {
  message: string;
  onRetry?: () => void;
  status: WebMapStatus;
}) {
  const isLoading = status === 'loading';

  return (
    <View pointerEvents={isLoading ? 'none' : 'box-none'} style={styles.overlay}>
      <View style={styles.panel}>
        {isLoading ? (
          <ActivityIndicator color="#118A36" size="large" />
        ) : (
          <Text style={styles.errorIcon}>!</Text>
        )}
        <Text style={styles.title}>{isLoading ? 'Map Loading' : 'Map Tiles Unavailable'}</Text>
        <Text style={styles.message}>{message}</Text>
        {!isLoading && onRetry ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#E9EEF2', flex: 1, overflow: 'hidden' },
  web: { backgroundColor: '#E9EEF2', flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  panel: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: 'rgba(22, 32, 44, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 310,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#263238',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    width: '100%',
  },
  errorIcon: {
    backgroundColor: '#FB2F32',
    borderRadius: 18,
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    height: 36,
    lineHeight: 36,
    overflow: 'hidden',
    textAlign: 'center',
    width: 36,
  },
  title: {
    color: '#16202C',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 10,
    textAlign: 'center',
  },
  message: {
    color: '#667385',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 5,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#118A36',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 16,
  },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0 },
});
