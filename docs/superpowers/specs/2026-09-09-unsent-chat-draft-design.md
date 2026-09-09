# Registrar rascunho de chat não enviado

**Date:** 2026-09-09

## Problem

Hoje o `ChatComposer` guarda o texto digitado só em `useState` local — não sobrevive a um
refresh, não é enviado a lugar nenhum, some quando o médico navega pra outra tela. Não existe
nenhum sinal, nem individual nem agregado, de que alguém começou a escrever pro chat da IA e
desistiu antes de enviar (ver `branstorms.md`, item 1.1, segunda metade). É a mesma lacuna que o
questionário tinha antes da feature de abandono — só que sem pedido de modal de confirmação: o
item original só pede pra "salvar a informação", pra que o gestor consiga enxergar quantos
médicos iniciam uma conversa e desistem.

## Scope

**In scope.**

- Detecção silenciosa: quando o médico sai da tela de chat (navegação dentro do app) com texto
  não-vazio (`trim().length > 0`) ainda no composer, um sinal é registrado. Sem modal, sem
  interceptar a navegação — o médico sai livremente.
- Generalizar `SignalCheckinRepository`: os três métodos atuais (`recordCheckin`,
  `recordAbandonment`) e o novo (`recordUnsentChatDraft`) colapsam num único método de
  repositório parametrizado, já que a transação (dedup + upsert incrementando uma coluna do
  `Signal`) é idêntica nos três casos. Use cases e endpoints continuam finos e separados por
  nome — só a camada de repositório generaliza.
- Nova coluna `Signal.unsentChatDrafts`, mesma supressão por k-anonimato herdada de `checkIns`
  que `abandoned` já tem — nunca decide visibilidade sozinha.
- Novo endpoint `POST /signals/chat-draft`, mesmo formato de `/signals/abandon` (sem auth, 204,
  mesmo corpo de 3 campos).
- Novo KPI no dashboard do gestor (`unsentChatDraftsLast4Weeks`, agregado da instituição, sem
  detalhamento por setor — mesmo tratamento do KPI de abandono) e nova linha no export PGR.
- Estender a linha 2 do consentimento (o único item opt-in) de novo, incluindo rascunho de chat
  no mesmo parênteses de exemplos que já cobre o questionário.

**Out of scope, deliberadamente.**

- Guardar o conteúdo do rascunho — nem localmente (sessionStorage, como o questionário tem via
  `assessment-draft.ts`), nem no servidor. Só um contador incrementa; o texto em si nunca sai do
  `useState` do composer e nunca é lido por este recurso. `chat-conversation.store.ts` já
  documenta essa decisão de privacidade pro histórico de mensagens enviadas — o rascunho não
  enviado segue a mesma régua, com ainda mais razão (é o que a pessoa decidiu *não* mandar).
- Modal de confirmação antes de sair do chat — decisão já tomada no brainstorm: chat é mais
  exploratório que questionário, e o item original nunca pediu isso.
- Interceptar fechar aba/refresh (`beforeunload`) — mesma decisão já tomada pro questionário. A
  desmontagem por navegação in-app basta, e é a única coisa que dispara de forma confiável de
  qualquer forma.
- Detalhamento por setor no dashboard — mesma decisão da v1 do KPI de abandono.
- Reconciliar com "Nova conversa" (`ChatRestartAction`) — reiniciar a conversa não mexe no
  composer nem desmonta nada, então não interage com esse contador de forma alguma.

## Modelo de dados

`apps/api/prisma/schema.prisma` — `Signal` ganha mais uma coluna, na mesma linha semanal por
setor que já tem `checkIns`/`concerning`/`abandoned`:

```prisma
model Signal {
  id               String      @id @default(cuid())
  institutionId    String
  institution      Institution @relation(fields: [institutionId], references: [id])
  sectorId         String
  sector           Sector      @relation(fields: [sectorId], references: [id])
  weekStart        DateTime
  checkIns         Int         @default(0)
  concerning       Int         @default(0)
  abandoned        Int         @default(0)
  unsentChatDrafts Int         @default(0)
  createdAt        DateTime    @default(now())

  @@unique([institutionId, sectorId, weekStart])
  @@map("signals")
}
```

Migration: `prisma migrate dev` adiciona a coluna com `DEFAULT 0`, sem backfill.

## Backend — generalizar o repositório

`apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`. Os
três métodos de escrita viram um só, parametrizado pelo que incrementar:

