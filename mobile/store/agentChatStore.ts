import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AGENT_SYSTEM_PROMPT, AREA_ANSWER_PROMPT, CLOSING_MESSAGE, FRIEND_COMPARE_PROMPT, FRIEND_PROMPT, GENERAL_ANSWER_PROMPT, OPENING_MESSAGE } from '../lib/agentChat/prompt';
import { cuisineAsked, friendTopic, googleQueryFor, keepRated, placeBrief, type FriendTopic } from '../lib/agentChat/friend';
import { socialLinks, toPlaceCard, type PlaceCard } from '../lib/agentChat/placeCards';
import { CHAT_STEPS } from '../lib/setupSteps';
import { callAgentChat, callAgentProse, type ChatMessage } from '../lib/agentChat/client';
import { weaveReply } from '../lib/agentChat/parse';
import { areasAskedAbout, briefForPrompt, buildAreaBrief } from '../lib/agentChat/areaBrief';
import { shortlistBrief } from '../lib/agentChat/shortlistBrief';
import { useShortlistStore } from './shortlistStore';
import { summariseConversation, type SummaryLine } from '../lib/conversationSummary';
import { recordDataGap } from '../lib/dataGapSync';
import { recordUnanswered } from '../lib/unansweredSync';
import { asksForAnOuting, WALK_RADIUS_M, type OutingStop } from '../lib/agentChat/outing';
import {
  asksForAnAmenity,
  brandDisplay,
  carriesTheTopic,
  composeBrand,
  pickBrand,
  composeAmenities,
  pickNearby,
  type AmenityAsk,
} from '../lib/agentChat/amenities';
import { mapsLink } from '../lib/itinerary';
import { searchPlaces, resolvePhoto, PlacesUnavailableError } from '../lib/placesClient';
import { areaCoords, placeNamedIn } from '../lib/ranking/placeLabels';
import { endOnUser } from '../lib/agentChat/parse';
import { useProfileStore } from './profileStore';
import { loadData } from '../lib/dataSource';
import type { JourneyTimes, Profile } from '../lib/types';
import { ambiguityInText, outsideLondonNote, sharpenAreaNames, unresolvedAreas } from '../lib/ranking/anchor';
import { describeChange, type PendingChange } from '../lib/pendingChange';
import { asksForARoute, describeRoutes, swapsThePlace, type PersonRoute } from '../lib/routes';
import { asksForTheRest, describeRanking, describeTheRest, rankAreas, rankingAsked, whichSets, type Ranking, type RankKind, type ThemeId } from '../lib/areaRanking';
import { ACTIVITIES, activitiesFromTags, activitiesIn, changesTheDay, choosePlace, clock, daySubtitle, dayTitle, describeDay, excludedIn, greenSpacesNear, hasTimeWords, isProperPark, PARK_WALK_MINS, parseWindow, planSlots, walkBetween, type DayCardData, type DayStopCard } from '../lib/dayPlan';
import { typeLabel } from '../lib/agentChat/placeCards';
import { fetchRoute, RouteUnavailableError } from '../lib/routeLookup';
import { favouritesFor, isRegionName, lovedNotPicked, MAX_REGION_PICKS, sameArea } from '../lib/regions';
import { normaliseName } from '../lib/ranking/normaliseName';

/**
 * One conversation, shared by both surfaces (the map's compact card and the
 * full-screen Agent tab) — a single store rather than one per screen means
 * opening either shows the same thread, continued.
 *
 * PERSISTED to the device (2026-09-07). It wasn't, and the effect was that
 * opening the Agent tab after any restart showed the opening question again
 * as though the conversation had never happened (Nick) — the store was
 * memory-only, so an app relaunch, or a Metro reload during development,
 * reset it to a fresh opener. Within a session both surfaces already shared
 * the thread; it was only across launches that it vanished.
 *
 * The old comment here claimed parity with shortlistStore. That stopped
 * being true when shortlistStore gained AsyncStorage, which left this as the
 * one piece of the hunt that forgot itself. Syncing it across a HOUSEHOLD
 * via Firebase is still future work — this is per-device.
 */

/** An ambiguous place name waiting to be pinned down at the end. */
export interface DeferredClarification {
  /** What they typed, as the app matched it — e.g. "Clapham". */
  stem: string;
  /** The real areas it could mean, from lib/ranking/anchor.ts. */
  options: string[];
  /**
   * 'favourites' when the first answer has to be narrowed to three: a part
   * of town rather than a place ("South East"), or more than three places
   * (Nick, 2026-10-04). Asked as buttons, pick up to `max`. 'region' is
   * the same question as first shipped, kept so one already queued still
   * renders.
   */
  kind?: 'favourites' | 'region';
  /** The most they may pick. */
  max?: number;
  /** The places they named. Empty when they only gave a region. */
  named?: string[];
  /**
   * The message that raised it, and the key it was recorded under in
   * `clarified`. Going Back past that message takes the question away
   * with it (Nick, 2026-10-04), and lets it be asked again if the new
   * answer needs it.
   */
  from?: string;
  key?: string;
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  /**
   * A day out, rendered as cards rather than as a wall of text.
   *
   * Present only on an itinerary reply. `text` still carries a readable
   * version for anything that only knows about text — and so a message
   * saved by an older build never renders as an empty bubble.
   */
  stops?: OutingStop[];
  /** Friend-style answers: swipeable place cards (components/PlaceCarousel). */
  places?: PlaceCard[];
  /** "See it on TikTok / Instagram" for that answer. */
  social?: { tiktok: string; instagram: string };
  /** Each person's way to work from an area, drawn as a map (components/RouteCard). */
  route?: { area: string; people: PersonRoute[] };
  /** Their areas ranked on one thing, drawn as a podium (components/RankCard). */
  ranking?: Ranking;
  /** A day out, drawn as a swipeable day strip (components/DayCard). */
  day?: DayCardData;
  /**
   * For an area/shortlist answer, this is ALREADY the woven result of
   * weaveReply (lib/agentChat/parse.ts) — the model's own knowledge and
   * the measured brief read as one paragraph, in one voice, never a
   * separate labelled block (Nick, 2026-09-09: the old "not from our data"
   * box "looked awful"). Nothing downstream should try to re-split this;
   * there is nothing left to split.
   *
   * The prompts (AREA_ANSWER_PROMPT / GENERAL_ANSWER_PROMPT) are what
   * actually protect the reader now that there is no visible seam to
   * catch a mistake at: they require anything added from the model's own
   * knowledge to never contradict the brief, because that check can no
   * longer happen after the fact, on screen.
   */
  text: string;
}

