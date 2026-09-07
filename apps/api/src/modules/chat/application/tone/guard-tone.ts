import type { ChatToken } from "@zelo/domain";
import { boundaryIndices } from "./sentence-split.ts";
import { classifyClosingTic, matchOpeningTell } from "./tone-tells.ts";
import { shouldAllowTrailingQuestion } from "./cadence.ts";

const OPENING_CAP = 120;

export type ReplyStreamFactory = (nudge?: string) => AsyncGenerator<ChatToken>;

export type ToneRule =
  | "opening_cliche_regenerated"
  | "opening_cliche_persisted"
  | "rhetorical_reframe"
  | "trailing_question";

export interface ToneGuardContext {
  conversationId: string;
  hasActiveRiskSignal: boolean;
  priorAssistantReplies: string[];
  buildNudge: (offendingOpening: string) => string;
  onTell?: (rule: ToneRule) => void;
}

type OpeningMode = "enforce" | "report";

interface RejectedOpening {
  rejectedOpening: string;
}

async function* runAttempt(
  stream: AsyncGenerator<ChatToken>,
  conversationId: string,
  openingMode: OpeningMode,
  allowTrailingQuestion: boolean,
  onTell?: (rule: ToneRule) => void,
): AsyncGenerator<ChatToken, RejectedOpening | null> {
  let pending = "";
  let openingChecked = false;
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
          if (openingMode === "enforce") {
            await stream.return(undefined);
            return { rejectedOpening: tell };
          }
          onTell?.("opening_cliche_persisted");
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

  if (!openingChecked && pending.length > 0) {
    const boundaries = boundaryIndices(pending);
    const end = boundaries.length > 0 ? boundaries[0]! + 1 : pending.length;
    const tell = matchOpeningTell(pending.slice(0, end));
    if (tell !== null) {
      if (openingMode === "enforce") {
        await stream.return(undefined);
        return { rejectedOpening: tell };
      }
      onTell?.("opening_cliche_persisted");
    }
  }

  const heldTail = pending.trim();
  const closedCleanly = heldTail.length > 0 && /[.!?…]$/.test(heldTail);
  const tic = emittedAny && closedCleanly ? classifyClosingTic(pending) : null;

  if (tic !== null) {
    onTell?.(tic);
  }

  if (!allowTrailingQuestion && closedCleanly && heldTail.endsWith("?")) {
    onTell?.("trailing_question");
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

  const allowTrailingQuestion = shouldAllowTrailingQuestion(context.priorAssistantReplies);

  const rejected = yield* runAttempt(
    requestReply(),
    context.conversationId,
    "enforce",
    allowTrailingQuestion,
    context.onTell,
  );

  if (rejected !== null) {
    context.onTell?.("opening_cliche_regenerated");
    yield* runAttempt(
      requestReply(context.buildNudge(rejected.rejectedOpening)),
      context.conversationId,
      "report",
      allowTrailingQuestion,
      context.onTell,
    );
  }
}
