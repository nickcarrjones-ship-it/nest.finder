import { create } from 'zustand';
import { AGENT_SYSTEM_PROMPT, OPENING_MESSAGE } from '../lib/agentChat/prompt';
import { callAgentChat, type ChatMessage } from '../lib/agentChat/client';
import { useProfileStore } from './profileStore';

/**
 * One conversation, shared by both surfaces (the map's compact card and the
 * full-screen Agent tab) — a single store rather than one per screen means
 * opening either shows the same thread, continued.
 *
 * Local-only for now, same as shortlistStore/ratingsStore — resets on
 * restart. Persisting this to Firebase is real future work, not this pass.
 */

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface AgentChatState {
  messages: DisplayMessage[];
  status: 'idle' | 'sending' | 'error';
  error: string | null;
  send: (text: string) => Promise<void>;
}

/** Fixed id for the seeded opener — excluded from what actually gets sent
 *  to the API (see send() below): the Anthropic Messages API requires the
 *  first message in a conversation to be role "user", and this one is
 *  authored locally, not a real assistant turn the model needs to see
 *  again — the system prompt already tells it "you already asked this". */
const SEED_ID = 'seed';

let nextId = 0;
const newId = () => String(nextId++);

export const useAgentChatStore = create<AgentChatState>((set, get) => ({
  messages: [{ id: SEED_ID, role: 'assistant', text: OPENING_MESSAGE }],
  status: 'idle',
  error: null,

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().status === 'sending') return;

    set((state) => ({
      messages: [...state.messages, { id: newId(), role: 'user', text: trimmed }],
      status: 'sending',
      error: null,
    }));

    // Read back post-update so the just-added user turn is included in what
    // gets sent — Zustand's set() is synchronous, so this is safe.
    const history: ChatMessage[] = get()
      .messages.filter((m) => m.id !== SEED_ID)
      .map((m) => ({ role: m.role, content: m.text }));

    try {
      const result = await callAgentChat(AGENT_SYSTEM_PROMPT, history);
      set((state) => ({
        messages: [...state.messages, { id: newId(), role: 'assistant', text: result.reply }],
        status: 'idle',
      }));
      // Every turn restates the model's full current understanding (see
      // prompt.ts), so a plain merge is correct — no need to diff turns.
      if (Object.keys(result.lifestyle).length > 0) {
        useProfileStore.getState().updateLifestyle(result.lifestyle);
      }
      if (Object.keys(result.areaCards).length > 0) {
        useProfileStore.getState().updateAreaCards(result.areaCards);
      }
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : 'Something went wrong' });
    }
  },
}));