interface AgentChatState {
  messages: DisplayMessage[];
  /**
   * A question named a place that could mean several stations ("Tooting":
   * Tooting, Tooting Bec, Tooting Broadway) and we asked which (Nick,
   * 2026-10-01). Not persisted: it is a live prompt, not history.
   */
  askWhich: { said: string; stem: string; options: string[] } | null;
  /** Answer `askWhich` by re-asking the question about the chosen place. */
  chooseWhich: (option: string) => Promise<void>;
  status: 'idle' | 'sending' | 'error';
  error: string | null;
  /** Place names we have already queued or asked about, so we ask once. */
  clarified: string[];
  /**
   * Ambiguous place names, saved up to be asked AT THE END as taps rather
   * than interrupting the conversation (Nick, 2026-08-30).
   *
   * "Clapham" could mean the Common, the High Street or the Junction, and
   * they are not interchangeable — from the Common the engine suggests
   * Highbury and Kennington, from the Junction it suggests Wandsworth Town
   * and Balham. So it does have to be asked. It just does not have to be
   * asked NOW: interrupting cost a whole extra turn before question two,
   * and the answer is a choice from a short list, which is a tap.
   */
  deferred: DeferredClarification[];
  /**
   * Where the setup conversation ended, as an index into `messages`.
   *
   * Everything before it is the six scripted questions and their answers,
   * which the Agent tab must NOT show: that ground is already covered, in
   * a far more readable form, by the "what I already know" card at the top
   * of the tab (Nick, 2026-09-22). "Show all messages" is for the
   * conversation somebody has had SINCE, which is the only part they
   * cannot already see.
   *
   * 0 for anyone who finished setup before this existed - they see the
   * whole thread, exactly as they did before, rather than nothing.
   */
  setupEndedAt: number;
  /**
   * The kind of place last looked up, so "and what about Tooting?" stays
   * about gyms instead of turning into a general description of Tooting
   * (Nick, 2026-09-23). Cleared by any ordinary area answer, because at
   * that point the subject really has moved on.
   */
  lastAmenity: AmenityAsk | null;
  /**
   * What the last answer was about, when that should carry on to a short
   * follow-up. Only routes, so far: after "what's our route to work from
   * Earlsfield?", "what about Tooting?" means the route from Tooting
   * (Nick, 2026-10-02 - it got a general report on Tooting instead).
   * Survives the "which Tooting?" question in between; cleared by any
   * other kind of answer.
   */
  lastTopic: 'route' | 'ranking' | 'day' | null;
  /** The last day out planned, so "actually just an afternoon" can re-plan it. */
  lastDay: { area: string; said: string } | null;
  /** The last ranking shown, so "what about the rest?" can list places 4 onwards. */
  lastRanking: Ranking | null;
  /** Answered, so stop asking. */
  resolveDeferred: (stem: string) => void;
  /**
   * Their favourite three, chosen on the buttons: loves them, lets go of
   * every other loved area, and keeps it that way for the rest of setup.
   */
  pickFavourites: (picks: string[]) => void;
  /**
   * Setup's Back button on a typed question (Nick, 2026-10-04: "in case
   * someone makes a mistake"). Takes their last answer away, with the
   * question after it and anything it queued, and hands the text back so
   * it can be edited rather than retyped. Null when there is nothing to
   * take back.
   */
  undoLastAnswer: () => string | null;
  /**
   * The favourites they picked, while setup is still writing the profile.
   * Each background read of the conversation restates every area named so
   * far, so without this the four they did not pick would come straight
   * back the next time one landed.
   */
  favourites: string[] | null;
  /** Setup finished: draws the line under its messages and empties the
   *  clarification queue. See the implementation for why both happen at
   *  the end rather than as they go. */
  markSetupFinished: () => void;
  /**
   * Turns where the Agent asked something off-script. The setup UI works
   * out which question they are on by counting answers, so a clarification
   * and its answer would otherwise skip a real question — and the progress
   * they see would run ahead of where they actually are.
   */
  followUps: number;
  /** The model's own signal that the three typed questions are done. */
  complete: boolean;
  /**
   * A change read out of the conversation but not yet applied — see
   * lib/pendingChange.ts. Null during setup, where answers ARE the profile
   * and confirming each one would be absurd.
   */
  pending: PendingChange | null;
  /**
   * The area the Agent last answered about, so a follow-up can be about it.
   *
   * "What are the schools like in the area?" names nowhere, and used to get
   * no answer at all because nothing matched (Nick, 2026-09-07). A question
   * straight after one about Angel is almost always still about Angel.
   */
  lastArea: string | null;
  /** Write the pending change to the profile, which re-ranks the map. */
  applyPending: () => void;
  /** Throw it away. The conversation stays; the map does not move. */
  dismissPending: () => void;
  send: (text: string) => Promise<void>;
  /** Back to a fresh opener. Paired with profileStore.clearPreferences() —
   *  see the Settings control that calls both. */
  restart: () => void;
}

/** Fixed id for the seeded opener — excluded from what actually gets sent
 *  to the API (see send() below): the Anthropic Messages API requires the
 *  first message in a conversation to be role "user", and this one is
 *  authored locally, not a real assistant turn the model needs to see
 *  again — the system prompt already tells it "you already asked this". */
const SEED_PREFIX = 'seed';
let seedCount = 0;
/** A fresh id per reset, so anything tracking "already shown by id" treats
 *  a restarted conversation's opener as new rather than as one it has
 *  already read out. Regular ids are plain numbers, so they never collide. */
const newSeedId = () => `${SEED_PREFIX}-${seedCount++}`;
const isSeed = (id: string) => id.startsWith(SEED_PREFIX);

let nextId = 0;
const newId = () => String(nextId++);

const openingMessage = () => ({ id: newSeedId(), role: 'assistant' as const, text: OPENING_MESSAGE });

/** Serialises sends — see the note in send(). */
let chain: Promise<void> = Promise.resolve();

