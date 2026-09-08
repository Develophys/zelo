export type ManagerMetricId = "concerningRate" | "checkIns" | "followUpRate" | "sectorCoverage";

export interface MetricDefinition {
  id: ManagerMetricId;
  /** Rótulo curto. A mesma string na tela, no CSV, no PDF e na metodologia. */
  label: string;
  /** Como o número é calculado, palavra por palavra. Tooltip e rota de metodologia. */
  method: string;
  /** Janela temporal, dita explicitamente porque os cards usam janelas diferentes. */
  window: string;
  /** Como a supressão por k-anonimato afeta este indicador especificamente. */
  suppression: string;
  /** Presente só quando o indicador não é dado real de produção. */
  provenance?: "demonstration";
}

/** Muda sempre que um limiar, uma janela ou uma regra de supressão mudar. */
export const MANAGER_METHODOLOGY_VERSION = "1.0 — 7 de setembro de 2026";

export const MANAGER_METRICS: Record<ManagerMetricId, MetricDefinition> = {
  concerningRate: {
    id: "concerningRate",
    label: "Respostas com sinal de sofrimento relevante",
    method:
      "Proporção de autoavaliações cujo escore total de PHQ-9 ou GAD-7 ficou acima de 9 — o teto da faixa \"leve\" das duas escalas. Um escore acima disso indica sintomas de depressão ou ansiedade em intensidade ao menos moderada, condição que a literatura associa a maior risco de esgotamento profissional. Não é um diagnóstico de burnout nem de nenhuma outra condição.",
    window: "Apenas a semana mais recente com dados suficientes — não é média das 6 semanas.",
    suppression:
      "Soma somente os setores com 5 respostas ou mais na semana de referência. Setores abaixo desse limite não entram nem no numerador nem no denominador. A visibilidade é decidida por setor, não semana a semana: uma vez que o setor atinge o mínimo na semana de referência, todas as semanas dele aparecem no gráfico com a contagem real, inclusive as semanas em que essa contagem ficou abaixo de 5.",
  },
  checkIns: {
    id: "checkIns",
    label: "Questionários respondidos",
    method:
      "Soma das autoavaliações respondidas. Uma mesma pessoa que responde em duas semanas diferentes conta duas vezes; dentro da mesma semana, conta uma única vez, mesmo que refaça o questionário.",
    window: "As 4 semanas mais recentes que têm dados — não necessariamente os últimos 28 dias corridos.",
    suppression: "Conta apenas setores visíveis.",
  },
  followUpRate: {
    id: "followUpRate",
    label: "Taxa de resposta do follow-up",
    method:
      "Proporção de contatos de reengajamento respondidos, na semana mais recente. O mecanismo de follow-up ainda não coleta dado real por instituição: este valor vem de um conjunto de demonstração, igual para todas as instituições, e não deve ser usado em relatório, apresentação ou documento de conformidade.",
    window: "Semana mais recente do conjunto de demonstração.",
    suppression:
      "Este indicador ainda não aplica o mínimo de 5 respostas que os demais aplicam. Enquanto for dado de demonstração isso não descreve ninguém; quando passar a ser real, o mínimo entra junto.",
    provenance: "demonstration",
  },
  sectorCoverage: {
    id: "sectorCoverage",
    label: "Cobertura desta leitura",
    method:
      "Conta, entre os setores que você selecionou no filtro, quantos têm 5 respostas ou mais na semana de referência — só esses entram nos números desta página.",
    window: "Usa a mesma semana de referência do indicador de sofrimento relevante, no topo da página.",
    suppression:
      "Quanto maior a diferença entre os dois números, menor a parte da instituição que os outros indicadores desta página conseguem representar. Por exemplo, em \"3 de 8 setores\": tudo nesta página descreve apenas esses 3. Os outros 5 podem estar melhor ou pior, e nada aqui mostraria isso.",
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
