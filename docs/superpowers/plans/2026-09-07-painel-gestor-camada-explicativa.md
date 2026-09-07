# Camada Explicativa do Painel do Gestor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o painel do gestor explicar cada número que mostra — o que mede, de que base saiu, em que janela e com que regra de privacidade — sem engordar a tela inicial.

**Architecture:** Um glossário de métricas em `@zelo/domain` vira a fonte única de rótulo, leitura em linguagem simples e método. A tela, as duas exportações, a nova rota de metodologia e o prompt da IA leem dele, então nenhuma dessas superfícies pode descrever a mesma métrica de forma diferente. A API passa a devolver o denominador por semana e a cobertura de setores, que já calculava e descartava. A profundidade fica em tooltip e em rota própria; a tela inicial ganha só uma linha por card.

**Tech Stack:** pnpm workspaces + Turborepo · TypeScript · React 19 + react-router 8 + TanStack Query + Tailwind 4 (web) · NestJS 10 + Prisma 7 (api) · Vitest 3 + Testing Library · Zod 3

**Spec:** `docs/superpowers/specs/2026-09-07-painel-gestor-camada-explicativa-design.md`

## Global Constraints

- **Nenhum rótulo de métrica pode conter a palavra "burnout".** O termo só aparece em `method`, descrevendo a associação clínica. Há teste de regressão para isso (Task 3).
- **`FOLLOW_UP_RATE_GOOD_MIN = 80` e `FOLLOW_UP_RATE_FAIR_MIN = 70` só existem em `packages/domain/src/manager/metric-bands.ts`.** Nenhum outro ponto do código repete esses números — mesma regra que `apps/api/src/modules/notification/application/thresholds.ts` já declara.
- **As faixas classificam o percentual inteiro já arredondado**, nunca a fração. Banda e número exibido saem sempre do mesmo valor.
- **Fronteiras das faixas:** `> 80` é Ótima; `>= 70 e <= 80` é Média; `< 70` é Baixa. 80 e 70 exatos caem em Média.
- **Exportações não carregam faixa nem tom enquanto `provenance === 'demonstration'`.**
- **Nenhum elemento focável dentro de container `aria-hidden`.** Ao transformar barras em botões, o `aria-hidden` do container tem que sair no mesmo commit.
- **O cálculo de nenhum indicador muda nesta entrega.** Renomeamos, explicamos e divulgamos; a matemática fica intacta para não quebrar séries históricas.
- **`turbo.json` declara `test.dependsOn: ["^build"]`.** Depois de qualquer mudança em `packages/domain`, é obrigatório rodar `pnpm turbo build --filter=@zelo/domain` antes de rodar testes de `@zelo/web` ou `@zelo/api` diretamente por `pnpm --filter`, senão eles importam o `dist/` velho.

---

## File Structure

#### Criados

| Arquivo | Responsabilidade |
| --- | --- |
| `packages/domain/src/manager/metric-bands.ts` | Constantes e resolução das faixas do follow-up. Puro, sem copy de tela além do rótulo da faixa. |
| `packages/domain/src/manager/metric-bands.test.ts` | Fronteiras e contiguidade das faixas. |
| `packages/domain/src/manager/metric-glossary.ts` | Rótulo, método, janela e regra de supressão de cada métrica, mais as funções de leitura em linguagem simples e a versão da metodologia. |
| `packages/domain/src/manager/metric-glossary.test.ts` | Completude, proibição de "burnout" em rótulo, proveniência, plural/singular. |
| `apps/web/src/presentation/ui/MetricHelp.tsx` | Ícone de ajuda + `Tooltip` alinhado à esquerda. Reutilizado em cards e legendas. |
| `apps/web/src/presentation/ui/MetricHelp.test.tsx` | Nome acessível e vínculo `aria-describedby`. |
| `apps/web/src/presentation/pages/ManagerMethodologyPage.tsx` | Página de metodologia, com a tabela por indicador gerada do glossário. |
| `apps/web/src/presentation/pages/ManagerMethodologyPage.test.tsx` | Geração a partir do glossário e presença das seções em prosa. |

#### Modificados

| Arquivo | Mudança |
| --- | --- |
| `packages/domain/src/index.ts` | Exporta os dois módulos novos. |
| `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts` | `weeklyTrend` ganha `checkIns`/`concerning`; resposta ganha `sectorCoverage`. |
| `apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.ts` | `formatSummary` usa denominadores, cobertura e rótulos do glossário. |
| `apps/web/src/ports/manager-signals.port.ts` | Schema Zod dos campos novos. |
| `apps/web/src/presentation/lib/manager-trend-chart.ts` | `TrendPoint` ganha campos; `trendWeekDetail` e `describeTrendWeek` reescritos. |
| `apps/web/src/presentation/ui/Tooltip.tsx` | Prop `align`. |
| `apps/web/src/presentation/pages/ManagerDashboardPage.tsx` | Cards do glossário, linha de cobertura, barras acessíveis, legendas explicadas, link de metodologia. |
| `apps/web/src/presentation/lib/download-manager-pgr-report.ts` | Rótulos do glossário, cobertura, ressalva de demonstração, rodapé de metodologia. |
| `apps/web/src/presentation/lib/routes.ts` | `managerMethodology`. |
| `apps/web/src/app/router.tsx` | Rota dentro do `ManagerShell`. |
| `apps/web/src/presentation/layout/manager-nav.ts` | Entrada "Como calculamos". |

---

### Task 1: Prop `align` no Tooltip e componente `MetricHelp`

O `Tooltip` atual é centralizado, `max-w-[16rem]` e semibold — dimensionado para rótulo de ícone, não para três linhas com uma fórmula. Nada depende desta task, e as próximas cinco dependem dela.

**Files:**

- Modify: `apps/web/src/presentation/ui/Tooltip.tsx:22-25` (props) e `:162-174` (bubble)
- Create: `apps/web/src/presentation/ui/MetricHelp.tsx`
- Test: `apps/web/src/presentation/ui/MetricHelp.test.tsx`

**Interfaces:**

- Consumes: `Tooltip` de `@/presentation/ui/Tooltip`
- Produces: `<Tooltip content align?: 'center' | 'start'>` (default `'center'`, comportamento atual inalterado); `<MetricHelp label: string content: ReactNode />`

- [ ] **Step 1: Write the failing test**

Criar `apps/web/src/presentation/ui/MetricHelp.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricHelp } from './MetricHelp';

describe('MetricHelp', () => {
  it('names the trigger after the metric it explains', () => {
    render(<MetricHelp label="Taxa de resposta do follow-up" content="Como é calculado." />);

    expect(
      screen.getByRole('button', { name: 'Sobre: Taxa de resposta do follow-up' }),
    ).toBeInTheDocument();
  });

  it('describes the trigger with the bubble once opened, so the explanation is not read as the name', async () => {
    const user = userEvent.setup();
    render(<MetricHelp label="Cobertura desta leitura" content="Quantos setores entram na conta." />);

    const trigger = screen.getByRole('button', { name: 'Sobre: Cobertura desta leitura' });
    await user.tab();
    expect(trigger).toHaveFocus();

    const bubble = await screen.findByTestId('tooltip');
    expect(bubble).toHaveTextContent('Quantos setores entram na conta.');
    expect(trigger).toHaveAttribute('aria-describedby', bubble.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/ui/MetricHelp.test.tsx`
Expected: FAIL — `Failed to resolve import "./MetricHelp"`

- [ ] **Step 3: Add the `align` prop to Tooltip**

Em `apps/web/src/presentation/ui/Tooltip.tsx`, trocar a interface de props:

```tsx
interface TooltipProps {
  content: ReactNode;
  /**
   * `start` é para explicação de várias linhas: alinhada à esquerda e mais
   * larga. O default mantém o formato de rótulo de ícone que todos os usos
   * existentes esperam.
   */
  align?: 'center' | 'start';
  children: ReactElement<Record<string, unknown>>;
}
```

Trocar a assinatura da função:

```tsx
export function Tooltip({ content, align = 'center', children }: TooltipProps) {
```

E trocar o `className` do bubble (`:170`) por:

```tsx
      className={[
        'pointer-events-none fixed z-50 w-max rounded-control bg-ink px-2.5 py-1.5 font-sans text-caption text-surface shadow-lift',
        align === 'start' ? 'max-w-[22rem] text-left font-normal' : 'max-w-[16rem] text-center font-semibold',
      ].join(' ')}
```

- [ ] **Step 4: Create the MetricHelp component**

Criar `apps/web/src/presentation/ui/MetricHelp.tsx`:

```tsx
import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface MetricHelpProps {
  label: string;
  content: ReactNode;
}

/**
 * 24px é o alvo mínimo do WCAG 2.5.8 e o maior que cabe ao lado de um rótulo
 * de card sem empurrar a linha.
 */
export function MetricHelp({ label, content }: MetricHelpProps) {
  return (
    <Tooltip content={content} align="start">
      <button
        type="button"
        aria-label={`Sobre: ${label}`}
        className="inline-flex h-6 w-6 items-center justify-center rounded-control text-muted-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/ui/MetricHelp.test.tsx src/presentation/ui/`