export const useAgentChatStore = create<AgentChatState>()(
  persist<AgentChatState>(
    (set, get) => ({
  messages: [openingMessage()],
  status: 'idle',
  error: null,
  clarified: [],
  askWhich: null,
  deferred: [],
  favourites: null,
  setupEndedAt: 0,
  lastAmenity: null,
  lastTopic: null,
  lastRanking: null,
  lastDay: null,
  followUps: 0,
  complete: false,
  pending: null,
  lastArea: null,

  // Clearing `clarified` matters: running the conversation again should ask
  // "which Clapham?" again, since the previous answer went with the profile
  // that was just wiped.
  restart: () =>
    set({
      messages: [openingMessage()], status: 'idle', error: null,
      // `complete` was missing here until 2026-09-07. It did not show while
      // the store was memory-only, because a relaunch cleared it anyway —
      // persisting the conversation is what turned a stale flag into a
      // permanent one: a restarted conversation would come back believing it
      // had already finished, and skip straight past the questions.
      clarified: [], deferred: [], favourites: null, setupEndedAt: 0, followUps: 0, complete: false,
      pending: null, lastArea: null, lastAmenity: null, lastTopic: null, lastRanking: null, lastDay: null,
    }),

  applyPending: () => {
    const p = get().pending;
    if (!p) return;
    const store = useProfileStore.getState();
    if (Object.keys(p.lifestyle).length > 0) store.updateLifestyle(p.lifestyle);
    if (Object.keys(p.areaCards).length > 0) store.updateAreaCards(p.areaCards);
    set({ pending: null });
  },

  dismissPending: () => set({ pending: null }),

  /**
   * Drop a clarification once it has been answered.
   *
   * `clarified` is deliberately left alone. It records that the app has
   * ASKED about a name, which is what stops it asking twice however many
   * times somebody says it.
   */
  resolveDeferred: (stem) =>
    set((state) => ({ deferred: state.deferred.filter((d) => d.stem !== stem) })),

  /**
   * Setup is over. Draw the line, and empty the queue it has just emptied
   * itself of.
   *
   * THE QUEUE. Setup walks `deferred` by INDEX and deliberately never
   * shrinks it mid-flow: `extraTaps` is part of the step count, and a
   * queue that shortened as you answered it would move the finish line
   * while somebody was walking towards it, which is the exact bug the
   * whole step spine was rebuilt to kill (2026-08-30). So it clears in one
   * go at the end instead. That was invisible until the Agent tab started
   * rendering the same queue (2026-09-21): every clarification setup had
   * already asked was still sitting in it, so finishing setup and opening
   * the Agent tab asked which Tooting you meant a second time, seconds
   * after you had told it (Nick, 2026-09-22).
   *
   * THE LINE. Everything in `messages` up to this point is setup, and the
   * Agent tab hides it - see setupEndedAt.
   *
   * Only on FINISHING. Abandoning setup half way has to leave both alone,
   * or resuming would skip the questions it had not reached yet.
   */
  markSetupFinished: () =>
    set((state) => ({ deferred: [], favourites: null, setupEndedAt: state.messages.length })),

  undoLastAnswer: () => {
    const messages = get().messages;
    let at = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { at = i; break; }
    }
    if (at < 0) return null;
    const gone = messages[at];
    const firstAnswer = !messages.slice(0, at).some((m) => m.role === 'user');
    // Anything still being read out of the conversation was read from a
    // version that included this answer. Let it land on nothing.
    setupEpoch++;
    const dropped = get().deferred.filter((d) => d.from === gone.id);
    const droppedKeys = new Set(dropped.map((d) => d.key ?? d.stem));
    set((state) => ({
      messages: state.messages.slice(0, at),
      deferred: state.deferred.filter((d) => d.from !== gone.id),
      clarified: state.clarified.filter((k) => !droppedKeys.has(k)),
      complete: false,
      error: null,
      ...(firstAnswer ? { favourites: null } : {}),
    }));
    /**
     * Question one is the only answer the areas come from, so taking it
     * back takes them back too; left in place, "Clapham" typed by mistake
     * would still be a loved area after they corrected it to Balham. The
     * rest of the profile is restated from the whole conversation on the
     * next answer, so it corrects itself.
     */
    const profile = useProfileStore.getState();
    if (firstAnswer) {
      for (const [name, v] of Object.entries(profile.profile.areaCards ?? {})) {
        if (v === 'love') profile.unloveArea(name);
      }
    }
    return gone.text;
  },

  pickFavourites: (picks) => {
    const profile = useProfileStore.getState();
    for (const name of lovedNotPicked(profile.profile.areaCards, picks)) profile.unloveArea(name);
    for (const name of picks) profile.loveArea(name);
    /**
     * A "which Clapham?" still waiting behind this one is only worth
     * asking if they kept Clapham. Kept: it is reworded to the name they
     * picked, so answering it replaces that card rather than adding a
     * fourth. Not kept: dropped. That makes the step count go DOWN by one,
     * which is the harmless direction - the finish line coming closer, not
     * moving away (see markSetupFinished).
     */
    const firstWord = (n: string) => normaliseName(n).split(' ')[0];
    set((state) => ({
      favourites: picks,
      deferred: state.deferred.flatMap((d) => {
        if (d.kind) return [d];
        const kept = picks.find((p) => firstWord(p) === firstWord(d.stem));
        return kept ? [{ ...d, stem: kept }] : [];
      }),
    }));
  },

  chooseWhich: (option) => {
    const ask = get().askWhich;
    if (!ask) return Promise.resolve();
    set({ askWhich: null });
    // "...like in Tooting?" -> "...like in Tooting Broadway?". If they picked
    // the bare name itself the text is unchanged, so the next send is told
    // not to ask again rather than looping.
    const pattern = new RegExp(`\\b${ask.stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const rewritten = pattern.test(ask.said) ? ask.said.replace(pattern, option) : `${ask.said} (${option})`;
    skipAskWhichOnce = true;
    return get().send(rewritten);
  },

  send: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();

    // Ambiguity is noted and SAVED FOR THE END — it no longer stands
    // between this answer and the next question.
    /**
     * True when THIS message raised a question we cannot answer yet.
     *
     * "What about Clapham?" used to do both at once: answer about Clapham
     * North - the shortest of the five, picked by the matcher, not by the
     * person - while simultaneously showing a card asking which Clapham
     * they meant. Answering a question we have just admitted we cannot
     * resolve is worse than either half alone (Nick, 2026-09-22, on the
     * Agent tab being cluttered).
     */
    /**
     * A QUESTION about an ambiguous place gets asked back, every time
     * (Nick, 2026-10-01: "What's the high street like in Tooting?" was
     * answered about the small rail station called just "Tooting", without
     * asking whether he meant Tooting Bec or Tooting Broadway).
     *
     * This is separate from deferAmbiguity below, which is about LOVED
     * areas: it asks once ever, and tapping an answer rewrites the profile.
     * A question must not do either - it changes nothing, and the same
     * word can mean a different place next time.
     */
    const skipWhich = skipAskWhichOnce;
    skipAskWhichOnce = false;
    if (!skipWhich && useProfileStore.getState().profile.setupDoneAt && isQuestion(trimmed)) {
      const options = ambiguityInText(trimmed);
      if (options.length >= 2) {
        const stem = options[0].split(' ')[0];
        set((state) => ({
          messages: [
            ...state.messages,
            { id: newId(), role: 'user' as const, text: trimmed },
            { id: newId(), role: 'assistant' as const, text: `Which part of ${stem} do you mean?` },
          ],
          askWhich: { said: trimmed, stem, options },
          status: 'idle' as const,
          error: null,
        }));
        return Promise.resolve();
      }
    }
    if (get().askWhich) set({ askWhich: null });

    // Favourites first, so "pick your three" is asked before "which
    // Clapham?" - there is no point asking which Clapham of someone who
    // then leaves it out of their three.
    const userId = newId();
    deferFavourites(trimmed, set, get, userId);
    const askedToClarify = deferAmbiguity(trimmed, set, get, userId);

    /**
     * Whether THIS message is part of setup, decided now rather than when
     * the model call comes back.
     *
     * The extraction is chained and unawaited, so it can easily still be in
     * flight when somebody taps through the last three questions and setup
     * closes. Read at resolution time, the answer flips: a sentence typed
     * during setup comes back after setupDoneAt is written and is treated
     * as an aside to be confirmed. That is how landing on the Agent tab
     * having typed nothing showed "Save this?" about the answers you had
     * just given (Nick, 2026-09-22).
     *
     * A message belongs to the conversation it was sent in. Nothing that
     * happens afterwards can change which one that was.
     */
    const duringSetup = !useProfileStore.getState().profile.setupDoneAt;

    /**
     * The next question goes up INSTANTLY, from the local script — no
     * network in the way (Nick, 2026-08-30).
     *
     * The questions were always known; until now they were being
     * regenerated by the model on every turn, so the person waited several
     * seconds to read a sentence the app already had. Worse, the model
     * returns the reply inside a JSON object carrying its whole restated
     * understanding of the profile, and nothing streams — so a short
     * question could not appear until a long extraction had finished
     * generating.
     *
     * The voice version did exactly this ("without waiting for the
     * network — deliberately, so there is no dead air") and it was removed
     * along with voice. It is safe again now: the thing that used to break
     * it was the Agent interrupting with a clarification and being talked
     * over, and clarifications are deferred to the end.
     */
    set((state) => {
      const answered = state.messages.filter((m) => m.role === 'user').length + 1;
      /**
       * The scripted reply belongs to SETUP only.
       *
       * Every send appended one — the next question, or CLOSING_MESSAGE
       * once the script ran out. After setup the script is always
       * exhausted, so asking "what are the schools like?" was answered with
       * "That's everything I needed to ask. Just a few quick taps and I'll
       * show you what I've found" — a line from a conversation that
       * finished days ago (Nick, 2026-09-07).
       *
       * Afterwards the reply comes from answerAboutArea, or there is none.
       */

      const next = CHAT_STEPS[answered];
      return {
        messages: [
          ...state.messages,
          { id: userId, role: 'user' as const, text: trimmed },
          ...(duringSetup
            ? [{
                id: newId(),
                role: 'assistant' as const,
                text: next ? next.question : CLOSING_MESSAGE,
              }]
            : []),
        ],
        // The app now owns the script, so it knows when the conversation is
        // over rather than waiting to be told. The model's own
        // conversationComplete is still honoured in extract() as a backstop.
        complete: !next,
        status: 'idle' as const,
        error: null,
      };
    });

    // The model call still happens — it is what reads a profile out of the
    // answer — but nobody is waiting on it now. Chained so the growing
    // history is built in order; two in parallel would race.
    chain = chain.then(() => answerOrExtract(set, get, trimmed, duringSetup, askedToClarify));
    return chain;
  },
    }),
    {
      name: 'maloca-agent-chat',
      storage: createJSONStorage(() => AsyncStorage),
      /**
       * The conversation, never the machinery. `status` and `error` describe
       * one in-flight attempt: a persisted 'sending' would rehydrate as a
       * spinner over a request that died with the last launch, and a
       * persisted error would report a failure from days ago as if it had
       * just happened.
       *
       * Everything else has to survive, not just the messages. `clarified`
       * and `deferred` are what stop it re-asking which Clapham you meant,
       * and `followUps` is what keeps the progress indicator honest — drop
       * those and the thread comes back looking right while behaving as
       * though it had forgotten half of itself.
       */
      partialize: (state) =>
        ({
          messages: state.messages,
          clarified: state.clarified,
          deferred: state.deferred,
          favourites: state.favourites,
          setupEndedAt: state.setupEndedAt,
          /**
           * Persisted since 2026-09-23. Without it, `lastArea` reset to
           * null on every launch, so the first follow-up of a session -
           * "and the schools?" - had nothing to attach to and was answered
           * as a question about the shortlist instead of about the area
           * plainly under discussion. The thread it follows on from is
           * persisted, so the pointer into it has to be too.
           */
          lastArea: state.lastArea,
          lastAmenity: state.lastAmenity,
          lastTopic: state.lastTopic,
          lastRanking: state.lastRanking,
          lastDay: state.lastDay,
          followUps: state.followUps,
          complete: state.complete,
        }) as AgentChatState,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Message ids are handed out by a module-level counter that restarts
        // at 0 on every launch. Restored messages already hold 0..N, so
        // without this the next message reuses an id that is on screen — and
        // React refuses to render two children with the same key. Exactly
        // the bug the workplace sheet's draft ids hit on 2026-09-07; same
        // cause, a counter outliving its own module.
        for (const m of state.messages) {
          if (isSeed(m.id)) {
            const n = Number(m.id.slice(SEED_PREFIX.length + 1));
            if (Number.isFinite(n) && n >= seedCount) seedCount = n + 1;
          } else {
            const n = Number(m.id);
            if (Number.isFinite(n) && n >= nextId) nextId = n + 1;
          }
        }
        // Nothing is in flight the moment we rehydrate, whatever was true
        // when the app was last closed.
        state.status = 'idle';
        state.error = null;
      },
    },
  ),
);

/**
 * Notice an ambiguous place name and SAVE IT for the end of setup.
 *
 * It used to be asked on the spot, which cost a whole turn: type
 * "Clapham", get asked which Clapham, answer that, and only then reach
 * question two. Fast to render — it never touched the network — but it was
 * still an extra question standing between two real ones, and the
 * conversation is meant to move (Nick, 2026-08-30).
 *
 * Nothing is lost by waiting. The answer is a choice from a short list of
 * real areas, which makes a far better tap at the end than a typed reply in
 * the middle — and the model still sees the original word and carries on
 * extracting from it either way.
 *
 * Recorded in `clarified` at the same time so a name is only ever queued
 * once, however many times they say it.
 */
function deferAmbiguity(
  text: string,
  set: (partial: Partial<AgentChatState> | ((s: AgentChatState) => Partial<AgentChatState>)) => void,
  get: () => AgentChatState,
  from?: string,
): boolean {
  const options = ambiguityInText(text);
  if (options.length < 2) return false; // one match is not ambiguous
  const stem = options[0];
  if (get().clarified.includes(stem)) return false;

  set((state) => ({
    clarified: [...state.clarified, stem],
    deferred: [...state.deferred, { stem, options, from, key: stem }],
  }));
  return true;
}

/**
 * The first answer narrowed to a favourite three, saved up as buttons for
 * the end of setup the same way an ambiguous name is (Nick, 2026-10-04).
 * Two answers need it: a part of town instead of a place (Max said "South
 * East"), and more than three places ("they can only name 3 areas").
 *
 * Only the answer to question one, and only during setup. That is the
 * question asking where they want to live; "we go out in east London a
 * lot" in answer three is about their evenings, and turning it into a
 * question about where to live would be answering something they never
 * said.
 */
function deferFavourites(text: string, set: SetState, get: GetState, from?: string): void {
  if (useProfileStore.getState().profile.setupDoneAt) return;
  const answeredBefore = get().messages.filter((m) => m.role === 'user').length - get().followUps;
  if (answeredBefore !== 0) return;
  const ask = favouritesFor(text);
  if (!ask) return;
  const key = `favourites:${normaliseName(text)}`;
  if (get().clarified.includes(key)) return;
  set((state) => ({
    clarified: [...state.clarified, key],
    deferred: [
      ...state.deferred,
      {
        stem: ask.region ?? ask.named.join(', '),
        options: ask.options,
        kind: 'favourites' as const,
        max: MAX_REGION_PICKS,
        named: ask.named,
        from,
        key,
      },
    ],
  }));
}

/**
 * Read a profile out of the conversation so far.
 *
 * Runs BEHIND the UI, not in front of it: send() has already shown the
 * user's message and the next question, so nothing on screen is waiting for
 * this. Its `reply` is discarded — the app asks the questions now — and only
 * the extracted lifestyle, areas and tags are kept.
 */
/** Does this read as a question? Deliberately loose — the cost of a false
 *  positive is one unnecessary answer, the cost of a false negative is
 *  silence where someone asked something. */
/** Set by chooseWhich so the re-asked question is answered, not queried again. */
let skipAskWhichOnce = false;

/**
 * Bumped by undoLastAnswer. A setup extraction that started before it
 * read a conversation that no longer exists, so it writes nothing.
 */
let setupEpoch = 0;

function isQuestion(text: string): boolean {
  if (text.includes('?')) return true;
  // where/who/when/could/will/did added 2026-09-23. Their absence was not
  // a judgement call, it was an oversight: "Where should we look" and "Who
  // lives there" are among the most natural things to type at a housing
  // agent, and without a question mark both fell through every branch and
  // got SILENCE. A missing question mark is normal typing, not a signal.
  if (/^(what|how|is|are|does|do|would|should|why|which|any|tell me|can you|where|who|when|could|will|did)\b/i
    .test(text.trim())) return true;
  // A question asked mid-sentence: "I love pizza, is there any good pizza
  // spots" was read as a statement and never answered (Nick, 2026-10-01).
  return /\b(is there|are there|any good|anywhere (?:good|nice)|where can|where'?s|what'?s|whats|what is|what are|how'?s|on offer|anything|recommend|suggest)\b/i.test(text);
}

/**
 * Journey times, loaded once and kept. 1MB of JSON that never changes
 * within a session, and the alternative — reloading it per question — is
 * the kind of cost nobody notices until the conversation is long.
 */
let journeyTimesCache: JourneyTimes | null = null;
async function journeyTimes(): Promise<JourneyTimes | undefined> {
  if (journeyTimesCache) return journeyTimesCache;
  try {
    journeyTimesCache = await loadData<JourneyTimes>('journey-times.json');
    return journeyTimesCache;
  } catch {
    // A missing commute line is a thinner answer, not a broken one.
    return undefined;
  }
}

type SetState = (
  partial: Partial<AgentChatState> | ((s: AgentChatState) => Partial<AgentChatState>),
) => void;
type GetState = () => AgentChatState;

/**
 * Two jobs, two calls, decided by what they actually said.
 *
 * Naming an area AFTER setup is almost always a question about it — "what
 * about Fulham?" — and until 2026-09-07 that got silently extracted as a
 * preference and answered with nothing, because the extractor's reply is
 * discarded by design. So a named area now routes to a real answer built
 * from what we have measured (lib/agentChat/areaBrief.ts), and the reply is
 * SHOWN.
 *
 * DURING setup it must not: question one is literally "which areas do you
 * love", so every answer names an area, and treating those as questions
 * would replace the entire setup conversation with area reviews.
 *
 * The extraction still runs either way — if they say "Fulham looks good but
 * I've gone off Zone 1", the Zone 1 part is still worth catching. It just
 * lands as a pending change to confirm rather than a silent rewrite.
 */
async function answerOrExtract(
  set: SetState,
  get: GetState,
  said: string,
  /** Captured by send() when the message went out — see the note there for
   *  why this cannot be read from the profile at this point. */
  inSetup: boolean,
  /** This message named somewhere ambiguous and a card is already on
   *  screen asking which one. See send(). */
  askedToClarify: boolean,
): Promise<void> {
  /**
   * Nothing to answer about while a clarification for this very message is
   * on screen. The card IS the reply; the answer comes once they have said
   * which place they meant, and it is then an answer about the right one.
   */
  const named = inSetup || askedToClarify ? [] : areasAskedAbout(said);
  /**
   * A follow-up with no area named carries on from the last one. Gated on
   * it LOOKING like a question, so "we're moving in March" is not answered
   * with a report on Angel — a statement is not a query, and answering one
   * as though it were is how an assistant becomes tiring.
   */
  /**
   * A food, drink or café message that names no area is about the area
   * already under discussion, however it is phrased (Nick, 2026-10-01:
   * "I love pizza whats on offer here" got no answer and an Update-your-map
   * card). It cannot be a preference about an AREA, because it names none,
   * so answering it is always the right reading. One that DOES name an area
   * and reads as a statement ("we loved Peckham, especially the pubs") is
   * still extracted below.
   */
  const aboutLastArea = named.length === 0 && !inSetup && !askedToClarify && Boolean(get().lastArea)
    && (isQuestion(said) || friendTopic(said) !== null || asksForARoute(said));
  const followUp = aboutLastArea ? [get().lastArea as string] : [];
  const areas = named.length > 0 ? named : followUp;

  /**
   * A route question, asked outright or carried on: "what about Tooting?"
   * straight after a route answer means the route from Tooting.
   */
  /**
   * "Which of the Maloca areas and the ones I love is busiest at night?"
   * (Nick, 2026-10-03) - a question about the whole list, not one area.
   */
  const rankTheme = inSetup || askedToClarify ? null : rankingAsked(said);
  // "What about the rest?" straight after a podium: places 4 onwards.
  const lastRanking = get().lastRanking;
  const restOfRanking = !rankTheme && !inSetup && get().lastTopic === 'ranking' && lastRanking
    && named.length === 0 && asksForTheRest(said) ? lastRanking : null;

  const routeQuestion = !rankTheme && !inSetup && areas.length > 0
    && (asksForARoute(said) || (get().lastTopic === 'route' && named.length > 0 && swapsThePlace(said)
      && !friendTopic(said) && !asksForAnAmenity(said) && !asksForAnOuting(said)));
  // "Actually I just have an afternoon" straight after a day plan: the same
  // area, re-planned for the new hours (Nick, 2026-10-03).
  const lastDay = get().lastDay;
  const dayChange = !rankTheme && !restOfRanking && !inSetup && get().lastTopic === 'day' && lastDay
    && named.length === 0 && changesTheDay(said) ? lastDay : null;

  // Anything else moves the conversation on from routes, rankings and days.
  if (!routeQuestion && !rankTheme && !restOfRanking && !dayChange && get().lastTopic) set({ lastTopic: null });

  if (rankTheme) {
    await answerWithRanking(set, rankTheme, said);
  } else if (dayChange) {
    await planDay(set, get, dayChange.area, said, dayChange.said);
  } else if (restOfRanking) {
    set((state) => ({
      messages: [...state.messages, { id: newId(), role: 'assistant' as const, text: describeTheRest(restOfRanking) }],
      status: 'idle' as const,
      error: null,
    }));
  } else if (areas.length > 0 && asksForAnOuting(said)) {
    /**
     * "Plan me a chill Sunday in Queens Park" is a different question from
     * "what is Queens Park like?", and it used to be answered as though it
     * were the same one — out of a brief full of medians and Ofsted
     * ratings, which cannot tell anybody where to get lunch.
     */
    await planDay(set, get, areas[0], said);
  } else if (routeQuestion) {
    /**
     * "What's our route to work from Earlsfield?" (Nick, 2026-10-02) got
     * "I don't have route level transport data". It has now: the actual
     * TfL route for each person, said by name, drawn as a map.
     */
    await answerWithRoutes(set, areas[0]);
  } else if (areas.length >= 2 && friendTopic(said) && !isServiceAmenity(said)) {
    /**
     * "Compare the pub scene of Earlsfield to East Dulwich - which has a
     * better vibe for what I'm looking for?" (Nick, 2026-10-02). It got
     * four pubs in one of them. Now both are looked up and compared,
     * against what they told us they want.
     */
    await answerComparingAsFriend(set, areas.slice(0, 3), said, friendTopic(said) as FriendTopic);
  } else if (areas.length === 1 && friendTopic(said) && !isServiceAmenity(said)) {
    /**
     * "What's the high street like?", "any good pubs?", "where's good to
     * eat?" - answered like a friend who knows the place, built on real
     * named places (Nick, 2026-10-01). Food, drink and cafés used to go to
     * the amenity list; they come here now. GPs, gyms, vets and the like
     * still get the list, which is the right shape for them.
     */
    await answerAsFriend(set, areas[0], said, friendTopic(said) as FriendTopic);
  } else if (areas.length > 0 && asksForAnAmenity(said)) {
    /**
     * "Where are the GP surgeries in Tooting Broadway?" names an area and
     * looks like a question, so until 2026-09-23 it went to the area
     * answer — whose brief holds no GPs, no gyms and no shops at all. The
     * model filled the gap from its own memory and invented surgeries,
     * with street names. Looked up for real now, or not answered.
     *
     * Checked BEFORE answerAboutAreas for exactly that reason: the area
     * path will confidently answer this, which is the whole problem.
     */
    await answerWithAmenities(set, areas[0], said);
  } else if (areas.length > 0) {
    await answerAboutAreas(set, get, areas, said);
  } else if (!inSetup && (isQuestion(said) || asksForAnOuting(said))) {
    /**
     * A question naming no area used to end here, in silence — the
     * extractor's reply is discarded, so nothing reached the thread at all
     * (audit, 2026-09-08). Six of fourteen realistic questions fell into
     * that hole, and silence is indistinguishable from a broken app.
     *
     * Most of them are questions about their own shortlist, which the app
     * can answer precisely. Gated on it looking like a question so a
     * statement — "we're moving in March" — is still just extracted.
     *
     * A request for a day out counts too, even though it is an imperative
     * rather than a question. "Plan me a chill Sunday in Queen's Park" has
     * no question mark and starts with a verb, so it failed both tests and
     * got silence — the worst answer available (Nick, 2026-09-14).
     */
    await answerGenerally(set, get, said);
  }

  /**
   * A request for a day out is NOT a change to their profile.
   *
   * "Plan me a Sunday in Fulham" names an area, and the extractor read
   * that as wanting Fulham added — so every itinerary arrived with a card
   * asking to save something nobody had asked to change (Nick,
   * 2026-09-14). The card is right when somebody says what they like; it
   * is noise when they asked where to get lunch.
   *
   * An amenity question is the same shape and joined it on 2026-09-23:
   * "where's the nearest gym in Balham" names Balham without saying a word
   * about wanting to live there.
   *
   * And then so did EVERY question, later the same day. The card was
   * appearing after almost every answer, offering to save things the
   * household had already said (Nick: "it consistently still pops up the
   * update map tap card with each answer"). The cause is not the diff —
   * that does compare against the stored profile — it is that the prompt
   * asks the model to restate its whole understanding every turn, so a
   * slight REWORDING of an answer given days ago reads as new
   * information. "What you like: ..." came back as a proposed change over
   * and over.
   *
   * A question is not a change to a profile. Asking what Tooting is like
   * says nothing about wanting to live there, so there is nothing to
   * extract and nothing to confirm. Statements still extract, which is
   * where a real preference actually arrives — "we loved Peckham when we
   * visited" is the shape that should move the map.
   *
   * It also halves the cost of every question. Until now an area question
   * cost two model calls: the answer, and an extraction whose reply is
   * explicitly discarded.
   *
   * Setup is exempt. There the typed answers ARE the profile, and every
   * one of them is a reply to a question we asked.
   */
  const worthExtracting = inSetup
    || (!isQuestion(said) && !asksForAnOuting(said) && !asksForAnAmenity(said) && !routeQuestion && !rankTheme && !restOfRanking && !dayChange && !aboutLastArea);
  if (worthExtracting) await extract(set, get, inSetup);
}

/**
 * Answers from the brief, and says so honestly when the brief is thin.
 *
 * A failure here must not take the conversation down with it: the
 * extraction still runs afterwards either way, and someone who asked about
 * Fulham and got a network error should see that, not silence.
 */
/**
 * Answers from the household's own hunt rather than from one area.
 *
 * Same contract as the area answer: the brief is the only source, the
 * reply is shown, and anything the model adds from its own knowledge is
 * split into `unmeasured` and labelled.
 */
async function answerGenerally(set: SetState, get: GetState, said: string): Promise<void> {
  const profile = useProfileStore.getState().profile;
  const entries = useShortlistStore.getState().entries;
  const brief = shortlistBrief({
    profile,
    areas: entries.map((e) => e.neighbourhood),
    journeyTimes: await journeyTimes(),
  });

  set({ status: 'sending' });
  try {
    const reply = await callAgentProse(GENERAL_ANSWER_PROMPT, [
      { role: 'user', content: `THEY ASKED: ${said}\n\n${brief}` },
    ]);
    // Returning here used to leave status on 'sending' FOREVER — and the
    // send button is disabled precisely while sending, so the chat locked
    // up with a greyed-out button and no message (Nick, 2026-09-14). The
    // area path next door always handled this; this one silently did not.
    if (!reply.answer && !reply.unmeasured) {
      set({ status: 'error', error: 'Maloca came back empty.' });
      return;
    }
    set((state) => ({
      messages: [
        ...state.messages,
        { id: newId(), role: 'assistant' as const, text: weaveReply(reply) },
      ],
      status: 'idle' as const,
      error: null,
    }));
    if (!reply.coveredByData) void recordUnanswered(said, 'general');
  } catch (err) {
    set({
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not answer that',
    });
  }
}

/**
 * A day out in an area, built from their own answers.
 *
 * Two halves that must not be confused. The REASONS come from
 * lib/itinerary.ts, which reads the same fixed preference tags that chose
 * the area in the first place — so the day out and the suggestion agree
 * about what somebody said they liked. The PLACES come from Google, are
 * shown once and stored nowhere, because their terms permit caching a
 * place_id and essentially nothing else.
 *
 * No model call at all. The wording is ours, the reasons are ours, and the
 * venues are looked up — so this cannot invent a café that does not exist,
 * which is exactly the failure an AI-written itinerary invites.
 */
/**
 * Local amenities, looked up rather than recalled.
 *
 * Shares planOuting's shape deliberately: the same neighbourhood-centre
 * resolution, the same ten minute walk enforced against each result's own
 * coordinates, the same cards, and — the important half — NO model call.
 * The sentence is ours and the places are Google's, so this cannot invent
 * a surgery.
 *
 * `withRating` only when they asked for the BEST one. Ratings put the
 * request in Places' Enterprise bucket, which has a fifth of the free
 * monthly allowance the Pro one has, so "where is the nearest pharmacy"
 * must not pay for a number it is not going to print.
 */
/**
 * Places as the swipeable photo cards (Nick, 2026-10-01: every list of
 * places looks like option A, not the old full-width cards). Photos are
 * fetched in parallel; a missing one is a plainer card, never an error.
 */
async function toCards(
  places: Awaited<ReturnType<typeof searchPlaces>>,
  from: { name: string; lat: number; lng: number },
): Promise<PlaceCard[]> {
  return Promise.all(
    places.map(async (p) =>
      toPlaceCard(p, from, p.photoName ? await resolvePhoto(p.photoName).catch(() => null) : null),
    ),
  );
}

/** A practical service (GP, gym, vet...) rather than food, drink or a café. */
function isServiceAmenity(said: string): boolean {
  const ask = asksForAnAmenity(said);
  return Boolean(ask && !['restaurants', 'cafés', 'pubs', 'takeaways'].includes(ask.label));
}

type RatedPlaces = Awaited<ReturnType<typeof searchPlaces>>;

/**
 * Google's rated places for a subject near an area's station. A failed or
 * capped lookup is not a failed answer: OpenStreetMap's named places still
 * carry it, so this returns nothing rather than throwing.
 */
async function ratedPlacesFor(area: string, topic: FriendTopic, said: string, keep = 5): Promise<RatedPlaces> {
  const at = areaCoords(area);
  const query = googleQueryFor(topic, said);
  if (!query || !at) return [];
  try {
    // The area's name goes in the query and the results are then FENCED to
    // a ten minute walk. Google treats the location as a preference, not
    // a boundary, so "restaurant" near Earlsfield returned a place in
    // Wimbledon, 36 minutes away (Nick, 2026-10-01). pickNearby is the
    // same fence the amenity lists and day-out planner already use.
    const found = await searchPlaces(`${query} in ${area}`, at, { radius: WALK_RADIUS_M, withRating: true, maxResults: 10 });
    return pickNearby(keepRated(found, topic), at, keep);
  } catch {
    return [];
  }
}

/** The places as swipeable cards, photos fetched alongside. */
function cardsFor(area: string, rated: RatedPlaces): Promise<PlaceCard[]> {
  const at = areaCoords(area);
  if (!at) return Promise.resolve([]);
  const station = { name: area, lat: at.lat, lng: at.lng };
  return Promise.all(
    rated.map(async (p) =>
      toPlaceCard(p, station, p.photoName ? await resolvePhoto(p.photoName).catch(() => null) : null),
    ),
  );
}

/** What the household has told us it wants, as the lines a prompt reads. */
function wantedFor(profile: Profile): string {
  const summary = summariseConversation(profile);
  return [
    summary.loves.length ? `Areas they love: ${summary.loves.join(', ')}` : null,
    summary.reason ? `What they like about them: "${summary.reason}"` : null,
    ...summary.lines.map((l: SummaryLine) => `${l.label}: ${l.value}`),
  ].filter(Boolean).join('\n');
}

/**
 * Two or three areas on one subject, compared for THIS household: each
 * area's real places looked up, then which suits them better and why.
 * Cards for every area underneath, each saying which station it is near.
 */
async function answerComparingAsFriend(
  set: SetState,
  areas: string[],
  said: string,
  topic: FriendTopic,
): Promise<void> {
  set({ status: 'sending' });
  const found = await Promise.all(areas.map((a) => ratedPlacesFor(a, topic, said, 4)));
  const briefs = areas.map((a, i) => placeBrief(a, topic, found[i])).filter((b): b is string => Boolean(b));
  if (!briefs.length) {
    set({ status: 'idle' });
    return answerAboutAreas(set, useAgentChatStore.getState, areas, said);
  }
  const profile = useProfileStore.getState().profile;
  try {
    const [reply, cardSets] = await Promise.all([
      callAgentProse(FRIEND_COMPARE_PROMPT, [
        {
          role: 'user',
          content: `THEY ASKED: ${said}\nAREAS: ${areas.join(', ')}\n\nWHAT THEY TOLD US THEY WANT:\n${wantedFor(profile) || '(nothing recorded yet)'}\n\n${briefs.join('\n\n')}`,
        },
      ]),
      Promise.all(areas.map((a, i) => cardsFor(a, found[i]))),
    ]);
    if (!reply.answer) {
      set({ status: 'error', error: 'Maloca came back empty.' });
      return;
    }
    const cards = cardSets.flat();
    set((state) => ({
      messages: [
        ...state.messages,
        { id: newId(), role: 'assistant' as const, text: reply.answer, places: cards.length ? cards : undefined },
      ],
      status: 'idle' as const,
      error: null,
      lastArea: areas[0],
      lastAmenity: null,
    }));
  } catch (err) {
    set({ status: 'error', error: err instanceof Error ? err.message : 'Could not answer that' });
  }
}

async function answerAsFriend(set: SetState, area: string, said: string, topic: FriendTopic): Promise<void> {
  set({ status: 'sending' });
  const at = areaCoords(area);
  const rated = await ratedPlacesFor(area, topic, said);
  const brief = placeBrief(area, topic, rated);
  if (!brief) {
    set({ status: 'idle' });
    return answerAboutAreas(set, useAgentChatStore.getState, [area], said);
  }
  try {
    // Photos are fetched alongside the answer, not after it, so the cards
    // cost no extra wait. A failed photo is a plainer card, not an error.
    const cardsPromise = at ? cardsFor(area, rated) : Promise.resolve<PlaceCard[]>([]);
    const [reply, cards] = await Promise.all([
      callAgentProse(FRIEND_PROMPT, [
        { role: 'user', content: `THEY ASKED: ${said}\nAREA: ${area}\n\n${brief}` },
      ]),
      cardsPromise,
    ]);
    if (!reply.answer) {
      set({ status: 'error', error: 'Maloca came back empty.' });
      return;
    }
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: newId(),
          role: 'assistant' as const,
          text: reply.answer,
          // The well-rated places it drew on, as swipeable cards.
          places: cards.length ? cards : undefined,
          social: socialLinks(area, topic, cuisineAsked(said)),
        },
      ],
      status: 'idle' as const,
      error: null,
      lastArea: area,
      lastAmenity: null,
    }));
  } catch (err) {
    set({ status: 'error', error: err instanceof Error ? err.message : 'Could not answer that' });
  }
}

async function answerWithAmenities(set: SetState, area: string, said: string): Promise<void> {
  const ask = asksForAnAmenity(said);
  if (!ask) return;

  const named = placeNamedIn(said);
  const label = named?.name ?? area;
  const at = named ? { lat: named.lat, lng: named.lng } : areaCoords(area);
  if (!at) {
    set({ status: 'error', error: `I don't know exactly where ${label} is on the map.` });
    return;
  }

  set({ status: 'sending' });
  if (ask.brand) {
    /**
     * A named business: search for THAT name, keep only results that are
     * it, nearest first, at whatever distance (Nick, 2026-10-01: "closest
     * Third Space gym" near Earlsfield returned Nuffield Health). The ten
     * minute fence does not apply: "the closest Third Space" may well be a
     * bus ride away, and the answer says how far.
     */
    try {
      const found = await searchPlaces(brandDisplay(ask.brand), at, { radius: 3000, maxResults: 10 });
      const branches = pickBrand(found, at, ask.brand);
      const cards = await toCards(branches, { name: label, lat: at.lat, lng: at.lng });
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: newId(),
            role: 'assistant' as const,
            text: composeBrand(label, ask.brand as string, branches, at),
            places: cards.length ? cards : undefined,
          },
        ],
        status: 'idle' as const,
        error: null,
        lastArea: area,
        lastAmenity: ask,
      }));
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof PlacesUnavailableError ? err.message : err instanceof Error ? err.message : 'Something went wrong',
      });
    }
    return;
  }
  try {
    const found = await searchPlaces(ask.query, at, {
      radius: WALK_RADIUS_M,
      withRating: ask.wantsBest,
    });
    const nearby = pickNearby(found, at);
    const cards = await toCards(nearby, { name: label, lat: at.lat, lng: at.lng });
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: newId(),
          role: 'assistant' as const,
          text: composeAmenities(label, ask, nearby),
          places: cards.length ? cards : undefined,
        },
      ],
      status: 'idle' as const,
      error: null,
      lastArea: area,
      // Kept, so the next "and what about Tooting?" stays on the subject.
      lastAmenity: ask,
    }));
  } catch (err) {
    set({
      status: 'error',
      error: err instanceof PlacesUnavailableError
        ? "I've looked up a lot of places this month, so I can't check that one right now."
        : err instanceof Error ? err.message : 'Something went wrong',
    });
  }
}

