import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Map, Camera, GeoJSONSource, Layer, type CameraRef } from '@maplibre/maplibre-react-native';
import { colors, fonts, spacing, type } from '../../theme';
import { useMapDataStore } from '../../store/mapDataStore';
import { useReachableAreas } from '../../hooks/useReachableAreas';
import { useProfileStore } from '../../store/profileStore';
import { getDestination } from '../../lib/destinations';
import { WorkplacePin } from '../../components/WorkplacePin';
import { LayerToggles, type LayerState } from '../../components/LayerToggles';
import { PicksCarousel, type PickWithLocation } from '../../components/PicksCarousel';
import { AgentThinkingBar } from '../../components/AgentThinkingBar';
import { PickDetailCard } from '../../components/PickDetailCard';
import { PickBubble } from '../../components/PickBubble';
import { effectiveLovedOrder, locateArea } from '../../lib/lovedAreas';
import { CommuteSlider } from '../../components/CommuteSlider';
import { CommuteChip } from '../../components/CommuteChip';
import { usePicks } from '../../hooks/usePicks';
import { useShortlistStore } from '../../store/shortlistStore';
import { useReachableRegion } from '../../hooks/useReachableRegion';
import { framingBounds } from '../../lib/mapCamera';
import { COMMUTE_DEFAULT_MINS } from '../../lib/commuteSettings';
import { WorkplaceEntrySheet } from '../../components/WorkplaceEntrySheet';
import { hasLifestyleSignal } from '../../lib/lifestyleSignal';
import { useAuthStore } from '../../store/authStore';
import { UnlockBar } from '../../components/UnlockBar';
import { UnlockSheet } from '../../components/UnlockSheet';
import { CommuteHintCard } from '../../components/CommuteHintCard';
import { MapLegendCard } from '../../components/MapLegend';
import type { NativeSyntheticEvent } from 'react-native';

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
// Pre-computed at +15% rather than done via a runtime `*` on a nested
// interpolate — that composed form triggered a MapLibre Native error on
// device (the native engine is stricter about expression complexity than
// the JS/web version) and silently failed to draw at all, which is also
// why the "bigger when selected" effect never visibly appeared.

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

/** Settled slider drags before the map asks the question it can't answer. */
const SETTLES_BEFORE_ASKING = 3;