Expected: PASS — inclusive os testes existentes de `Tooltip`, que exercitam o default `center`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/ui/Tooltip.tsx apps/web/src/presentation/ui/MetricHelp.tsx apps/web/src/presentation/ui/MetricHelp.test.tsx
git commit -m "feat(web): add a left-aligned tooltip variant and the MetricHelp trigger

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Faixas do follow-up em `@zelo/domain`

**Files:**

- Create: `packages/domain/src/manager/metric-bands.ts`
- Test: `packages/domain/src/manager/metric-bands.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: nada
- Produces: `FOLLOW_UP_RATE_GOOD_MIN: number`, `FOLLOW_UP_RATE_FAIR_MIN: number`, `type FollowUpBandTone = 'good' | 'fair' | 'poor'`, `interface FollowUpBand { tone: FollowUpBandTone; label: string; meaning: string }`, `followUpBandFor(percent: number): FollowUpBand`

- [ ] **Step 1: Write the failing test**

Criar `packages/domain/src/manager/metric-bands.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { followUpBandFor } from "./metric-bands";

describe("followUpBandFor", () => {
  // As quatro fronteiras, uma asserção cada: é exatamente o que muda sem
  // ninguém perceber quando estes valores virarem configuráveis por instituição.
  it("treats 81 as good", () => {
    expect(followUpBandFor(81).tone).toBe("good");
  });

  it("treats 80 exactly as fair, because the rule is 'above 80'", () => {
    expect(followUpBandFor(80).tone).toBe("fair");
  });

  it("treats 70 exactly as fair, because the rule is 'below 70'", () => {
    expect(followUpBandFor(70).tone).toBe("fair");
  });

  it("treats 69 as poor", () => {
    expect(followUpBandFor(69).tone).toBe("poor");
  });

  it("resolves the ends of the scale", () => {
    expect(followUpBandFor(0).tone).toBe("poor");
    expect(followUpBandFor(100).tone).toBe("good");
  });

  it("gives every whole percentage exactly one band, with a label and a meaning", () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      const band = followUpBandFor(percent);
      expect(["good", "fair", "poor"]).toContain(band.tone);
      expect(band.label.length).toBeGreaterThan(0);
      expect(band.meaning.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/domain exec vitest run src/manager/metric-bands.test.ts`
Expected: FAIL — `Failed to resolve import "./metric-bands"`

- [ ] **Step 3: Write the implementation**

Criar `packages/domain/src/manager/metric-bands.ts`:

```ts
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
```

- [ ] **Step 4: Export from the package barrel**

Em `packages/domain/src/index.ts`, acrescentar ao final:

```ts
export * from "./manager/metric-bands";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @zelo/domain exec vitest run src/manager/metric-bands.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/manager/metric-bands.ts packages/domain/src/manager/metric-bands.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): add follow-up response rate bands

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Glossário de métricas em `@zelo/domain`

Fonte única de rótulo, leitura e método. Depois desta task, cinco superfícies passam a ler daqui em vez de repetir copy.

**Files:**

- Create: `packages/domain/src/manager/metric-glossary.ts`
- Test: `packages/domain/src/manager/metric-glossary.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: nada
- Produces: `type ManagerMetricId`, `interface MetricDefinition`, `MANAGER_METRICS: Record<ManagerMetricId, MetricDefinition>`, `MANAGER_METHODOLOGY_VERSION: string`, e quatro funções de leitura: `concerningRateReading`, `checkInsReading`, `followUpReading`, `sectorCoverageReading`

- [ ] **Step 1: Write the failing test**

Criar `packages/domain/src/manager/metric-glossary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MANAGER_METRICS,
  MANAGER_METHODOLOGY_VERSION,
  checkInsReading,
  concerningRateReading,
  followUpReading,
  sectorCoverageReading,
} from "./metric-glossary";

describe("MANAGER_METRICS", () => {
  it("defines every field for every metric", () => {
    for (const metric of Object.values(MANAGER_METRICS)) {
      expect(metric.label.length).toBeGreaterThan(0);
      expect(metric.method.length).toBeGreaterThan(0);
      expect(metric.window.length).toBeGreaterThan(0);
      expect(metric.suppression.length).toBeGreaterThan(0);
    }
  });

  // Regressão para a decisão D2: o indicador conta PHQ-9/GAD-7 acima de 9,
  // que não é uma medida de burnout. A palavra só pode aparecer em `method`,
  // descrevendo a associação clínica.
  it("never calls a metric 'burnout' in its label", () => {
    for (const metric of Object.values(MANAGER_METRICS)) {
      expect(metric.label.toLowerCase()).not.toContain("burnout");
    }
  });

  it("marks the follow-up rate as demonstration data", () => {
    expect(MANAGER_METRICS.followUpRate.provenance).toBe("demonstration");
  });

  it("marks nothing else as demonstration data", () => {
    const demo = Object.values(MANAGER_METRICS).filter((m) => m.provenance === "demonstration");
    expect(demo.map((m) => m.id)).toEqual(["followUpRate"]);
  });

  it("carries a methodology version, so a change of rule is datable", () => {
    expect(MANAGER_METHODOLOGY_VERSION.length).toBeGreaterThan(0);
  });
});

describe("plain-language readings", () => {
  it("states the numerator, the denominator and the week for the concerning rate", () => {
    expect(concerningRateReading({ percent: 47, responses: 62, weekLabel: "31 de ago." })).toBe(
      "47% das 62 respostas na semana de 31 de ago.",
    );
  });

  it("uses the singular for a single response", () => {
    expect(concerningRateReading({ percent: 0, responses: 1, weekLabel: "3 de ago." })).toBe(
      "0% de 1 resposta na semana de 3 de ago.",
    );
  });

  it("states the total and how many sectors it spans", () => {
    expect(checkInsReading({ total: 312, visibleSectors: 4 })).toBe(
      "312 respostas em 4 setores visíveis, nas últimas 4 semanas",
    );
  });

  it("uses the singular for a single sector", () => {
    expect(checkInsReading({ total: 9, visibleSectors: 1 })).toBe(
      "9 respostas em 1 setor visível, nas últimas 4 semanas",
    );
  });

  it("says outright that the follow-up rate is not this institution's data", () => {
    expect(followUpReading()).toContain("demonstração");
  });

  it("states visible, total and hidden sectors", () => {
    expect(sectorCoverageReading({ visible: 4, total: 7 })).toBe(
      "4 de 7 setores · 3 ocultos por terem menos de 5 respostas",
    );
  });

  it("drops the hidden clause when nothing is hidden", () => {
    expect(sectorCoverageReading({ visible: 7, total: 7 })).toBe("7 de 7 setores · nenhum oculto");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/domain exec vitest run src/manager/metric-glossary.test.ts`
Expected: FAIL — `Failed to resolve import "./metric-glossary"`

- [ ] **Step 3: Write the implementation**

Criar `packages/domain/src/manager/metric-glossary.ts`:

```ts
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
      "Soma somente os setores com 5 respostas ou mais na semana de referência. Setores abaixo desse limite não entram nem no numerador nem no denominador.",
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
      "Quantos dos setores selecionados no filtro chegaram ao mínimo de 5 respostas na semana de referência e, portanto, entram em todos os números desta página.",
    window: "Semana de referência, a mesma do indicador de sofrimento relevante.",
    suppression:
      "Este indicador é a medida da supressão: quanto maior a diferença entre os dois números, menor a parcela da instituição que os demais indicadores representam.",
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
```

- [ ] **Step 4: Export from the package barrel**

Em `packages/domain/src/index.ts`, acrescentar ao final:

```ts
export * from "./manager/metric-glossary";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @zelo/domain exec vitest run src/manager/`
Expected: PASS — os testes desta task mais os 6 da Task 2.

- [ ] **Step 6: Build the package so the apps can import it**

Run: `pnpm turbo build --filter=@zelo/domain`
Expected: sucesso. Sem isso, `@zelo/web` e `@zelo/api` importam o `dist/` antigo.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/manager/metric-glossary.ts packages/domain/src/manager/metric-glossary.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): add the manager metric glossary as the single source of metric copy

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: API devolve denominador por semana e cobertura de setores

O use case já calcula `totalCheckIns`/`totalConcerning` por semana e já monta `visibleSectorIds` contra `bySector` — e descarta os dois. Esta task só para de descartar.

**Files:**

- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts:9-23`, `:51-61`, `:81-84`, `:116-134`
- Test: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`

**Interfaces:**

- Consumes: nada de tasks anteriores
- Produces: `ManagerSignalsResponse` com `weeklyTrend: { weekStart: string; concerningRate: number; checkIns: number; concerning: number }[]` e `sectorCoverage: { visible: number; total: number }`

- [ ] **Step 1: Write the failing test**

Acrescentar a `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`, dentro do `describe` existente. Reutilize os fakes de repositório que o arquivo já define; o formato de `SignalRow` é `{ sectorId, sectorName, weekStart, checkIns, concerning }`.

```ts
  it("carries the denominator of every trend week, so a rate can be read against its base", async () => {
    const rows = [
      { sectorId: "s1", sectorName: "UTI", weekStart: new Date("2026-08-24T00:00:00.000Z"), checkIns: 10, concerning: 4 },
      { sectorId: "s1", sectorName: "UTI", weekStart: new Date("2026-08-31T00:00:00.000Z"), checkIns: 20, concerning: 9 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("inst-1", ["s1"]);

    expect(result.weeklyTrend).toEqual([
      { weekStart: "2026-08-24T00:00:00.000Z", concerningRate: 0.4, checkIns: 10, concerning: 4 },
      { weekStart: "2026-08-31T00:00:00.000Z", concerningRate: 0.45, checkIns: 20, concerning: 9 },
    ]);
  });

  // A garantia mais importante do produto não pode depender de leitura de
  // código: um setor abaixo do limiar fica fora de TODOS os agregados,
  // inclusive do denominador da tendência, onde seria fácil vazá-lo.
  it("keeps a sub-threshold sector out of the trend denominators entirely", async () => {
    const week = new Date("2026-08-31T00:00:00.000Z");
    const rows = [
      { sectorId: "visible", sectorName: "UTI", weekStart: week, checkIns: 20, concerning: 9 },
      { sectorId: "hidden", sectorName: "Pediatria", weekStart: week, checkIns: 3, concerning: 3 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("inst-1", ["visible", "hidden"]);

    expect(result.weeklyTrend).toHaveLength(1);
    expect(result.weeklyTrend[0]!.checkIns).toBe(20);
    expect(result.weeklyTrend[0]!.concerning).toBe(9);
    expect(result.segments.map((s) => s.label)).toEqual(["UTI"]);
  });

  it("reports how many sectors the reading covers and how many are suppressed", async () => {
    const week = new Date("2026-08-31T00:00:00.000Z");
    const rows = [
      { sectorId: "a", sectorName: "UTI", weekStart: week, checkIns: 20, concerning: 9 },
      { sectorId: "b", sectorName: "PS", weekStart: week, checkIns: 8, concerning: 2 },
      { sectorId: "c", sectorName: "Pediatria", weekStart: week, checkIns: 3, concerning: 1 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("inst-1", ["a", "b", "c"]);

    expect(result.sectorCoverage).toEqual({ visible: 2, total: 3 });
  });

  // Quando nenhum setor chega ao limiar a página fica vazia, e "0 de 0" leria
  // como "esta instituição não tem setores" — que é outra coisa.
  it("still reports the total when every sector is suppressed", async () => {
    const week = new Date("2026-08-31T00:00:00.000Z");
    const rows = [
      { sectorId: "a", sectorName: "UTI", weekStart: week, checkIns: 2, concerning: 1 },
      { sectorId: "b", sectorName: "PS", weekStart: week, checkIns: 1, concerning: 0 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("inst-1", ["a", "b"]);

    expect(result.sectorCoverage).toEqual({ visible: 0, total: 2 });
    expect(result.segments).toEqual([]);
  });

  it("reports zero coverage when there is no data at all", async () => {
    const useCase = makeUseCase([]);

    const result = await useCase.execute("inst-1", ["a"]);

    expect(result.sectorCoverage).toEqual({ visible: 0, total: 0 });
  });
```

Se o arquivo de teste ainda não tiver um helper `makeUseCase(rows)`, criar um no topo do arquivo a partir do padrão de construção já usado nos testes existentes:

```ts
  function makeUseCase(rows: SignalRow[]) {
    const repository: SignalRepository = {
      findAll: async () => rows,
      findAllForWeek: async () => [],
      countBySector: async () => 0,
    };
    const followUps: SimulatedFollowUpRepository = { findAll: async () => [] };
    return new GetManagerSignalsUseCase(repository, followUps);
  }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
Expected: FAIL — `weeklyTrend` sem `checkIns`/`concerning` e `sectorCoverage` `undefined`.

- [ ] **Step 3: Widen the response type and the empty response**

Em `get-manager-signals.use-case.ts`, trocar a interface e a constante do topo:

```ts
export interface ManagerSignalsResponse {
  overallConcerningRate: number;
  checkInsLast4Weeks: number;
  weeklyTrend: { weekStart: string; concerningRate: number; checkIns: number; concerning: number }[];
  segments: { label: string; value: number; n: number }[];
  followUpResponseRate: number;
  sectorCoverage: { visible: number; total: number };
}

const RECENT_WEEKS_FOR_VOLUME = 4;
const EMPTY_RESPONSE: Omit<ManagerSignalsResponse, "followUpResponseRate"> = {
  overallConcerningRate: 0,
  checkInsLast4Weeks: 0,
  weeklyTrend: [],
  segments: [],
  sectorCoverage: { visible: 0, total: 0 },
};
```

- [ ] **Step 4: Report the total when every sector is suppressed**

Ainda em `get-manager-signals.use-case.ts`, trocar o retorno antecipado de `mostRecentWeek === null` (`:81-84`) por:

```ts
    const mostRecentWeek = referenceWeek(bySector);
    if (mostRecentWeek === null) {
      // `total` vem de bySector, não de zero: "0 de 4 setores" diz que a
      // semana ainda não atingiu o mínimo, enquanto "0 de 0" leria como
      // "esta instituição não tem setores".
      return { ...EMPTY_RESPONSE, sectorCoverage: { visible: 0, total: bySector.size }, followUpResponseRate };
    }
```

- [ ] **Step 5: Emit the denominators and the coverage**

Trocar o bloco `weeklyTrend` e o `return` final (`:124-134`) por:

```ts
    const weeklyTrend = weekTimes.map((weekTime) => {
      const weekRows = visibleRows.filter((r) => r.weekStart.getTime() === weekTime);
      const totalCheckIns = weekRows.reduce((sum, r) => sum + r.checkIns, 0);
      const totalConcerning = weekRows.reduce((sum, r) => sum + r.concerning, 0);
      return {
        weekStart: new Date(weekTime).toISOString(),
        concerningRate: totalCheckIns === 0 ? 0 : totalConcerning / totalCheckIns,
        checkIns: totalCheckIns,
        concerning: totalConcerning,
      };
    });

    return {
      overallConcerningRate,
      checkInsLast4Weeks,
      weeklyTrend,
      segments,
      followUpResponseRate,
      // Somados sobre `visibleRows`, que já é o conjunto filtrado por
      // k-anonimato — expor o total não afrouxa nada.
      sectorCoverage: { visible: visibleSectorIds.size, total: bySector.size },
    };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/`
Expected: PASS. Se `manager.controller.test.ts` afirmar o corpo da resposta inteiro, atualizar essas asserções para incluir os campos novos.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts apps/api/src/modules/manager/infrastructure/manager.controller.test.ts
git commit -m "feat(api): carry weekly denominators and sector coverage in the signals response

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Schema do web aceita os campos novos

**Files:**

- Modify: `apps/web/src/ports/manager-signals.port.ts:3-9`
- Test: `apps/web/src/ports/manager-signals.port.test.ts` (criar se não existir)

**Interfaces:**

- Consumes: o formato de resposta da Task 4
- Produces: `ManagerSignalsResponse` (web) com `weeklyTrend[].checkIns`, `weeklyTrend[].concerning` e `sectorCoverage`

- [ ] **Step 1: Write the failing test**

Criar `apps/web/src/ports/manager-signals.port.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ManagerSignalsResponseSchema } from "./manager-signals.port";

const VALID = {
  overallConcerningRate: 0.47,
  checkInsLast4Weeks: 312,
  weeklyTrend: [{ weekStart: "2026-08-31T00:00:00.000Z", concerningRate: 0.47, checkIns: 62, concerning: 29 }],
  segments: [{ label: "UTI", value: 44, n: 20 }],
  followUpResponseRate: 0.72,
  sectorCoverage: { visible: 4, total: 7 },
};

describe("ManagerSignalsResponseSchema", () => {
  it("accepts a response carrying weekly denominators and coverage", () => {
    expect(ManagerSignalsResponseSchema.parse(VALID)).toEqual(VALID);
  });

  // Silenciar a ausência com um default esconderia uma API desatualizada e
  // faria a tela desenhar "0 de 0 setores" como se tivesse sido medido.
  it("rejects a trend point without its denominator", () => {
    const stale = { ...VALID, weeklyTrend: [{ weekStart: "2026-08-31T00:00:00.000Z", concerningRate: 0.47 }] };
    expect(() => ManagerSignalsResponseSchema.parse(stale)).toThrow();
  });

  it("rejects a response without coverage", () => {
    const { sectorCoverage: _omitted, ...stale } = VALID;
    expect(() => ManagerSignalsResponseSchema.parse(stale)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/ports/manager-signals.port.test.ts`
Expected: FAIL — o primeiro caso passa a `parse` mas devolve objeto sem os campos extras, e os dois `toThrow` falham.

- [ ] **Step 3: Widen the schema**

Em `apps/web/src/ports/manager-signals.port.ts`:

```ts
export const ManagerSignalsResponseSchema = z.object({
  overallConcerningRate: z.number(),
  checkInsLast4Weeks: z.number(),
  weeklyTrend: z.array(
    z.object({
      weekStart: z.string(),
      concerningRate: z.number(),
      checkIns: z.number(),
      concerning: z.number(),
    }),
  ),
  segments: z.array(z.object({ label: z.string(), value: z.number(), n: z.number() })),
  followUpResponseRate: z.number(),
  sectorCoverage: z.object({ visible: z.number(), total: z.number() }),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/ports/manager-signals.port.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix every mock that now fails to type-check**

Os testes existentes montam respostas de sinais à mão e agora não satisfazem o tipo. Rodar:

Run: `pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit`
Expected: erros apontando cada mock. Em cada um, acrescentar `checkIns` e `concerning` a todo ponto de `weeklyTrend` e `sectorCoverage` ao objeto. Em `ManagerDashboardPage.test.tsx`, o `SIGNALS_RESPONSE` vira:

```ts
const SIGNALS_RESPONSE = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  weeklyTrend: [
    { weekStart: "2026-06-01T00:00:00.000Z", concerningRate: 0.3, checkIns: 20, concerning: 6 },
    { weekStart: "2026-06-08T00:00:00.000Z", concerningRate: 0.5, checkIns: 24, concerning: 12 },
  ],
  segments: [
    { label: "Plantão noturno", value: 52, n: 18 },
    { label: "Pronto-socorro", value: 38, n: 24 },
    { label: "UTI", value: 44, n: 9 },
  ],
  followUpResponseRate: 0.7,
  sectorCoverage: { visible: 3, total: 4 },
};
```

- [ ] **Step 6: Run the full web suite**

Run: `pnpm --filter @zelo/web exec vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ports/manager-signals.port.ts apps/web/src/ports/manager-signals.port.test.ts apps/web/src/presentation
git commit -m "feat(web): accept weekly denominators and sector coverage from the signals API

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: KPI cards passam a ler o glossário

Renomeação nas telas, linha fixa por card, ícone de ajuda, e a faixa do follow-up com a pill de demonstração.

**Files:**

- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx:254-271`
- Test: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:**

- Consumes: `MANAGER_METRICS`, `concerningRateReading`, `checkInsReading`, `followUpReading`, `followUpBandFor` de `@zelo/domain`; `MetricHelp` de `@/presentation/ui/MetricHelp`; `weekLabel` de `@/presentation/lib/manager-trend-chart`
- Produces: nada consumido por tasks posteriores

- [ ] **Step 1: Write the failing test**

Acrescentar a `ManagerDashboardPage.test.tsx`:

```tsx
  it("labels the main indicator by what it measures, never as burnout", async () => {
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Respostas com sinal de sofrimento relevante")).toBeInTheDocument();
    });
    expect(screen.queryByText(/burnout/i)).not.toBeInTheDocument();
  });

  it("states the base and the week under the main number", async () => {
    renderManager();

    // 41% de 24 respostas — a última semana da série, não a média das seis.
    await waitFor(() => {
      expect(screen.getByText("41% das 24 respostas na semana de 8 de jun.")).toBeInTheDocument();
    });
  });

  it("says how many sectors the check-in total spans", async () => {
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("111 respostas em 3 setores visíveis, nas últimas 4 semanas")).toBeInTheDocument();
    });
  });

  it("marks the follow-up rate as demonstration data and bands it", async () => {
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Dado de demonstração — não reflete esta instituição")).toBeInTheDocument();
    });
    // 70% cai em "Média": a regra é "abaixo de 70 é baixa".
    expect(screen.getByText("Média")).toBeInTheDocument();
  });

  it("offers a help trigger for every KPI card", async () => {
    renderManager();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sobre: Respostas com sinal de sofrimento relevante" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Sobre: Questionários respondidos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sobre: Taxa de resposta do follow-up" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerDashboardPage.test.tsx -t "labels the main indicator"`
Expected: FAIL — o texto na tela ainda é "sinais de burnout na equipe".

- [ ] **Step 3: Add the imports and a small card helper**

No topo de `ManagerDashboardPage.tsx`, acrescentar:

```tsx
import {
  MANAGER_METRICS,
  checkInsReading,
  concerningRateReading,
  followUpBandFor,
  followUpReading,
  type MetricDefinition,
} from "@zelo/domain";
import { MetricHelp } from "@/presentation/ui/MetricHelp";
import { Pill } from "@/presentation/ui/Pill";
```

E, acima de `ManagerDashboardPage`, o conteúdo do tooltip e o card:

```tsx
function metricHelpContent(metric: MetricDefinition, extra?: string) {
  return (
    <span className="flex flex-col gap-1.5">
      <span>{metric.method}</span>
      <span>{metric.window}</span>
      <span>{metric.suppression}</span>
      {extra && <span>{extra}</span>}
    </span>
  );
}

interface KpiCardProps {
  metric: MetricDefinition;
  value: string;
  valueClass: string;
  reading: string;
  /** Acrescentado ao fim do tooltip — o significado da faixa, quando há uma. */
  extraHelp?: string;
  badge?: ReactNode;
}

function KpiCard({ metric, value, valueClass, reading, extraHelp, badge }: KpiCardProps) {
  return (
    <Card className="flex h-full flex-col text-center" data-testid="kpi-card">
      <p className={`font-serif text-stat ${valueClass}`}>{value}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-caption text-muted">
        <span>{metric.label}</span>
        <MetricHelp label={metric.label} content={metricHelpContent(metric, extraHelp)} />
      </p>
      <p className="mt-1.5 text-pretty text-label text-muted-2">{reading}</p>
      {badge && <div className="mt-2">{badge}</div>}
    </Card>
  );
}
```

Acrescentar `ReactNode` ao import de `react` no topo do arquivo:

```tsx
import type { ReactNode } from "react";
```

- [ ] **Step 4: Replace the three inline cards**

Trocar o bloco `:254-269` (os três `<Card>` do `else`) por:

```tsx
            <>
              {/* Deliberadamente sem tom. O que conta como taxa preocupante é
                  questão de produto em aberto, e um âmbar incondicional lê
                  como alerta até a 0%. O follow-up abaixo ganha tom porque
                  "qual taxa de resposta é boa" é metodologia de survey, não
                  questão clínica em aberto. */}
              <KpiCard
                metric={MANAGER_METRICS.concerningRate}
                value={`${concerningPercent}%`}
                valueClass="text-ink"
                reading={concerningRateReading({
                  percent: concerningPercent,
                  responses: referenceWeekResponses,
                  weekLabel: referenceWeekLabel,
                })}
              />
              <KpiCard
                metric={MANAGER_METRICS.checkIns}
                value={String(checkInsLast4Weeks)}
                valueClass="text-brand"
                reading={checkInsReading({
                  total: checkInsLast4Weeks,
                  visibleSectors: sectorCoverage.visible,
                })}
              />
              <KpiCard
                metric={MANAGER_METRICS.followUpRate}
                value={`${followUpPercent}%`}
                valueClass="text-muted"
                reading={followUpReading()}
                extraHelp={followUpBand.meaning}
                badge={
                  <span className="flex items-center justify-center gap-2">
                    <Pill tone="neutral">demonstração</Pill>
                    <Pill tone={followUpBand.tone === "poor" ? "warning" : "neutral"}>
                      {followUpBand.label}
                    </Pill>
                  </span>
                }
              />
            </>
```

- [ ] **Step 5: Derive the values the cards need**

No corpo de `ManagerDashboardPage`, logo abaixo de `const followUpResponseRate = ...`, acrescentar:

```tsx
  const sectorCoverage = data?.sectorCoverage ?? { visible: 0, total: 0 };
  const concerningPercent = Math.round(overallConcerningRate * 100);
  const followUpPercent = Math.round(followUpResponseRate * 100);
  // A faixa lê o mesmo inteiro que o card imprime: classificar a fração crua
  // faria 0,804 e 0,7996 exibirem ambos "80%" em faixas diferentes.
  const followUpBand = followUpBandFor(followUpPercent);
  // O KPI principal é da semana de referência, que é a última da série — não
  // uma média das seis.
  const referenceWeek = weeklyTrend[weeklyTrend.length - 1];
  const referenceWeekResponses = referenceWeek?.checkIns ?? 0;
  const referenceWeekLabel = referenceWeek ? weekLabel(referenceWeek.weekStart) : "—";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: PASS. Testes antigos que procuravam "sinais de burnout na equipe" precisam ser atualizados para o rótulo novo — é a mudança pretendida, não uma regressão.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git commit -m "feat(web): render KPI cards from the metric glossary, with readings and help

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Linha de cobertura substitui o aviso genérico

Hoje a página diz a regra ("segmentos com menos de 5 respostas ficam ocultos"); passa a dizer o número.

**Files:**

- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx:62-63` e `:223`
- Test: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:**

- Consumes: `MANAGER_METRICS`, `sectorCoverageReading` de `@zelo/domain`; `sectorCoverage` da Task 5
- Produces: nada

- [ ] **Step 1: Write the failing test**

```tsx
  it("says how much of the institution this reading covers", async () => {
    renderManager();

    await waitFor(() => {
      expect(
        screen.getByText("3 de 4 setores · 1 oculto por ter menos de 5 respostas"),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Sobre: Cobertura desta leitura" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerDashboardPage.test.tsx -t "how much of the institution"`
Expected: FAIL — o texto não existe.

- [ ] **Step 3: Replace the disclosure paragraph**

Trocar a linha `:223` por:

```tsx
      <div className="mt-3 flex max-w-[62ch] flex-wrap items-center gap-x-1.5 gap-y-1">
        <p className="text-label text-muted">{DASHBOARD_DISCLOSURE}</p>
        {data && (
          <p className="flex items-center gap-1 text-label text-ink-2" data-testid="sector-coverage">
            <span>{sectorCoverageReading(sectorCoverage)}</span>
            <MetricHelp
              label={MANAGER_METRICS.sectorCoverage.label}
              content={metricHelpContent(MANAGER_METRICS.sectorCoverage)}
            />
          </p>
        )}
      </div>
```

E encurtar a constante `:62-63`, já que o número agora diz a parte quantitativa:

```tsx
const DASHBOARD_DISCLOSURE = "Nenhum dado individual é exibido.";
```

Acrescentar `sectorCoverageReading` ao import de `@zelo/domain`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: PASS. Ajustar qualquer teste que afirmasse o texto antigo completo de `DASHBOARD_DISCLOSURE`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git commit -m "feat(web): show how many sectors a dashboard reading actually covers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Barras da tendência viram botões com tooltip

Barras hoje são `aria-hidden` com uma `<ul class="sr-only">` paralela. Pendurar tooltip nelas criaria trigger focável dentro de conteúdo escondido. Viram botões, e a lista paralela sai porque passaria a duplicar.

**Files:**

- Modify: `apps/web/src/presentation/lib/manager-trend-chart.ts:1-4` e `:73-79`
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx:283-287`, `:296-334`, `:335-364`
- Test: `apps/web/src/presentation/lib/manager-trend-chart.test.ts`, `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:**

- Consumes: `weeklyTrend[].checkIns`/`.concerning` da Task 5; `Tooltip` com `align="start"` da Task 1
- Produces: `interface TrendWeekDetail`, `trendWeekDetail(trend: TrendPoint[], index: number, peakIndex: number): TrendWeekDetail`, `describeTrendWeek(detail: TrendWeekDetail): string`

- [ ] **Step 1: Write the failing test**

Acrescentar a `apps/web/src/presentation/lib/manager-trend-chart.test.ts`:

```ts
import { trendWeekDetail, describeTrendWeek } from "./manager-trend-chart";

const TREND = [
  { weekStart: "2026-08-24T00:00:00.000Z", concerningRate: 0.4, checkIns: 20, concerning: 8 },
  { weekStart: "2026-08-31T00:00:00.000Z", concerningRate: 0.47, checkIns: 62, concerning: 29 },
];

describe("trendWeekDetail", () => {
  it("carries the numerator, the denominator and the move from the previous week", () => {
    expect(trendWeekDetail(TREND, 1, 1)).toEqual({
      weekLabel: "31 de ago.",
      percent: 47,
      concerning: 29,
      checkIns: 62,
      deltaPoints: 7,
      isPeak: true,
      isLatest: true,
    });
  });

  it("has no delta on the first week of the series", () => {
    expect(trendWeekDetail(TREND, 0, 1).deltaPoints).toBeNull();
  });
});

describe("describeTrendWeek", () => {
  // O nome acessível e a bolha saem da mesma estrutura, então não podem
  // divergir — que é o modo de falha de manter duas descrições paralelas.
  it("reads the week, the rate, the base and the move", () => {
    expect(describeTrendWeek(trendWeekDetail(TREND, 1, 1))).toBe(
      "Semana de 31 de ago.: 47%, 29 de 62 respostas, 7 pontos acima da semana anterior (pico, mais recente)",
    );
  });

  it("reads a week with no movement and no marks", () => {
    const flat = [
      { weekStart: "2026-08-24T00:00:00.000Z", concerningRate: 0.4, checkIns: 20, concerning: 8 },
      { weekStart: "2026-08-31T00:00:00.000Z", concerningRate: 0.4, checkIns: 20, concerning: 8 },
    ];
    expect(describeTrendWeek(trendWeekDetail(flat, 1, 0))).toBe(
      "Semana de 31 de ago.: 40%, 8 de 20 respostas, sem variação vs. a semana anterior (mais recente)",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/lib/manager-trend-chart.test.ts`
Expected: FAIL — `trendWeekDetail` não existe.

- [ ] **Step 3: Widen TrendPoint and rewrite the description helpers**

Em `manager-trend-chart.ts`, trocar a interface do topo:

```ts
export interface TrendPoint {
  weekStart: string;
  concerningRate: number;
  checkIns: number;
  concerning: number;
}
```

E substituir `describeTrendWeek` (`:73-79`) por:

```ts
export interface TrendWeekDetail {
  weekLabel: string;
  percent: number;
  concerning: number;
  checkIns: number;
  deltaPoints: number | null;
  isPeak: boolean;
  isLatest: boolean;
}

export function trendWeekDetail(
  trend: TrendPoint[],
  index: number,
  peakIndex: number,
): TrendWeekDetail {
  const point = trend[index]!;
  const previous = index > 0 ? trend[index - 1] : undefined;
  const percent = Math.round(point.concerningRate * 100);
  return {
    weekLabel: weekLabel(point.weekStart),
    percent,
    concerning: point.concerning,
    checkIns: point.checkIns,
    deltaPoints: previous ? percent - Math.round(previous.concerningRate * 100) : null,
    isPeak: index === peakIndex,
    isLatest: index === trend.length - 1,
  };
}

/**
 * Nome acessível de uma barra. Sai da mesma estrutura que a bolha do tooltip
 * renderiza, para que o que o leitor de tela ouve e o que o mouse mostra não
 * possam divergir.
 */
export function describeTrendWeek(detail: TrendWeekDetail): string {
  const week = detail.weekLabel ? `Semana de ${detail.weekLabel}` : "Semana";
  const base = `${detail.concerning} de ${detail.checkIns} ${detail.checkIns === 1 ? "resposta" : "respostas"}`;

  let move: string;
  if (detail.deltaPoints === null) move = "primeira semana da série";
  else if (detail.deltaPoints === 0) move = "sem variação vs. a semana anterior";
  else if (detail.deltaPoints > 0) move = `${detail.deltaPoints} pontos acima da semana anterior`;
  else move = `${Math.abs(detail.deltaPoints)} pontos abaixo da semana anterior`;

  const marks = [detail.isPeak && "pico", detail.isLatest && "mais recente"].filter(Boolean);
  const suffix = marks.length > 0 ? ` (${marks.join(", ")})` : "";

  return `${week}: ${detail.percent}%, ${base}, ${move}${suffix}`;
}
```

- [ ] **Step 4: Write the failing page test**

Acrescentar a `ManagerDashboardPage.test.tsx`:

```tsx
  it("exposes each trend week as a focusable button naming its base", async () => {
    renderManager();

    const bar = await screen.findByRole("button", {
      name: "Semana de 8 de jun.: 50%, 12 de 24 respostas, 20 pontos acima da semana anterior (pico, mais recente)",
    });
    expect(bar).toBeInTheDocument();
  });

  it("shows the week detail on focus", async () => {
    const user = userEvent.setup();
    renderManager();

    const bar = await screen.findByRole("button", { name: /Semana de 8 de jun\./ });
    bar.focus();

    const bubble = await screen.findByTestId("tooltip");
    expect(bubble).toHaveTextContent("50%");
    expect(bubble).toHaveTextContent("12 de 24 respostas");
  });

  it("keeps no focusable element inside aria-hidden content", async () => {
    const { container } = renderManager();
    await screen.findByRole("button", { name: /Semana de 8 de jun\./ });

    const hidden = container.querySelectorAll('[aria-hidden="true"] button, [aria-hidden="true"] a');
    expect(hidden).toHaveLength(0);
  });
```

- [ ] **Step 5: Turn the bars into buttons**

Em `ManagerDashboardPage.tsx`:

- **1.** Remover a `<ul data-testid="trend-description" className="sr-only">` (`:283-287`) inteira — os botões passam a anunciar o mesmo conteúdo, e `hidden`/`md:hidden` é `display:none`, que já retira o breakpoint inativo da árvore de acessibilidade.
- **2.** Remover `aria-hidden="true"` do container das barras desktop (`:307`) e do container da lista mobile (`:335`).
- **3.** Trocar cada barra desktop por um botão dentro de `Tooltip`:

```tsx
                    <div className="mt-auto hidden h-14 items-end gap-2 md:flex">
                      {bars.map((bar, index) => {
                        const detail = trendWeekDetail(weeklyTrend, index, peakWeek);
                        return (
                          <Tooltip key={index} align="start" content={<TrendWeekBubble detail={detail} />}>
                            <button
                              type="button"
                              data-testid="trend-bar"
                              aria-label={describeTrendWeek(detail)}
                              className={`w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                bar.isZero
                                  ? "bg-control-edge"
                                  : index === peakWeek
                                    ? "bg-warn"
                                    : index === weeklyTrend.length - 1
                                      ? "bg-brand"
                                      : "bg-control-edge"
                              }`}
                              style={{ height: `${trendBarProportions[index]}%` }}
                            />
                          </Tooltip>
                        );
                      })}
                    </div>
```

- **4.** Na lista mobile, envolver cada linha e trocar o `<div>` externo por `<button type="button" aria-label={describeTrendWeek(detail)} className="flex w-full items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">`, mantendo o conteúdo interno como está e marcando-o `aria-hidden="true"` para não duplicar o rótulo:

```tsx
                      {weeklyTrend.map((point, index) => {
                        const bar = bars[index]!;
                        const detail = trendWeekDetail(weeklyTrend, index, peakWeek);
                        return (
                          <Tooltip key={index} align="start" content={<TrendWeekBubble detail={detail} />}>
                            <button
                              type="button"
                              aria-label={describeTrendWeek(detail)}
                              className="flex w-full items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                              <span aria-hidden="true" className="w-19 shrink-0 whitespace-nowrap font-mono text-mono-data text-muted-2">
                                {weekLabel(point.weekStart)}
                              </span>
                              <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-pill bg-canvas-alt">
                                <span
                                  data-testid="trend-bar-mobile"
                                  className={`block h-full rounded-pill ${
                                    bar.isZero
                                      ? "bg-control-edge"
                                      : index === peakWeek
                                        ? "bg-warn"
                                        : index === weeklyTrend.length - 1
                                          ? "bg-brand"
                                          : "bg-control-edge"
                                  }`}
                                  style={{ width: `${trendBarProportions[index]}%` }}
                                />
                              </span>
                              <span aria-hidden="true" className="w-9 shrink-0 text-right font-mono text-mono-data text-muted-2">
                                {Math.round(point.concerningRate * 100)}%
                              </span>
                            </button>
                          </Tooltip>
                        );
                      })}
```

- **5.** Acrescentar o componente da bolha acima de `ManagerDashboardPage`:

```tsx
function TrendWeekBubble({ detail }: { detail: TrendWeekDetail }) {
  const move =
    detail.deltaPoints === null
      ? "Primeira semana da série"
      : detail.deltaPoints === 0
        ? "Sem variação vs. a semana anterior"
        : `${detail.deltaPoints > 0 ? "+" : "−"}${Math.abs(detail.deltaPoints)} pontos vs. a semana anterior`;

  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-semibold">Semana de {detail.weekLabel}</span>
      <span>
        {detail.percent}% — {detail.concerning} de {detail.checkIns}{" "}
        {detail.checkIns === 1 ? "resposta" : "respostas"}
      </span>
      <span>{move}</span>
    </span>
  );
}
```

- **6.** Atualizar os imports de `@/presentation/lib/manager-trend-chart` para incluir `trendWeekDetail` e `type TrendWeekDetail`, e importar `Tooltip` de `@/presentation/ui/Tooltip`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/lib/manager-trend-chart.test.ts src/presentation/pages/ManagerDashboardPage.test.tsx src/presentation/pages/a11y.test.tsx`
Expected: PASS. Testes antigos que consultavam `trend-description` precisam ser reescritos para consultar os botões.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/presentation/lib/manager-trend-chart.ts apps/web/src/presentation/lib/manager-trend-chart.test.ts apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git commit -m "feat(web): make trend weeks focusable and show their base on hover and focus

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Legendas "Pico" e "Mais recente" explicadas

Um gestor pode ler o âmbar de "Pico" como alerta de gravidade, quando ele é puramente relativo à série.

**Files:**

- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx:370-385`
- Test: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:**

- Consumes: `MetricHelp` da Task 1
- Produces: nada

- [ ] **Step 1: Write the failing test**

```tsx
  it("explains that the peak marker is relative to the series, not an alert threshold", async () => {
    const user = userEvent.setup();
    renderManager();

    const help = await screen.findByRole("button", { name: "Sobre: Pico" });
    help.focus();

    const bubble = await screen.findByTestId("tooltip");
    expect(bubble).toHaveTextContent("não é um limite de alerta");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerDashboardPage.test.tsx -t "peak marker is relative"`
Expected: FAIL — não existe botão com esse nome.

- [ ] **Step 3: Add the explanations**

Acima de `ManagerDashboardPage`, acrescentar:

```tsx
const PEAK_LEGEND_HELP =
  "A semana com a maior proporção de sinais dentro destas 6 semanas. É uma comparação relativa à própria série e não é um limite de alerta: a barra fica marcada mesmo que o valor seja baixo, porque indica o ponto mais alto do período, não que ele seja preocupante.";

const LATEST_LEGEND_HELP =
  "A última semana com dados. Aparece separada porque é a que reflete a situação atual; quando ela também é o pico, prevalece a marcação de pico.";
```

E trocar o bloco de legenda (`:370-385`), removendo o `aria-hidden` do container para que os gatilhos de ajuda fiquem alcançáveis:

```tsx
                    <div className="mt-2 flex gap-3">
                      {peakWeek !== -1 && (
                        <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warn" />
                          Pico
                          <MetricHelp label="Pico" content={PEAK_LEGEND_HELP} />
                        </span>
                      )}
                      {weeklyTrend.length > 0 &&
                        !bars[weeklyTrend.length - 1]!.isZero &&
                        peakWeek !== weeklyTrend.length - 1 && (
                          <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand" />
                            Mais recente
                            <MetricHelp label="Mais recente" content={LATEST_LEGEND_HELP} />
                          </span>
                        )}
                    </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git commit -m "feat(web): explain what the peak and latest chart legends mean

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Exportações do PGR leem o glossário

O rótulo está hardcoded em CSV e PDF; a paridade entre tela e documento de auditoria é o que o produto vende.

**Files:**

- Modify: `apps/web/src/presentation/lib/download-manager-pgr-report.ts:29-42` e `:72-80`
- Test: `apps/web/src/presentation/lib/download-manager-pgr-report.test.ts`

**Interfaces:**

- Consumes: `MANAGER_METRICS`, `MANAGER_METHODOLOGY_VERSION`, `sectorCoverageReading` de `@zelo/domain`
- Produces: nada

- [ ] **Step 1: Write the failing test**

Acrescentar a `download-manager-pgr-report.test.ts` (ajustar o fixture existente para incluir os campos novos):

```ts
import { MANAGER_METRICS } from "@zelo/domain";

  it("uses the glossary label, so the export and the screen cannot disagree", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));

    expect(lines.some((line) => line.includes(MANAGER_METRICS.concerningRate.label))).toBe(true);
    expect(lines.some((line) => /burnout/i.test(line))).toBe(false);
  });

  it("records how much of the institution the export covers", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));

    expect(lines.some((line) => line.includes("4 de 7 setores"))).toBe(true);
  });

  it("marks the follow-up line as demonstration data", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));
    const followUp = lines.find((line) => line.includes(MANAGER_METRICS.followUpRate.label))!;

    expect(followUp).toContain("dado de demonstração — não usar como evidência");
  });

  // Escrever "Ótima" ao lado de um número simulado dentro do insumo de PGR é
  // exatamente a falha que o rótulo de demonstração existe para impedir.
  it("never writes an interpretation band while the follow-up is demonstration data", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));

    for (const band of ["Ótima", "Média", "Baixa"]) {
      expect(lines.some((line) => line.includes(band))).toBe(false);
    }
  });

  it("points at the methodology page and its version", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));

    expect(lines.some((line) => line.includes("/manager/methodology"))).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/lib/download-manager-pgr-report.test.ts`
Expected: FAIL — o CSV ainda escreve "Sinais de burnout na equipe".

- [ ] **Step 3: Rewrite the CSV builder**

Em `download-manager-pgr-report.ts`, acrescentar no topo:

```ts
import { MANAGER_METRICS, MANAGER_METHODOLOGY_VERSION, sectorCoverageReading } from "@zelo/domain";