/**
 * Their loved areas and/or Maloca's picks, ranked on one thing from the
 * app's own measurements (lib/areaRanking.ts), shown as a podium.
 */
async function answerWithRanking(set: SetState, theme: ThemeId, said: string): Promise<void> {
  const profile = useProfileStore.getState().profile;
  const want = whichSets(said);
  const loved = want.love
    ? Object.entries(profile.areaCards ?? {}).filter(([, v]) => v === 'love').map(([name]) => name)
    : [];
  const picks = want.pick
    ? useShortlistStore.getState().entries.map((e) => e.neighbourhood).filter((n) => !loved.includes(n))
    : [];
  const areas: { name: string; kind: RankKind }[] = [
    ...loved.map((name) => ({ name, kind: 'love' as const })),
    ...picks.map((name) => ({ name, kind: 'pick' as const })),
  ];
  if (areas.length < 2) {
    set((state) => ({
      messages: [...state.messages, {
        id: newId(),
        role: 'assistant' as const,
        text: areas.length
          ? 'I need at least two areas to rank. Love a few more on the map, or let Maloca suggest some.'
          : 'Love a few areas on the map, or let Maloca suggest some, and I can rank them for you.',
      }],
      status: 'idle' as const,
      error: null,
    }));
    return;
  }
  const ranking = rankAreas(theme, areas, { profile, journeyTimes: theme === 'commute' ? await journeyTimes() : undefined });
  set((state) => ({
    messages: [...state.messages, {
      id: newId(),
      role: 'assistant' as const,
      text: describeRanking(ranking),
      ranking: ranking.rows.length >= 2 ? ranking : undefined,
    }],
    status: 'idle' as const,
    error: null,
    lastAmenity: null,
    lastTopic: 'ranking' as const,
    lastRanking: ranking,
  }));
}