export default function MapScreen() {
  const load = useMapDataStore((s) => s.load);
  const status = useMapDataStore((s) => s.status);
  const error = useMapDataStore((s) => s.error);
  const stations = useMapDataStore((s) => s.stations);
  const { areas, ready } = useReachableAreas();
  const members = useProfileStore((s) => s.profile.members);
  // Stations off by default: today's session established that people ask
  // "where could I live", not "which station is this" — the region answers
  // that on its own. Dots stay available for anyone who wants the detail,
  // but showing them unasked was exactly the "what do these mean" confusion
  // Nick hit when this first rendered on a real device (2026-08-23).
  const [layers, setLayers] = useState<LayerState>({ anchors: true, picks: true });
  // Collapsed behind the filter button, like the commute slider beside it.
  const [layersOpen, setLayersOpen] = useState(false);
  // Always on — see LayerToggles.tsx for why this one has no toggle.
  const region = useReachableRegion(true);
  const insets = useSafeAreaInsets();
  const { picks: rankedPicks, provisional, reranking } = usePicks();
  /**
   * Nothing on the map while a new ranking is coming. The old ten are not a
   * weaker answer than the new ten, they are an answer to a question nobody
   * asked any more — so they come off the carousel AND off the map, and the
   * thinking bar takes their place (Nick, 2026-09-01).
   */
  const picks = reranking ? [] : rankedPicks;
  const toggleVisited = useShortlistStore((s) => s.toggleVisited);
  const rankingError = useShortlistStore((s) => s.rankingError);
  // For the visited dot on a loved area's card — see lovedPicks below.
  // Loved areas have no ShortlistEntry of their own until someone toggles
  // it (store/shortlistStore.ts upserts one then), so this is read-only
  // lookup, never a source the loved list depends on existing.
  const shortlistEntries = useShortlistStore((s) => s.entries);
  const [openPick, setOpenPick] = useState<PickWithLocation | null>(null);
  const [centeredPick, setCenteredPick] = useState<string | null>(null);
  const cameraRef = useRef<CameraRef>(null);
  /**
   * flyTo/fitBounds are typed as returning void but actually hand back a
   * promise from the native module (Camera.tsx's setStop) — one that
   * rejects, uncaught, as "Invalid reactTag N, could not find MLRNCamera"
   * whenever the command lands after the native view has gone away (a tab
   * switch mid-animation, Fast Refresh swapping the view out from under an
   * in-flight call). Harmless — the camera move just doesn't happen — but
   * unswallowed it spams the console as an uncaught rejection. Catching it
   * here rather than typing it through: the library's own .d.ts says void.
   */
  function moveCamera(command: () => unknown) {
    try {
      Promise.resolve(command()).catch(() => {});
    } catch {
      // Same benign race, thrown synchronously instead of rejected.
    }
  }
  const maxCommuteMins = useProfileStore((s) => s.profile.maxCommuteMins) ?? COMMUTE_DEFAULT_MINS;
  const updateCommuteSettings = useProfileStore((s) => s.updateCommuteSettings);
  const isDemo = useProfileStore((s) => s.profile.isDemo);
  const [workplaceOpen, setWorkplaceOpen] = useState(() => isDemo ?? false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  /**
   * The commute slider starts folded away behind its chip.
   *
   * Not during onboarding, though — see showSlider below. Dragging it and
   * watching the region breathe is the whole demo, so hiding it there would
   * remove the one thing there is to do on a first run.
   */
  const [commuteOpen, setCommuteOpen] = useState(false);
  const lifestyle = useProfileStore((s) => s.profile.lifestyle);
  const areaCards = useProfileStore((s) => s.profile.areaCards);
  const lovedOrder = useProfileStore((s) => s.profile.lovedOrder);
  const engaged = hasLifestyleSignal(lifestyle);
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  // Requires an account: the conversation cannot send without one, so
  // offering it signed out is a button that only ever errors.

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

  /**
   * hint -> pitch on a COUNT of deliberate slider changes, not a timer
   * (Nick, 2026-08-29). The old rule fired twelve seconds after the first
   * drag: it interrupted anyone still exploring, and made anyone who had
   * understood it immediately sit and wait.
   *
   * Three settles is roughly where "where COULD we live" has been answered
   * and the useful question becomes "which of these, though?" — the one the
   * Agent answers and the map cannot. CommuteSlider only calls onChange on
   * release, and only when the value really moved, so these are three
   * decisions rather than three frames of a drag.
   */
  const [settles, setSettles] = useState(0);

  function handleCommuteChange(mins: number) {
    updateCommuteSettings({ maxCommuteMins: mins });
    // The captions have done their job by the time someone starts exploring.
    setShowWorkCaptions(false);
    // Moving the slider is what advances past the nudge — an explanation
    // of the polygon only lands once they've watched it change.
    if (beat === 'callouts' || beat === 'nudge') setBeat('hint');
    const next = settles + 1;
    setSettles(next);
    if (next >= SETTLES_BEFORE_ASKING) setBeat('pitch');
  }

  const showHint = onboarding && beat === 'hint';
  // Signing in happens behind the modal, so nothing else would close it.
  useEffect(() => {
    if (user) setUnlockOpen(false);
  }, [user]);

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
  const showUnlockBar = !user && !workplaceOpen && !inFirstRunTour;
  // The legend is needed from the very first frame — unexplained shapes are
  // the thing to fix, not something to reveal three beats later. The pitch
  // panel folds the same rows in, so they never both show.
  const showLegendCard = onboarding && beat !== 'pitch';
  /**
   * Open during onboarding, folded away afterwards.
   *
   * By the time someone has picks to look at they have settled on a number
   * — 45 minutes, say — and the slider is a permanently open control for a
   * setting nobody is changing, sitting in the space the map wants back
   * (Nick, 2026-09-01). The chip in the layer bar reopens it, and keeps the
   * number visible in the meantime.
   */
  const showSlider = onboarding || commuteOpen;


  /**
   * The bottom of the screen, measured once.
   *
   * The slider, the layer toggles and the picks carousel were each
   * bottom-anchored with their own hand-tuned offset, so they only lined up
   * for the state they happened to be tuned in. Adding the "closest to your
   * commute" note pushed the strip taller and they collided (Nick's
   * screenshot, 2026-08-31).
   *
   * Now each one sits on top of what is actually below it, so any
   * combination stacks instead of overlapping.
   */
  /**
   * Measured against what the strip actually draws, not guessed. The card
   * grew a second row — the match badge — plus the scrollbar hairline
   * underneath it (Nick, 2026-09-02: "the height can double"). See
   * CARD_HEIGHT and the strip/track styles in PicksCarousel.tsx — this is
   * their sum (82pt strip + 10pt track), kept next to them on purpose.
   */
  const CAROUSEL_H = 92;
  const HEADER_H = 24;
  const TOGGLES_H = 40;
  const GAP = spacing.xs;

  const THINKING_H = 62;

  /**
   * CommuteSlider's own rendered height (wrap padding + headline + track +
   * ticks) — only needed for the reorder below.
   */
  const SLIDER_H = 84;

  /**
   * Reopening the slider from its chip used to pop the bottomStack up
   * ABOVE the picks carousel and the toggle row — both already anchored
   * hard against the tab bar — stranding it a card-and-a-half above the
   * tab bar with nothing under it. During onboarding this never showed:
   * there are no picks yet, so the slider was already the lowest thing on
   * screen, which is the placement Nick wants back once it is reopened
   * later too — "a very small gap between the tab bar and the slider"
   * (2026-09-02).
   *
   * So on reopen it becomes the bottommost element and the carousel +
   * toggles make room above it, rather than the other way round.
   */
  const sliderReopened = commuteOpen && !onboarding;

  /**
   * The tab bar is a real, space-taking bar, not an overlay — this screen's
   * own content already stops above it. `insets.bottom` is the raw
   * hardware inset for the home indicator / gesture bar, which the tab bar
   * has ALREADY cleared by the time this screen ever renders — adding it
   * again on top stranded the carousel roughly a card's height above the
   * tab bar with dead space underneath (Nick's screenshot, 2026-09-02).
   * This is deliberately just a small fixed gap instead.
   */
  const TAB_BAR_GAP = spacing.sm;

  const picksBottom = TAB_BAR_GAP + (sliderReopened ? SLIDER_H + GAP : 0);
  // Whichever of the two is occupying the strip — they never both show, and
  // the toggles sit on top of the one that is.
  //
  // `picks.length` alone used to decide this, which was fine before loved
  // areas could be in the strip too: a household with only loved areas and
  // no AI ranking yet has picks.length === 0 but the strip is NOT empty
  // (Nick, 2026-09-09 — loved areas now show even before there's anything
  // AI-ranked), so the toggles would have floated back down and sat on top
  // of a carousel that was still there. Checked directly against
  // areaCards rather than against lovedPicks below, because that memo is
  // defined further down and duplicating its identity here would be the
  // same fact computed twice, one of which could quietly drift from the
  // other.
  const hasLoved = Object.values(areaCards ?? {}).some((v) => v === 'love');
  const picksBlockH = reranking
    ? THINKING_H + GAP
    : picks.length > 0 || hasLoved
      ? CAROUSEL_H + HEADER_H + GAP
      : 0;
  const togglesBottom = picksBottom + picksBlockH;
  const stackBottom = sliderReopened
    ? TAB_BAR_GAP
    : togglesBottom + (onboarding ? 0 : TOGGLES_H + GAP);

  /**
   * Loved areas, placed on the map as numbered rose bubbles — the SAME
   * bubble the AI's own picks use, just tinted rose, and opening the same
   * detail card on tap (Nick, 2026-09-09: "instead of having the row
   * bubbles clickable [with a name popup], they would be mirroring the
   * same as the bubbles for the areas... suggested by the agent").
   *
   * This replaced AnchorPin outright — an unlabelled dot you tapped to
   * reveal a name that then faded again, a second interaction pattern
   * existing nowhere else in the app. One mechanism now: tap a numbered
   * bubble, the detail card opens, exactly like every other pick.
   *
   * Built from profile.areaCards rather than from `picks`, because
   * shortlistByAnchor deliberately excludes a loved area from its own
   * candidates — so these can never arrive through the normal pick path
   * and have to be built here instead. locateArea is the shared placement
   * rule (the basemap's own OSM label for the place, station as a
   * fallback) so this and the carousel below never disagree about where
   * an area sits.
   *
   * score/confidence are placeholders, not a claim: this is a place the
   * HOUSEHOLD chose, not one the model suggested, so there is no model
   * score to carry — 'high' confidence records that it is certain, not
   * that an AI was sure of it.
   */
  const lovedPicks = useMemo(() => {
    const order = effectiveLovedOrder(areaCards, lovedOrder);
    const visited = new Set(shortlistEntries.filter((e) => e.visited).map((e) => e.neighbourhood));
    return order
      .map((name): PickWithLocation | null => {
        const at = locateArea(name, stations);
        if (!at) return null;
        return {
          neighbourhood: name,
          score: 0,
          reason: "You've told Maloca you love this area — it's what the rest of your suggestions are being measured against.",
          confidence: 'high',
          visited: visited.has(name),
          lat: at.lat,
          lng: at.lng,
        };
      })
      .filter((p): p is PickWithLocation => p !== null);
  }, [areaCards, lovedOrder, stations, shortlistEntries]);

  /**
   * Loved areas first, then the AI's own picks — one strip, in the order
   * Nick asked for. The filter is defensive rather than load-bearing: the
   * AI ranking already excludes a loved area from its own candidates (see
   * lovedPicks above), so this only guards against the FlatList crashing
   * on a duplicate key if that invariant is ever broken elsewhere.
   */
  const carouselPicks = useMemo<PickWithLocation[]>(() => {
    const loved = new Set(lovedPicks.map((p) => p.neighbourhood));
    return [...lovedPicks, ...picks.filter((p) => !loved.has(p.neighbourhood))];
  }, [lovedPicks, picks]);

  // Memoised: a fresh identity on every render invalidated the carousel's
  // props and re-rendered every card in the strip.
  const handleCenterChange = useCallback((pick: PickWithLocation) => {
    setCenteredPick(pick.neighbourhood);
    moveCamera(() => cameraRef.current?.flyTo({ center: [pick.lng, pick.lat], duration: 900 }));
  }, []);

  const handleOpenPick = useCallback((pick: PickWithLocation) => {
    setCenteredPick(pick.neighbourhood);
    moveCamera(() => cameraRef.current?.flyTo({ center: [pick.lng, pick.lat], duration: 900 }));
    setOpenPick(pick);
  }, []);

  useEffect(() => {
    load();
  }, [load]);


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
   *
   * SIGNED OUT ONLY (Nick, 2026-09-01). This is explanatory furniture for
   * someone meeting the map for the first time. Once there is an account
   * behind it, the person put those workplaces in themselves and knows
   * perfectly well whose they are — at that point it is two bubbles of
   * their own names sitting on top of the areas they came to look at.
   */
  const [showWorkCaptions, setShowWorkCaptions] = useState(true);
  const workCaptions = !user && showWorkCaptions;

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
    moveCamera(() =>
      cameraRef.current?.fitBounds(
        [box.sw.lng, box.sw.lat, box.ne.lng, box.ne.lat],
        { duration: 700 },
      ),
    );
  }, [region.outline, region.pockets, workplacePins, maxCommuteMins]);


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
        // MapLibre's own attribution button — the little 'i'. It defaults
        // to the bottom-right, which is now where the picks carousel and
        // the layer bar live, so it sat under the app's furniture. Offset
        // by the safe-area inset because the map runs full-bleed under the
        // status bar (there is no header on this screen).
        attributionPosition={{ top: insets.top + spacing.sm, right: spacing.md }}
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
        {/* No pins while the sheet is open: an A and a B floating over
            London mean nothing before anyone has said where they work, and
            the letters are the first thing the eye goes to. */}
        {!workplaceOpen && workplacePins.map((pin) => (
          <WorkplacePin
            key={pin.key}
            lng={pin.lng}
            lat={pin.lat}
            initial={pin.initial}
            caption={workCaptions ? `${pin.name || 'They'} works here` : undefined}
            // Nothing to bring back once signed in, so the pin stops being
            // pressable rather than toggling state that never renders.
            onPress={user ? undefined : () => setShowWorkCaptions(true)}
          />
        ))}
        {/* Rose, numbered, same tap-to-open mechanism as the teal ones
            below — no separate "tap to reveal a name" step any more (Nick,
            2026-09-09). ONE numbering list across both colours now, same
            as the carousel: with X loved areas these take 1..X, so the
            first AI-suggested bubble below starts at X+1, not back at 1
            (Nick, 2026-09-09 — "the same numbering list... the first of 5
            areas suggested by the agent would be X+1"). A pink bubble and
            a teal bubble showing the same number used to mean two
            different things; one shared sequence means a number on the
            map means exactly one thing wherever you see it. */}
        {layers.anchors && lovedPicks.map((pick, i) => (
          <PickBubble
            key={`loved-${pick.neighbourhood}`}
            pick={pick}
            rank={i + 1}
            tone="rose"
            centered={pick.neighbourhood === centeredPick}
            onPress={() => { setCenteredPick(pick.neighbourhood); setOpenPick(pick); }}
          />
        ))}
        {layers.picks && picks.map((pick, i) => (
          <PickBubble
            key={pick.neighbourhood}
            pick={pick}
            rank={lovedPicks.length + i + 1}
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
          { bottom: stackBottom, left: insets.left + spacing.lg, right: spacing.lg },
        ]}
        pointerEvents="box-none"
      >
        {showLegendCard && <MapLegendCard members={members} maxCommuteMins={maxCommuteMins} />}
        {showUnlockBar && (
          <UnlockBar
            areaCount={areas.length}
            maxCommuteMins={maxCommuteMins}
            onPress={() => setUnlockOpen(true)}
          />
        )}
        {showSlider && <CommuteSlider value={maxCommuteMins} onChange={handleCommuteChange} />}
      </View>


      {showHint && (
        <View style={[styles.belowSlider, { bottom: stackBottom + 132 }]}>
          <CommuteHintCard onDismiss={() => setBeat('pitch')} />
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
      <View style={[styles.picksStrip, { bottom: picksBottom }]}>
        {reranking && <AgentThinkingBar />}
        <PicksCarousel
          picks={carouselPicks}
          lovedCount={lovedPicks.length}
          /* Says what these are BEFORE anyone reads a single card. It used
             to name the anchors — "10 areas like Clapham Common and Tooting
             Broadway" — which was accurate and unreadable: it repeated what
             every card already said and it was long enough to wrap over the
             map. The card now carries no anchor at all, so this is the one
             place that has to say where the list came from, in one line
             (Nick, 2026-09-01).

             Falls back to the provisional note while the real ranking is
             still coming: without it "shortest commute to your office" is
             shown in the same place, in the same style, as a considered
             recommendation — and someone who ruled out Canary Wharf sees it
             at the top and concludes the app ignored them (2026-08-30). */
          title={
            provisional
              ? (rankingError ?? 'Closest to your commute for now — still working out which suit you.')
              : "Maloca's suggestions based on where you love today"
          }
          onCenterChange={handleCenterChange}
          onOpen={handleOpenPick}
          /* Keeps the strip on the same area as the map. Tapping a bubble
             enlarged it and flew the camera while the strip stayed put, so
             two things claimed focus at once and closing the card left the
             odd one out behind (Nick, 2026-09-08). */
          focusOn={centeredPick}
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
            { bottom: togglesBottom },
          ]}
        >
          <LayerToggles
            value={layers}
            onChange={setLayers}
            open={layersOpen}
            onToggleOpen={() => setLayersOpen((v) => !v)}
            trailing={
              <CommuteChip
                minutes={maxCommuteMins}
                open={commuteOpen}
                onPress={() => setCommuteOpen((v) => !v)}
              />
            }
          />
        </View>
      )}

      {/* Doesn't appear until workplace entry is actually done — the value
          moment (their own pins, their own polygon) has to land first, or
          this just competes with it. Bottom-anchored rather than centred so
          the map it's describing stays fully visible above it. */}
      <UnlockSheet
        visible={unlockOpen}
        areaCount={areas.length}
        busy={authStatus === 'signing-in'}
        onSignIn={beginSignIn}
        onClose={() => setUnlockOpen(false)}
      />

      <WorkplaceEntrySheet visible={workplaceOpen} onClose={() => setWorkplaceOpen(false)} />


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
    // Stops short of the corner: the map's attribution 'i' now sits there,
    // and this pill spans the full width while it is showing.
    right: spacing.lg + 28,
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
  picksStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
