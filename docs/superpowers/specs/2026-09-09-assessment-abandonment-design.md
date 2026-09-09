# Modal de confirmação ao abandonar o questionário

**Date:** 2026-09-09

## Problem

Hoje o médico pode iniciar um questionário (`ScaleAssessmentPage`) e sair a qualquer momento —
tocar em Home, no bottom-nav, no botão de voltar — sem nenhum aviso e sem que isso deixe rastro
algum. O rascunho em `assessment-draft.ts` só existe em `sessionStorage`, é puramente local, e
nunca foi pensado para detectar ou reportar abandono. Do lado do gestor, não existe hoje nenhum
número que diferencie "ninguém está respondendo" de "estão começando e desistindo" — os dois
cenários são indistinguíveis no dashboard atual (ver `branstorms.md`, item 1.1, marcado
**IMPORTANTE!!!**).

A ideia: mostrar um modal de confirmação quando o médico tenta sair de um questionário já
iniciado, e contar quantos desses abandonos acontecem por setor/semana, para o gestor enxergar
esse número (com a mesma supressão por k-anonimato que já protege todo o resto do dashboard).

## Scope

**In scope.**

- Modal de confirmação ("Sair sem terminar?") ao tentar navegar para fora de `ScaleAssessmentPage`
  dentro do app, mas só depois que o médico já respondeu pelo menos 1 pergunta.
- Registro de abandono no backend — reaproveitando a tabela `Signal` e a mesma lógica de
  k-anonimato/semana de referência já usada para `checkIns`/`concerning`.
- Um KPI agregado da instituição no `ManagerDashboardPage` (`abandonedLast4Weeks`, mesmo formato
  de `checkInsLast4Weeks`) e a mesma linha no export do PGR (CSV e PDF).
- Gating pelo mesmo par de condições que já existe para o check-in de conclusão: vínculo de
  instituição/setor presente **e** opt-in agregado ativo. Nenhuma mudança de consentimento é
  necessária aqui — a cópia já foi ampliada para cobrir isso (commit `3686df7`).

**Out of scope, deliberadamente.**

- Interceptar fechar aba, dar refresh ou fechar o PWA (`beforeunload`) — só navegação dentro do
  app via `useBlocker`. Decisão já tomada: o diálogo nativo do navegador não é customizável e o
  evento `unload` não garante que a requisição de rede complete.
- Disparar o modal antes da 1ª resposta — abrir a tela e sair sem responder nada não conta como
  abandono.
- Detalhamento por setor no dashboard (tipo o card "Sinais por setor") — só o número agregado da
  instituição nesta v1. Se depois fizer falta, é extensão aditiva sobre a mesma coluna `abandoned`.
- Rascunho de chat não enviado (segunda metade do item 1.1 do brainstorm) — feature separada, com
  seu próprio texto de consentimento a definir; não faz parte desta entrega.
- Incluir `abandonedLast4Weeks` no prompt de `GenerateManagerInsightUseCase` (a análise por IA) —
  fica de fora até decidirmos se isso muda a leitura que a IA já faz dos indicadores existentes.
- Zerar/decrementar o contador quando o médico volta depois e conclui o mesmo questionário — cada
  saída confirmada é um evento independente; um abandono seguido de uma conclusão soma nos dois
  contadores, sem tentar reconciliar os dois.

## Modelo de dados

`apps/api/prisma/schema.prisma` — `Signal` ganha uma coluna, na mesma linha semanal por setor que
já guarda `checkIns`/`concerning`:

```prisma
model Signal {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  sectorId      String
  sector        Sector      @relation(fields: [sectorId], references: [id])
  weekStart     DateTime
  checkIns      Int         @default(0)
  concerning    Int         @default(0)
  abandoned     Int         @default(0)
  createdAt     DateTime    @default(now())

  @@unique([institutionId, sectorId, weekStart])
  @@map("signals")
}
```

Migration: `prisma migrate dev` adiciona a coluna com `DEFAULT 0` — sem backfill necessário, linhas
existentes simplesmente começam em zero.

`SignalDedupKey` (tabela existente, `dedupKey String @id`) é reaproveitada sem mudança de schema —
só muda o conteúdo do hash (ver Backend).

## Backend

Reaproveita o módulo `signal-checkin` inteiro em vez de criar um módulo novo — mesmo controller,
mesmo padrão de use-case, mesma tabela.

**Repositório** (`apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`):
novo método ao lado de `recordCheckin`, mesma forma de retorno:

```ts
export interface RecordAbandonmentParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  dedupKey: string;
}

export interface SignalCheckinRepository {
  recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null>;
  /** The row's abandoned count after the increment, or null when deduplicated. */
  recordAbandonment(params: RecordAbandonmentParams): Promise<{ abandoned: number } | null>;
}
```