/**
 * How each person gets to work from an area: the fastest TfL route, by
 * name, with a map (lib/routes.ts, components/RouteCard.tsx). Everyone's
 * route is looked up at once; anyone whose lookup fails is simply left
 * out, and if nobody's worked the answer says so rather than guessing.
 */
async function answerWithRoutes(set: SetState, area: string): Promise<void> {
  const members = useProfileStore.getState().profile.members ?? [];
  if (!members.length) {
    set({ status: 'error', error: 'Add where you work first, and I can show you the route.' });
    return;
  }
  set({ status: 'sending' });
  const found = await Promise.allSettled(members.map((m) => fetchRoute(area, m.workId)));
  const people: PersonRoute[] = found.flatMap((r, i) =>
    r.status === 'fulfilled'
      ? [{ name: members[i].name?.trim() || `Person ${i + 1}`, office: members[i].workLabel || members[i].workId, route: r.value }]
      : [],
  );
  if (!people.length) {
    const why = found.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason;
    set({ status: 'error', error: why instanceof RouteUnavailableError ? why.message : "I couldn't get the route from TfL just now." });
    return;
  }
  set((state) => ({
    messages: [
      ...state.messages,
      { id: newId(), role: 'assistant' as const, text: describeRoutes(area, people), route: { area, people } },
    ],
    status: 'idle' as const,
    error: null,
    lastArea: area,
    lastTopic: 'route' as const,
  }));
}

