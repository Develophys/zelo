# 11 — Chat (acolhimento)

**Route / File:** `/chat` · `src/presentation/pages/ChatPage/` (restyle existing; keep logic)

**Estrutura de arquivos** — mesma convenção de `HomePage/` e `YouPage/`: pasta por página, filhos
colocados ao lado, `index.ts` exportando **só** a página (`export { ChatPage } from './ChatPage'`),
então o import do router (`@/presentation/pages/ChatPage`) não muda.

```text
pages/ChatPage/
  index.ts                      só o export da página
  ChatPage.tsx                  composição + fiação dos hooks
  ChatPage.test.tsx
  chat-column.ts                CHAT_COLUMN, a coluna de 900px compartilhada pelas faixas
  ChatHeader.tsx
  ChatDisclaimerBanner.tsx
  ChatEmptyState.tsx
  ChatMessageBubble.tsx
  AssistantTypingIndicator.tsx
  ChatAlerts.tsx                providerError + crisisFallback
  ChatActionTray.tsx            os dois CTAs
  ChatComposer.tsx
```

`ChatComposer` e `ChatMessageBubble` saíram de `presentation/components/` porque só o chat os usa —
`components/` fica para o que é compartilhado entre páginas (ex.: `InstitutionLinkCard`,
`PeerChatRoom`). A região de rolagem em si continua em `ChatPage.tsx`: ela é dona da fiação de
`useStickToBottom`, e extrair isso exigiria ~11 props de prop-drilling.

**Purpose:** AI active-listening support. This screen already works — it consumes
`useChatConversation` and streams tokens. **Do not change the logic**; re-skin it to Sereno and
keep the two non-negotiables: the disclaimer banner and the persistent "falar com uma pessoa
real" shortcut.

## Keep from the existing implementation
- `useChatConversation(CONVERSATION_ID)` → `{ messages, isStreaming, crisisFallback,
  providerError, sendMessage }`.
- `sendMessage(text, false)` — the `hasActiveRiskSignal` arg stays `false` here (see the code
  comment in the current `ChatPage`: real risk-signal detection is a separate, not-yet-built
  feature; wiring `crisisFallback` back in would be circular).
- The anonymization happens in the use-case (`AnonymizeTextUseCase`) before send — do not move it
  to the component.

## Layout
`PhoneShell nav bleed fill bg="canvas"` — **sem `centered`**. O chat é superfície de aplicação,
não de leitura: o cromo ocupa toda a largura ao lado da sidebar e só o conteúdo dentro de cada
faixa fica numa coluna de 900px (`max-w-chat`), compartilhada por header, mensagens e composer
para tudo alinhar. `fill` dá altura exata de viewport, então bandeja e composer ficam presos na
base e só a lista rola. Ver `../2026-07-28-responsive-tablet-desktop-ui-design.md` §§10–11.

Flex column full height:
1. **Header** — `bg-surface border-b border-surface-brand`, `flex items-center gap-3 p-[14px_20px]`:
   back arrow → `/home`; title stack `body-strong` "Acolhimento" + `mono-data text-muted-2`
   "texto anonimizado antes do envio".
2. **Disclaimer banner** — full-width `bg-warn-bg text-warn-ink text-[12.5px] text-center p-[9px]`
   "Acolhimento por IA — não substitui atendimento profissional." **Non-dismissable.**
3. **Message list** — `flex-1 overflow-y-auto no-scrollbar p-[18px_16px] flex flex-col gap-3`.
   Map `messages`:
   - assistant: `self-start bg-surface text-ink rounded-[20px] rounded-bl-md shadow-card`,
     `max-w-[80%] p-[13px_15px] text-[14.5px] leading-relaxed`.
   - user: `self-end bg-brand text-white rounded-[20px] rounded-br-md`.
   - Streaming assistant bubble updates in place (already handled by the hook).
   - If `providerError`: inline `text-danger` retry note. If `crisisFallback`: surface the CVV
     line inline (reuse handoff copy).
4. **Handoff button** — `bg-surface-brand text-brand rounded-2xl p-[13px] mx-4 font-bold`
   "🫂 Falar com uma pessoa real" (HeartHandshake icon) → `/crisis`. **Always visible.**
