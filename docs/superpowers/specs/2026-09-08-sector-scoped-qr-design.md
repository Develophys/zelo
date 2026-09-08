# QR code setorizado

**Date:** 2026-09-08

## Problem

Hoje o QR code que o admin gera (`InstitutionQrCodeModal`) carrega só o código de convite da
instituição. Quando um médico/aluno escaneia esse código, o fluxo de vínculo resolve a instituição
e então pede, num passo manual separado (`LinkInstitutionSectorStep`), que a pessoa escolha o
próprio setor numa lista. Esse passo manual é a única coisa que impede o vínculo automático hoje,
e é também um ponto de erro: nada garante que a pessoa escolha o setor certo — alguém pode
selecionar "UTI" por engano quando deveria ser "Pronto-Socorro", e não existe hoje nenhuma
correção fácil para esse erro depois de feito (ver `branstorms.md`, item "QR code já vinculado a
um setor").

A ideia é dar ao setor o mesmo tipo de código de convite que a instituição já tem, para que um QR
gerado por setor vincule a pessoa direto ao setor certo — sem eliminar a opção de vínculo manual
para quem não tiver ou não quiser usar esse QR específico.

## Scope

**In scope.**

- Um campo `Sector.inviteCode`, escolhido manualmente por quem cria/edita o setor (gestor), com o
  mesmo comportamento do `Institution.inviteCode` de hoje: único, imutável após criado, sem
  gerador automático.
- O endpoint de lookup por código passa a também resolver códigos de setor, devolvendo
  instituição + setor quando aplicável, sem quebrar o comportamento atual para código de
  instituição.
- Ação "Gerar QR" por setor em duas telas: `ManagerAdminSectorsPage` (gestor, tela que já lista
  setores) e uma nova linha expansível por instituição em `AdminInstitutionsPage` (admin, que
  hoje não tem nenhuma visão de setor).
- Ajuste no fluxo de vínculo (`useLinkInstitutionFlow`) para pular a seleção manual de setor
  quando o código escaneado/digitado já resolve um setor, mostrando em vez disso uma tela de
  confirmação ("Instituição X — Setor Y, confirmar?") antes de finalizar.
- Setor inativo (ou instituição inativa) por trás de um código de setor já distribuído é tratado
  como "não encontrado" — mesmo comportamento já usado hoje para instituição inativa.

**Out of scope, deliberadamente.**

- Regenerar/rotacionar o código de um setor depois de criado — mesma imutabilidade da instituição,
  sem exceção agora.
- Fallback automático para a lista manual de setores quando o setor do QR está inativo (decisão
  já tomada: bloqueia com mensagem, não degrada para o passo manual).
- Qualquer mudança no formato do QR em si (continua sendo só a string do código, sem URL, sem
  JSON, sem prefixo) — mantém o payload idêntico ao que já existe para instituição.
- Migrar instituições/setores já existentes para terem um código de setor retroativo — como o
  código é digitado à mão pelo gestor, setores já cadastrados simplesmente não têm código até
  alguém editar o setor e preencher um; a migration só adiciona a coluna (nullable até ser
  preenchida).

## Modelo de dados

`apps/api/prisma/schema.prisma` — `Sector` ganha um campo opcional, único globalmente (mesmo
padrão de `Institution.inviteCode`, para manter os dois num único "namespace" de códigos
resolvidos pelo mesmo endpoint):

```prisma
model Sector {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  name          String
  isActive      Boolean     @default(true)
  managerId     String?
  manager       Manager?    @relation(fields: [managerId], references: [id])
  inviteCode    String?     @unique
  createdAt     DateTime    @default(now())

  signals       Signal[]
  notifications Notification[]

  @@unique([institutionId, name])
  @@map("sectors")
}
```

`inviteCode` é opcional (`String?`) porque setores existentes não têm um valor até serem
editados — diferente de `Institution.inviteCode`, que é obrigatório desde a criação. Uma vez
setado, o campo de edição de setor não aceita mudança nele (mesma regra do `PATCH` de instituição,
que já exclui `inviteCode` do `UpdateInstitutionSchema`).

Migration: `prisma migrate dev` adiciona a coluna nullable, sem backfill — não há como gerar um
valor válido automaticamente sem contrariar a decisão de "gestor digita".

## Backend

Reaproveita o endpoint público existente em vez de criar uma rota nova —
`apps/api/src/modules/institution/infrastructure/institution.controller.ts` já injeta
`SectorRepository` (usado hoje só por `GET /institutions/:id/sectors`).

```ts
@Get("by-code/:code")
async byCode(@Param("code") code: string): Promise<LinkCodeResult> {
  const institution = await this.getInstitutionByInviteCode.execute(code);
  if (institution) {
    return { institution: { id: institution.id, name: institution.name } };
  }

  const sector = await this.getSectorByInviteCode.execute(code);
  if (!sector) {
    throw new NotFoundException();
  }
  return {
    institution: { id: sector.institution.id, name: sector.institution.name },
    sector: { id: sector.id, name: sector.name },
  };
}
```

`LinkCodeResult = { institution: { id: string; name: string }; sector?: { id: string; name:
string } }`. Compatibilidade: quem já consome esse endpoint só para código de instituição continua
recebendo exatamente a mesma forma de resposta de hoje (sem `sector`) — nada muda para esse caso.

Novo use-case espelhando o existente: `GetSectorByInviteCodeUseCase`, mesma regra de "inativo =
não encontrado" que `GetInstitutionByInviteCodeUseCase` já aplica — resolve só se `sector.isActive
&& sector.institution.isActive`. Repositório: `SectorRepository.findByInviteCode(code)` (novo
método), incluindo o relacionamento com `institution` para checar `isActive` e devolver o nome.

Colisão de código único (setor tentando usar um código já em uso — seja de outro setor, seja de
uma instituição, já que o namespace é compartilhado) gera o mesmo tipo de erro de conflito que já
existe para instituição (`DuplicateInstitutionOrManagerError`-like via violação de constraint do
Prisma, capturado como 409 no controller de admin/gestor de setores).

## Frontend — geração do QR

**`InstitutionQrCodeModal.tsx`** vira a base de um componente genérico `QrCodeModal({ isOpen,
onClose, title, payload, downloadFilename })`, com `InstitutionQrCodeModal` e o novo
`SectorQrCodeModal` como wrappers finos por cima dele — sem duplicar a lógica de geração do
canvas/download.

**`ManagerAdminSectorsPage.tsx`:**
- Campo de código no modal de criar/editar setor, ao lado do campo de nome (mesmo padrão de
  validação inline do e-mail já usado no projeto: erro claro se o código já está em uso, campo
  desabilitado para edição depois que o setor já tem um código).
- `renderRowActions` (hoje só o ícone de editar) ganha um segundo `IconButton` com ícone `QrCode`
  (mesmo ícone já usado em `AdminInstitutionsPage`), abrindo o `SectorQrCodeModal` — só habilitado
  se o setor já tiver um `inviteCode` preenchido; sem código, mostra um estado desabilitado com
  tooltip explicando que precisa cadastrar um código primeiro.
- O tipo `AdminSector` (`@/ports/manager-admin.port`) e o hook `useAdminSectors` precisam trazer
  `inviteCode` no payload.

**`AdminInstitutionsPage.tsx`** (peça nova desta entrega — não existe hoje nenhuma visão de setor
aqui):
- Cada linha da tabela de instituições ganha um controle de expandir/recolher. Expandido, mostra
  a lista de setores daquela instituição (reaproveitando o mesmo endpoint `GET
  /institutions/:id/sectors` já usado no fluxo de vínculo), cada um com a mesma ação "Gerar QR"
  (mesmo componente `SectorQrCodeModal`).
- Sem ação de criar/editar setor aqui — isso continua sendo só do gestor, via
  `ManagerAdminSectorsPage`. O admin só visualiza e gera QR de setores que já têm código.

## Frontend — fluxo de vínculo

`useLinkInstitutionFlow.ts` ganha um terceiro valor de `step`: `"code" | "sector" | "confirm"`.

- `lookupCode` passa a interpretar a resposta discriminada do backend: só `institution` → mesmo
  comportamento de hoje, `setStep("sector")`. `institution` + `sector` → guarda os dois no estado
  e `setStep("confirm")`, pulando a lista manual.
- Novo `handleConfirmSubmit`: usa a instituição e o setor já resolvidos (sem nova chamada de rede)
  para chamar `link(...)` e navegar, mesma finalização que `handleSectorSubmit` já faz hoje.
- `LinkInstitutionCodeStep.tsx` e `LinkInstitutionQrScanModal.tsx` não mudam — o mesmo campo de
  texto manual e o mesmo scan continuam chamando a mesma `lookupCode`; a única diferença é o que
  ela faz com o resultado.
- Novo componente `LinkInstitutionConfirmStep.tsx`: tela simples mostrando nome da instituição e
  do setor resolvidos, com um botão de confirmar e uma opção de "não é isso" que volta para
  `"code"` (permite escanear de novo se o QR errado foi lido).
- `LinkInstitutionSectorStep.tsx` não muda — continua sendo a lista manual para quando só a
  instituição foi resolvida.

## Tratamento de erros

- Código de setor inexistente, setor inativo, ou instituição do setor inativa → mesmo 404 que já
  existe hoje para código de instituição inexistente/inativa; a mensagem no frontend
  (`codeErrorMessage`) continua a mesma ("Código não encontrado."), sem distinguir os casos —
  consistente com a escolha já feita para instituição.
- Colisão de código único ao criar/editar setor (código já usado por outro setor ou por uma
  instituição) → erro inline no formulário de setor, mesmo padrão de validação já usado em outros
  formulários do admin/gestor.

## Testes

TDD, mesmo padrão do resto do projeto:

- Backend: `GetSectorByInviteCodeUseCase` (setor ativo, setor inativo, instituição do setor
  inativa, código não encontrado); teste de integração do controller cobrindo os três resultados
  do `by-code/:code` (só instituição, instituição+setor, nem um nem outro); repositório
  (`findByInviteCode` retornando `null` para inativo).
- Frontend: `useLinkInstitutionFlow` — as três transições de `step` a partir de `lookupCode`;
  `LinkInstitutionConfirmStep` (render, confirmar, "não é isso"); `SectorQrCodeModal`/`QrCodeModal`
  genérico; a nova linha expansível de `AdminInstitutionsPage` (expandir, listar setores, abrir
  QR); o campo de código no formulário de setor do gestor (validação de conflito, campo desabilitado
  após setado).
- Backend do admin/gestor de setores: teste de conflito de unicidade ao tentar salvar um código já
  em uso.

## Riscos e decisões já fechadas (não reabrir sem novo motivo)

- QR de instituição continua existindo, convivendo com o QR de setor (não foi substituído).
- Setor inativo bloqueia, não faz fallback pra lista manual.
- Código de setor é digitado à mão pelo gestor, sem gerador automático.
- Campo de texto manual do fluxo de vínculo aceita os dois tipos de código, sem campo separado.
