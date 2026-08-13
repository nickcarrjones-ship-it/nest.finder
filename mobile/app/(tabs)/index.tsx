import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Map, Camera, GeoJSONSource, Layer, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { colors, spacing, type } from '../../theme';
import { useMapDataStore } from '../../store/mapDataStore';
import { useReachableAreas } from '../../hooks/useReachableAreas';
import { reachableAreasToGeoJSON } from '../../lib/geojson';
import { useProfileStore } from '../../store/profileStore';
import { getDestination } from '../../lib/destinations';
import { WorkplacePin } from '../../components/WorkplacePin';
import { CommuteControlsSheet } from '../../components/CommuteControlsSheet';
import { SelectedAreaCard, type SelectedArea } from '../../components/SelectedAreaCard';
import type { NativeSyntheticEvent } from 'react-native';
import type { PressEventWithFeatures } from '@maplibre/maplibre-react-native';

// Same free CARTO basemap the web app uses (js/map-core.js) — no API key needed.
const CARTO_TILE_URL = 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

// A raster-tile style, per the MapLibre style spec — just wraps CARTO's tiles.
const MALOCA_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: { type: 'raster', tiles: [CARTO_TILE_URL], tileSize: 256 },
  },
  layers: [{ id: 'carto-layer', type: 'raster', source: 'carto' }],
};

/**
 * The web app fights Leaflet to keep circles a constant size on screen at
 * every zoom (getRadiusForZoom in js/map-core.js — the maths work out to a
 * near-constant ~4.6px). MapLibre's circle-radius is already in screen
 * pixels, not real-world metres, so no equivalent fight is needed — this
 * just smoothly grows the dots as you zoom in, which reads better than a
 * fixed size when you're looking at all of London vs one neighbourhood.
 */
// TypeScript models MapLibre's expression grammar as dozens of exact tuple
// shapes, too precise for a plain array literal to satisfy — the `any` here
// is a narrow, deliberate escape for that one line; the library itself
// validates the expression at runtime.
// -5% from an earlier pass that read as cluttered with this many areas on
// screen at once (was 8/14/26).
const BASE_CIRCLE_RADIUS: any = ['interpolate', ['linear'], ['zoom'], 9, 7.5, 12, 13, 16, 25];
// Pre-computed at +15% rather than done via a runtime `*` on a nested
// interpolate — that composed form triggered a MapLibre Native error on
// device (the native engine is stricter about expression complexity than
// the JS/web version) and silently failed to draw at all, which is also
// why the "bigger when selected" effect never visibly appeared.
const SELECTED_CIRCLE_RADIUS: any = ['interpolate', ['linear'], ['zoom'], 9, 8.6, 12, 15, 16, 29];

// Central London — roughly where the web app's default view sits.
const LONDON: [number, number] = [-0.118, 51.509]; // [lng, lat]

// Width reserved for the gear button so the info pill doesn't sit under it.
const GEAR_BUTTON_SIZE = 40;
const GEAR_BUTTON_SPACE = spacing.lg + GEAR_BUTTON_SIZE + spacing.sm;

export default function MapScreen() {
  const load = useMapDataStore((s) => s.load);
  const status = useMapDataStore((s) => s.status);
  const error = useMapDataStore((s) => s.error);
  const { areas, ready } = useReachableAreas();
  const members = useProfileStore((s) => s.profile.members);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    load();
  }, [load]);

  const areasGeoJSON = useMemo(() => reachableAreasToGeoJSON(areas), [areas]);

  const workplacePins = useMemo(
    () =>
      members
        .map((m) => {
          const dest = getDestination(m.workId);
          return dest ? { key: m.id, initial: m.name.charAt(0).toUpperCase(), ...dest } : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [members],
  );

  const handleAreaPress = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const props = event.nativeEvent.features[0]?.properties;
    if (props) setSelectedArea({ name: props.name, memberTimes: props.memberTimes });
  };

  // The selected area's own circle grows 15% so it's obvious which bubble
  // the open card belongs to. `case` compares each feature's `name`
  // property (set in reachableAreasToGeoJSON) against the selection.
  const circleRadius: any = useMemo(() => {
    if (!selectedArea) return BASE_CIRCLE_RADIUS;
    return ['case', ['==', ['get', 'name'], selectedArea.name], SELECTED_CIRCLE_RADIUS, BASE_CIRCLE_RADIUS];
  }, [selectedArea]);

  // "Bolder" stroke on the selected circle — a plain number comparison,
  // no nested-expression composition, so much less likely to hit the
  // same native-side issue as the radius expression above.
  const circleStrokeWidth: any = useMemo(() => {
    if (!selectedArea) return 1.5;
    return ['case', ['==', ['get', 'name'], selectedArea.name], 3, 1.5];
  }, [selectedArea]);

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={MALOCA_MAP_STYLE} logo={false} attribution={false}>
        <Camera center={LONDON} zoom={10} />
        {ready && (
          <GeoJSONSource id="reachable-areas" data={areasGeoJSON} onPress={handleAreaPress}>
            <Layer
              id="reachable-areas-circles"
              type="circle"
              paint={{
                'circle-radius': circleRadius,
                'circle-color': colors.green,
                'circle-opacity': 0.35,
                'circle-stroke-width': circleStrokeWidth,
                'circle-stroke-color': colors.green,
              }}
            />
          </GeoJSONSource>
        )}
        {workplacePins.map((pin) => (
          <WorkplacePin key={pin.key} lng={pin.lng} lat={pin.lat} initial={pin.initial} />
        ))}
      </Map>

      {/* Purely informational — the gear button below is what opens settings. */}
      <View style={[styles.statusBar, { top: insets.top + spacing.sm, left: insets.left + GEAR_BUTTON_SPACE }]}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="small" color={colors.copper} />
            <Text style={styles.statusText}>Finding your areas…</Text>
          </>
        )}
        {status === 'error' && <Text style={styles.statusTextError}>Couldn't load area data: {error}</Text>}
        {ready && <Text style={styles.statusText}>{areas.length} areas match your commute</Text>}
      </View>

      <Pressable
        style={[styles.gearButton, { top: insets.top + spacing.sm, left: insets.left + spacing.lg }]}
        onPress={() => setControlsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Commute settings"
      >
        <Text style={styles.gearIcon}>⚙</Text>
      </Pressable>

      <CommuteControlsSheet visible={controlsOpen} onClose={() => setControlsOpen(false)} />

      {selectedArea && (
        <SelectedAreaCard area={selectedArea} members={members} onClose={() => setSelectedArea(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  map: { flex: 1 },
  statusBar: {
    position: 'absolute',
    right: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  statusText: { ...type.body, color: colors.inkMid },
  statusTextError: { ...type.body, color: colors.red },
  gearButton: {
    position: 'absolute',
    width: GEAR_BUTTON_SIZE,
    height: GEAR_BUTTON_SIZE,
    borderRadius: GEAR_BUTTON_SIZE / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  gearIcon: {
    fontSize: 20,
    color: colors.inkMid,
  },
});