const DEMONSTRATION_SUFFIX = " (dado de demonstração — não usar como evidência)";
```

E trocar `buildPgrCsvLines` por:

```ts
export function buildPgrCsvLines(data: ManagerSignalsResponse, generatedAt: Date): string[] {
  return [
    csvQuote("Insumo para o PGR - Zelo"),
    csvQuote(formatDate(generatedAt)),
    csvQuote(DISCLAIMER),
    csvQuote(sectorCoverageReading(data.sectorCoverage)),
    "",
    "Métrica,Valor",
    `${MANAGER_METRICS.concerningRate.label},${Math.round(data.overallConcerningRate * 100)}%`,
    `${MANAGER_METRICS.checkIns.label} (4 semanas),${data.checkInsLast4Weeks}`,
    // Sem faixa de interpretação: enquanto o valor for de demonstração, um
    // rótulo como "Ótima" dentro de um documento de conformidade afirmaria
    // sobre a instituição algo que este número não mede.
    `${MANAGER_METRICS.followUpRate.label}${DEMONSTRATION_SUFFIX},${Math.round(data.followUpResponseRate * 100)}%`,
    "",
    "Setor,Sinais (%),n",
    ...data.segments.map((segment) => `${segment.label},${segment.value}%,${segment.n}`),
    "",
    csvQuote(`Metodologia: /manager/methodology — versão ${MANAGER_METHODOLOGY_VERSION}`),
  ];
}
```

- [ ] **Step 4: Mirror the changes in the PDF**

Trocar as três linhas de métrica em `downloadPgrReportAsPdf` (`:72-77`) por:

```ts
  doc.text(`${MANAGER_METRICS.concerningRate.label}: ${Math.round(data.overallConcerningRate * 100)}%`, 14, y);
  y += LINE_HEIGHT;
  doc.text(`${MANAGER_METRICS.checkIns.label} (4 semanas): ${data.checkInsLast4Weeks}`, 14, y);
  y += LINE_HEIGHT;
  const followUpLines = doc.splitTextToSize(
    `${MANAGER_METRICS.followUpRate.label}${DEMONSTRATION_SUFFIX}: ${Math.round(data.followUpResponseRate * 100)}%`,
    180,
  );
  doc.text(followUpLines, 14, y);
  y += followUpLines.length * LINE_HEIGHT;
  doc.text(sectorCoverageReading(data.sectorCoverage), 14, y);
  y += LINE_HEIGHT + 6;
