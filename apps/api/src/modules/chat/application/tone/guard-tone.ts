import type { ChatToken } from "@zelo/domain";
import { boundaryIndices } from "./sentence-split.ts";
import { matchOpeningTell } from "./tone-tells.ts";

const OPENING_CAP = 120;

export type ReplyStreamFactory = (nudge?: string) => AsyncGenerator<ChatToken>;

export interface ToneGuardContext {
  conversationId: string;
  hasActiveRiskSignal: boolean;
  priorAssistantReplies: string[];
  buildNudge: (offendingOpening: string) => string;
}

interface RejectedOpening {
  rejectedOpening: string;
}

async function* runAttempt(
  stream: AsyncGenerator<ChatToken>,
  conversationId: string,
  validateOpening: boolean,
): AsyncGenerator<ChatToken, RejectedOpening | null> {
  let pending = "";
  let openingChecked = !validateOpening;

  try {
    for await (const token of stream) {
      if (token.done) {
        break;
      }
      pending += token.delta;

      if (!openingChecked) {
        const boundaries = boundaryIndices(pending);
        if (boundaries.length === 0 && pending.length < OPENING_CAP) {
          continue;
        }
        const end = boundaries.length > 0 ? boundaries[0]! + 1 : pending.length;
        const tell = matchOpeningTell(pending.slice(0, end));
        if (tell !== null) {
          await stream.return(undefined);
          return { rejectedOpening: tell };
        }
        openingChecked = true;
      }

      if (pending.length > 0) {
        yield { conversationId, delta: pending, done: false };
        pending = "";
      }
    }
  } catch (error) {
    if (openingChecked && pending.length > 0) {
      yield { conversationId, delta: pending, done: false };
    }
    throw error;
  }

  if (pending.length > 0) {
    yield { conversationId, delta: pending, done: false };
  }
  yield { conversationId, delta: "", done: true };
  return null;
}

export async function* guardTone(
  requestReply: ReplyStreamFactory,
  context: ToneGuardContext,
): AsyncGenerator<ChatToken> {
  if (context.hasActiveRiskSignal) {
    yield* requestReply();
    return;
  }

  const rejected = yield* runAttempt(requestReply(), context.conversationId, true);

  if (rejected !== null) {
    yield* runAttempt(
      requestReply(context.buildNudge(rejected.rejectedOpening)),
      context.conversationId,
      false,
    );
  }
}