/**
 * A day out, built from what they like doing, for the hours they have
 * (lib/dayPlan.ts), each stop a real, well-rated place a short walk from
 * the last, shown as a swipeable day strip (components/DayCard.tsx).
 *
 * `previous` is the request a follow-up is changing ("actually I just
 * have an afternoon"): its activities carry over, the new hours win, and
 * anything they said no to is dropped.
 */
async function planDay(set: SetState, get: GetState, area: string, said: string, previous?: string): Promise<void> {
  const profile = useProfileStore.getState().profile;

  /**
   * Prefer the real neighbourhood over the station: "a day in Fulham
   * Broadway" describes a ticket hall. The OSM label gives the name a
   * Londoner uses and the middle of the place, so the ten minute walk is
   * measured from where somebody would actually be standing.
   */
  const named = placeNamedIn(said) ?? (previous ? placeNamedIn(previous) : null);
  const label = named?.name ?? area;
  const at = named ? { lat: named.lat, lng: named.lng } : areaCoords(area);
  if (!at) {
    set({ status: 'error', error: `I don't know exactly where ${label} is on the map.` });
    return;
  }

  const window = previous && !hasTimeWords(said) ? parseWindow(previous) : parseWindow(said);
  const dropped = excludedIn(said);
  const asked = [...activitiesIn(said), ...(previous ? activitiesIn(previous) : [])]
    .filter((a, i, all) => all.indexOf(a) === i && !dropped.includes(a));
  // What they have told us they like: everything they have typed, and what
  // they said about the areas they love.
  const summary = summariseConversation(profile);
  const history = [
    ...get().messages.filter((m) => m.role === 'user').map((m) => m.text),
    summary.reason ?? '',
  ].join(' \n ');
  const likes = activitiesIn(history).filter((a) => !dropped.includes(a));
  const fromTags = activitiesFromTags(profile.lifestyle?.preferenceTags ?? []).filter((a) => !dropped.includes(a));
  const slots = planSlots(window, asked, likes, fromTags);

  set({ status: 'sending' });
  try {
    const stops: DayStopCard[] = [];
    const used = new Set<string>();
    let prev: { lat: number; lng: number } | null = null;
    for (const slot of slots) {
      const spec = ACTIVITIES[slot.activity];
      const dinner = slot.activity === 'dinner';
      const food = ['brunch', 'coffee', 'lunch', 'dinner'].includes(slot.activity);
      /**
       * Rated, which is Google's Enterprise tier - capped per household
       * and overall by the proxy. Website and phone ride along for dinner
       * only, at that same tier, for "Book a table".
       */
      let pick: (Awaited<ReturnType<typeof searchPlaces>>[number] & { lat: number; lng: number }) | null = null;
      if (slot.activity === 'walk') {
        /**
         * A walk goes to a REAL green space from the app's own park data,
         * looked up on Google by name for its photo and rating - never a
         * search for "park", which near Tooting Broadway found Mellison Rd
         * Pocket Park (Nick, 2026-10-03). A common is worth a longer walk
         * than a café; nowhere proper in reach means no walk at all.
         */
        for (const green of greenSpacesNear(at).slice(0, 2)) {
          const found = await searchPlaces(green.name, at, { radius: 2500, withRating: true, maxResults: 3 });
          const first = green.name.toLowerCase().split(/\s+/)[0];
          const near = found.filter((p): p is typeof p & { lat: number; lng: number } =>
            p.lat !== null && p.lng !== null && isProperPark(p.name) && !used.has(p.id)
            && walkBetween(at, { lat: p.lat as number, lng: p.lng as number }) <= PARK_WALK_MINS);
          pick = near.find((p) => p.name.toLowerCase().includes(first)) ?? null;
          if (pick) break;
        }
        if (!pick) continue;
      } else {
        const found = await searchPlaces(spec.query, at, {
          radius: WALK_RADIUS_M,
          withRating: true,
          withContact: dinner,
          maxResults: 8,
        });
        const usable = (food ? keepRated(found, 'food') : found)
          .filter((p): p is typeof p & { lat: number; lng: number } => p.lat !== null && p.lng !== null && isProperPark(p.name));
        pick = choosePlace(usable, at, prev, used);
        if (!pick) continue;
      }
      used.add(pick.id);
      const mapsUrl = mapsLink(pick.id, pick.name);
      stops.push({
        activity: slot.activity,
        label: spec.label,
        time: clock(slot.at),
        at: slot.at,
        placeId: pick.id,
        name: pick.name,
        kind: typeLabel(pick.primaryType),
        rating: pick.rating,
        // One photo per stop actually shown - a separate charge each, and
        // allowed to fail into a plainer card.
        photoUrl: pick.photoName ? await resolvePhoto(pick.photoName).catch(() => null) : null,
        mapsUrl,
        walkFromPrev: prev ? walkBetween(prev, pick) : null,
        bookUrl: dinner ? pick.website ?? mapsUrl : null,
        phone: dinner ? pick.phone ?? null : null,
      });
      prev = pick;
    }

    const day: DayCardData = {
      title: dayTitle(label, window),
      subtitle: daySubtitle(stops.map((x) => ({ activity: x.activity, at: x.at }))),
      start: window.start,
      end: window.end,
      stops,
    };
    set((state) => ({
      messages: [
        ...state.messages,
        { id: newId(), role: 'assistant' as const, text: describeDay(label, day), day: stops.length ? day : undefined },
      ],
      status: 'idle' as const,
      error: null,
      lastArea: area,
      lastTopic: 'day' as const,
      lastDay: { area, said: previous ? `${previous} ${said}` : said },
    }));
  } catch (err) {
    set({
      status: 'error',
      error: err instanceof PlacesUnavailableError
        ? err.message
        : err instanceof Error ? err.message : 'Could not plan that',
    });
  }
}

