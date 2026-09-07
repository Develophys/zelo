/**
 * Camada Operacional das configurações por instituição — ver
 * docs/superpowers/specs/2026-08-23-institution-settings-design.md.
 * Nenhum outro ponto do código pode repetir estes números.
 */
export const FOLLOW_UP_RATE_GOOD_MIN = 80;
export const FOLLOW_UP_RATE_FAIR_MIN = 70;

export type FollowUpBandTone = "good" | "fair" | "poor";

export interface FollowUpBand {
  tone: FollowUpBandTone;
  label: string;
  meaning: string;
}

const GOOD: FollowUpBand = {
  tone: "good",
  label: "Ótima",
  meaning:
    "A maior parte da equipe respondeu ao contato de reengajamento, então os demais números desta página descrevem bem quem foi acompanhado.",
};

const FAIR: FollowUpBand = {
  tone: "fair",
  label: "Média",
  meaning:
    "Boa parte respondeu, mas cerca de um em cada quatro contatos ficou sem retorno. Vale acompanhar se a taxa cai nas próximas semanas.",
};

const POOR: FollowUpBand = {
  tone: "poor",
  label: "Baixa",
  meaning:
    "A maior parte dos contatos ficou sem retorno. Antes de ler os demais indicadores como representativos, vale rever o momento e o canal do follow-up.",
};

/**
 * Recebe o percentual inteiro já arredondado — o mesmo valor que a tela
 * exibe. Classificar a fração crua faria 0,804 e 0,7996 aparecerem ambos
 * como "80%" em faixas diferentes.
 */
export function followUpBandFor(percent: number): FollowUpBand {
  if (percent > FOLLOW_UP_RATE_GOOD_MIN) return GOOD;
  if (percent >= FOLLOW_UP_RATE_FAIR_MIN) return FAIR;
  return POOR;
}
