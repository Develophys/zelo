# Canal WhatsApp para o chat de acolhimento — design spec

**Status:** design aprovado, **não agendado para implementação**. Registrado como pendência de produto (ver `general-documentations/roadmap/mauricio.md` e `general-documentations/documentacao-produto/user-stories.md` US-010) até que Mauricio decida priorizá-lo. Derivado de brainstorm em 28/07/2026, na trilha de evolução independente do Zelo pós-Jornada Incubintech (o time não avançou para pré-incubação — ver `roadmap/README.md`, nota de 28/07/2026).

Escopo original ("IA aprende sobre o médico a partir de dados de plantão fornecidos pelo hospital", registrado em `ideas.md`) foi descartado pelo próprio autor da ideia antes deste brainstorm — não faz parte deste spec. O par anônimo via WebSocket mencionado na mesma conversa é um subsistema independente, com spec própria a ser feita separadamente.

## 1. Achado que molda todo o resto do design (ler antes de qualquer coisa)

O Zelo hoje **não tem nenhum conceito de identidade persistente por dispositivo em lugar nenhum do produto** — nem para o médico usuário (só o gestor tem login/sessão, via `manager-session.store.ts`). O histórico de chat vive só em estado React (`useChatConversation.ts`), some ao recarregar a página; não existe tabela de conversa/mensagem no Prisma (`apps/api/prisma/schema.prisma` só tem `Assessment`, `SimulatedSignal`, `ManagerInsight`, `SimulatedFollowUp`). A anonimização do texto (FR-5) acontece hoje inteiramente no navegador, antes de qualquer envio de rede — é a garantia central de privacidade do produto ("nenhum dado bruto sai do dispositivo").

Nenhuma dessas três coisas sobrevive intacta à chegada do WhatsApp:

1. **Identidade**: um número de WhatsApp é identificável por natureza. Este spec introduz o primeiro conceito de identidade persistente do produto — um `deviceLinkToken` opaco, gerado no dispositivo, que o servidor associa (nunca o inverso) a um número de telefone cifrado.
2. **Persistência de conversa**: "continuar no WhatsApp uma conversa iniciada no app" exige guardar histórico de mensagens em algum lugar — hoje não existe. Duas tabelas novas (`Conversation`, `Message`) resolvem isso, guardando só conteúdo já anonimizado.
3. **Anonimização client-side**: não existe "navegador" no WhatsApp — a mensagem crua do médico chega direto no webhook da Meta. A anonimização passa a acontecer no servidor (em memória, nunca persistida em texto claro) **só para mensagens vindas do canal WhatsApp** — exceção documentada explicitamente aqui, não um enfraquecimento silencioso da garantia geral do produto.

Essas três mudanças são deliberadas e foram validadas com Mauricio durante o brainstorm (28/07/2026) — não são acidentes de implementação.

## 2. Decisão de fornecedor

**WhatsApp Cloud API da própria Meta**, não um BSP terceiro (ex.: Twilio). Motivo: manter a superfície de fornecedores pequena — hoje o produto só depende da Groq para IA; adicionar um BSP a mais tocando tráfego de conversa (mesmo anonimizada) é um fornecedor extra desnecessário quando a Meta oferece a via direta, gratuita para conversas iniciadas pelo médico dentro da janela de 24h.

Trade-off aceito: exige verificação de negócio no Meta Business Manager (custo único de setup) e aprovação prévia de templates de mensagem para qualquer contato *iniciado pelo Zelo* (afeta o follow-up, ver §6).

## 3. Novos módulos e dados

**`apps/api/src/modules/whatsapp-channel/`**, seguindo a mesma Clean Architecture já usada em `chat/`, `assessment/`, `manager/`:

- `RequestWhatsappLinkUseCase` — recebe telefone + `deviceLinkToken`, gera OTP de 6 dígitos, envia via template aprovado da Cloud API.
- `ConfirmWhatsappLinkUseCase` — valida OTP contra o pedido pendente, grava `WhatsappLink`.
- `ReceiveWhatsappMessageUseCase` — recebe o payload do webhook da Meta, resolve o vínculo pelo índice de busca do número, anonimiza o texto (nova implementação server-side, espelhando `apps/web/src/use-cases/anonymize-text.usecase.ts`), roda a IA (reaproveitando o `AiChatPort` já usado por `SendChatMessageUseCase`, mas consumindo o generator até o fim em vez de streaming — WhatsApp não suporta entrega token a token), detecta risco, persiste a troca anonimizada, responde.
- `SendCrisisDirectionViaWhatsappUseCase` — porta server-side da lógica hoje só client-side em `apps/web/src/use-cases/get-crisis-direction.usecase.ts` (FR-7–FR-10, já simplificada por `adr-003-crisis-protocol-rescope-peer-chat-differentiator.md`). Reimplementada no backend, não movida para `packages/domain` — consistente com a convenção já documentada no README raiz de que lógica de negócio vive em cada app, não no pacote compartilhado.
- `SendFollowUpViaWhatsappUseCase` — job agendado (primeira vez que o backend precisa de um scheduler; introduz `@nestjs/schedule`), roda diariamente, encontra vínculos elegíveis (ver §6) e dispara o template de follow-up.

**Prisma — 3 modelos novos:**

