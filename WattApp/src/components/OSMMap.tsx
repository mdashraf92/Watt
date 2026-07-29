import React, {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef,
} from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import {
  BRAND_MARKERS, MARKER_SIZE, MARKER_ANCHOR,
  USER_MARKER_SIZE, USER_MARKER_ANCHOR,
} from '../constants/mapMarkers';

// Free OpenStreetMap map rendered with Leaflet inside a WebView.
// No API key, no billing, works in Expo Go. Mirrors the small slice of the
// react-native-maps API this app uses, so swapping back to Google Maps
// later is a one-file change per screen.

export interface OSMRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface OSMMarkerSpec {
  id: string;
  latitude: number;
  longitude: number;
  color: string;                    // pin background color (legacy circular pin)
  icon?: 'zap' | 'home' | 'star';  // glyph inside the pin
  /**
   * Brand teardrop marker key — 'station' | 'outOfService' | 'maintenance'.
   * When set, the full-colour brand artwork replaces the coloured circle, so
   * `color` and `icon` are ignored. Derive it with markerForStatus().
   */
  brand?: string;
}

export interface OSMMapHandle {
  animateToRegion(region: OSMRegion, durationMs?: number): void;
  /** Draw a route and fit the map to it. Pass [] or call clearRoute to remove. */
  setRoute(coords: Array<[number, number]>): void;
  clearRoute(): void;
}

interface OSMMapProps {
  style?: StyleProp<ViewStyle>;
  initialRegion: OSMRegion;
  markers?: OSMMarkerSpec[];
  onMarkerPress?: (id: string) => void;
  onRegionChangeComplete?: (region: OSMRegion) => void;
  showsUserLocation?: boolean;
  interactive?: boolean;            // false = static preview (no gestures)
}

const deltaToZoom = (latitudeDelta: number) =>
  Math.round(Math.log2(360 / Math.max(latitudeDelta, 0.0005)) * 10) / 10;