```ts
export interface RecordSignalIncrementParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  dedupKey: string;
  increments: Partial<{ checkIns: number; concerning: number; abandoned: number; unsentChatDrafts: number }>;
}

export interface SignalCheckinRepository {
  /** The row's counters after the increment, or null when deduplicated. */
  recordIncrement(
    params: RecordSignalIncrementParams,
  ): Promise<{ checkIns: number; concerning: number; abandoned: number; unsentChatDrafts: number } | null>;
}
```

`RecordCheckinParams`/`RecordAbandonmentParams` deixam de existir como tipos próprios —
`recordCheckin`/`recordAbandonment` somem da interface. `PrismaSignalCheckinRepository` fica com
um único método fazendo a mesma transação de sempre (criar a linha de dedup, `upsert` no
`Signal` incrementando só os campos presentes em `increments`), substituindo as duas
implementações quase idênticas que existem hoje.

Os três use cases continuam existindo, cada um chamando `recordIncrement` com o `increments`
certo:
- `RecordSignalCheckinUseCase`: `{ checkIns: 1, concerning: input.concerning ? 1 : 0 }`.
- `RecordAssessmentAbandonmentUseCase`: `{ abandoned: 1 }`.
- `RecordUnsentChatDraftUseCase` (novo): `{ unsentChatDrafts: 1 }`, dedup key com prefixo
  `chat-draft:` (mesmo formato de `abandon:`, terceiro namespace independente — um médico pode
  contar nos três contadores no mesmo setor/semana, são eventos diferentes).

`SignalCheckinController` ganha um terceiro endpoint fino, mesmo padrão dos outros dois:

```ts
const SignalChatDraftSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  deviceSignalId: z.string().min(1),
});

@Post("chat-draft")
@HttpCode(204)
async chatDraft(@Body() body: unknown): Promise<void> { /* mesmo formato de abandon() */ }
```

## Backend — visibilidade do novo contador

`SignalRow` (`apps/api/src/modules/manager/application/ports/signal-repository.port.ts`) ganha
`unsentChatDrafts: number`; `PrismaSignalRepository.findAll` seleciona e mapeia o campo, mesmo
padrão de `abandoned`.

`GetManagerSignalsUseCase` ganha `unsentChatDraftsLast4Weeks`, somado a partir das mesmas
`visibleRows`/`recentWeekTimes` que já servem `checkInsLast4Weeks`/`abandonedLast4Weeks` — mesma
garantia: nunca decide visibilidade, nunca conta uma semana sem check-ins reais no setor visível
(a mesma correção que `abandonedLast4Weeks` já tem, herdada de graça por reusar `recentWeekTimes`
pós-filtro).

## Frontend — médico

`ChatComposer.tsx` ganha um `useEffect` com cleanup, sem dependências (roda só na desmontagem):

```tsx
const textRef = useRef(text);
textRef.current = text;

useEffect(() => {
  return () => {
    if (textRef.current.trim().length === 0) return;
    const link = getLinkedAndOptedIn();
    if (link) {
      void recordUnsentChatDraftUseCase.execute({ link }).catch(() => {});
    }
  };
}, []);
```

`textRef` existe porque a closure do cleanup de um efeito com deps `[]` captura o `text` do
primeiro render — sem o ref, sempre leria string vazia. Mesmo gate de `getLinkedAndOptedIn()`
(link presente + opt-in agregado) que `useSubmitAssessment.ts` e `ScaleAssessmentPage.tsx` já
usam, sem mudança nenhuma nesse helper.

Novas peças espelhando `record-assessment-abandonment.usecase.ts` ponta a ponta:
- `apps/web/src/use-cases/record-unsent-chat-draft.usecase.ts` — mesma forma
  (`execute({ link }): Promise<void>`, no-op se `link` for `null`).
- `SignalCheckinPort` ganha `chatDraft(params): Promise<void>`; `HttpSignalCheckinAdapter`
  implementa postando pra `/signals/chat-draft` — mesmo padrão de `abandon`.
- `apps/web/src/app/container/signal-checkin.ts`: `recordUnsentChatDraftUseCase` exportado,
  compartilhando a mesma instância de `HttpSignalCheckinAdapter` que os outros dois já
  compartilham.

## Frontend — gestor

- `packages/domain/src/manager/metric-glossary.ts`: novo id `"unsentChatDrafts"`, entrada em
  `MANAGER_METRICS` com label "Conversas iniciadas e não enviadas", `unsentChatDraftsReading`,
  versão da metodologia sobe de novo.
