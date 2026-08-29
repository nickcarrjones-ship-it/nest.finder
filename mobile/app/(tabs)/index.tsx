import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Map, Camera, GeoJSONSource, Layer, type CameraRef } from '@maplibre/maplibre-react-native';
import { colors, spacing, type } from '../../theme';
import { useMapDataStore } from '../../store/mapDataStore';
import { useReachableAreas } from '../../hooks/useReachableAreas';
import { reachableAreasToGeoJSON } from '../../lib/geojson';
import { useProfileStore } from '../../store/profileStore';
import { getDestination } from '../../lib/destinations';
import { WorkplacePin } from '../../components/WorkplacePin';
import { SelectedAreaCard, type SelectedArea } from '../../components/SelectedAreaCard';
import { LayerToggles, type LayerState } from '../../components/LayerToggles';
import { PicksCarousel, type PickWithLocation } from '../../components/PicksCarousel';
import { PickDetailCard } from '../../components/PickDetailCard';
import { PickBubble } from '../../components/PickBubble';
import { CommuteSlider } from '../../components/CommuteSlider';
import { usePicks } from '../../hooks/usePicks';
import { useShortlistStore } from '../../store/shortlistStore';
import { useReachableRegion } from '../../hooks/useReachableRegion';
import { framingBounds } from '../../lib/mapCamera';
import { COMMUTE_DEFAULT_MINS } from '../../lib/commuteSettings';
import { WorkplaceEntrySheet } from '../../components/WorkplaceEntrySheet';
import { AgentCard } from '../../components/AgentCard';
import { hasLifestyleSignal } from '../../lib/lifestyleSignal';
import { useAuthStore } from '../../store/authStore';
import { MapExplainerPanel } from '../../components/MapExplainerPanel';
import { CommuteHintCard } from '../../components/CommuteHintCard';
import { WorkplaceCallout } from '../../components/WorkplaceCallout';
import { MapLegendCard } from '../../components/MapLegend';
import type { NativeSyntheticEvent } from 'react-native';
import type { PressEventWithFeatures } from '@maplibre/maplibre-react-native';

/**
 * OpenFreeMap's Positron, replacing CARTO's raster tiles (2026-08-29).
 *
 * CARTO started watermarking tiles with "API KEY REQUIRED", and their free
 * key covers non-commercial use only — which Maloca will not be. You cannot
 * ship a paid product with another company's watermark on the map.
 *
 * OpenFreeMap is free for any use, commercial included, with no key, no
 * registration and no request limit; it is funded by donations and publishes
 * weekly full-planet downloads, so if the public instance ever went away the
 * same tiles could be self-hosted rather than scrambled for.
 *
 * Positron is the same cartography family CARTO's light_all came from, so
 * the look carries over. It is VECTOR rather than raster, which is what
 * MapLibre is built to render: sharper labels at every zoom and smaller
 * downloads. The app's own circles and region draw on top as before.
 *
 * ATTRIBUTION IS REQUIRED and is why `attribution` is no longer false below
 * — OpenStreetMap and OpenMapTiles have to be credited.
 */
const MALOCA_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

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
 * How the reachable region is drawn — revised 2026-08-23 after the first
 * version (a cream wash dimming everywhere UNREACHABLE) proved invisible on
 * device: cream-on-cream is close to zero contrast against the basemap, so
 * it read as "nothing is showing" rather than "here's your area" — verified
 * by re-running the exact merge computation with real data outside the app
 * (58 pockets, matching what the old status text reported), which confirmed
 * the ALGORITHM was correct and the rendering was the problem.
 *
 * Now a light POSITIVE teal fill directly on the reachable region, using
 * the same tealSoft token used for accents elsewhere in the app — clearly
 * visible regardless of the basemap underneath, and still leaves green/
 * amber/red free to mean one thing (area quality) since teal isn't one of
 * those three colours.
 */
const REGION_FILL = colors.tealSoft;

// Central London — roughly where the web app's default view sits.
const LONDON: [number, number] = [-0.118, 51.509]; // [lng, lat]