```

E, no final da geração do PDF, antes do download, acrescentar o rodapé:

```ts
  y += 6;
  doc.setFontSize(9);
  doc.text(`Metodologia: /manager/methodology — versão ${MANAGER_METHODOLOGY_VERSION}`, 14, y);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/lib/download-manager-pgr-report.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/lib/download-manager-pgr-report.ts apps/web/src/presentation/lib/download-manager-pgr-report.test.ts
git commit -m "feat(web): drive the PGR exports from the metric glossary

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Rota `/manager/methodology`

Metodologia citável. A tabela por indicador é gerada do glossário; só a prosa é escrita à mão.

**Files:**

- Create: `apps/web/src/presentation/pages/ManagerMethodologyPage.tsx`
- Test: `apps/web/src/presentation/pages/ManagerMethodologyPage.test.tsx`
- Modify: `apps/web/src/presentation/lib/routes.ts`, `apps/web/src/app/router.tsx:131-134`, `apps/web/src/presentation/layout/manager-nav.ts:17-21`

**Interfaces:**

- Consumes: `MANAGER_METRICS`, `MANAGER_METHODOLOGY_VERSION` de `@zelo/domain`
- Produces: `routes.managerMethodology = "/manager/methodology"`

- [ ] **Step 1: Write the failing test**

