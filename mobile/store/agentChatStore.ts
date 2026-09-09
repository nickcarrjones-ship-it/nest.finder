import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AGENT_SYSTEM_PROMPT, AREA_ANSWER_PROMPT, CLOSING_MESSAGE, GENERAL_ANSWER_PROMPT, OPENING_MESSAGE } from '../lib/agentChat/prompt';
import { CHAT_STEPS } from '../lib/setupSteps';
import { callAgentChat, callAgentProse, type ChatMessage } from '../lib/agentChat/client';
import { weaveReply } from '../lib/agentChat/parse';
import { areasAskedAbout, briefForPrompt, buildAreaBrief } from '../lib/agentChat/areaBrief';
import { shortlistBrief } from '../lib/agentChat/shortlistBrief';
import { useShortlistStore } from './shortlistStore';
import { summariseConversation, type SummaryLine } from '../lib/conversationSummary';
import { recordDataGap } from '../lib/dataGapSync';
import { endOnUser } from '../lib/agentChat/parse';
import { useProfileStore } from './profileStore';
import { loadData } from '../lib/dataSource';
import type { JourneyTimes } from '../lib/types';
import { ambiguityInText, outsideLondonNote, sharpenAreaNames, unresolvedAreas } from '../lib/ranking/anchor';
import { describeChange, type PendingChange } from '../lib/pendingChange';

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
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
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
  deferred: [],
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
      clarified: [], deferred: [], followUps: 0, complete: false, pending: null,
      lastArea: null,
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

  send: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();

    // Ambiguity is noted and SAVED FOR THE END — it no longer stands
    // between this answer and the next question.
    deferAmbiguity(trimmed, set, get);

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
      const scripted = !useProfileStore.getState().profile.setupDoneAt;
      const next = CHAT_STEPS[answered];
      return {
        messages: [
          ...state.messages,
          { id: newId(), role: 'user' as const, text: trimmed },
          ...(scripted
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
    chain = chain.then(() => answerOrExtract(set, get, trimmed));
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
): void {
  const options = ambiguityInText(text);
  if (options.length < 2) return; // one match is not ambiguous
  const stem = options[0];
  if (get().clarified.includes(stem)) return;

  set((state) => ({
    clarified: [...state.clarified, stem],
    deferred: [...state.deferred, { stem, options }],
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
function isQuestion(text: string): boolean {
  if (text.includes('?')) return true;
  return /^(what|how|is|are|does|do|would|should|why|which|any|tell me|can you)\b/i.test(text.trim());
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
): Promise<void> {
  const profile = useProfileStore.getState().profile;
  const inSetup = !profile.setupDoneAt;
  const named = inSetup ? [] : areasAskedAbout(said);
  /**
   * A follow-up with no area named carries on from the last one. Gated on
   * it LOOKING like a question, so "we're moving in March" is not answered
   * with a report on Angel — a statement is not a query, and answering one
   * as though it were is how an assistant becomes tiring.
   */
  const followUp = named.length === 0 && !inSetup && get().lastArea && isQuestion(said)
    ? [get().lastArea as string]
    : [];
  const areas = named.length > 0 ? named : followUp;

  if (areas.length > 0) {
    await answerAboutAreas(set, get, areas, said);
  } else if (!inSetup && isQuestion(said)) {
    /**
     * A question naming no area used to end here, in silence — the
     * extractor's reply is discarded, so nothing reached the thread at all
     * (audit, 2026-09-08). Six of fourteen realistic questions fell into
     * that hole, and silence is indistinguishable from a broken app.
     *
     * Most of them are questions about their own shortlist, which the app
     * can answer precisely. Gated on it looking like a question so a
     * statement — "we're moving in March" — is still just extracted.
     */
    await answerGenerally(set, get, said);
  }
  await extract(set, get);
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
    if (!reply.answer && !reply.unmeasured) return;
    set((state) => ({
      messages: [
        ...state.messages,
        { id: newId(), role: 'assistant' as const, text: weaveReply(reply) },
      ],
      status: 'idle' as const,
      error: null,
    }));
  } catch (err) {
    set({
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not answer that',
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
  const summary = summariseConversation(profile);

  const wanted = [
    summary.loves.length ? `Areas they love: ${summary.loves.join(', ')}` : null,
    summary.reason ? `What they like about them: "${summary.reason}"` : null,
    ...summary.lines.map((l: SummaryLine) => `${l.label}: ${l.value}`),
  ].filter(Boolean).join('\n');

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
      set({ status: 'error', error: 'The Agent came back empty.' });
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
    }));
    // One row per area, so a comparison that failed on both is counted as
    // two gaps rather than one — the tally is about subjects, not turns.
    for (const b of briefs) recordDataGap(b.area, b.missing, Boolean(reply.unmeasured));
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
): Promise<void> {
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
      const inSetup = !profile.setupDoneAt;

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
      set({ status: 'error', error: err instanceof Error ? err.message : 'Something went wrong' });
    }
  }
}
