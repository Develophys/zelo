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
   "anonimizado antes do envio" (ver §A promessa de anonimato não caberia mais no header).
2. **Disclaimer banner** — full-width `bg-warn-bg text-warn-ink text-[12.5px] text-center p-[9px]`
   "Acolhimento por IA — não substitui atendimento profissional." **Non-dismissable.**
3. **Message list** — `flex-1 overflow-y-auto no-scrollbar p-[18px_16px] flex flex-col gap-3`.
   Map `messages`:
   - assistant: `self-start bg-surface text-ink rounded-[20px] rounded-bl-md shadow-card`,
     `max-w-[min(80%,65ch)] p-[13px_15px] text-body leading-normal` (ver §Tipografia).
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

## Ritmo de turno na lista (15/08/2026)

Medido: todos os intervalos entre balões davam **12px** — `user→assistant`, `assistant→user`,
`user→assistant`, idênticos. Um valor só repetido até tudo ter o mesmo peso; a transcrição lia
como uma pilha sem estrutura.

A unidade que importa numa conversa é a **troca**: uma mensagem e a resposta que ela provocou
andam juntas, e a troca seguinte é outra unidade. Agora o espaço codifica isso:

| Intervalo | Antes | Depois |
|---|---|---|
| Dentro da troca (`user→assistant`) | 12px | **8px** |
| Entre trocas (`assistant→user`) | 12px | **20px** |

Contraste de 2,5×, os dois valores na escala documentada (`design-tokens.md` §3). Implementado com
`gap-2` na coluna + `mt-3` no balão de usuário que abre uma troca (prop `startsExchange`), em vez
de um `gap` uniforme. O indicador de digitação e os alertas herdam o intervalo curto — são a
resposta àquela mensagem.

## Ações compactas não esticam no desktop

`COMPACT_ACTION` usava `flex-1`, então na coluna de 900px cada botão virava ~442px: "Pessoa real"
como uma pílula enorme e "Avaliar" jogado para a direita. Compacto que não é compacto. A partir de
768px passam a `md:flex-none md:px-5` — tamanho de conteúdo, agrupados à esquerda. No celular
continuam dividindo a largura, que é o certo lá.

## A conversa sobrevive à navegação (15/08/2026)

Medido: 12 turnos → tocar "Avaliar como estou" → voltar → **0 balões**. `useChatConversation`
guardava as mensagens em `useState`, então desmontar a página descartava tudo. O agravante é que a
bandeja existe justamente para expor esses dois atalhos — a UI convidava o toque que apagava a
conversa, sem aviso e sem recuperação.

As mensagens passaram para `stores/chat-conversation.store.ts` (Zustand, escopo de módulo).
**Sem `persist` de propósito:** a conversa precisa sobreviver à navegação dentro do app, mas
gravar em disco o que um médico escreveu em sofrimento é outra classe de risco de privacidade —
fechar a aba continua apagando tudo. `isStreaming`, `providerError` e `crisisFallback` seguem
locais, então voltar para a tela mostra a conversa sem um estado de streaming velho.

**Consequência nos testes:** store de escopo de módulo vaza entre testes. O reset ficou no
`afterEach` global do `vitest.setup.ts`, junto do `cleanup()` — que existe ali pelo mesmo motivo.
Por arquivo seria mais fácil de esquecer, e a falha é silenciosa e confusa.

## Stream que trava e stream abandonado

- **Trava:** se o servidor aceita a conexão e não manda nada, `isStreaming` ficava `true` para
  sempre e o botão de enviar ficava desabilitado para sempre — a mesma classe de travamento que a
  primeira passagem de harden corrigiu, só que por silêncio em vez de exceção. Agora cada
  `stream.next()` corre contra um timeout de 45s; ao estourar, cancela o iterador e marca
  `streamError` (era um booleano `providerError` até 16/08/2026 — ver "Sem conexão" abaixo).
- **Abandono:** sair da página no meio da resposta deixava o stream sendo lido até o fim em
  segundo plano. `abortedRef` quebra o laço e chama `stream.return()`, que dispara o `finally` do
  adapter e cancela o reader.

## Limite de caracteres visível

`maxLength={2000}` truncava calado — colar 2500 caracteres perdia 500 sem sinal nenhum. A partir
de 120 caracteres restantes aparece um contador ligado ao input por `aria-describedby`, que vira
aviso em `text-danger` ao atingir o teto.

### O contador falava a cada tecla (16/08/2026)

O `role="status"` estava **no contador visível**, cujo texto muda a cada caractere. NVDA, JAWS e
VoiceOver enfileiram cada mudança como anúncio novo, então os últimos 120 caracteres viravam ~120
interrupções de fala — a saída de voz ficava inutilizável exatamente quando um médico exausto está
escrevendo a mensagem mais difícil. WCAG 4.1.3 cumprido na letra e violado na intenção.

O contador visível perdeu o `role="status"` e virou texto comum; quem anuncia agora é uma região
`sr-only` `aria-live="polite" aria-atomic="true"` separada, que só muda ao **cruzar** um degrau de
`REMAINING_ANNOUNCEMENT_STEPS` (120, 50, 20, 0). O `aria-describedby` continua ligando o contador
ao campo, então a contagem exata segue disponível sob demanda.

Três detalhes que a região precisa para funcionar de verdade:

- **A região nasce montada e vazia.** Vários leitores ignoram um live region inserido no DOM junto
  com o primeiro texto — precisa já estar lá para observar a mudança. Por isso ela renderiza sempre,
  fora do `{nearLimit && …}`.
- **Anuncia onde o texto parou, não o degrau.** Colar e cair em 3 restantes fala "3 caracteres
  restantes", não "20" — o degrau decide *quando* falar, o número dito é o real.