Criar `apps/web/src/presentation/pages/ManagerMethodologyPage.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MANAGER_METRICS, MANAGER_METHODOLOGY_VERSION } from "@zelo/domain";
import { ManagerMethodologyPage } from "./ManagerMethodologyPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <ManagerMethodologyPage />
    </MemoryRouter>,
  );
}

describe("ManagerMethodologyPage", () => {
  // Gerada do glossário: acrescentar uma métrica lá tem que bastar para ela
  // aparecer aqui, senão a página envelhece em silêncio.
  it("documents every metric in the glossary", () => {
    renderPage();

    for (const metric of Object.values(MANAGER_METRICS)) {
      expect(screen.getByText(metric.label)).toBeInTheDocument();
      expect(screen.getByText(metric.method)).toBeInTheDocument();
      expect(screen.getByText(metric.window)).toBeInTheDocument();
      expect(screen.getByText(metric.suppression)).toBeInTheDocument();
    }
  });

  it("states the methodology version, so a change of rule is datable", () => {
    renderPage();
    expect(screen.getByText(new RegExp(MANAGER_METHODOLOGY_VERSION))).toBeInTheDocument();
  });

  it("discloses that a device is not a person", () => {
    renderPage();
    expect(screen.getByText(/um dispositivo não é uma pessoa/i)).toBeInTheDocument();
  });

  it("discloses that the chart uses a relative scale, not 0 to 100", () => {
    renderPage();
    expect(screen.getByText(/não contra 0% a 100%/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerMethodologyPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./ManagerMethodologyPage"`