async function answerAboutAreas(
  set: SetState,
  get: GetState,
  areas: string[],
  said: string,
): Promise<void> {
  const profile = useProfileStore.getState().profile;
  /**
   * Journey times are passed now. They never were, so buildAreaBrief's
   * third argument sat unused and its commute-conflict check was dead code
   * — the Agent could not answer "how long is the commute from there?"
   * about the one thing this app is built on (audit, 2026-09-08).
   */
  /**
   * One brief per area named. "Is Balham or Tooting better for schools?"
   * used to be answered about ONE of them, chosen by name length, so the
   * reply was about the area mentioned second and the comparison was never
   * made (audit, 2026-09-08).
   */
  const jt = await journeyTimes();
  const briefs = areas.map((a) => buildAreaBrief(a, profile, jt));
  const wanted = wantedFor(profile);

  set({ status: 'sending' });
  try {
    const reply = await callAgentProse(AREA_ANSWER_PROMPT, [
      {
        role: 'user',
        content: `THEY ASKED: ${said}\n\nWHAT THEY TOLD US THEY WANT:\n${wanted || '(nothing recorded yet)'}\n\n${
          briefs.length > 1
            ? `They named TWO areas — compare them, and say which suits what they told us better.\n\n${briefs.map(briefForPrompt).join('\n\n---\n\n')}`
            : `BRIEF:\n${briefForPrompt(briefs[0])}`
        }`,
      },
    ]);
    // Nothing measured AND nothing recalled is a failure, not an answer.
    if (!reply.answer && !reply.unmeasured) {
      set({ status: 'error', error: 'Maloca came back empty.' });
      return;
    }
    set((state) => ({
      messages: [
        ...state.messages,
        { id: newId(), role: 'assistant' as const, text: weaveReply(reply) },
      ],
      status: 'idle' as const,
      error: null,
      lastArea: areas[0],
      // The subject really has moved on, so a later "and what about
      // Peckham?" must not silently still be about gyms.
      lastAmenity: null,
    }));
    // One row per area, so a comparison that failed on both is counted as
    // two gaps rather than one — the tally is about subjects, not turns.
    for (const b of briefs) recordDataGap(b.area, b.missing, Boolean(reply.unmeasured));
    // The wording itself, scrubbed — only when our data could not answer.
    if (!reply.coveredByData) void recordUnanswered(said, areas.length > 1 ? 'compare' : 'area', areas);
  } catch (err) {
    set({
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not look that area up',
    });
  }
}

