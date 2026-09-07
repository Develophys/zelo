const OPENING_TELLS: RegExp[] = [
  /^(eu )?entendo que(?![\p{L}\p{N}_])/iu,
  /^entendi(?![\p{L}\p{N}_])/iu,
  /^sinto muito(?![\p{L}\p{N}_])/iu,
  /^lamento (muito )?que(?![\p{L}\p{N}_])/iu,
  /^é importante (lembrar|notar|que)(?![\p{L}\p{N}_])/iu,
  /^como (uma? )?(ia|inteligência artificial)(?![\p{L}\p{N}_])/iu,
  /^você (tem razão|está cert[oa])(?![\p{L}\p{N}_])/iu,
  /^(isso )?faz (todo )?sentido(?![\p{L}\p{N}_])/iu,
  /^obrigad[oa] por (compartilhar|confiar|dividir)(?![\p{L}\p{N}_])/iu,
  /^parece que você(?![\p{L}\p{N}_])/iu,
  /^primeiro(,| de tudo)(?![\p{L}\p{N}_])/iu,
  /^que bom que você(?![\p{L}\p{N}_])/iu,
];

const RHETORICAL_REFRAME =
  /\bnão (é|se trata de)(?![\p{L}\p{N}_])(?! pouca)[^.!?]{3,80}?,\s*(mas|e sim|é sobre|é que)(?![\p{L}\p{N}_])/iu;

const HUMAN_CONTACT_OFFER =
  /pessoa|psic[óo]log|psiquiatr|terap[êe]ut|terapia|profissiona|(?<![\p{L}\p{N}_])(algu[ée]m|atendimento|cvv|188)(?![\p{L}\p{N}_])/iu;

export function matchOpeningTell(opening: string): string | null {
  const trimmed = opening.trim();
  return OPENING_TELLS.some((tell) => tell.test(trimmed)) ? trimmed : null;
}

export type ClosingTic = "rhetorical_reframe" | "trailing_question";

export function classifyClosingTic(
  sentence: string,
  allowTrailingQuestion: boolean,
): ClosingTic | null {
  const trimmed = sentence.trim();

  if (HUMAN_CONTACT_OFFER.test(trimmed)) {
    return null;
  }

  if (RHETORICAL_REFRAME.test(trimmed)) {
    return "rhetorical_reframe";
  }

  if (!allowTrailingQuestion && trimmed.endsWith("?")) {
    return "trailing_question";
  }

  return null;
}