- [ ] **Step 3: Create the page**

Criar `apps/web/src/presentation/pages/ManagerMethodologyPage.tsx`:

```tsx
import { MANAGER_METRICS, MANAGER_METHODOLOGY_VERSION } from "@zelo/domain";
import { Card } from "@/presentation/ui/Card";
import { CardTitle } from "@/presentation/ui/CardTitle";
import { SectionLabel } from "@/presentation/ui/SectionLabel";
import { MANAGER_INSIGHT_DISCLAIMER } from "@/presentation/lib/manager-insight-disclaimer";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "O que o Zelo mede",
    body: "As autoavaliações usam PHQ-9 (sintomas de depressão) e GAD-7 (sintomas de ansiedade), aplicadas em duas etapas: uma triagem curta e, em caso de pontuação positiva, o questionário completo. Nenhuma delas mede burnout diretamente — o que o painel chama de sinal de sofrimento relevante é um escore acima da faixa leve, condição associada na literatura a maior risco de esgotamento profissional.",
  },
  {
    title: "Como um sinal vira um número",
    body: "A resposta é cifrada no aparelho antes de qualquer envio. O que chega ao servidor é um incremento em um contador por setor e por semana — não existe registro individual no banco, apenas contadores. A deduplicação é por dispositivo e semana, e um dispositivo não é uma pessoa: dois profissionais que compartilham um tablet contam como um, e um profissional com dois aparelhos conta como dois. É uma imprecisão inevitável sob anonimato, e ela precisa ser considerada ao ler \"respostas\" como se fosse \"pessoas\".",
  },
  {
    title: "A regra de privacidade",
    body: "Um setor só aparece se tiver ao menos 5 respostas na semana de referência; abaixo disso ele fica fora de todos os números da página, não apenas da lista por setor. A semana de referência é a mais recente em que algum setor atinge esse mínimo — e não simplesmente a última semana do calendário, porque uma semana em curso é parcial por definição e faria o painel inteiro desaparecer toda segunda-feira.",
  },
  {
    title: "Como ler o gráfico de tendência",
    body: "As barras são desenhadas em escala relativa à própria série, com uma folga de 10 pontos em cada extremo — ou seja, elas comparam as semanas entre si, e não contra 0% a 100%. Uma variação de 40% para 47% ocupa boa parte da altura por esse motivo. O percentual impresso acima de cada barra é sempre o valor literal, e é ele que deve ser citado.",
  },
  {
    title: "O que este painel não é",
    body: MANAGER_INSIGHT_DISCLAIMER,
  },
];

export function ManagerMethodologyPage() {
  return (
    // O uso real previsto é virar anexo de documento de PGR, então a página
    // precisa imprimir limpa: sem fundo, sem sombra e sem quebrar um
    // indicador ao meio entre duas páginas.
    <div className="max-w-[80ch] print:max-w-none [&_*]:print:shadow-none [&_*]:print:bg-transparent">
      <SectionLabel>Transparência</SectionLabel>
      <h1 className="mt-1 text-h1 text-ink">Como calculamos estes números</h1>
      <p className="mt-2 text-label text-muted">Versão {MANAGER_METHODOLOGY_VERSION}</p>

      <div className="mt-5 flex flex-col gap-3.5">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardTitle>{section.title}</CardTitle>
            <p className="mt-2 text-pretty text-label text-ink-2">{section.body}</p>
          </Card>
        ))}

        <Card>
          <CardTitle>Cada indicador</CardTitle>
          <div className="mt-3 flex flex-col gap-4">
            {Object.values(MANAGER_METRICS).map((metric) => (
              <div key={metric.id} className="break-inside-avoid border-t border-line pt-3 first:border-t-0 first:pt-0">
                <p className="text-body font-extrabold text-ink">{metric.label}</p>
                <dl className="mt-1.5 flex flex-col gap-1.5 text-label text-ink-2">
                  <div>
                    <dt className="font-mono text-mono-data text-muted-2">Como é calculado</dt>
                    <dd className="text-pretty">{metric.method}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-mono-data text-muted-2">Janela</dt>
                    <dd className="text-pretty">{metric.window}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-mono-data text-muted-2">Supressão</dt>
                    <dd className="text-pretty">{metric.suppression}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Register the route and the nav entry**

Em `apps/web/src/presentation/lib/routes.ts`, acrescentar depois de `managerHistory`:

```ts
  managerMethodology: "/manager/methodology",
