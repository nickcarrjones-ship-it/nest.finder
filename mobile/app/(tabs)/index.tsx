import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Map, Camera, GeoJSONSource, Layer, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { colors, spacing, type } from '../../theme';
import { useMapDataStore } from '../../store/mapDataStore';
import { useReachableAreas } from '../../hooks/useReachableAreas';
import { reachableAreasToGeoJSON } from '../../lib/geojson';
import { useProfileStore } from '../../store/profileStore';
import { getDestination } from '../../lib/destinations';
import { WorkplacePin } from '../../components/WorkplacePin';
import { CommuteControlsSheet } from '../../components/CommuteControlsSheet';
import { SelectedAreaCard, type SelectedArea } from '../../components/SelectedAreaCard';
import { LayerToggles, type LayerState } from '../../components/LayerToggles';
import { PicksCarousel, type PickWithLocation } from '../../components/PicksCarousel';
import { PickDetailCard } from '../../components/PickDetailCard';
import { usePicks } from '../../hooks/usePicks';
import { useShortlistStore } from '../../store/shortlistStore';
import { useReachableRegion } from '../../hooks/useReachableRegion';
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

/**
 * How the reachable region is drawn, per Nick's decisions (2026-08-22):
 * a light wash over what you CANNOT reach rather than a fill over what you
 * can, so the region costs no colour and leaves green/amber/red free to mean
 * one thing — how good an area is. A heavier wash was tried and rejected:
 * at a 30-minute limit most of the screen veils over and it reads as broken.
 */
const UNREACHABLE_WASH = 0.28;

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
  // Stations off by default: today's session established that people ask
  // "where could I live", not "which station is this" — the region answers
  // that on its own. Dots stay available for anyone who wants the detail,
  // but showing them unasked was exactly the "what do these mean" confusion
  // Nick hit when this first rendered on a real device (2026-08-23).
  const [layers, setLayers] = useState<LayerState>({
    region: true, stations: false, workplaces: true,
  });
  const region = useReachableRegion(layers.region);
  const insets = useSafeAreaInsets();
  const { picks } = usePicks();
  const toggleVisited = useShortlistStore((s) => s.toggleVisited);
  const [openPick, setOpenPick] = useState<PickWithLocation | null>(null);
  const cameraRef = useRef<CameraRef>(null);

  const handleCenterChange = (pick: PickWithLocation) => {
    cameraRef.current?.flyTo({ center: [pick.lng, pick.lat], duration: 900 });
  };

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

  // The real constraint, from the actual on-device error: "Only one
  // zoom-based interpolate subexpression may be used in an expression" —
  // a `case` with an interpolate in EACH branch is two, full stop, no
  // matter how they're composed. So instead of one layer with a
  // case-wrapped radius, this renders the selected area's circle via a
  // SEPARATE Layer (filtered to just that one feature), each with its
  // own single, uncomplicated interpolate. Same visual result, no
  // expression-composition trick required.
  const excludeSelectedFilter: any = selectedArea ? ['!=', ['get', 'name'], selectedArea.name] : undefined;
  const onlySelectedFilter: any = selectedArea ? ['==', ['get', 'name'], selectedArea.name] : undefined;

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={MALOCA_MAP_STYLE} logo={false} attribution={false}>
        <Camera ref={cameraRef} center={LONDON} zoom={10} />
        {layers.region && region.mask && (
          <GeoJSONSource id="unreachable-mask" data={region.mask}>
            <Layer
              id="unreachable-wash"
              type="fill"
              paint={{ 'fill-color': colors.cream, 'fill-opacity': UNREACHABLE_WASH }}
            />
          </GeoJSONSource>
        )}
        {layers.region && region.outline && (
          <GeoJSONSource id="region-outline" data={region.outline}>
            <Layer
              id="region-outline-line"
              type="line"
              paint={{
                'line-color': colors.ink,
                'line-opacity': 0.38,
                'line-width': 1.4,
              }}
            />
          </GeoJSONSource>
        )}
        {ready && layers.stations && (
          <GeoJSONSource id="reachable-areas" data={areasGeoJSON} onPress={handleAreaPress}>
            <Layer
              id="reachable-areas-circles"
              type="circle"
              filter={excludeSelectedFilter}
              paint={{
                'circle-radius': BASE_CIRCLE_RADIUS,
                'circle-color': colors.green,
                'circle-opacity': 0.35,
                'circle-stroke-width': 1.5,
                'circle-stroke-color': colors.green,
              }}
            />
            {selectedArea && (
              <Layer
                id="reachable-areas-circles-selected"
                type="circle"
                filter={onlySelectedFilter}
                paint={{
                  'circle-radius': SELECTED_CIRCLE_RADIUS,
                  'circle-color': colors.green,
                  'circle-opacity': 0.35,
                  'circle-stroke-width': 3,
                  'circle-stroke-color': colors.green,
                }}
              />
            )}
          </GeoJSONSource>
        )}
        {layers.workplaces && workplacePins.map((pin) => (
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
        {ready && !region.computing && (
          <Text style={styles.statusText}>
            {region.pockets > 0
              ? `${areas.length} areas${region.pockets > 1 ? ` in ${region.pockets} pockets` : ''}`
              : `${areas.length} areas match your commute`}
          </Text>
        )}
        {ready && region.computing && (
          <>
            <ActivityIndicator size="small" color={colors.copper} />
            <Text style={styles.statusText}>
              {region.progress
                ? `Mapping walking routes… ${Math.round(
                    (region.progress.done / region.progress.total) * 100,
                  )}%`
                : 'Mapping walking routes…'}
            </Text>
          </>
        )}
      </View>

      <Pressable
        style={[styles.gearButton, { top: insets.top + spacing.sm, left: insets.left + spacing.lg }]}
        onPress={() => setControlsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Commute settings"
      >
        <Text style={styles.gearIcon}>⚙</Text>
      </Pressable>

      {/* Picks carousel sits just above the tab bar; swiping through it pans
          the camera to each pick — the browsing motion supplies the spatial
          context a flat list can't. Toggles float higher to make room. */}
      <View style={[styles.picksStrip, { bottom: insets.bottom + spacing.xs }]}>
        <PicksCarousel
          picks={picks}
          onCenterChange={handleCenterChange}
          onOpen={(pick) => { handleCenterChange(pick); setOpenPick(pick); }}
        />
      </View>

      <View style={[styles.toggleBar, { bottom: insets.bottom + spacing.xs + 96 }]}>
        <LayerToggles value={layers} onChange={setLayers} />
      </View>

      <CommuteControlsSheet visible={controlsOpen} onClose={() => setControlsOpen(false)} />

      {selectedArea && !openPick && (
        <SelectedAreaCard area={selectedArea} members={members} onClose={() => setSelectedArea(null)} />
      )}

      {openPick && (
        <PickDetailCard
          pick={openPick}
          members={members}
          onToggleVisited={() => {
            toggleVisited(openPick.neighbourhood);
            setOpenPick({ ...openPick, visited: !openPick.visited });
          }}
          onClose={() => setOpenPick(null)}
        />
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
  toggleBar: {
    position: 'absolute',
    alignSelf: 'center',
  },
  picksStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