export default function MapScreen() {
  const load = useMapDataStore((s) => s.load);
  const status = useMapDataStore((s) => s.status);
  const error = useMapDataStore((s) => s.error);
  const stations = useMapDataStore((s) => s.stations);
  const { areas, ready } = useReachableAreas();
  const members = useProfileStore((s) => s.profile.members);
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);
  // Stations off by default: today's session established that people ask
  // "where could I live", not "which station is this" — the region answers
  // that on its own. Dots stay available for anyone who wants the detail,
  // but showing them unasked was exactly the "what do these mean" confusion
  // Nick hit when this first rendered on a real device (2026-08-23).
  const [layers, setLayers] = useState<LayerState>({
    stations: false, workplaces: true, picks: true,
  });
  // Always on — see LayerToggles.tsx for why this one has no toggle.
  const region = useReachableRegion(true);
  const insets = useSafeAreaInsets();
  const { picks } = usePicks();
  const toggleVisited = useShortlistStore((s) => s.toggleVisited);
  const [openPick, setOpenPick] = useState<PickWithLocation | null>(null);
  const [centeredPick, setCenteredPick] = useState<string | null>(null);
  const cameraRef = useRef<CameraRef>(null);
  const maxCommuteMins = useProfileStore((s) => s.profile.maxCommuteMins) ?? COMMUTE_DEFAULT_MINS;
  const updateCommuteSettings = useProfileStore((s) => s.updateCommuteSettings);
  const isDemo = useProfileStore((s) => s.profile.isDemo);
  const [workplaceOpen, setWorkplaceOpen] = useState(() => isDemo ?? false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [introOffered, setIntroOffered] = useState(false);
  const lifestyle = useProfileStore((s) => s.profile.lifestyle);
  const engaged = hasLifestyleSignal(lifestyle);
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  // Requires an account: the conversation cannot send without one, so
  // offering it signed out is a button that only ever errors.
  const showAgentFab = Boolean(user) && !isDemo && engaged;

  function beginSignIn() {
    if (authStatus !== 'signing-in') signInWithGoogle();
  }

  /**
   * The first-run sequence (Nick's spec, 2026-08-23), one beat at a time so
   * nothing competes for attention:
   *   callouts  — "Harriet's workplace" tags, ~4s, naming the pins
   *   nudge     — points at the slider, the one thing to try next
   *   hint      — fires when they actually move it, explaining the polygon
   *   pitch     — the bottom panel: what signing in unlocks
   *   done      — normal map, nothing overlaid
   * It only runs once workplace entry is finished (there is nothing to
   * narrate before that), and is skipped wholesale for anyone who already
   * has preferences — they've seen it.
   */
  type Beat = 'callouts' | 'nudge' | 'hint' | 'pitch' | 'done';
  const [beat, setBeat] = useState<Beat>('callouts');
  const onboarding = !isDemo && !engaged;

  // callouts -> nudge, once the tags have had their few seconds.
  useEffect(() => {
    if (!onboarding || beat !== 'callouts') return;
    const t = setTimeout(() => setBeat('nudge'), 4000);
    return () => clearTimeout(t);
  }, [onboarding, beat]);

  // hint -> pitch, giving them a moment with the polygon they just changed
  // before asking for anything.
  useEffect(() => {
    if (!onboarding || beat !== 'hint') return;
    const t = setTimeout(() => setBeat('pitch'), 12000);
    return () => clearTimeout(t);
  }, [onboarding, beat]);

  function handleCommuteChange(mins: number) {
    updateCommuteSettings({ maxCommuteMins: mins });
    // The captions have done their job by the time someone starts exploring.
    setShowWorkCaptions(false);
    // Moving the slider is what advances past the nudge — an explanation
    // of the polygon only lands once they've watched it change.
    if (beat === 'callouts' || beat === 'nudge') setBeat('hint');
  }

  const showCallouts = onboarding && beat === 'callouts';
  const showHint = onboarding && beat === 'hint';
  // Whether to RAISE the card, which is a different question from whether
  // to keep it on screen. Deriving visibility from this was the bug Nick hit
  // (2026-08-26): the first answer makes the Agent record preferences, so
  // `engaged` flipped true and the card unmounted MID-CONVERSATION with
  // three questions still to ask. Opening is conditional; staying open is
  // not — once the conversation starts, agentOpen alone decides, and only
  // finishing or closing ends it.
  const shouldOfferIntro = Boolean(user) && !isDemo && !engaged && !introOffered;

  useEffect(() => {
    if (!shouldOfferIntro) return;
    setIntroOffered(true); // once per session, however the conversation goes
    setAgentOpen(true);
  }, [shouldOfferIntro]);

  // Signed out, this panel is the ONLY way into an account — the tab bar is
  // hidden while signed out, and the Agent card needs one. It used to also
  // require "no preferences yet" AND the beat sequence to have reached
  // 'pitch', which left 15 of the 16 signed-out states with no way in at
  // all: a map, a commute region, and nothing to press (Nick, 2026-08-27).
  //
  // So the rule is now the honest one — signed out means show the way in —
  // minus the two moments where something else legitimately owns the
  // screen: the workplace sheet, and the first-run tour before it has made
  // its point. Signed IN, this never shows; the Agent card handles that.
  const inFirstRunTour = onboarding && beat !== 'pitch' && beat !== 'done';
  const showExplainer = !user && !agentOpen && !workplaceOpen && !inFirstRunTour;
  // The legend is needed from the very first frame — unexplained shapes are
  // the thing to fix, not something to reveal three beats later. The pitch
  // panel folds the same rows in, so they never both show.
  const showLegendCard = onboarding && beat !== 'pitch';


  const handleCenterChange = (pick: PickWithLocation) => {
    setCenteredPick(pick.neighbourhood);
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
          const dest = getDestination(m.workId, m.workLabel, stations);
          return dest
            ? { key: m.id, name: m.name, initial: m.name.charAt(0).toUpperCase(), ...dest }
            : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [members, stations],
  );

  /**
   * Keep the map framed on the household: centred between the workplaces,
   * zoomed so about 70% of the reachable region is on screen.
   *
   * Driven imperatively rather than through the Camera's center/zoom props,
   * because those set the OPENING position and do not reliably re-apply —
   * the map stayed wherever it started (Nick, on device 2026-08-29).
   *
   * It re-frames whenever the region changes, which is what dragging the
   * commute slider does. That is deliberate movement the user just asked
   * for, not the camera wandering: a longer commute opens up a wider area,
   * and being left zoomed into the middle of it hides the point.
   */
  /**
   * "Nick works here" as a bubble on the pin, not a row in the legend.
   *
   * It names the thing it points at, which a legend entry never quite does.
   * Shown as the map loads, dismissed the moment the commute slider moves —
   * by then it has been read, and it would only sit in the way — and brought
   * back by tapping a pin, for anyone who has forgotten what the circles
   * mean (Nick, 2026-08-29).
   */
  const [showWorkCaptions, setShowWorkCaptions] = useState(true);

  const framedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!region.outline || workplacePins.length === 0) return;
    // One reframe per distinct region, so unrelated re-renders leave the
    // camera alone once someone starts panning around.
    const key = `${maxCommuteMins}:${region.pockets}:${workplacePins.map((p) => p.key).join()}`;
    if (framedFor.current === key) return;
    framedFor.current = key;

    const box = framingBounds(
      workplacePins.map((p) => ({ lng: p.lng, lat: p.lat })),
      region.outline,
    );
    if (!box) return;
    // fitBounds, not a computed zoom: MapLibre knows its own projection, and
    // a hand-rolled metres-per-pixel formula got it wrong by a factor of two.
    // [west, south, east, north] — GeoJSON order, per LngLatBounds.
    cameraRef.current?.fitBounds(
      [box.sw.lng, box.sw.lat, box.ne.lng, box.ne.lat],
      { duration: 700 },
    );
  }, [region.outline, region.pockets, workplacePins, maxCommuteMins]);

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
      {/* attribution stays ON: OpenFreeMap's tiles carry an OpenStreetMap and
          OpenMapTiles credit requirement, and it was switched off under the
          old raster basemap. */}
      {/* The map is INERT until the workplace sheet is done.
          Behind the sheet it is scene-setting, not a thing to explore:
          panning it moves a view the user has not chosen yet, and the
          camera is about to be framed for them anyway. Letting someone
          drag it away first just means the reframe looks like the app
          taking their map back (Nick, 2026-08-29). */}
      <Map
        style={styles.map}
        mapStyle={MALOCA_MAP_STYLE}
        logo={false}
        dragPan={!workplaceOpen}
        touchZoom={!workplaceOpen}
        doubleTapZoom={!workplaceOpen}
        doubleTapHoldZoom={!workplaceOpen}
        touchRotate={!workplaceOpen}
        touchPitch={!workplaceOpen}
      >
        <Camera ref={cameraRef} center={LONDON} zoom={10} />
        {region.outline && (
          <GeoJSONSource id="region-outline" data={region.outline}>
            <Layer id="region-fill" type="fill" paint={{ 'fill-color': REGION_FILL }} />
            <Layer
              id="region-outline-line"
              type="line"
              paint={{
                'line-color': colors.teal,
                'line-opacity': 0.45,
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
        {/* No pins while the sheet is open: an A and a B floating over
            London mean nothing before anyone has said where they work, and
            the letters are the first thing the eye goes to.

            Keyed on the whole set, so swapping the demo's A and B for real
            people tears every marker down before building the new ones.
            Markers are native views rather than React ones, and without a
            forced unmount the old pair lingered next to the new for a couple
            of seconds — two "works here" bubbles each (Nick, on device
            2026-08-29). */}
        <Fragment key={workplacePins.map((p) => `${p.key}:${p.lng},${p.lat}`).join('|')}>
          {layers.workplaces && !workplaceOpen && workplacePins.map((pin) => (
          <WorkplacePin
            key={pin.key}
            lng={pin.lng}
            lat={pin.lat}
            initial={pin.initial}
            caption={showWorkCaptions ? `${pin.name || 'They'} works here` : undefined}
            onPress={() => setShowWorkCaptions(true)}
          />
          ))}
        </Fragment>
        {showCallouts && workplacePins.map((pin) => (
          <WorkplaceCallout key={`c-${pin.key}`} lng={pin.lng} lat={pin.lat} name={pin.name} />
        ))}
        {layers.picks && picks.map((pick, i) => (
          <PickBubble
            key={pick.neighbourhood}
            pick={pick}
            rank={i + 1}
            centered={pick.neighbourhood === centeredPick}
            onPress={() => { setCenteredPick(pick.neighbourhood); setOpenPick(pick); }}
          />
        ))}
      </Map>

      {/* Loading/error only — the "N areas in M pockets" readout that used
          to live here was real information nobody needed; the region drawn
          on the map already answers "where", which is the only question
          this screen exists to answer. */}
      {(status === 'loading' || status === 'error') && (
        <View style={[styles.statusBar, { top: insets.top + spacing.sm, left: insets.left + spacing.lg }]}>
          {status === 'loading' && (
            <>
              <ActivityIndicator size="small" color={colors.teal} />
              <Text style={styles.statusText}>Finding your areas…</Text>
            </>
          )}
          {status === 'error' && <Text style={styles.statusTextError}>Couldn't load area data: {error}</Text>}
        </View>
      )}

      {/* The commute-limit control — dragging it and watching the region
          respond IS the explanation for what the shaded area means, which a
          label alone never managed (map-legibility exploration, 2026-08-23).
          Sole home for this setting now; the old settings-sheet dropdown for
          it is gone. Fully live before sign-in too: this is the demo, and
          it's what teaches someone what the app actually does. */}
      {/* One bottom stack: what the colours mean, then the control that
          changes them. The slider sits lowest because it is the thing people
          reach for repeatedly, and the bottom of the screen is where a thumb
          actually lands (Nick, 2026-08-29). */}
      <View
        style={[
          styles.bottomStack,
          { bottom: insets.bottom + spacing.md, left: insets.left + spacing.lg, right: spacing.lg },
        ]}
        pointerEvents="box-none"
      >
        {showLegendCard && <MapLegendCard members={members} maxCommuteMins={maxCommuteMins} />}
        <CommuteSlider value={maxCommuteMins} onChange={handleCommuteChange} />
      </View>


      {showHint && (
        <View style={[styles.belowSlider, { bottom: insets.bottom + spacing.md + 132 }]}>
          <CommuteHintCard
            maxCommuteMins={maxCommuteMins}
            onDismiss={() => setBeat('pitch')}
          />
        </View>
      )}

      {region.computing && (
        <View
          style={[
            styles.computingPill,
            { top: insets.top + spacing.sm + (showHint ? 184 : 104) },
          ]}
        >
          <ActivityIndicator size="small" color={colors.teal} />
          <Text style={styles.statusText}>
            {region.progress
              ? `Mapping walking routes… ${Math.round(
                  (region.progress.done / region.progress.total) * 100,
                )}%`
              : 'Mapping walking routes…'}
          </Text>
        </View>
      )}

      {/* Picks carousel sits just above the tab bar; swiping through it pans
          the camera to each pick AND grows its bubble on the map — the
          browsing motion supplies the spatial context a flat list can't.
          Toggles float higher to clear it — but only once it's actually
          showing. Empty (nothing onboarded yet), they drop flush above the
          tab bar instead, so the map gets that space back rather than
          floating for no reason (Nick's call, 2026-08-23). */}
      <View style={[styles.picksStrip, { bottom: insets.bottom + spacing.xs }]}>
        <PicksCarousel
          picks={picks}
          onCenterChange={handleCenterChange}
          onOpen={(pick) => { handleCenterChange(pick); setOpenPick(pick); }}
        />
      </View>

      {/* Hidden while the explainer owns the bottom of the screen — at that
          stage there is nothing to toggle that the explainer isn't already
          naming, and two competing bottom elements is exactly the clutter
          this restructure removes. */}
      {!onboarding && (
        <View
          style={[
            styles.toggleBar,
            { bottom: insets.bottom + spacing.xs + (picks.length > 0 ? 60 : 0) },
          ]}
        >
          <LayerToggles value={layers} onChange={setLayers} />
        </View>
      )}

      {/* Doesn't appear until workplace entry is actually done — the value
          moment (their own pins, their own polygon) has to land first, or
          this just competes with it. Bottom-anchored rather than centred so
          the map it's describing stays fully visible above it. */}
      {showExplainer && (
        <MapExplainerPanel
          members={members}
          maxCommuteMins={maxCommuteMins}
          areaCount={areas.length}
          signedIn={Boolean(user)}
          busy={authStatus === 'signing-in'}
          onPress={user ? () => setAgentOpen(true) : beginSignIn}
        />
      )}

      {showAgentFab && (
        <Pressable
          onPress={() => setAgentOpen(true)}
          style={[styles.agentLauncher, { bottom: insets.bottom + spacing.xs + 60, right: spacing.lg }]}
          accessibilityRole="button"
          accessibilityLabel="Talk to the Maloca Agent"
        >
          <Text style={styles.agentLauncherIcon}>💬</Text>
        </Pressable>
      )}

      {agentOpen && <AgentCard onClose={() => setAgentOpen(false)} />}

      <WorkplaceEntrySheet visible={workplaceOpen} onClose={() => setWorkplaceOpen(false)} />

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
  bottomStack: {
    position: 'absolute',
    gap: spacing.sm,
  },
  belowSlider: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  computingPill: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  toggleBar: {
    position: 'absolute',
    alignSelf: 'center',
  },
  agentLauncher: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  agentLauncherIcon: { fontSize: 20 },
  picksStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