// Inline SVG glyphs drawn inside pins
const GLYPHS: Record<string, string> = {
  zap:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  home: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  star: '<svg width="15" height="15" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

function buildHtml(region: OSMRegion, interactive: boolean): string {
  const zoom = deltaToZoom(region.latitudeDelta);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#e8ecef; }
  .watt-pin { display:flex; align-items:center; justify-content:center;
    width:32px; height:32px; border-radius:16px; border:2.5px solid #fff;
    box-shadow:0 3px 8px rgba(0,0,0,0.35); }
  .watt-user-dot { width:16px; height:16px; border-radius:8px; background:#3B82F6;
    border:3px solid #fff; box-shadow:0 0 0 6px rgba(59,130,246,0.25); }
  /* Brand artwork sits unclipped; the drop-shadow follows the teardrop outline
     rather than a bounding box, which a box-shadow would not do. */
  .watt-brand-pin svg, .watt-person svg { width:100%; height:100%; display:block;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); }
  .watt-brand-pin, .watt-person { width:100%; height:100%; }
  .leaflet-control-attribution { font-size:9px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var GLYPHS = ${JSON.stringify(GLYPHS)};
  var BRAND  = ${JSON.stringify(BRAND_MARKERS)};
  var BRAND_SIZE   = ${JSON.stringify(MARKER_SIZE)};
  var BRAND_ANCHOR = ${JSON.stringify(MARKER_ANCHOR)};
  var USER_SIZE    = ${JSON.stringify(USER_MARKER_SIZE)};
  var USER_ANCHOR  = ${JSON.stringify(USER_MARKER_ANCHOR)};
  var routeLine = null;
  var map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    dragging: ${interactive},
    touchZoom: ${interactive},
    scrollWheelZoom: ${interactive},
    doubleClickZoom: ${interactive},
    boxZoom: false, keyboard: false, tap: ${interactive},
  }).setView([${region.latitude}, ${region.longitude}], ${zoom});

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  var markerLayer = L.layerGroup().addTo(map);
  var userMarker = null;

  function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }

  window.__setMarkers = function (list) {
    markerLayer.clearLayers();
    list.forEach(function (m) {
      var icon;
      if (m.brand && BRAND[m.brand]) {
        // Brand teardrop: anchor at the tip, which is what points at the coord.
        icon = L.divIcon({
          className: '',
          html: '<div class="watt-brand-pin">' + BRAND[m.brand] + '</div>',
          iconSize: BRAND_SIZE, iconAnchor: BRAND_ANCHOR,
        });
      } else {
        var glyph = GLYPHS[m.icon || 'zap'] || GLYPHS.zap;
        icon = L.divIcon({
          className: '',
          html: '<div class="watt-pin" style="background:' + m.color + '">' + glyph + '</div>',
          iconSize: [32, 32], iconAnchor: [16, 16],
        });
      }
      L.marker([m.latitude, m.longitude], { icon: icon })
        .on('click', function () { post({ type: 'markerPress', id: m.id }); })
        .addTo(markerLayer);
    });
  };

  window.__setUserLocation = function (lat, lng) {
    if (userMarker) { userMarker.setLatLng([lat, lng]); return; }
    var icon = L.divIcon({
      className: '',
      html: '<div class="watt-person">' + BRAND.person + '</div>',
      iconSize: USER_SIZE, iconAnchor: USER_ANCHOR,
    });
    userMarker = L.marker([lat, lng], { icon: icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
  };

  // ── Route overlay (in-app directions) ────────────────────────────────────
  window.__setRoute = function (coords) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (!coords || !coords.length) return;
    // Drawn twice: a wide pale casing under a solid line, so the route stays
    // legible over both light roads and dark satellite-ish tiles.
    routeLine = L.layerGroup([
      L.polyline(coords, { color: '#ffffff', weight: 9, opacity: 0.9, lineJoin: 'round' }),
      L.polyline(coords, { color: '#378B5A', weight: 5, opacity: 1,   lineJoin: 'round' }),
    ]).addTo(map);
    map.fitBounds(L.polyline(coords).getBounds(), { padding: [50, 90] });
  };

  window.__clearRoute = function () {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  };

  window.__animateTo = function (lat, lng, zoom, durationMs) {
    map.flyTo([lat, lng], zoom, { duration: Math.max(durationMs / 1000, 0.2) });
  };

  map.on('moveend', function () {
    var c = map.getCenter();
    var b = map.getBounds();
    post({ type: 'regionChange', region: {
      latitude: c.lat, longitude: c.lng,
      latitudeDelta: Math.abs(b.getNorth() - b.getSouth()),
      longitudeDelta: Math.abs(b.getEast() - b.getWest()),
    }});
  });

  post({ type: 'ready' });
</script>
</body>
</html>`;
}

const OSMMap = forwardRef<OSMMapHandle, OSMMapProps>(function OSMMap(
  {
    style,
    initialRegion,
    markers = [],
    onMarkerPress,
    onRegionChangeComplete,
    showsUserLocation = false,
    interactive = true,
  },
  ref,
) {
  const webRef  = useRef<WebView>(null);
  const readyRef = useRef(false);
  const markersRef = useRef(markers);
  markersRef.current = markers;

  // HTML is generated once — later region/marker changes go through the bridge.
  const html = useMemo(
    () => buildHtml(initialRegion, interactive),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pushMarkers = (list: OSMMarkerSpec[]) => {
    webRef.current?.injectJavaScript(
      `window.__setMarkers(${JSON.stringify(list)}); true;`,
    );
  };

  useEffect(() => {
    if (readyRef.current) pushMarkers(markers);
  }, [JSON.stringify(markers)]);

  useImperativeHandle(ref, () => ({
    animateToRegion(region: OSMRegion, durationMs = 600) {
      webRef.current?.injectJavaScript(
        `window.__animateTo(${region.latitude}, ${region.longitude}, ${deltaToZoom(region.latitudeDelta)}, ${durationMs}); true;`,
      );
    },
    setRoute(coords: Array<[number, number]>) {
      webRef.current?.injectJavaScript(
        `window.__setRoute(${JSON.stringify(coords)}); true;`,
      );
    },
    clearRoute() {
      webRef.current?.injectJavaScript(`window.__clearRoute(); true;`);
    },
  }));

  const locateUser = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getLastKnownPositionAsync() ?? await Location.getCurrentPositionAsync({});
      if (loc) {
        webRef.current?.injectJavaScript(
          `window.__setUserLocation(${loc.coords.latitude}, ${loc.coords.longitude}); true;`,
        );
      }
    } catch { /* location unavailable — skip the blue dot */ }
  };

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    let msg: any;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type === 'ready') {
      readyRef.current = true;
      pushMarkers(markersRef.current);
      if (showsUserLocation) locateUser();
    } else if (msg.type === 'markerPress') {
      onMarkerPress?.(msg.id);
    } else if (msg.type === 'regionChange') {
      onRegionChangeComplete?.(msg.region);
    }
  };

  return (
    <View style={style} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={{ flex: 1, backgroundColor: '#e8ecef' }}
        originWhitelist={['*']}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        setBuiltInZoomControls={false}
        overScrollMode="never"
        androidLayerType="hardware"
      />
    </View>
  );
});

export default OSMMap;