```prisma
model WhatsappLink {
  id                    String   @id @default(cuid())
  deviceLinkToken       String   @unique
  encryptedPhoneNumber  Bytes
  phoneNumberBlindIndex String   @unique // HMAC determinístico do número — permite achar o vínculo a partir do remetente do webhook sem descriptografar em massa
  verifiedAt            DateTime
  createdAt             DateTime @default(now())

  @@map("whatsapp_links")
}

model Conversation {
  id              String   @id @default(cuid())
  deviceLinkToken String
  channel         String   // "app" | "whatsapp"
  createdAt       DateTime @default(now())

  @@map("conversations")
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // "user" | "assistant"
  anonymizedContent String // só conteúdo já anonimizado — nunca texto bruto
  createdAt      DateTime @default(now())

  @@map("messages")
}
```

`encryptedPhoneNumber` segue o mesmo padrão de cifragem em repouso já usado para dado sensível no restante do produto (não um mecanismo novo). `phoneNumberBlindIndex` é a única forma de busca — o número em si nunca é comparado em claro em uma query.

**Frontend (`apps/web`)**: nova tela "Vincular WhatsApp" (ex.: `WhatsappLinkPage.tsx`), use cases `request-whatsapp-link.usecase.ts` / `confirm-whatsapp-link.usecase.ts`, adapter `http-whatsapp-link.adapter.ts`, porta `whatsapp-link.port.ts` — mesmo padrão de Clean Architecture já usado para os demais fluxos HTTP do app. `deviceLinkToken` gerado com UUID na primeira vinculação e persistido no mesmo storage já usado pelo histórico de avaliações (IndexedDB).

## 4. Fluxo — vinculação

1. Médico abre "Vincular WhatsApp" no app → digita o número.
2. App gera (ou reusa) `deviceLinkToken` local → chama `POST /whatsapp/link/request { deviceLinkToken, phoneNumber }`.
3. API gera OTP de 6 dígitos, grava pedido pendente (TTL curto), envia o OTP por WhatsApp via template aprovado.
4. Médico recebe o código no WhatsApp, digita de volta no app.
5. App chama `POST /whatsapp/link/confirm { deviceLinkToken, otp }` → API valida, grava `WhatsappLink` (`verifiedAt` = agora).

Rate limit no pedido de OTP — evita esgotar a cota de template da Meta por abuso/erro de digitação repetido.

## 5. Fluxo — conversa pelo WhatsApp

1. Médico manda mensagem livre no WhatsApp → Meta chama `POST /whatsapp/webhook`.
2. API verifica a assinatura do payload (`X-Hub-Signature-256`) — descarta silenciosamente se inválida.
3. API calcula o blind index do número remetente, busca `WhatsappLink`. Número sem vínculo → mensagem ignorada, sem resposta (evita confirmar a terceiros que aquele número específico "existe" no Zelo).
4. Resolve/cria a `Conversation` (`channel: "whatsapp"`) para o `deviceLinkToken` do vínculo.
5. Anonimiza o texto recebido (server-side, em memória).
6. Roda a mesma lógica de IA do chat do app (guardrails contra diagnóstico, FR-4), consumindo a resposta inteira antes de responder (sem streaming).
7. Detecta sinal de risco agudo, se houver.
8. Persiste a troca anonimizada em `Message`.
9. Responde no WhatsApp. Se risco detectado, dispara `SendCrisisDirectionViaWhatsappUseCase` como mensagem com **botões interativos** (par médico / psicólogo / não, obrigado — mesmas opções de `CrisisOfferPage`); recusa manda a linha CVV 188 na hora (FR-9).

Falha da IA (Groq indisponível) → mesma mensagem de indisponibilidade já usada no app (`ChatPage`), adaptada para texto simples.

## 6. Fluxo — follow-up (US-009) via WhatsApp

Job diário busca `WhatsappLink`s cuja `Conversation` mais recente teve última mensagem há ≥`FOLLOWUP_INTERVAL_DAYS` (3 dias, já resolvido em `2026-07-19-followup-mechanism-design.md`) e que ainda não têm follow-up registrado → envia o template fixo aprovado pela Meta (texto estático, sem conteúdo dinâmico — exigência de mensagem iniciada pelo negócio): *"Oi, aqui é o Zelo. Como você está desde a última conversa?"*

Resposta do médico reabre a janela de 24h de conversa livre e cai no fluxo do §5 normalmente. A resposta (houve ou não) é registrada no `SimulatedFollowUp` já existente (`apps/api/prisma/schema.prisma`), com o canal anotado — reaproveita a métrica "taxa de resposta do follow-up" já exibida no painel do gestor (`ManagerDashboardPage`), sem criar uma segunda métrica paralela.

## 7. Testes

- Testes unitários dos novos use-cases, mesmo padrão `*.test.ts` co-localizado já usado em todo o repo.
- `fake-whatsapp.adapter.ts`, espelhando `fake-chat.adapter.ts` / `fake-insight.adapter.ts` já existentes — testa a lógica de negócio sem bater na Meta de verdade.
- Teste de verificação de assinatura do webhook (payload válido vs. adulterado).
- Validação manual no número sandbox liberado pela Meta durante a verificação de negócio, antes de qualquer uso com número real.

## 8. Fora de escopo deste spec

- Chat par-a-par via WebSocket entre médicos anônimos, incluindo gestor adicionando pares (US relacionada, mas subsistema independente — spec própria).
- Qualquer uso de dados de plantão/escala do hospital para a IA "aprender" sobre o médico — descartado pelo próprio autor da ideia antes deste brainstorm.
- Múltiplos números de WhatsApp por dispositivo.
- Mídia (áudio, imagem) na conversa — texto puro na v1.
- Múltiplas conversas simultâneas por número.
