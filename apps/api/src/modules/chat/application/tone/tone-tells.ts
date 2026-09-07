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

const LEAD = String.raw`(?:^|^[^?,]{0,14}[,:;–—-]\s*)`;
const EDGE = String.raw`(?![\p{L}\p{N}_])`;
const NOT_AFTER = String.raw`(?<![\p{L}\p{N}_])`;
const TAIL = String.raw`[^?]{0,20}\?$`;
const TAIL_WIDE = String.raw`[^?]{0,30}\?$`;

const SOMATIC_SUBJECT = String.raw`(?:sono|dormir|dormido|dormindo|ins[ôo]nia|apetite|comer|comido|comendo|fome|alimenta[çc][ãa]o|energia|disposi[çc][ãa]o|[âa]nimo|humor|cansa[çc]o|exaust[ãa]o|descanso|descansar|folga|pausa|corpo|cabe[çc]a|rotina|carga|escala|jornada|plant[ãa]o|plant[õo]es|turno|turnos|sobrecarga)`;

const SOMATIC_PARTICIPLE = String.raw`(?:dormido|dormindo|comido|comendo|descansado|descansando|se alimentado|se alimentando|se sentido|se sentindo)`;

const STATE_COPULA = String.raw`(?:t[áa]|est[áa]|est[ãa]o|t[ãa]o|tem sido|t[eê]m sido|vem sendo|anda|andam|vai|v[ãa]o|foi|foram)`;

const CLINICAL_CHECKIN_QUESTION: RegExp[] = [
  new RegExp(
    `${LEAD}como (?:é que )?${STATE_COPULA}${EDGE}[^?]{0,40}?${SOMATIC_SUBJECT}${EDGE}${TAIL}`,
    "iu",
  ),
  new RegExp(
    `${LEAD}como (?:voc[êe] |vc |c[êe] |tu )?(?:tem|t[eê]m|anda|vem|t[áa]|est[áa]) ${SOMATIC_PARTICIPLE}${EDGE}${TAIL_WIDE}`,
    "iu",
  ),
  new RegExp(
    `^como (?:voc[êe] |vc |c[êe] |tu )?(?:t[áa]|est[áa]|tem passado|tem estado|tem se sentido|se sente|se sentiu)(?: hoje| agora| ultimamente| esses dias| nesses dias| depois disso| desde ent[ãa]o)?\\s*\\?$`,
    "iu",
  ),
  new RegExp(`${NOT_AFTER}(?:faz|h[áa]) quanto tempo${EDGE}`, "iu"),
  new RegExp(`${NOT_AFTER}desde quando${EDGE}`, "iu"),
  new RegExp(`${NOT_AFTER}com que frequ[êe]ncia${EDGE}`, "iu"),
  new RegExp(
    `${LEAD}(?:isso|isto|esse|essa|aquilo)${EDGE}[^?]{0,40}?(?:vem acontecendo|tem acontecido|acontece|tem sido assim|se repete|tem se repetido|vem se repetindo)${EDGE}${TAIL}`,
    "iu",
  ),
  new RegExp(
    `${NOT_AFTER}tem conseguido${EDGE}[^?]{0,15}?(?:comer|dormir|descansar|se alimentar|se cuidar|folgar|parar|desligar)${EDGE}${TAIL}`,
    "iu",
  ),
  new RegExp(`${NOT_AFTER}tem ${SOMATIC_PARTICIPLE}${EDGE}${TAIL}`, "iu"),
  new RegExp(`^o que (?:mudou|tem mudado|mudaria)${EDGE}${TAIL}`, "iu"),
  new RegExp(
    `^quant[oa]s (?:plant[õo]es|turnos|horas|noites|dias|vezes)${EDGE}[^?]{0,30}\\?$`,
    "iu",
  ),
];

export function matchOpeningTell(opening: string): string | null {
  const trimmed = opening.trim();
  return OPENING_TELLS.some((tell) => tell.test(trimmed)) ? trimmed : null;
}

export function isClinicalCheckinQuestion(sentence: string): boolean {
  const trimmed = sentence.trim();
  return trimmed.endsWith("?") && CLINICAL_CHECKIN_QUESTION.some((probe) => probe.test(trimmed));
}

export type ClosingTic = "rhetorical_reframe" | "trailing_question";

export function classifyClosingTic(
  sentence: string,
  allowTrailingQuestion: boolean,
): ClosingTic | null {
  const trimmed = sentence.trim();

  if (RHETORICAL_REFRAME.test(trimmed)) {
    return "rhetorical_reframe";
  }

  if (!allowTrailingQuestion && isClinicalCheckinQuestion(trimmed)) {
    return "trailing_question";
  }

  return null;
}