- **Trava de aperto: só fala descendo.** Apagar de volta por cima de um degrau não reanuncia, senão
  reescrever perto do teto faria a fala oscilar na fronteira. A trava rearma quando a mensagem sai
  da faixa (acima de 120 restantes), porque aí a próxima aproximação é nova.

O `role="status"` da dica de "espere a resposta terminar" **fica**: aquele texto aparece por um
evento discreto e fala uma vez só, que é o caso para o qual o papel existe.

## Gravidade dos dois alertas (15/08/2026)

Os dois estados de erro tinham fundos praticamente iguais — `danger-bg` (#F7EBE8) e
`danger-strong-bg` (#F5E4E1) diferem 2–3 pontos por canal. Renderizados lado a lado, a distinção
de gravidade existia **só no botão**; o container lia igual para "a IA falhou" e "você pode estar
em risco".

Agora a borda carrega a gravidade: o alerta de crise usa `border-danger-strong` (6,56:1 contra o
próprio fundo — aresta decidida), e o de provider segue com `border-danger-border` (1,34:1 —
fiapo discreto). Fundo e botão continuam como estavam; quem separa os dois à primeira vista é a
borda.

## Botão de enviar desabilitado

`bg-brand` + `disabled:opacity-50` compunha para ~#97B5AE, e a seta branca em cima dava **2,20:1**
— abaixo do piso de 3:1 para ícone com significado. Trocado por `disabled:bg-track
disabled:text-muted`: seta legível a 3,92:1 e o botão passa a ler como inerte de verdade, em vez
de "verde meio apagado". Opacidade não serve para desabilitar controle colorido — ela degrada
figura e fundo juntos.

## O "tentar de novo" que não fazia nada (16/08/2026)

Medido: stream entrega "Meio caminho", depois falha → alerta aparece → clicar em **Tentar de novo**
não dispara chamada nenhuma. `retryLastMessage` desistia quando a última mensagem guardada não era
do usuário, e o `finally` do `runStream` só removia o balão do assistente quando ele estava
**vazio**. Falha com resposta parcial — exatamente o caso que o timeout de 45s da passagem anterior
criou — deixava um turno de assistente por último, então o botão saía silenciosamente pelo `return`
inicial. Controle visível, zero efeito, zero aviso.

Agora o retry varre de trás para frente até a última mensagem do usuário, corta os turnos de
assistente pendurados depois dela e reenvia com o histórico anterior como contexto. O caso antigo
(último turno é do usuário) é o mesmo caminho, não um ramo separado.

## Resposta cortada não passa por resposta inteira

Conteúdo parcial ficava no store sem marca: uma frase interrompida no meio lia igual a uma resposta
concluída — pior que resposta nenhuma numa tela de acolhimento. `ChatUiMessage` ganhou
`interrupted`, marcado no `finally` sempre que sobrou conteúdo sem fechamento limpo: timeout,
`ChatErrorEvent` no meio do stream, saída da página, ou parada pelo usuário. O balão fecha com uma
linha `caption` sobre um filete `border-line` — "Resposta interrompida antes do fim." — e o
anunciador `role="status"` troca "Resposta:" por "Resposta interrompida:".

O generator terminar sem exceção **não** é sinal de resposta completa: um `ai_unavailable` emitido
no meio fecha o iterador normalmente. Por isso a marcação olha erro e fechamento, não só `done`.

## Parar a resposta, e o `stream.return()` que travava a parada

O composer ficava desabilitado por até 45s sem saída. O botão de enviar vira **Parar resposta**
(`Square`, mesma geometria e cor — a convenção que o usuário já conhece) enquanto o stream corre.

Ao implementar apareceu o defeito real: `await stream.return()` num generator suspenso em `await`
só resolve quando o generator **retoma**. Ou seja, o cancelamento esperava justamente a coisa que
estava travada — parar não parava nada até o provider mandar mais. As três saídas (parada, timeout,
desmontagem) passaram a disparar `stream.return()` sem `await`, com a rejeição engolida; o `finally`
do adapter continua cancelando o reader quando puder.

## Teto por chunk não é teto de duração

O timeout de 45s corria por `stream.next()`. Um stream pingando um token a cada 44s nunca o
estourava e segurava a tela para sempre. Agora existe também um prazo total de 180s por resposta,
criado uma vez por stream e limpo no `finally`.

## Sem conexão não é "a IA não respondeu"

O adapter converte `fetch` rejeitado em `ai_unavailable`, então ficar offline no subsolo do hospital
— a falha mais provável de todas — era relatada como falha da IA. `streamError` substituiu o
booleano `providerError` e passa a valer `'offline' | 'provider' | null`, classificado por
`navigator.onLine` no momento do erro. `onLine === true` não prova nada sobre alcançar o provider,
então só `false` é tratado como sinal; o resto cai no texto de provider.

O alerta offline **não** é um terceiro degrau de `danger`: é outra **classe** de problema, então a
escada de duas alturas que a passagem de 15/08 decidiu continua intacta.

> **Correção de mesmo dia.** A primeira tentativa pôs o alerta na família `warn` e criou um
> `--color-warn-border` para ele. Errado: `warn` já é da **tarja de disclaimer**, que é permanente,
> não-dispensável e fica no topo da mesma tela (`design-tokens.md` registra `warn` como "AI
> disclaimer text"). Offline, os dois blocos âmbar empilhavam com significados sem relação — "a IA
> não substitui profissional" e "sua conexão caiu". O alerta saiu de `warn`; o token de borda,
> criado e sem outro uso, foi removido no mesmo dia. Não recriar.

O papel certo era **status informativo do sistema**, não aviso: `bg-surface-brand` com filete
`border-track` (1,19:1 — discreto como o resto da família) e prosa `brand-ink` a 11,44:1. Um ícone
`WifiOff` nomeia o estado sem depender de cor, então o alerta se separa da tarja por preenchimento,
borda, ícone e posição — quatro sinais, não um.

Os dois controles ficam em contorno sobre `surface`, sem preenchimento: offline não é crise e nada
ali deve gritar. A hierarquia vem da tinta — `brand` (6,20:1) no retry, que é a ação esperada, e
`danger-strong` (8,07:1) no CVV, que mantém a cor da linha de vida em forma mais quieta.
**O CVV aparece aqui de propósito:** `tel:188` não depende de dados, e o princípio 2 do PRODUCT.md
exige que a escalada continue funcionando com a rede fora — mas o evento `crisis_fallback_required`
nunca chega justamente quando não há rede.

## O corretor ortográfico lia o texto antes do anonimizador (16/08/2026)

O campo tinha `autoComplete="off"` e nada sobre corretor. O **Enhanced Spell Check** do Chrome
manda o conteúdo do campo para o Google, e extensões como o Grammarly leem o campo direto — os
dois **antes** do `AnonymizeTextUseCase`. Ou seja: a promessa que o header imprime na tela
("texto anonimizado antes do envio") era contornada acima do código que a garante, o que colide
com o princípio 1 do PRODUCT.md. A persona é explícita sobre por que isso importa mais aqui do que
em outro produto: "a confiança precisa ser demonstrada tecnicamente, não apenas declarada".

Decisão: **bloquear os dois caminhos, nos dois campos de texto livre de saúde mental** — o composer
do acolhimento e o campo do `PeerChatRoom`. O peer chat entra junto de propósito: carrega o mesmo
tipo de texto e **não** tem anonimizador nenhum na frente, então era a metade mais exposta das
duas. O conjunto de atributos mora em `presentation/lib/private-field.ts`
(`PRIVATE_TEXT_FIELD`) e é aplicado por spread, para os dois campos não poderem divergir depois.

Três precisões que decidiram o custo:

- **`spellCheck={false}` sozinho não para o Grammarly.** A extensão precisa de `data-gramm`,
  `data-gramm_editor` e `data-enable-grammarly`. Desligar só o corretor pagaria o custo inteiro e
  fecharia metade do buraco.
- **No celular — a cena principal — quem corrige é o teclado, não o navegador.** `spellCheck` não
  governa o autocorretor do teclado virtual, então o custo real ("médico exausto perde ajuda de
  digitação") cai quase todo no desktop, não no aparelho onde o app é usado.
- **Por isso `autoCorrect` e `autoCapitalize` ficam de fora.** Eles atingiriam exatamente a ajuda
  que se decidiu preservar no celular. O vazamento é o corretor; o autocorretor é a ajuda. Não
  adicionar `autoCorrect="off"` aqui por simetria com o `LinkInstitutionCodeStep`, que desliga os
  dois porque um código de instituição não tem ortografia para ajudar.

Custo aceito: quem usa no desktop perde a marcação de erro de digitação, inclusive quem depende
dela por dislexia. Nenhum critério de WCAG 2.1 AA exige corretor, mas é uma perda de inclusão real
e registrada — não um efeito colateral não percebido.

## Offline detectável não espera 45 segundos (16/08/2026)

O teto de 45s por chunk existe para o servidor que aceita a conexão e fica **calado** — não dá para
saber antes. Mas quando `navigator.onLine === false` no momento do envio, já se sabe: `runStream`
sai na primeira linha, marca `streamError = 'offline'` e nunca chama o use case. Antes, quem
mandasse uma mensagem no subsolo via o indicador de digitação por 45 segundos para só então
descobrir que nem tinha rede — o pior tempo de espera possível justamente para quem está mal.

A mensagem do usuário **continua na lista**: ela foi escrita, e apagá-la para sinalizar falha
perderia o texto. `onLine === true` segue sem provar nada sobre alcançar o provider, então só
`false` curto-circuita; todo o resto continua passando pelo caminho de stall.

## O alerta offline percebe a rede voltar

O texto dizia "quando a internet voltar, toque em tentar de novo" e deixava a vigilância com o
usuário — que está com o celular no bolso entre um atendimento e outro, não olhando a tela. O hook
`useOnline` escuta `online`/`offline` e o alerta troca prosa e ícone (`WifiOff` → `Wifi`) quando a
conexão volta.

**Não há retry automático.** Reenviar sozinho o que um médico escreveu em sofrimento é decisão
dele, não do app: o alerta avisa que dá para tentar, o toque continua sendo dele. O CVV permanece
nos dois estados pelo mesmo motivo do parágrafo acima.

## Uma tela quebrada não pode levar a escalada junto (16/08/2026)

Não havia `ErrorBoundary` em lugar nenhum do app. Qualquer exceção de render dentro da conversa
derrubava a rota inteira — inclusive a bandeja com "Falar com uma pessoa real" e o CVV. Isso
contradiz diretamente o princípio 2 do PRODUCT.md: a escalada tem de sobreviver à falha, não
compartilhá-la.

O boundary (`presentation/ui/ErrorBoundary.tsx`, reutilizável, com `fallback(retry)`) envolve
**só o transcript**, dentro do scroller. Header, bandeja e composer ficam fora e continuam
funcionando — que é o ponto: a parte que pode quebrar é a que renderiza conteúdo de tamanho
ilimitado vindo da IA. O painel de falha ainda repete o `tel:` do CVV, porque uma tela quebrada é
exatamente quando o número não deveria exigir mais um toque para achar.

**Ele não é `danger`.** Um bug de render não é crise, então usa a mesma família de status
informativo do alerta offline (`bg-surface-brand` + `border-track`) e a escada de duas alturas de
`danger` continua reservada para "a IA falhou" e "você pode estar em risco".

## O `truncate` do header não truncava

A extração do `AnonymityNote` moveu o `truncate` de um `<p>` bloco para um `<span>` dentro de um
`<p class="flex">`. Como item flex, o `span` fica com `min-width: auto` e não encolhe abaixo do
próprio conteúdo — e o utilitário `truncate` do Tailwind é só
`overflow/text-overflow/white-space`, sem `min-width: 0`. O resultado é que a regra documentada em
§Tipografia (a linha mono não pode virar duas em 320px) tinha deixado de valer sem ninguém notar.
`min-w-0` no span restaura o comportamento.

## A aba da bandeja mentia sobre esconder coisas

`aria-expanded` promete conteúdo que aparece e some. A bandeja nunca escondeu nada — os dois
atalhos existem nos dois estados, e no compacto carregam o `aria-label` inteiro, então para um
leitor de tela os dois estados são **idênticos**. O controle é de densidade visual, não de
disclosure: virou `aria-pressed`, e o `aria-controls` saiu junto por não apontar mais para nada
que apareça ou suma.

## O teto de altura do composer seguia o zoom do navegador

`max-h-33` é `8.25rem` e acompanha o tamanho de fonte raiz; o `MAX_FIELD_HEIGHT_PX = 132` do JS
era o mesmo valor cravado em pixel. Com o texto do navegador a 200% — dentro do compromisso de
WCAG 2.1 AA do PRODUCT.md — as linhas dobravam de altura e o teto não, então o campo caía de ~4
linhas visíveis para ~2. O efeito lê `getComputedStyle(field).maxHeight`, então o JS passa a
seguir o que o CSS decidir e a constante duplicada sumiu.

`MAX_MESSAGE_LENGTH` (2000) estava declarado no composer e no hook, e o texto de teto tinha o
"2000" escrito à mão pela terceira vez. Os três passaram a vir de `presentation/lib/chat-limits.ts`.

## Papéis de cor da tela (16/08/2026)

A tela é **Operate**: cor codifica ação, estado e orientação, e a raridade é o que dá força ao
sálvia. A regra que organiza o resto:

> **Preenchimento carrega ação. Texto tingido carrega voz e promessa.**

`bg-brand` fica com o que se toca — balão do usuário, botão de enviar, pílula "Pessoa real". Onde a
marca aparece como **texto sobre neutro**, ela não está competindo por um clique; está dizendo de
quem é a voz.

- **A promessa de anonimato tinha a menor hierarquia da tela.** O princípio 1 do PRODUCT.md chama
  anonimato de "promessa, não funcionalidade", e todas as outras telas autenticadas usam o chip
  `PrivacyBadge`. O chat renderizava `texto anonimizado antes do envio` em `text-muted-2` — o texto
  de menor contraste da página. Agora existe uma assinatura única (`AnonymityNote`): cadeado +
  `text-brand`, com o papel tipográfico vindo do contexto (mono 12px no header, `body` no estado
  vazio). A frase não mudou — trocar por um "anônimo" genérico perderia informação justamente na
  tela onde se digita texto livre. 6,20:1 sobre `surface`.
- **Pontos de digitação** saíram de `text-muted` para `text-brand`. É o único momento em que o
  assistente tem presença antes de ter palavras; cinza lia como cromo de sistema. De quebra o
  contraste sobe, não desce: 6,20:1 contra 5,61:1.
- **Título do estado vazio** em `text-brand`. É a primeira coisa que um médico vê e era ink puro
  sobre cinza; o serif sálvia é onde o mundo "Sereno" se apresenta. 5,65:1 sobre `canvas` — acima do
  piso de 4,5:1, não só do de 3:1 de texto grande.

**O que ficou deliberadamente sem cor:** o balão do assistente segue `bg-surface` branco sobre
`canvas` (1,09:1, separação carregada pelo `shadow-card`). Tingir esbarraria em `surface-brand`, que
significa **selecionado** no resto do app (`QuestionCard`, `IconBadge`, `PrivacyBadge`), e a
alternância branco-vs-marca é a convenção de chat que o domínio pede. Restrição aqui é decisão, não
esquecimento.

## Composer de uma linha para 2000 caracteres

`maxLength={2000}` num `<input>` de uma linha: quem escrevia um parágrafo em sofrimento via ~30
caracteres por vez e não conseguia reler nem editar o que tinha escrito. Virou `textarea` com
`rows={1}` que cresce com o conteúdo até 132px (`max-h-33`) e então rola por dentro.

- **Raio:** `rounded-card-lg` (26px). Em uma linha a caixa tem 50px de altura, o CSS limita o raio à
  metade e ela lê como pílula, igual antes; ao crescer vira canto suave em vez de losango.
- **Alinhamento:** a linha passou a `items-end`, então o botão acompanha a base da caixa que cresce.
- **Barra de rolagem:** o navegador desenha a barra colada na aresta interna da borda, então com 26px
  de raio ela cortava a curva — barra reta encostada em canto redondo. A utilidade `inset-scrollbar`
  recua o polegar 4px da borda (trilho de 14px, `border: 4px solid transparent` +
  `background-clip: content-box` → polegar visível de 6px) e afasta 10px do topo e da base, para ele
  nunca entrar na curva. Cor vem do sistema: `track` em repouso, `faint` no hover.
  `scrollbar-width: thin` fica isolado em `@supports not selector(::-webkit-scrollbar)` porque no
  Chrome a propriedade padrão **desliga** os pseudo-elementos `::-webkit-scrollbar`; assim o Firefox
  ganha a versão fina e tingida que consegue, e o Chrome fica com a recuada. No celular — a cena
  principal — a barra é overlay e some sozinha, então isto é acabamento de desktop.
- **Cursor sobre a barra:** barra com estilo próprio herda o cursor do elemento, então sobre ela
  aparecia o I-beam de texto — lia como "mais texto para clicar", não como algo para arrastar.
  `cursor` nos pseudo-elementos `::-webkit-scrollbar` não é confiável no Chromium, então a região é
  detectada no `mousemove`: `offsetX > clientWidth` só é verdade sobre a barra, porque `clientWidth`
  exclui a largura dela. Sem overflow não existe barra e a comparação nunca dá verdadeira, então o
  caso de uma linha se resolve sozinho. O estado só muda quando cruza a fronteira, e `mouseleave`
  zera.
- **Teclas:** Enter envia, Shift+Enter quebra linha, e `isComposing` é checado para não enviar no
  meio de uma composição de IME (detalhe e roteiro de teste na seção "O Enter do IME não é o Enter de
  enviar"). Um `sr-only` permanente em `aria-describedby` diz isso, porque `textarea` em que Enter
  envia contraria a expectativa de teclado.
- **Enter durante o stream** era engolido calado. Agora responde com uma linha `caption`
  (`role="status"`): "Espere a resposta terminar, ou toque em parar."

## O Enter do IME não é o Enter de enviar (18/08/2026)

Enter envia. Mas em japonês, chinês ou coreano o Enter também **confirma o candidato do IME**: quem
escreve digita romaji (`nihongo`), o IME mostra a lista de candidatos inline (日本語 / にほんご / …) e
o Enter escolhe um. Esse Enter pertence ao IME, não ao formulário. Sem guarda, a mensagem sai pela
metade — com o texto ainda em composição — e quem escreve perde a frase sem entender por quê.

`event.nativeEvent.isComposing` é verdadeiro só **durante** uma sessão de composição, então a checagem
no `keyDown` deixa esse Enter passar para o IME e só envia no Enter seguinte.

**O que isto não é:** não é filtro de idioma. Texto em japonês, chinês ou português acentuado é
enviado normalmente, e deve ser. Colar `日本語のテストを行っています。` e apertar Enter envia — colar não
abre sessão de composição, então `isComposing` é falso e o Enter é do formulário. Isso é o
comportamento correto, não uma falha da guarda.

**Como verificar de verdade** (a única forma; texto pronto nunca exercita o caminho):

1. Windows: Configurações → Hora e idioma → Idioma e região → adicionar 日本語.
2. `Win+Espaço` para trocar o teclado, modo Hiragana (`あ`).
3. No composer, digitar `nihongo` — aparece にほんご sublinhado, ainda em composição.
4. `Espaço` para converter → lista de candidatos.
5. **Enter.** Esperado: 日本語 é fixado no campo e **nada é enviado**.
6. **Enter de novo.** Esperado: aí sim a mensagem sai.

O passo 5 é o teste inteiro.

**Dívida conhecida:** não há teste automatizado — `isComposing` aparece só no fonte. E o Safari (e
WebKit mais antigo) historicamente reporta `keyCode 229` nesse Enter e já foi inconsistente com
`isComposing`, então o passo 5 merece repetição no macOS/iOS antes de confiar só no Chrome.

## O campo voltava para a primeira linha a cada tecla (18/08/2026)

O `fitToContent` mede a altura colapsando o campo primeiro (`height: 'auto'`) para poder encolher
também, e ler `scrollHeight` logo depois força o layout síncrono. Nesse instante o elemento cabe no
próprio conteúdo, a faixa rolável é zero e o navegador **fixa `scrollTop` em 0**. Devolver a altura
volta a rolagem, mas não volta a posição.

Como o `fitToContent` roda num `useEffect`, ele acontece **depois** de o navegador já ter rolado até o
cursor. A cada tecla, então: navegador rola até o cursor → efeito joga de volta para a linha 1. Abaixo
de ~4 linhas o campo ainda cabe, nada rola e o defeito é invisível — por isso só aparecia em texto
longo, exatamente quando reler o que se escreveu importa mais.

Guardar `scrollTop` antes e restaurar depois resolve. Guardar a posição, e não forçar o fim: o cursor
nem sempre está no final, e editar no meio de um desabafo precisa ficar parado onde está. Em uma
colagem o valor guardado já passa do novo máximo, o navegador fixa no limite e o campo termina no
fim — que é onde o cursor está.

## Identidade estável por mensagem

A lista usava `key={index}` sobre um array **filtrado**, e o placeholder do assistente entra e sai
desse array — os índices andavam e o React reaproveitava balão de um turno para outro. Cada
mensagem carrega um `id` de contador de módulo; o append de token e a marcação de `interrupted`
casam por `id`, não por `length - 1`.

## A espinha de alinhamento (16/08/2026)

Medido numa janela de 1400px, com a coluna de 900px centrada em 250–1150:

| Faixa | Borda esquerda | Padding em relação à coluna |
|---|---|---|
| Header | 270px | **dentro** (`p-[14px_20px]`) |
| Bandeja | 266px | **dentro** (`px-4`) |
| Balões | 250px | fora (`p-[18px_16px]`) |
| Composer | 250px | fora (`p-[14px_16px]`) |

Quatro faixas, três bordas. A causa não era o valor do padding e sim **de que lado da
`CHAT_COLUMN` ele estava**: header e bandeja punham a calha dentro da coluna, balões e composer
punham fora. No celular isso se escondia como 4px de diferença só no header; no desktop o header
ficava 20px para dentro da conversa que ele intitula.

A calha vai **fora** da coluna em todas as faixas, então a aresta da coluna é a espinha. Header:
`px-4` no elemento externo e `py-3.5 short:py-2 md:py-2.5` na coluna (mesmos 14/8/10px de antes,
só o horizontal saiu). Bandeja: `px-4` no envoltório, `px-4` removido dos dois ramos.

## A aba da bandeja estava presa nas coisas erradas

Duas âncoras, duas falhas:

- **`right-4` resolvia contra um `<div>` de largura total**, então numa janela de 1400px a aba
  ficava em `W−16` = 1384px enquanto a coluna que ela controla termina em 1150 — **234px à
  deriva**, colada na borda da janela e sem relação com o painel que abre.
- **`-top-9.75` (−39px) era derivado do `pt-3` do pai.** A base da aba caía em
  `padding do pai − 11px`: com `pt-3` isso dá 1px **abaixo** da régua, então ela cobria a borda e
  lia como aba soldada ao painel. Mas em `short:pt-2` vira **−3px, três pixels acima da régua** — e
  como a aba tem `border-b-0`, ela flutuava destacada com o fundo aberto. Número mágico que só
  funcionava em um dos dois paddings de que dependia.

Agora a aba mora dentro de um `${CHAT_COLUMN} relative` de altura zero, então `right-0` a prende na
aresta direita da coluna, e `-top-7` é exatamente a própria altura (`h-7`) — a base cai no topo do
padding-box do container, que é a aresta interna da régua, **em qualquer padding**. Os 20px acima
da bandeja, que antes eram montados por `pt-3` do pai + `pt-2` da bandeja, viraram um `pt-5`
declarado (`short:pt-4` = 16px). Foi essa soma em dois lugares que obrigava o offset derivado.

A aba deixou de ter `aria-controls` na mesma passagem que a tornou `aria-pressed` (§A aba da
bandeja mentia sobre esconder coisas): sem nada que apareça ou suma, não há o que referenciar. O
`id="chat-action-tray"` que existia só para ser o alvo dessa referência virou
`data-testid`, que é o que ele de fato era.

## Um alerta por vez, e a crise ganha

`crisisFallback` e `streamError` eram condições independentes em `ChatAlerts`, e o hook pode ligar
as duas na mesma tentativa: basta o stream emitir `crisis_fallback_required` e depois estolar
(45s) ou lançar — `providerResponded` já é `true`, então o `catch`/`stall` chama
`setStreamError(...)` com `crisisFallback` ainda ligado. O resultado eram **dois** `role="alert"`
empilhados, anunciando junto, e o "tentar de novo" da falha técnica disputando espaço com "ligue
para o CVV".

`ChatAlerts` agora retorna **um** bloco, e a crise tem precedência: se `crisisFallback` está
ligado, é ele que aparece. Nada de segurança se perde — o link do CVV não depende de rede
(princípio 2 do PRODUCT.md), que era a única coisa que o alerta offline oferecia a mais. O que se
perde de propósito é o retry: quando a IA sinalizou risco, a prioridade é o telefone, não insistir
no provedor. A escada de severidade da tela (§Cores) fica intacta, com um degrau visível por vez.

Consequência para o foco: `ChatPage` deixa de perguntar "existe `streamError`?" e passa a perguntar
"o botão de retry está na tela?" (`streamError !== null && !crisisFallback`). Sem isso, uma
tentativa que descobre a crise deixaria o foco no `<body>` — o botão sai de cena com o alerta que o
continha, e o gate antigo continuaria achando que ele está lá.

## O retry do ErrorBoundary destruía o próprio foco

Mesma família do retry dos alertas, com uma diferença que muda a solução: o alerta que falha de
novo **continua montado**, então basta não mexer no foco. O `ErrorBoundary` não — o React desmonta
a árvore do fallback e monta outra, então tanto o sucesso quanto a falha jogam o foco no `<body>`.

Dois caminhos, dois destinos:

- **Recuperou:** foco na região `Conversa` (`role="region"`, `tabIndex={0}`), não no composer. O
  usuário clicou em "tentar de novo" para **ver a conversa**; o destino é o que o retry produziu.
  Nos alertas o destino é o composer porque lá o retry produz uma *resposta*, que chega por live
  region e se anuncia sozinha.
- **Estourou de novo:** foco de volta no "tentar de novo" do painel novo, que é o equivalente mais
  próximo de "não mexer no foco" quando o nó original deixou de existir.

`ErrorBoundary` ganhou `onRecover?`, chamado de `componentDidUpdate` quando `failed` cai de `true`
para `false`. Só um boundary consegue distinguir "o retry renderizou" de "o retry estourou": se o
filho lança de novo, o React descarta aquele commit e reentra com o estado de erro, então o
`componentDidUpdate` do commit abortado não roda e `onRecover` fica calado — que é exatamente a
semântica desejada, e tem teste.

## Escala de 4px

`p-2.25` (9px) na tarja de disclaimer era o único valor fora da escala na tela. Virou
`px-4 py-2` — 8px na vertical e a mesma calha de 16px das outras faixas.

## O número do CVV vinha de dois lugares (16/08/2026)

`RequestHumanHandoffUseCase` é dono de `{ label: "CVV - Centro de Valorização da Vida",
phone: "188" }`, e as três telas de crise liam de lá. O chat tinha `tel:188` e o literal `"188"`
escritos à mão. Se a linha mudasse, três telas atualizavam e o chat continuava discando o número
velho — no caminho crítico de segurança do produto.

`presentation/lib/crisis-line.ts` passou a ser o único acessor. Ele também absorve o
`label.split(" - ")[0]`, que estava repetido literalmente nas três telas de crise — exatamente o
limiar de 3 ocorrências, e o chat seria a quarta. Os campos nomeados (`label`, `fullLabel`,
`phone`, `telHref`) substituem o comentário que as telas repetiam para explicar a derivação.

Chamar o use case daqui é seguro: ele é síncrono e sem I/O **por projeto** (princípio 2 do
PRODUCT.md), que é a mesma razão pela qual o atalho tem de funcionar com o provider fora.

## Duplicações locais que viraram uma fonte só

- **Forma do balão.** O indicador de digitação copiava à mão `rounded-[20px] rounded-bl-md
  bg-surface shadow-card` do balão do assistente. São **duas** ocorrências, não três — então
  deliberadamente **não** virou token de sistema; virou `chat-bubble.ts` local, com o raio numa
  constante só e as duas peles (`USER_BUBBLE`, `ASSISTANT_BUBBLE`) derivando dela. Abstrair cedo é
  pior que duplicar; o que se ganha aqui é impedir a deriva entre balão e indicador.
- **Ação do composer.** Enviar e parar eram duas cópias inline da mesma geometria que precisam
  ficar idênticas. Viraram `COMPOSER_ACTION`, e a altura saiu de `h-11.5` (46px, valor só desta
  tela) para `h-11` — os 44px que o resto do sistema usa (`Button` `sm`, fechar do `Modal`, piso de
  toque). As variantes divergem só onde devem: `hover:bg-brand-hover` no parar, `disabled:bg-track
  disabled:text-muted` no enviar.

## O que não foi extraído

- **`AnonymityNote` fica em `ChatPage/`.** Dois usos, uma tela. Ganha promoção para `ui/` quando
  uma terceira tela pedir, não antes.
- **Nenhum "botão-ícone circular" compartilhado.** O fechar do `Modal` (fantasma, 44px) e a ação do
  composer (preenchido, primário) se parecem e servem a propósitos diferentes.
- **Nenhum componente genérico de link do CVV.** A tela de crise usa CTA de largura total dentro de
  um `Card`; o chat usa ação compacta em linha. Ênfases diferentes — o que se compartilha é o
  **dado**, não a apresentação.

## Hierarquia dos dois CTAs

"Falar com uma pessoa real" é a linha de vida do spec e **não** pode empatar visualmente com o
CTA de autoavaliação: fica em `soft` (`bg-surface-brand`) com `border-track`; "Avaliar como
estou" cai para `ghost`. Os dois eram idênticos antes, o que fazia nenhum dos dois liderar.

## Tipografia

Header: `body-strong` + `mono-data` — os dois papéis já trazem o peso no token
(`design-tokens.md` §2), então nada de `font-extrabold` solto aqui. O subtítulo mono leva
`truncate`: em 320px ele quebraria em duas linhas e empurraria o header para além dos 65px que
alinham com o header da sidebar (§Layout).

### A promessa de anonimato não caberia mais no header

O `ThemeSwitchButton` entrou no header depois deste spec e cobra 56px da linha (44px de alvo +
`gap-3`). IBM Plex Mono tem avanço fixo de 0,6em, então a 12px cada caractere custa 7,2px exatos e
o orçamento é aritmética: `viewport − 32 (px-4) − 44 (voltar) − 12 − 12 − 44 (tema) − 19 (cadeado +
gap-1.5)`. Com "texto anonimizado antes do envio" (32 caracteres, 230px) a linha inteira passou a
caber só a partir de **430px** — antes do botão de tema cabia desde 360px. Ou seja: em todo celular
corrente a frase truncava, e a única outra cópia dela vive no empty state, que desaparece na
primeira mensagem.

"texto" era redundante — o `mono-data` sob "Acolhimento" já se refere ao que se digita. Sem ele,
26 caracteres (187px) cabem inteiros desde **360px** com o botão de tema no lugar, e a 320px o
corte cai em "anonimizado antes do…", que mantém a alegação temporal — o *quando*, que é a parte
substantiva da promessa. A cópia longa continua no empty state (`ChatEmptyState`), onde é uma frase
de `body` sem disputa de largura.

O botão de tema fica: ele é o mesmo affordance nos quatro headers de destino (Home, Peers, You,
Chat). Devolver os 56px por outro caminho não existe — o alvo de 44px já é o que dita a altura do
header (44 > 40,5px do bloco de texto), então tirar o botão da linha do subtítulo custaria ~18px de
cromo fixo, exatamente o que §9 do spec responsivo recuperou.

**O `text-[12.5px]` da faixa de disclaimer é proposital — não promova para `caption` (13px).**
"Acolhimento por IA — não substitui atendimento profissional." tem 59 caracteres; a 13px pede
~383px e a faixa oferece ~357px num aparelho de 375px, então subir meio pixel quebra a frase em
duas linhas e engorda o cromo fixo em ~19px — justamente o que §9 do spec responsivo recuperou.
Leva `text-balance` para que, quando quebrar em telas menores, as duas linhas fiquem equilibradas.

**Os balões voltaram para `body` em 16/08/2026.** O `text-[14.5px]` ficou aqui enquanto o valor
era papel de fato compartilhado — 22 ocorrências em 9 arquivos, e mudar só o chat dessincronizaria
a tela do resto do app. A extração de `ui/TextField.tsx` (`ui-primitives.md`) no mesmo dia
recolheu 21 desses pontos em um só, e o argumento evaporou junto: sobraram **duas** ocorrências, e
`PeerChatRoom` nunca usou 14,5px — usa `text-label`. Sem papel compartilhado para proteger, o que
restava era o custo: um valor fora da escala não participa do bump de ≥768px
(`design-tokens.md` §2), então a superfície de leitura mais densa do app continuava em tamanho de
celular no desktop — dentro de um `container-chat` de 900px — enquanto `body` ao redor subia para
16px. `body` (15→16px) é o papel certo: os balões são prosa de conversa, não rótulo. `label` é
papel de controle e é **menor** que `body` nas duas larguras.

A regra de três da §Duplicações continua valendo e não contradiz isso: ela decide se um valor
repetido vira constante compartilhada, não que tamanho um papel deve ter. Ela argumentaria contra
inventar um token `--text-chat` — que ninguém propôs.

O parágrafo do vazio inicial é justificado (`text-justify`) e por isso leva `hyphens-auto`: sem
hifenização, justificar uma medida de ~45ch no celular abre rios de espaço entre as palavras.
`<html lang="pt-BR">` já está no `index.html`, que é o que liga o dicionário de hifenização.
**A justificação fica no parágrafo, nunca no `div` que o envolve** — no wrapper ela também pega
o `h2` e estica o espaçamento entre palavras do título quando ele quebra em duas linhas.

Controles e prosa de erro seguem a convenção do app, não papéis próprios desta tela: prosa de
`role="alert"` em `text-label` (11 outras chamadas fazem assim) e rótulo de controle em
`text-label font-semibold` (30 outras chamadas). `caption` é papel de prosa descritiva
(`design-tokens.md` §2) — usá-lo em botão era desvio só desta tela.

**A regra vale para os quatro controles da tela**, incluindo os compactos da bandeja recolhida.
Eles nasceram em `text-caption` (a bandeja veio depois desta decisão) e voltaram para `label` em
16/08/2026. A 320px — a largura mais apertada — "Pessoa real" e "Avaliar" cabem em uma linha a
14px dentro dos 44px de piso de toque, então subir de 13px para 14px não custa quebra de linha.
`caption` fica para prosa: o contador de caracteres do composer, por exemplo, é `caption` de
propósito.

Balões usam `leading-normal` (1.5), não `leading-relaxed`: 1.625 era a única ocorrência no app
inteiro e abre demais as linhas numa medida curta de conversa.

## Performance de streaming

`messages` muda a cada token, então tudo que depende dele re-renderiza por token. Cinco medidas,
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

5. **O cromo da tela também é `memo`** (16/08/2026). As quatro medidas acima cobriam a lista, o
   composer, o `Sidebar` e a identidade dos callbacks — e deixaram de fora os quatro irmãos que
   ficam em volta: `ChatHeader`, `ChatDisclaimerBanner`, `ChatActionTray` e `ChatAlerts`. Como o
   `ChatPage` re-renderiza a cada token, os quatro iam junto. O pior era o `ChatAlerts`, que chama
   `getCrisisLine()` → `requestHumanHandoffUseCase.execute()` no corpo: **um objeto `CrisisLine`
   novo por token**, num caso em que quase sempre não há alerta nenhum para desenhar. O
   `ChatActionTray` remontava duas árvores de ícone `lucide` ao lado. Todos os quatro têm props
   estáveis ou nenhuma (`onToggle` e `onRetry` já eram `useCallback`), então `memo` bastou.

   O `CrisisCallLink` chamava `getCrisisLine()` **de novo**, por instância — dois a três cálculos
   por render do alerta. Agora o `ChatAlerts` calcula uma vez e passa `line` por prop. Não entrou
   `useMemo` nem constante de módulo: com o `memo`, o alerta praticamente não re-renderiza, e
   cachear no módulo tornaria o valor imune a mock num teste futuro sem ganho mensurável.

   **Medido, não presumido:** com o `memo` removido, `ChatPage.test.tsx` conta 14 chamadas do use
   case para 12 tokens; o teste falha em `expected 14 to be less than 12`. É esse número que a
   regressão reintroduz.

**Rolagem por frame, não por token.** `useStickToBottom` escrevia `scrollTop = scrollHeight` a
cada commit; cada escrita vem acompanhada de uma leitura de `scrollHeight`, que força layout.
Agora agenda via `requestAnimationFrame` e coalesce: com 12 tokens chegando em macrotasks
separadas (como chunks de rede), 13 escritas viraram 3.

**A checagem de "ainda seguindo" tem que ser no disparo do frame, não no agendamento.** Um frame
agendado enquanto o usuário seguia o fim continuava disparando depois de ele rolar para cima e o
puxava de volta — exatamente o que o "parar de seguir" existe para evitar. `ChatPage.test.tsx`
pegou isso.

## "Ver novas mensagens" parava antes do fim (16/08/2026)

O `scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })` **congela o alvo na hora da
chamada**. Durante os ~300ms da animação o transcript cresce com os tokens que continuam chegando,
então a rolagem terminava no fim *antigo*. Pior: os eventos `scroll` que a própria animação dispara
caíam no `handleScroll` como se fossem do usuário — a distância até o fim ainda era grande no meio
do trajeto, então `isFollowingRef` virava `false` sozinho, o `scheduleScrollToBottom` passava a
desistir e, se o conteúdo tivesse crescido mais que os 48px do limiar, `hasUnseenContent` voltava a
`true`. O usuário tocava a pílula, a tela deslizava, a pílula reaparecia e o fim continuava fora de
alcance. **O controle falhava exatamente no único estado em que ele é renderizado.**

A animação passou a ser nossa, num `requestAnimationFrame` com ease-out exponencial em
`SMOOTH_SCROLL_MS` (320ms), em vez de delegada ao `behavior: 'smooth'`. Três coisas caem juntas:

- **O alvo é recalculado a cada frame** (`scrollHeight - clientHeight` no momento do frame), então
  crescer no meio do caminho é o caso normal, não uma corrida perdida.
- **Enquanto `animationRef` está ativo, `handleScroll` retorna cedo.** Todo evento de scroll ali é
  nosso; não existe mais como a animação se cancelar sozinha.
- **Gesto do usuário aborta.** `wheel`, `touchstart` e `keydown` no scroller cancelam a animação e
  devolvem o controle — sem isso, "ignorar eventos de scroll durante a animação" viraria 320ms
  brigando com quem decidiu subir no meio.

O frame final escreve `scrollTop = scrollHeight` (o navegador satura em
`scrollHeight - clientHeight`), a mesma frase do caminho instantâneo. `prefers-reduced-motion` e a
ausência de `requestAnimationFrame` continuam caindo no salto direto.

**Por que isso não tinha teste.** O jsdom desta versão não implementa `Element.prototype.scrollTo`
— é `undefined`, verificado. O `typeof scroller.scrollTo === 'function'` era sempre falso nos
testes, então o ramo suave **nunca rodou uma vez** e o
`expect(scroller.scrollTop).toBe(SCROLL_HEIGHT)` só passava pelo ramo instantâneo. Animação nossa
resolve isso de lado: os frames são dirigidos pelo teste (`driveAnimationFrames`), com timestamps
que avançam e com `cancelAnimationFrame` também stubado — sem stubar o cancelamento, o teste de
aborto por gesto passaria sem nunca exercitar o aborto.

## Copy (PT-BR)
"Acolhimento" · "anonimizado antes do envio" · disclaimer above · "Falar com uma pessoa
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