- `ManagerDashboardPage.tsx`: quinto `KpiCard`, depois do de abandono. O grid é
  `lg:grid-cols-4` com 4 cards hoje — com 5, ou sobe pra `lg:grid-cols-5` (cards mais estreitos)
  ou fica em 4 colunas com o quinto sozinho numa segunda linha (mesmo padrão que o card de
  abandono já aceitou ao virar o quarto). Decisão de layout fica pro plano, não é uma escolha de
  produto que precise de aprovação separada aqui.
- `apps/web/src/ports/manager-signals.port.ts`: `unsentChatDraftsLast4Weeks: z.number().default(0)`
  — já nasce com `.default(0)`, não `z.number()` puro (correção que a feature de abandono só
  aplicou depois, em revisão; aqui entra certo desde o início, pela mesma razão: `api.yml`/
  `web.yml` são workflows independentes e um deploy do web antes do da api não pode quebrar o
  dashboard).
- `download-manager-pgr-report.ts`: mais uma linha no CSV e no PDF, mesmo padrão das duas
  anteriores.

## Frontend — consentimento

`ConsentPage.tsx` e `AggregateOptInSection.tsx`, a mesma linha 2 que já foi estendida uma vez:

> Autorizo o uso **anônimo e agregado** dos meus sinais e interações (como um questionário
> iniciado e não concluído, ou uma mensagem de chat começada e não enviada) para melhorar o
> cuidado da equipe.

## Tratamento de erros

- Registro é sempre fire-and-forget: `.catch(() => {})`, nunca aparece pro médico, nunca impede
  nada — mesma regra das duas features anteriores.
- `institutionId`/`sectorId` inválidos → mesmo 400 via `UnknownInstitutionOrSectorError`, mesmo
  comportamento herdado do método de repositório generalizado.
- Dedup (mesmo médico, mesmo setor, mesma semana, um segundo rascunho abandonado) → `null`, sem
  erro, sem efeito colateral.

## Testes

TDD, mesmo padrão do resto do projeto:

- Backend: teste do `recordIncrement` generalizado cobrindo os três formatos de `increments`
  (equivalente aos três comportamentos que `recordCheckin`/`recordAbandonment` já tinham
  cobertos — nenhuma cobertura perdida na fusão); `RecordUnsentChatDraftUseCase` (dedup key com
  prefixo `chat-draft:`, distinto de `abandon:` e do dedup de checkin); controller (`POST
  /signals/chat-draft`: sucesso, 400 de validação, 400 de institution/sector desconhecidos, sem
  auth); `GetManagerSignalsUseCase` — `unsentChatDraftsLast4Weeks` suprimido/visível pelos mesmos
  casos que `abandonedLast4Weeks` já tem.
- Frontend: `ChatComposer` — não dispara nada ao desmontar com texto vazio; dispara e chama o
  use case com texto não-vazio; não dispara sem vínculo de instituição; não dispara com opt-in
  desligado; dispara certo mesmo depois de múltiplos re-renders (closure do `textRef` não fica
  obsoleta); não dispara quando a saída é por ter *enviado* a mensagem (texto já limpo antes da
  desmontagem, se ela acontecer). `RecordUnsentChatDraftUseCase` (no-op sem link, propaga falha
  do port). Adapter HTTP. `ManagerDashboardPage` — quinto KPI, valor e leitura. `metric-glossary`
  consumido pelo card e pelo export. Linhas novas do CSV/PDF. `ConsentPage`/
  `AggregateOptInSection` — texto novo renderizado.
- Manual: como médico vinculado e opt-in ativo, digitar algo no chat sem enviar e navegar pra
  Home; como gestor (setor com 5+ respostas já visíveis), conferir o KPI novo subir (ou seguir
  oculto, se o setor ainda não bateu k=5 por check-ins); baixar o PGR e conferir a linha.

## Riscos e decisões já fechadas (não reabrir sem novo motivo)

- Sem modal de confirmação — silencioso, por design deste item específico.
- Sem persistir o conteúdo do rascunho, em lugar nenhum — só o contador.
- Repositório generalizado num único método parametrizado; use cases e endpoints continuam
  separados e finos.
- `unsentChatDraftsLast4Weeks` já nasce com `.default(0)` no schema Zod do frontend.
- "Nova conversa" não interage com este contador.