```

Em `apps/web/src/app/router.tsx`, importar a página e acrescentar ao array `children` do `ManagerShell`, depois de `manager/history`:

```tsx
      { path: "manager/methodology", Component: ManagerMethodologyPage },
```

Em `apps/web/src/presentation/layout/manager-nav.ts`, acrescentar `BookOpen` ao import de `lucide-react` e a entrada ao final de `MANAGER_PRIMARY_NAV`:

```ts
  { id: 'methodology', label: 'Como calculamos', icon: BookOpen, route: routes.managerMethodology },
```

- [ ] **Step 5: Link from the dashboard footer**

No fim do JSX de `ManagerDashboardPage`, antes do `</div>` externo:

```tsx
      <p className="mt-4 text-label text-muted">
        <Link
          to={routes.managerMethodology}
          className="rounded-control font-bold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Como calculamos estes números
        </Link>
      </p>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerMethodologyPage.test.tsx src/presentation/layout/ManagerNav.test.tsx`
Expected: PASS. `ManagerNav.test.tsx` pode afirmar a contagem de itens do menu primário — atualizar para 4.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerMethodologyPage.tsx apps/web/src/presentation/pages/ManagerMethodologyPage.test.tsx apps/web/src/presentation/lib/routes.ts apps/web/src/app/router.tsx apps/web/src/presentation/layout/manager-nav.ts apps/web/src/presentation/layout/ManagerNav.test.tsx apps/web/src/presentation/pages/ManagerDashboardPage.tsx
git commit -m "feat(web): add a citable methodology page generated from the glossary

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Prompt da IA recebe denominadores, cobertura e a ressalva de demonstração

Hoje o modelo lê `40%, 42%, 44%` sem saber se cada ponto vem de 8 ou de 180 respostas, e pode afirmar tendência onde há ruído.

**Files:**

- Modify: `apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.ts:48-65`
- Test: `apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.test.ts`

**Interfaces:**

- Consumes: `ManagerSignalsResponse` da Task 4; `MANAGER_METRICS` da Task 3
- Produces: nada

**IMPORTANTE — leia antes de escrever qualquer teste:** este arquivo de teste já existe e já compõe `GenerateManagerInsightUseCase` a partir do `GetManagerSignalsUseCase` **real**, alimentado por uma `FakeSignalRepository` que já está declarada no arquivo — não pelo objeto do use case mockado diretamente. Não introduza um helper novo nem um `ManagerSignalsResponse` escrito à mão: use exatamente o padrão que as quatro `it()` existentes já seguem (`new FakeSignalRepository([...])` → `new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository())` → `new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository, sectorRepository as never)` → `useCase.execute("Ana Konder", "institution-1")` → asserção em `aiInsight.lastParams?.summary`). As classes `FakeSignalRepository`, `FakeSectorRepository`, `FakeSimulatedFollowUpRepository`, `FakeAiInsightPort` e `FakeManagerInsightRepository` já existem no topo do arquivo — reutilize-as.

**A primeira `it()` do arquivo quebra com esta mudança e precisa ser atualizada, não só as novas serem acrescentadas.** Ela afirma o texto exato do `summary` antigo, que este task reescreve.

- [ ] **Step 1: Update the existing test's assertions to the new summary text**

Na primeira `it()` (`"formats the current ManagerSignalsResponse into a PT-BR summary..."`), trocar as três linhas de asserção sobre `summary`:

```ts
    expect(aiInsight.lastParams?.summary).toContain("Respostas com sinal de sofrimento relevante: 60%");
    expect(aiInsight.lastParams?.summary).toContain("UTI: 60% (n=10)");
    expect(aiInsight.lastParams?.summary).toContain(
      "Tendência semanal (taxa e base por semana, 2 semanas): 30% (n=10), 60% (n=10)",
    );
    expect(aiInsight.lastParams?.summary).toContain("Cobertura: 1 de 1 setores");
    expect(aiInsight.lastParams?.summary).toContain(
      "Taxa de resposta do follow-up: 0% — dado de demonstração, não reflete esta instituição",
    );
