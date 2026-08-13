import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Map, Camera, GeoJSONSource, Layer, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { colors, spacing, type } from '../../theme';
import { useMapDataStore } from '../../store/mapDataStore';
import { useReachableAreas } from '../../hooks/useReachableAreas';
import { reachableAreasToGeoJSON } from '../../lib/geojson';
import { useProfileStore } from '../../store/profileStore';
import { getDestination } from '../../lib/destinations';
import { WorkplacePin } from '../../components/WorkplacePin';

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
const AREA_CIRCLE_RADIUS: any = ['interpolate', ['linear'], ['zoom'], 9, 4, 12, 8, 16, 16];

// Central London — roughly where the web app's default view sits.
const LONDON: [number, number] = [-0.118, 51.509]; // [lng, lat]

export default function MapScreen() {
  const load = useMapDataStore((s) => s.load);
  const status = useMapDataStore((s) => s.status);
  const error = useMapDataStore((s) => s.error);
  const { areas, ready } = useReachableAreas();
  const members = useProfileStore((s) => s.profile.members);

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

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={MALOCA_MAP_STYLE} logo={false} attribution={false}>
        <Camera center={LONDON} zoom={10} />
        {ready && (
          <GeoJSONSource id="reachable-areas" data={areasGeoJSON}>
            <Layer
              id="reachable-areas-circles"
              type="circle"
              paint={{
                'circle-radius': AREA_CIRCLE_RADIUS,
                'circle-color': colors.green,
                'circle-opacity': 0.35,
                'circle-stroke-width': 1.5,
                'circle-stroke-color': colors.green,
              }}
            />
          </GeoJSONSource>
        )}
        {workplacePins.map((pin) => (
          <WorkplacePin key={pin.key} lng={pin.lng} lat={pin.lat} initial={pin.initial} />
        ))}
      </Map>

      {/* Also shown as a number, so it's obvious at a glance the data behind
          the circles is real, not placeholder. */}
      <View style={styles.statusBar}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="small" color={colors.copper} />
            <Text style={styles.statusText}>Finding your areas…</Text>
          </>
        )}
        {status === 'error' && <Text style={styles.statusTextError}>Couldn't load area data: {error}</Text>}
        {ready && <Text style={styles.statusText}>{areas.length} areas match your commute</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  map: { flex: 1 },
  statusBar: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
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
});
