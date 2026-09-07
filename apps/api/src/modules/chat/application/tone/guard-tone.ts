import type { ChatToken } from "@zelo/domain";
import { boundaryIndices } from "./sentence-split.ts";
import { isClosingTic, matchOpeningTell } from "./tone-tells.ts";
import { shouldAllowTrailingQuestion } from "./cadence.ts";

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
  allowTrailingQuestion: boolean,
): AsyncGenerator<ChatToken, RejectedOpening | null> {
  let pending = "";
  let openingChecked = !validateOpening;
  let emittedAny = false;

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

      const boundaries = boundaryIndices(pending);
      if (boundaries.length >= 2) {
        const cut = boundaries[boundaries.length - 2]! + 1;
        yield { conversationId, delta: pending.slice(0, cut), done: false };
        pending = pending.slice(cut);
        emittedAny = true;
      }
    }
  } catch (error) {
    if (openingChecked && pending.length > 0) {
      yield { conversationId, delta: pending, done: false };
    }
    throw error;
  }

  const heldTail = pending.trim();
  const dropTail =
    emittedAny &&
    heldTail.length > 0 &&
    /[.!?…]$/.test(heldTail) &&
    isClosingTic(pending, allowTrailingQuestion);

  if (!dropTail && pending.length > 0) {
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

  const allowTrailingQuestion = shouldAllowTrailingQuestion(context.priorAssistantReplies);

  const rejected = yield* runAttempt(
    requestReply(),
    context.conversationId,
    true,
    allowTrailingQuestion,
  );

  if (rejected !== null) {
    yield* runAttempt(
      requestReply(context.buildNudge(rejected.rejectedOpening)),
      context.conversationId,
      false,
      allowTrailingQuestion,
    );
  }
}