```

A segunda linha (`"UTI: 60% (n=10)"`) já era verdadeira antes — o formato de segmento não muda nesta task — mas é repetida aqui para o bloco ficar completo e substituível de uma vez.

- [ ] **Step 2: Write the failing test for suppression reaching the summary**

Acrescentar ao `describe`, depois da primeira `it()`:

```ts
  it("keeps a sub-threshold sector out of every number in the summary, but still reports it was suppressed", async () => {
    const signalsRepository = new FakeSignalRepository([
      { sectorId: "sector-uti", sectorName: "UTI", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { sectorId: "sector-peq", sectorName: "Pediatria", weekStart: WEEK_2, checkIns: 3, concerning: 1 },
    ]);
    const getManagerSignals = new GetManagerSignalsUseCase(signalsRepository, new FakeSimulatedFollowUpRepository());
    const aiInsight = new FakeAiInsightPort({ interpretation: "texto", suggestedActions: [] });
    const insightRepository = new FakeManagerInsightRepository();
    const sectorRepository = new FakeSectorRepository([
      { id: "sector-uti", name: "UTI" },
      { id: "sector-peq", name: "Pediatria" },
    ]);
    const useCase = new GenerateManagerInsightUseCase(getManagerSignals, aiInsight, insightRepository, sectorRepository as never);

    await useCase.execute("Ana Konder", "institution-1");

    const summary = aiInsight.lastParams?.summary ?? "";
    // 3 check-ins fica abaixo do limiar de 5: o setor nunca deveria contribuir
    // para nenhum agregado, nem sequer para o denominador da tendência.
    expect(summary).toContain("Cobertura: 1 de 2 setores");
    expect(summary).toContain("Respostas com sinal de sofrimento relevante: 40%");
    expect(summary).toContain("Tendência semanal (taxa e base por semana, 1 semanas): 40% (n=10)");
    expect(summary).not.toContain("Pediatria");
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/generate-manager-insight.use-case.test.ts`
Expected: FAIL — a primeira `it()` falha nas novas asserções (texto antigo ainda no código), a segunda `it()` nova falha porque `signals.sectorCoverage` ainda não existe no `formatSummary`.

- [ ] **Step 4: Rewrite formatSummary**

Acrescentar ao topo do arquivo:

```ts
import { MANAGER_METRICS } from "@zelo/domain";
```

E trocar o método:

```ts
  private formatSummary(signals: ManagerSignalsResponse): string {
    // O denominador viaja junto de cada ponto: sem ele o modelo lê
    // "40%, 42%, 44%" sem saber se cada semana tem 8 ou 180 respostas, e
    // afirma tendência onde há ruído de amostra.
    const trendLine = signals.weeklyTrend
      .map((point) => `${Math.round(point.concerningRate * 100)}% (n=${point.checkIns})`)
      .join(", ");
    const segmentLines = signals.segments
      .map((segment) => `  - ${segment.label}: ${segment.value}% (n=${segment.n})`)
      .join("\n");

    return [
      "Dados agregados da equipe (última semana visível, últimas 6 semanas de tendência):",
      `- Cobertura: ${signals.sectorCoverage.visible} de ${signals.sectorCoverage.total} setores atingiram o mínimo de 5 respostas e entram nos números abaixo.`,
      `- ${MANAGER_METRICS.concerningRate.label}: ${Math.round(signals.overallConcerningRate * 100)}%`,
      `- ${MANAGER_METRICS.checkIns.label} (4 semanas): ${signals.checkInsLast4Weeks}`,
      `- Tendência semanal (taxa e base por semana, ${signals.weeklyTrend.length} semanas): ${trendLine}`,
      `- ${MANAGER_METRICS.followUpRate.label}: ${Math.round(signals.followUpResponseRate * 100)}% — dado de demonstração, não reflete esta instituição; não baseie nenhuma recomendação nele.`,
      "- Por setor (apenas setores com 5+ respostas, por privacidade):",
      segmentLines,
    ].join("\n");
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/`
Expected: PASS.

- [ ] **Step 6: Run the whole monorepo suite**

Run: `pnpm test`
Expected: PASS em `@zelo/domain`, `@zelo/api` e `@zelo/web`.

- [ ] **Step 7: Run lint and boundary checks**

Run: `pnpm lint && pnpm lint:boundaries`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.ts apps/api/src/modules/manager/application/use-cases/generate-manager-insight.use-case.test.ts
git commit -m "feat(api): give the insight model weekly denominators, coverage and the demo caveat

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Verificação final

Depois da Task 12, conferir à mão no app rodando (`pnpm dev`), logado como gestor:

- [ ] Nenhuma tela do painel contém a palavra "burnout" como rótulo de indicador
- [ ] O card principal mostra a linha "X% das N respostas na semana de …"
- [ ] A linha de cobertura mostra visíveis, total e ocultos
- [ ] Cada barra da tendência é alcançável por Tab e abre a bolha no foco
- [ ] "Pico" e "Mais recente" têm ícone de ajuda que explica o significado
- [ ] O card de follow-up mostra a pill "demonstração" e a faixa
- [ ] `/manager/methodology` abre pelo menu e pelo link do rodapé, e imprime de forma legível
- [ ] O CSV exportado não contém "burnout", contém a linha de cobertura, marca o follow-up como demonstração e não contém nenhuma faixa