5. **Composer** — reuse `ChatComposer` (existing) restyled: input `bg-surface border border-line
   rounded-pill p-[13px_18px]` placeholder "Escreva como você está…"; send button 46px circle
   `bg-brand text-white` (`ArrowUp`), disabled while `isStreaming`.

## Bandeja de ações e viewports baixos

O atalho de acolhimento humano, o "Avaliar como estou" e o composer vivem numa bandeja
persistente única (`bg-surface`, `border-t`), separada visualmente do piso da conversa
(`bg-canvas`). Empilhados, os dois CTAs custam ~217px de cromo fixo — em celular na horizontal
isso deixava menos de um balão visível.

A partir da emenda de 15/08/2026 em `../2026-07-28-responsive-tablet-desktop-ui-design.md` §9, a
bandeja responde a **altura**:

- `short` (`max-height: 640px`) — paddings verticais comprimidos, CTAs no piso de toque de 44px.
- `short-wide` (`max-height: 640px` e `min-width: 480px`) — os dois CTAs lado a lado.

O disclaimer e o atalho de acolhimento humano continuam **sempre visíveis** em qualquer altura —
comprimir nunca vira esconder. Ver §9 para o caso do teclado aberto, que media query de altura
não alcança.

## Bandeja recolhível (15/08/2026)

A bandeja tem dois estados, controlados por uma aba semicircular no canto superior direito que
**avança para fora da borda de cima** do container (`absolute -top-9.75`, `rounded-t-card`,
`border-b-0` + `bg-surface`, então a régua de 1px do container morre na aba em vez de passar por
baixo dela). Chevron para baixo = recolher, para cima = expandir.

| Estado | Conteúdo | Altura (390px) |
|---|---|---|
| Expandida | os dois CTAs em tamanho cheio | 146px |
| Recolhida | linha horizontal compacta, ícone + rótulo curto para **os dois** | 64px |

**Recolher nunca esconde o atalho de acolhimento humano.** Ele encolhe para "Pessoa real" com o
ícone, ao lado de "Avaliar" — os dois seguem visíveis e a um toque em qualquer estado, então a
regra de §Layout ("Always visible") e a regra de ouro 4 do `AGENTS.md` continuam valendo. Os
rótulos visíveis encurtam porque a 375px os dois textos completos não cabem lado a lado (~195px
cada, ~167px disponíveis); o texto normativo completo fica no `aria-label`, então o nome acessível
não muda e os testes que procuram "Falar com uma pessoa real" seguem passando.

**Recolhe sozinha quando o usuário envia uma mensagem** (`handleSend` em `ChatPage.tsx` liga
`trayCollapsed`), devolvendo 82px para a conversa exatamente quando a atenção volta para o chat.
O composer é irmão da bandeja, nunca recolhe — dá para continuar escrevendo em qualquer estado.

O estado mora no `ChatPage` (`collapsed` + `onToggle`), não na `ChatActionTray`: mantém o
componente burro e o auto-recolher testável direto.

## Hierarquia dos dois CTAs

"Falar com uma pessoa real" é a linha de vida do spec e **não** pode empatar visualmente com o
CTA de autoavaliação: fica em `soft` (`bg-surface-brand`) com `border-track`; "Avaliar como
estou" cai para `ghost`. Os dois eram idênticos antes, o que fazia nenhum dos dois liderar.

## Tipografia

Header: `body-strong` + `mono-data` — os dois papéis já trazem o peso no token
(`design-tokens.md` §2), então nada de `font-extrabold` solto aqui. O subtítulo mono leva
`truncate`: em 320px ele quebraria em duas linhas e empurraria o header para além dos 65px que
alinham com o header da sidebar (§Layout).

**O `text-[12.5px]` da faixa de disclaimer é proposital — não promova para `caption` (13px).**
"Acolhimento por IA — não substitui atendimento profissional." tem 59 caracteres; a 13px pede
~383px e a faixa oferece ~357px num aparelho de 375px, então subir meio pixel quebra a frase em
duas linhas e engorda o cromo fixo em ~19px — justamente o que §9 do spec responsivo recuperou.
Leva `text-balance` para que, quando quebrar em telas menores, as duas linhas fiquem equilibradas.

