import { StyleSheet, View } from 'react-native';
import { Map, Camera, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { colors } from '../../theme';

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

// Central London — roughly where the web app's default view sits.
const LONDON: [number, number] = [-0.118, 51.509]; // [lng, lat]

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={MALOCA_MAP_STYLE} logo={false} attribution={false}>
        <Camera center={LONDON} zoom={10} />
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  map: { flex: 1 },
});
