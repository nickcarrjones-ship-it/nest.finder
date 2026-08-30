import { create } from 'zustand';
import { AGENT_SYSTEM_PROMPT, OPENING_MESSAGE } from '../lib/agentChat/prompt';
import { callAgentChat, type ChatMessage } from '../lib/agentChat/client';
import { useProfileStore } from './profileStore';
import { ambiguityInText, outsideLondonNote, unresolvedAreas } from '../lib/ranking/anchor';

/**
 * One conversation, shared by both surfaces (the map's compact card and the
 * full-screen Agent tab) — a single store rather than one per screen means
 * opening either shows the same thread, continued.
 *
 * Local-only for now, same as shortlistStore — resets on
 * restart. Persisting this to Firebase is real future work, not this pass.
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

export const useAgentChatStore = create<AgentChatState>((set, get) => ({
  messages: [openingMessage()],
  status: 'idle',
  error: null,
  clarified: [],
  deferred: [],
  followUps: 0,
  complete: false,

  // Clearing `clarified` matters: running the conversation again should ask
  // "which Clapham?" again, since the previous answer went with the profile
  // that was just wiped.
  restart: () =>
    set({
      messages: [openingMessage()], status: 'idle', error: null,
      clarified: [], deferred: [], followUps: 0,
    }),

  send: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    // QUEUED, not dropped. This used to return early while a reply was in
    // flight, which was harmless when the UI blocked between questions —
    // but the card now moves to the next question immediately, so a quick
    // answer would arrive mid-flight and be silently thrown away
    // (2026-08-27). Chaining keeps them in order, which the API needs
    // anyway: each turn sends the whole history, so two in parallel would
    // race to build it.
    // Ambiguity is noted and SAVED FOR THE END — it no longer stands
    // between this answer and the next question.
    deferAmbiguity(trimmed, set, get);
    chain = chain.then(() => deliver(trimmed, set, get));
    return chain;
  },
}));

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

async function deliver(
  trimmed: string,
  set: (partial: Partial<AgentChatState> | ((s: AgentChatState) => Partial<AgentChatState>)) => void,
  get: () => AgentChatState,
): Promise<void> {
  {
    set((state) => ({
      messages: [...state.messages, { id: newId(), role: 'user', text: trimmed }],
      status: 'sending',
      error: null,
    }));

    // Read back post-update so the just-added user turn is included in what
    // gets sent — Zustand's set() is synchronous, so this is safe.
    const history: ChatMessage[] = get()
      .messages.filter((m) => !isSeed(m.id))
      .map((m) => ({ role: m.role, content: m.text }));

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
      set((state) => ({
        messages: [...state.messages, { id: newId(), role: 'assistant', text: result.reply }],
        status: 'idle',
        complete: result.conversationComplete === true,
        // Counted so the question counter does not advance past a real question.
        followUps: state.followUps + (result.needsFollowUp === true ? 1 : 0),
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
      if (Object.keys(lifestylePatch).length > 0) {
        useProfileStore.getState().updateLifestyle(lifestylePatch);
      }
      if (Object.keys(result.areaCards).length > 0) {
        useProfileStore.getState().updateAreaCards(result.areaCards);
      }
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : 'Something went wrong' });
    }
  }
}
