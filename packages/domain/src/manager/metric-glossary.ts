export type ManagerMetricId = "concerningRate" | "checkIns" | "abandoned" | "followUpRate" | "sectorCoverage";

export interface MetricDefinition {
  id: ManagerMetricId;
  /** Rótulo curto. A mesma string na tela, no CSV, no PDF e na metodologia. */
  label: string;
  /**
   * Como o número é calculado. É o único campo que o tooltip do painel mostra,
   * então precisa se sustentar sozinho: quem só lê ele não pode sair com uma
   * leitura errada do indicador.
   */
  method: string;
  /** Janela temporal, dita explicitamente porque os cards usam janelas diferentes. Só na metodologia. */
  window: string;
  /** Como a supressão por k-anonimato afeta este indicador especificamente. Só na metodologia. */
  suppression: string;
  /** Presente só quando o indicador não é dado real de produção. */
  provenance?: "demonstration";
}

/** Muda sempre que um limiar, uma janela ou uma regra de supressão mudar. */
export const MANAGER_METHODOLOGY_VERSION = "1.1 — 9 de setembro de 2026";

export const MANAGER_METRICS: Record<ManagerMetricId, MetricDefinition> = {
  concerningRate: {
    id: "concerningRate",
    label: "Respostas com sinal de sofrimento relevante",
    method:
      "A parte das respostas que pontuou acima de 9 no PHQ-9 ou no GAD-7. Acima de 9 as duas escalas saem da faixa \"leve\": são sintomas de depressão ou ansiedade em intensidade ao menos moderada. Não é diagnóstico de nada, e não é uma medida de burnout.",
    window:
      "Apenas a semana mais recente com dados suficientes — não é a média do período mostrado no gráfico.",
    suppression:
      "Uma vez que um setor atinge 5 respostas na semana de referência, o gráfico passa a mostrar todas as semanas dele com a contagem real — inclusive as semanas em que essa contagem ficou abaixo de 5. A visibilidade é decidida uma vez, por setor, e não semana a semana. Setores que nunca atingem o mínimo ficam fora do numerador e do denominador.",
  },
  checkIns: {
    id: "checkIns",
    label: "Respostas",
    method:
      "Soma das respostas enviadas. Uma mesma pessoa que responde em duas semanas diferentes conta duas vezes; dentro da mesma semana, conta uma única vez, mesmo que refaça o questionário.",
    window: "As 4 semanas mais recentes que têm dados — não necessariamente os últimos 28 dias corridos.",
    suppression: "Conta apenas os setores com 5 respostas ou mais.",
  },
  abandoned: {
    id: "abandoned",
    label: "Questionários abandonados",
    method:
      "Quantas vezes alguém começou a responder um questionário (PHQ-9 ou GAD-7) e confirmou que queria sair antes de terminar, na tela de aviso que aparece nesse momento. Uma pessoa que abandona e depois volta e conclui o mesmo questionário conta nos dois indicadores — não há tentativa de reconciliar um com o outro.",
    window: "As 4 semanas mais recentes que têm dados — mesma janela de \"Respostas\".",
    suppression:
      "Conta apenas os setores que já têm 5 respostas ou mais na semana de referência — o mesmo critério de \"Respostas\", nunca um critério próprio. Um setor não fica visível por abandono sozinho.",
  },
  followUpRate: {
    id: "followUpRate",
    label: "Taxa de resposta do follow-up",
    method:
      "A parte dos contatos de reengajamento que foi respondida, na semana mais recente. O mecanismo de follow-up ainda não coleta dado real por instituição: este valor vem de um conjunto de demonstração, igual para todas as instituições, e não deve ser usado em relatório, apresentação ou documento de conformidade.",
    window: "Semana mais recente do conjunto de demonstração.",
    suppression:
      "Este indicador ainda não aplica o mínimo de 5 respostas que os demais aplicam. Enquanto for dado de demonstração isso não descreve ninguém; quando passar a ser real, o mínimo entra junto.",
    provenance: "demonstration",
  },
  sectorCoverage: {
    id: "sectorCoverage",
    label: "Cobertura desta leitura",
    method:
      "Conta, entre os setores que você selecionou no filtro, quantos têm 5 respostas ou mais na semana de referência — só esses entram nos números desta página. Em \"3 de 8 setores\", tudo aqui descreve apenas esses 3: os outros 5 podem estar melhor ou pior, e nada nesta página mostraria isso.",
    window: "Usa a mesma semana de referência do indicador de sofrimento relevante, no topo da página.",
    suppression:
      "Quanto maior a diferença entre os dois números, menor a parte da instituição que os outros indicadores desta página conseguem representar.",
  },
};

function respostas(count: number): string {
  return count === 1 ? "1 resposta" : `${count} respostas`;
}

export function concerningRateReading(input: {
  percent: number;
  responses: number;
  weekLabel: string;
}): string {
  const preposition = input.responses === 1 ? "de" : "das";
  return `${input.percent}% ${preposition} ${respostas(input.responses)} na semana de ${input.weekLabel}`;
}

export function checkInsReading(input: { total: number; visibleSectors: number }): string {
  const sectors =
    input.visibleSectors === 1 ? "1 setor visível" : `${input.visibleSectors} setores visíveis`;
  return `${respostas(input.total)} em ${sectors}, nas últimas 4 semanas`;
}

export function followUpReading(): string {
  return "Dado de demonstração — não reflete esta instituição";
}

export function sectorCoverageReading(input: { visible: number; total: number }): string {
  const hidden = input.total - input.visible;
  const tail =
    hidden === 0
      ? "nenhum oculto"
      : `${hidden} ${hidden === 1 ? "oculto" : "ocultos"} por ${hidden === 1 ? "ter" : "terem"} menos de 5 respostas`;
  return `${input.visible} de ${input.total} setores · ${tail}`;
}

function questionariosAbandonados(count: number): string {
  return count === 1 ? "1 questionário abandonado" : `${count} questionários abandonados`;
}

export function abandonedReading(total: number): string {
  return `${questionariosAbandonados(total)}, nas últimas 4 semanas`;
}