O `text-[14.5px]` dos balões também fica: é papel de fato compartilhado com `PeerChatRoom` e os
formulários (9 arquivos). Mudar só aqui dessincroniza o chat do resto do app — se for para virar
token, é decisão de sistema, não desta tela.

O parágrafo do vazio inicial é justificado (`text-justify`) e por isso leva `hyphens-auto`: sem
hifenização, justificar uma medida de ~45ch no celular abre rios de espaço entre as palavras.
`<html lang="pt-BR">` já está no `index.html`, que é o que liga o dicionário de hifenização.
**A justificação fica no parágrafo, nunca no `div` que o envolve** — no wrapper ela também pega
o `h2` e estica o espaçamento entre palavras do título quando ele quebra em duas linhas.

Controles e prosa de erro seguem a convenção do app, não papéis próprios desta tela: prosa de
`role="alert"` em `text-label` (11 outras chamadas fazem assim) e rótulo de controle em
`text-label font-semibold` (30 outras chamadas). `caption` é papel de prosa descritiva
(`design-tokens.md` §2) — usá-lo em botão era desvio só desta tela.

Balões usam `leading-normal` (1.5), não `leading-relaxed`: 1.625 era a única ocorrência no app
inteiro e abre demais as linhas numa medida curta de conversa.

## Performance de streaming

`messages` muda a cada token, então tudo que depende dele re-renderiza por token. Quatro medidas,
todas com teste de regressão:

1. **`useChatConversation` guarda o histórico num ref.** `sendMessage` e `retryLastMessage`
   dependiam de `messages` e por isso ganhavam identidade nova a cada token, o que anulava
   qualquer `memo` abaixo deles. Agora leem `messagesRef.current` e dependem só de `runStream`
   (que depende só de `conversationId`), então mantêm identidade pela vida do componente.
2. **`ChatMessageBubble` é `memo`.** Só o último balão muda durante o streaming; sem isso os N
   balões anteriores re-renderizavam a cada token (N×T em vez de 1×T).
3. **`ChatComposer` é `memo`** e recebe `onSend` estável via `useCallback` — depende de
   `sendMessage` (agora estável) e `resumeFollowing` (já era). Sem o item 1 o `memo` não serviria
   para nada.
4. **`Sidebar` é `memo`.** Não recebe props, mas re-renderizava a cada token porque `PhoneShell`
   recebe `children` novo a cada render do `ChatPage` — os 4 `NavLink` e o `<picture>` do logo
   iam junto.

**Rolagem por frame, não por token.** `useStickToBottom` escrevia `scrollTop = scrollHeight` a
cada commit; cada escrita vem acompanhada de uma leitura de `scrollHeight`, que força layout.
Agora agenda via `requestAnimationFrame` e coalesce: com 12 tokens chegando em macrotasks
separadas (como chunks de rede), 13 escritas viraram 3.

**A checagem de "ainda seguindo" tem que ser no disparo do frame, não no agendamento.** Um frame
agendado enquanto o usuário seguia o fim continuava disparando depois de ele rolar para cima e o
puxava de volta — exatamente o que o "parar de seguir" existe para evitar. `ChatPage.test.tsx`
pegou isso.

## Copy (PT-BR)
"Acolhimento" · "texto anonimizado antes do envio" · disclaimer above · "Falar com uma pessoa
real" · placeholder "Escreva como você está…".

## Data / logic
- Wraps existing hook + `ChatComposer` + `ChatMessageBubble` (a lista é mapeada direto em
  `ChatPage.tsx`; não existe `ChatMessageList`). Keep `CONVERSATION_ID` handling as-is.
- Handoff button opens `/crisis` (route) instead of the old in-page `HumanHandoffPanel` — or keep
  the panel if product prefers a sheet; either way it must not depend on the network.

## Interactions
- Send → `sendMessage(text, false)`. Handoff → `/crisis`. Back → `/home`.

## Acceptance criteria
- Disclaimer always present; handoff button always present (both survive scroll & streaming).
- Bubbles styled per Sereno; streaming updates the last assistant bubble in place.
- With the provider forced to error, the handoff/CVV path still works (network-independent).
- No change to anonymization or send semantics.