async function extract(
  set: (partial: Partial<AgentChatState> | ((s: AgentChatState) => Partial<AgentChatState>)) => void,
  get: () => AgentChatState,
  /** Captured by send(), not read from the profile here — see send(). */
  inSetup: boolean,
): Promise<void> {
  const epoch = setupEpoch;
  {
    set({ error: null });

    // Read back post-update so the just-added user turn is included in what
    // gets sent — Zustand's set() is synchronous, so this is safe.
    /**
     * Everything said so far, ENDING ON THE USER.
     *
     * send() now puts the next scripted question up immediately, so by the
     * time this runs the thread ends with an assistant turn. Sending that
     * is a last-assistant-turn prefill, which Sonnet 5 rejects outright —
     * "AI proxy error (400)" the moment the Agent was restarted (Nick,
     * 2026-08-31). It was invisible before the instant-question change,
     * because the reply used to be appended AFTER the call returned.
     *
     * Trailing assistant turns are dropped rather than the whole history
     * rebuilt: the question we have just asked has not been answered yet,
     * so the model loses nothing by not seeing it as the final word.
     */
    const history: ChatMessage[] = endOnUser(get().messages.filter((m) => !isSeed(m.id)))
      .map((m) => ({ role: m.role, content: m.text }));

    // Nothing from the user yet — there is nothing to extract from.
    if (history.length === 0) return;

    /**
     * "Clapham" could mean five different stations, and they are not
     * interchangeable — from the Common the engine suggests Highbury and
     * Kennington, from the Junction it suggests Wandsworth Town and Balham.
     * Picking one silently would decide something the user should decide.
     *
     * The note rides along with THIS message rather than the system prompt,
     * because it depends on what they just said, and it is checked against
     * their own words rather than the parsed profile so the question can be
     * asked immediately instead of a turn late. It also catches a misheard
     * place name at the cheapest possible moment — before it becomes the
     * anchor for every suggestion that follows.
     *
     * Asked once per name. Being queried twice about the same word would
     * read as not listening.
     */
    /**
     * They named somewhere we do not cover — Amsterdam, Manchester, or
     * Liverpool meaning the city. Left alone this fell through to the
     * expensive model-led path with no anchor and no explanation, so the
     * user never learned why the answers got worse. The Agent says so
     * instead. Checked against the parsed profile because it needs the
     * model to have extracted a place name first.
     */
    const stranded = unresolvedAreas(useProfileStore.getState().profile.areaCards);
    const strandedKey = stranded.join('|');
    if (stranded.length && !get().clarified.includes(strandedKey)) {
      const last = history[history.length - 1];
      if (last?.role === 'user') last.content = `${last.content}\n\n${outsideLondonNote(stranded)}`;
      set((state) => ({ clarified: [...state.clarified, strandedKey] }));
    }

    try {
      const result = await callAgentChat(AGENT_SYSTEM_PROMPT, history);
      // Read from a conversation that Back has since changed: not a word of
      // it applies, including "the conversation is complete".
      if (inSetup && epoch !== setupEpoch) {
        set({ status: 'idle' });
        return;
      }
      // result.reply is deliberately DROPPED. The app has already asked the
      // next question from the local script; showing the model's version of
      // it too would ask twice.
      //
      // complete is OR-ed, never assigned: send() may already have ended the
      // conversation by running out of script, and a late extraction must
      // not reopen it.
      set((state) => ({
        status: 'idle',
        complete: state.complete || result.conversationComplete === true,
      }));
      // Every turn restates the model's full current understanding (see
      // prompt.ts), so a plain merge is correct — no need to diff turns.
      //
      // anchorReason travels WITH the lifestyle patch, not beside it. It is
      // the answer to "what is it about there that you like?" — the question
      // that separates someone who means Clapham Common from someone who
      // means the High Street on a Friday — and it decides which
      // measurements the similarity engine weights.
      //
      // It was parsed, schema'd and read by the ranking, but nothing ever
      // stored it, so question two was asked, answered and silently
      // discarded (found 2026-08-28). Exactly the failure mode this rebuild
      // exists to remove, so it is worth the extra line.
      const lifestylePatch = {
        ...result.lifestyle,
        ...(result.anchorReason ? { anchorReason: result.anchorReason } : {}),
        ...(result.preferenceTags?.length ? { preferenceTags: result.preferenceTags } : {}),
      };
      /**
       * The model is told to use each area's commonly-known name and
       * obeys, which loses precision: "Clapham Common" comes back as
       * "Clapham", and that resolves to Clapham North — the High Street
       * end, not the Common someone described.
       *
       * Their own words are the tiebreak. Checked against every message
       * they have sent, not just the last, because the area is usually
       * named in answer one and re-stated by the model on every turn
       * afterwards.
       */
      const saidByUser = get()
        .messages.filter((m) => m.role === 'user')
        .map((m) => m.text);
      const cards = Object.keys(result.areaCards).length > 0
        ? sharpenAreaNames(result.areaCards, saidByUser)!
        : {};
      // "South East London" is not a place anything can be matched to. The
      // model is told not to write one down, and this is the backstop:
      // the region buttons are how it gets pinned to real places.
      for (const [name, verdict] of Object.entries(cards)) {
        if (verdict === 'love' && isRegionName(name)) delete cards[name];
      }
      // Once they have picked their three, an area they left out stays out.
      const favourites = get().favourites;
      if (inSetup && favourites) {
        for (const [name, verdict] of Object.entries(cards)) {
          if (verdict === 'love' && !favourites.some((f) => sameArea(f, name))) delete cards[name];
        }
      }

      /**
       * DURING SETUP the answers ARE the profile, so they are written
       * straight through — asking someone to confirm the answer they just
       * typed would be absurd.
       *
       * AFTERWARDS they are held for a yes or no (lib/pendingChange.ts).
       * Anything said to the Agent used to rewrite the profile the moment
       * the model parsed it, which silently re-ranked the map: asking "what
       * about Fulham?" is a question, not an instruction, and answering it
       * by quietly reordering someone's shortlist is the app putting words
       * in their mouth (Nick, 2026-09-07).
       */
      const profile = useProfileStore.getState().profile;

      if (inSetup) {
        if (Object.keys(lifestylePatch).length > 0) {
          useProfileStore.getState().updateLifestyle(lifestylePatch);
        }
        if (Object.keys(cards).length > 0) {
          useProfileStore.getState().updateAreaCards(cards);
        }
      } else {
        // Merged with anything already waiting, so a two-message aside does
        // not throw away what the first message established.
        const existing = get().pending;
        const change = describeChange(
          profile,
          { ...(existing?.lifestyle ?? {}), ...lifestylePatch },
          { ...(existing?.areaCards ?? {}), ...cards },
        );
        set({ pending: change });
      }
    } catch (err) {
      // A failure reading a conversation Back has since changed is not news.
      if (inSetup && epoch !== setupEpoch) return;
      set({ status: 'error', error: err instanceof Error ? err.message : 'Something went wrong' });
    }
  }
}