`PrismaSignalCheckinRepository.recordAbandonment` espelha `recordCheckin`: mesma transação
(`signalDedupKey.create` seguido de `signal.upsert`), incrementando só `abandoned` — não toca em
`checkIns` nem `concerning`, porque um abandono não é uma resposta completa. Mesmo tratamento de
`P2002` (dedup, retorna `null`) e `P2003` (`UnknownInstitutionOrSectorError`, vira 400).

**Use case novo**, `RecordAssessmentAbandonmentUseCase`
(`apps/api/src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.ts`),
espelhando `RecordSignalCheckinUseCase`:

```ts
export interface RecordAssessmentAbandonmentInput {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export class RecordAssessmentAbandonmentUseCase {
  async execute(input: RecordAssessmentAbandonmentInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    // Prefixo "abandon:" garante um namespace de dedup independente do
    // check-in de conclusão: o mesmo médico pode contar uma vez em cada
    // contador, no mesmo setor, na mesma semana — são eventos diferentes.
    const dedupKey = createHash("sha256")
      .update(`abandon:${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`)
      .digest("hex");

    await this.repository.recordAbandonment({ institutionId: input.institutionId, sectorId: input.sectorId, weekStart, dedupKey });
  }
}
```

Sem notificação de `SECTOR_BECAME_VISIBLE` aqui — esse gatilho já existe em `recordCheckin` e
dispara pelo cruzamento do limiar de `checkIns`, não de `abandoned`.

**Controller** (`SignalCheckinController`, mesmo arquivo): novo endpoint `POST /signals/abandon`,
mesmo formato de schema e resposta (`204`, `BadRequestException` nos mesmos dois casos):

```ts
const SignalAbandonSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  deviceSignalId: z.string().min(1),
});

@Post("abandon")
@HttpCode(204)
async abandon(@Body() body: unknown): Promise<void> {
  const parsed = SignalAbandonSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
  try {
    await this.recordAbandonment.execute(parsed.data);
  } catch (error) {
    if (error instanceof UnknownInstitutionOrSectorError) throw new BadRequestException("Unknown institutionId or sectorId");
    throw error;
  }
}
```

`signal-checkin.module.ts` ganha o novo use case e o repositório reaproveitado (mesmo provider).

**`get-manager-signals.use-case.ts`**: soma `abandoned` das linhas visíveis dos últimos 4
semanas, do mesmo jeito que já faz para `checkInsLast4Weeks` — mesmo `visibleRows`, mesmo
`recentWeekTimes`. Visibilidade continua decidida só por `checkIns >= K_ANONYMITY_THRESHOLD` na
semana de referência: `abandoned` nunca entra nesse cálculo, só é somado depois, para os setores
que já passaram no critério existente. Isso é o que garante que abandono não vaza informação de
setores que a supressão de check-in já esconde. Novo campo na resposta:

```ts
export interface ManagerSignalsResponse {
  // ...campos existentes
  abandonedLast4Weeks: number;
}
```

## Frontend — médico

**`ScaleAssessmentPage.tsx`**: novo `useBlocker` (de `react-router`), condicionado a
`answers.some((a) => a !== undefined)` — mesmo teste de progresso que já existe implicitamente no
componente (`showResumed`, `resumed.current`). Quando o blocker entra em estado `"blocked"`, abre
um componente novo, `AbandonAssessmentModal.tsx` (extraído, não inline — mesmo padrão de
`LinkInstitutionConfirmStep.tsx`/`SectorQrCodeModal.tsx`: componente próprio, testável isolado,
recebendo `blocker` como prop): `Modal size="sm"`, footer com `Button variant="outline"`
("Continuar respondendo", chama `blocker.reset()`) e `Button variant="danger"` ("Sair mesmo
assim", chama `blocker.proceed()` e dispara o registro).

O registro é fire-and-forget, no mesmo formato de `useSubmitAssessment.ts`:

```ts
const { institutionId, sectorId, deviceSignalId } = useInstitutionLinkStore.getState();
const { aggregateOptIn } = useConsentStore.getState();
if (institutionId !== null && sectorId !== null && deviceSignalId !== null && aggregateOptIn) {
  void recordAssessmentAbandonmentUseCase.execute({ institutionId, sectorId, deviceSignalId }).catch(() => {});
}
```

Sem instituição vinculada ou sem opt-in: zero chamadas de rede, exatamente como o check-in de
conclusão hoje.

**Novas peças, espelhando `signal-checkin` ponta a ponta:**

- `apps/web/src/ports/signal-abandonment.port.ts` — porta análoga a `SignalCheckinPort`.
- `apps/web/src/infrastructure/http/http-signal-abandonment.adapter.ts` — `POST
  ${API_BASE_URL}/signals/abandon`.
- `apps/web/src/use-cases/record-assessment-abandonment.usecase.ts` — mesmo formato do use case de
  check-in (`link: InstitutionLinkSnapshot | null`, `execute` vira no-op se `link === null`).
- Registrado em `apps/web/src/app/container.ts` ao lado de `recordSignalCheckinUseCase`.

## Frontend — gestor

**`ManagerDashboardPage.tsx`**: novo `KpiCard` no mesmo grid dos três existentes
(`concerningRate`, `checkIns`, `followUpRate`), lendo `data?.abandonedLast4Weeks ?? 0`. Sem estado
vazio dedicado — cai no mesmo `checkInsLast4Weeks === 0` já existente (`KPI_EMPTY`), já que
abandono nunca aparece sem check-ins visíveis por trás.

**`packages/domain/src/manager/metric-glossary.ts`**: novo id `"abandoned"` em `ManagerMetricId` e
entrada em `MANAGER_METRICS`, documentando method/window/suppression igual às demais — window
igual ao de `checkIns` ("últimas 4 semanas com dados"), suppression explicando que só conta setores
já visíveis pelo critério de check-ins. `MANAGER_METHODOLOGY_VERSION` sobe (nova regra entrando).

**`download-manager-pgr-report.ts`**: uma linha nova no CSV (`Métrica,Valor`) e no PDF, no mesmo
padrão de `checkInsLast4Weeks`, usando `MANAGER_METRICS.abandoned.label`.

**`apps/web/src/ports/manager-signals.port.ts`**: `abandonedLast4Weeks: z.number()` no schema de
resposta.

## Tratamento de erros

- Registro de abandono falhando (rede, 500, o que for) nunca aparece pro médico — `.catch(() =>
  {})`, mesmo padrão do check-in de conclusão. O médico já saiu da tela; não há UI pra mostrar erro
  nem sentido em tentar de novo.
- `institutionId`/`sectorId` inválidos no backend → 400, mesmo `UnknownInstitutionOrSectorError`
  já existente (não deveria acontecer na prática — o `deviceSignalId`/vínculo vem do mesmo estado
  local que o check-in de conclusão já usa com sucesso).
- Dedup (mesmo médico, mesmo setor, mesma semana, um segundo "sair mesmo assim" depois de voltar e
  desistir de novo) → `recordAbandonment` retorna `null`, use case não faz nada além disso — sem
  erro, sem efeito colateral visível.

## Testes

TDD, mesmo padrão do resto do projeto:

- Backend: `RecordAssessmentAbandonmentUseCase` (dedup key inclui o prefixo certo, chama o
  repositório com os campos certos); `PrismaSignalCheckinRepository.recordAbandonment` (incrementa
  só `abandoned`, dedup via `P2002`, `UnknownInstitutionOrSectorError` via `P2003`); teste de
  integração do controller para `POST /signals/abandon` (sucesso, 400 de validação, 400 de
  institution/sector desconhecidos); `GetManagerSignalsUseCase` — `abandonedLast4Weeks` some junto
  com o resto quando o setor está suprimido, soma correta quando visível.
- Frontend: `useBlocker` em `ScaleAssessmentPage` (não bloqueia com zero respostas, bloqueia com
  pelo menos 1, "Continuar respondendo" cancela e mantém o estado, "Sair mesmo assim" navega e
  dispara o registro); `RecordAssessmentAbandonmentUseCase` (no-op sem link); adapter HTTP; o novo
  `KpiCard` em `ManagerDashboardPage` (valor, leitura, estado vazio compartilhado); as linhas novas
  em `download-manager-pgr-report.ts` (CSV e PDF).
- Manual smoke test: iniciar um questionário como médico vinculado com opt-in ativo, responder 1
  pergunta, tentar sair, confirmar; como gestor, ver o KPI subir (ou continuar oculto, se o setor
  ainda não bateu k=5 por check-ins); baixar o PGR e conferir a linha nova.

## Riscos e decisões já fechadas (não reabrir sem novo motivo)

- Só navegação in-app (`useBlocker`); sem `beforeunload`.
- Limiar de "iniciado" é a 1ª resposta, não a abertura da tela.
- `abandoned` mora na mesma linha do `Signal`, herdando a supressão por `checkIns`, não uma
  supressão própria.
- V1 é só o agregado da instituição — sem detalhamento por setor no dashboard.
- Rascunho de chat não enviado é feature separada, fora desta entrega.
