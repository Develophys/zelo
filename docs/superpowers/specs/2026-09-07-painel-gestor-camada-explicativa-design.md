# Painel do gestor: camada explicativa, metodologia citável e backlog de indicadores

**Data:** 2026-09-07
**Status:** Design aprovado, pronto para plano de implementação
**Escopo de produto:** PRD FR-12, FR-13, FR-16, FR-17
**Personas:** PU-002 (Dra. Beatriz Konder, decisora) e PU-003 (Rafael Tissiani, analista) — `general-documentations/documentacao-produto/`

---

## 1. Problema

O painel do gestor mostra números corretos sem dizer o que eles significam, de que base saíram nem como foram calculados. Um gestor lê "47% — sinais de burnout na equipe" e não tem como saber que aquilo é **uma semana**, de **62 respostas**, de **4 dos 7 setores**, medindo **PHQ-9/GAD-7 acima de 9** — nenhuma dessas quatro informações está na tela.

Isso falha com as duas personas por motivos opostos. Beatriz (PU-002) não tem paciência para interpretação estatística e precisa que o painel já traduza o dado em linguagem de gestão; hoje ele entrega o número cru e deixa a tradução por conta dela. Rafael (PU-003) precisa reproduzir o número para assiná-lo; hoje ele não consegue, e o gatilho de abandono descrito em PU-003 §8 já está armado no código.

O objetivo desta entrega é fazer o painel **explicar-se**, sem engordar a tela inicial.

---

## 2. Decisões tomadas

| # | Decisão | Escolha |
| --- | --- | --- |
| D1 | Escopo | Implementar a camada explicativa completa com o dado atual; mapear os dashboards novos como backlog priorizado com o custo de dado de cada um |
| D2 | Nomenclatura | Renomear o indicador para o que ele mede de fato e explicar o vínculo com burnout, em vez de manter o rótulo curto e ressalvar no tooltip |
| D3 | Formato | Uma linha fixa por card + tooltip com o método; **mais** a rota de metodologia (D6) |
| D4 | Tooltip da tendência | Incluir `checkIns` e `concerning` por semana na resposta da API, para o tooltip mostrar o denominador |
| D5 | Arquitetura | Glossário de métricas como fonte única, lido por tela, CSV, PDF, rota de metodologia e prompt da IA; mais um componente `MetricHelp` reutilizável. Sem reescrever os KPI cards |
| D6 | Metodologia | Rota própria `/manager/methodology`, **dentro desta entrega** |
| D7 | Telemetria de uso | Coleta só como contador agregado, com a faixa de duração calculada no aparelho e nenhuma linha por sessão — sem instante, sem sequência, sem cliques. Duração de fluxo, nunca por questão. A resposta local ao abandono (B12) vem primeiro e não depende de consentimento novo; o funil agregado (B10) depende de uma 4ª linha de opt-in independente. Exibir o funil de chat ao gestor segue fora |
| D8 | Faixas do follow-up | Acima de 80% ótima, 70–80% média, abaixo de 70% baixa. Constantes em `packages/domain`, na trilha das configurações por instituição (spec de 23/08/2026), classificando o percentual já arredondado. Faixa visível na tela; ausente das exportações enquanto o dado for de demonstração |

---

## 3. Descobertas da auditoria de código

Seis achados na leitura do código. D-1 a D-3 são correções de rótulo e entram nesta entrega. D-4 entra como divulgação. D-5 não é defeito — é uma escolha metodológica correta que precisa ficar documentada. D-6 não muda nada agora, mas condiciona como um item do backlog pode ser implementado.

### D-1 — O KPI principal mede uma coisa e se chama outra

`overallConcerningRate` conta autoavaliações com escore PHQ-9 ou GAD-7 **acima de 9** (`apps/web/src/domain/is-concerning-score.ts:7`), que é o teto da faixa "leve" das duas escalas. Isso é sintoma de depressão ou ansiedade em intensidade ao menos moderada — um proxy razoável e defensável de risco, mas **não é uma medida de burnout**, e o rótulo `"sinais de burnout na equipe"` afirma que é. Numa auditoria, essa é a primeira pergunta e a mais difícil de responder.

### D-2 — O número principal é de uma semana, ao lado de um número de quatro

`overallConcerningRate` é calculado apenas sobre `mostRecentWeek` (`get-manager-signals.use-case.ts:102-114`). Ele fica lado a lado com `checkInsLast4Weeks`, rotulado "(4 semanas)". Nada na tela indica que os dois cards falam de janelas diferentes, e a leitura natural — de que ambos cobrem o mesmo período — está errada.

### D-3 — A supressão por k-anonimato é invisível

O use case calcula `visibleSectorIds` contra o conjunto completo `bySector` (`get-manager-signals.use-case.ts:90-96`) e descarta a diferença. Um painel que representa 4 de 7 setores e um que representa 7 de 7 são visualmente idênticos. O gestor pode generalizar para o hospital inteiro uma leitura que vale para pouco mais da metade dele, e não tem como perceber isso. O dado necessário já está em memória; falta apenas devolvê-lo.

### D-4 — O follow-up é dado simulado, global, e vai para o relatório do PGR

`computeFollowUpResponseRate` chama `followUpRepository.findAll()` **sem `institutionId`** (`get-manager-signals.use-case.ts:138`), e o modelo `SimulatedFollowUp` não tem coluna de instituição. Consequências:

1. Toda instituição do deployment vê o mesmo número de follow-up.
2. Ele é apresentado ao lado de dois números reais, sem nenhuma distinção visual.
3. Ele é escrito no CSV e no PDF do "Insumo para o PGR" — ou seja, **um número simulado é exportado dentro de um documento oferecido como evidência de gestão de risco psicossocial**.

O item 3 é o risco mais caro do painel hoje. O nome do modelo (`Simulated…`) mostra que a natureza demonstrativa é intencional; o que não é intencional é ela não aparecer em lugar nenhum para quem lê.

**Decisão:** o card e as duas exportações passam a marcar o indicador como dado de demonstração, explicitamente, até FR-17 ter dado real por instituição. Substituir o dado real é trabalho de backlog (§10, item B4); **divulgar** que ele é simulado é obrigação desta entrega.

### D-5 (divulgação, não correção) — O gráfico não usa escala 0-100%

`toTrendBarHeights` normaliza contra a própria série com padding de 10 pontos (`manager-trend-chart.ts:38-66`). Uma variação de 40% a 47% ocupa boa parte da altura do gráfico. A justificativa registrada em código é boa e não vamos mudá-la — uma escala literal esconderia movimento real. Mas é exatamente o tipo de escolha metodológica que um auditor questiona, e hoje ela não está documentada em lugar nenhum visível ao gestor. Vai para a rota de metodologia.

### D-6 — O follow-up é o único indicador sem piso de k-anonimato

`computeFollowUpResponseRate` calcula `responded / sent` sem verificar nenhum mínimo (`get-manager-signals.use-case.ts:137-143`). Todos os outros números da página passam por `visibleSectorIds`, que aplica `K_ANONYMITY_THRESHOLD`; este não passa por nada.

Hoje isso é inofensivo **por acidente**: o dado é global e simulado (D-4), então não descreve ninguém. No momento em que B4 o tornar real e por instituição, uma instituição com 3 contatos enviados e 1 respondido exibe 33% — um número que é uma única pessoa. Se B4 trouxer também recorte por setor, passa a ser o caminho mais curto para identificação em todo o painel.

**A consequência para o sequenciamento:** o que protege este indicador hoje é justamente o seu defeito. Corrigir a proveniência sem adicionar o piso trocaria um problema de honestidade por um de privacidade — o pior dos dois. B4 não pode ser dividido em "primeiro o dado real, depois o k-anonimato": as duas metades são uma entrega só.

Nesta entrega nada muda no cálculo; o rótulo de demonstração de §5.3 já impede o uso indevido enquanto o número não for real.

---

## 4. Arquitetura: o glossário como fonte única

### Por que

O rótulo `"Sinais de burnout na equipe"` está hardcoded em **três** lugares hoje: o card (`ManagerDashboardPage.tsx:259`), o CSV e o PDF (`download-manager-pgr-report.ts:36`, `:73`). Com a rota de metodologia serão quatro superfícies, e o prompt da IA (`generate-manager-insight.use-case.ts:53-65`) descreve as mesmas métricas com um quinto vocabulário. Divergência entre tela e export é o gatilho de abandono de PU-003 §8, e é o tipo de inconsistência que a fiscalização encontra antes de nós.

### Forma

Novo módulo em `packages/domain` (`@zelo/domain`), consumido pelo web e pela api — decisão PA1, §14:

```ts
export interface MetricDefinition {
  id: 'concerningRate' | 'checkIns' | 'followUpRate' | 'sectorCoverage';
  /** Rótulo curto. A mesma string na tela, no CSV e no PDF. */
  label: string;
  /** Linha sempre visível sob o valor: o que o número quer dizer, em linguagem de gestão. Serve PU-002. */
  plainReading: string;
  /** Como o número é calculado, palavra por palavra. Vai no tooltip e na rota de metodologia. Serve PU-003. */
  method: string;
  /** Janela temporal, dita explicitamente porque os cards usam janelas diferentes (D-2). */
  window: string;
  /** Como a supressão por k-anonimato afeta este indicador especificamente. */
  suppression: string;
  /** Presente só quando o indicador não é dado real de produção (D-4). */
  provenance?: 'demonstration';
}
```

`ManagerDashboardPage`, `download-manager-pgr-report`, a nova `ManagerMethodologyPage` e o `formatSummary` do backend lêem daqui. `packages/domain` é o único lugar que os dois apps já compartilham — o backend não pode importar de `apps/web`, e duplicar os identificadores no backend reintroduziria exatamente a divergência de vocabulário que o glossário existe para eliminar.

A concessão fica registrada como comentário no próprio módulo: ele carrega copy de apresentação em pt-BR dentro de um pacote de domínio. Se o produto ganhar um segundo idioma (`branstorms.md` §1.2 já prevê ES/EN), este é o primeiro módulo a se dividir em identificadores + camada de tradução.

**Alternativa rejeitada:** copy inline em cada componente. Mais rápida de escrever, mas a primeira edição de rótulo produz divergência entre tela e documento de auditoria — que é justamente o que o produto vende.

### Componente `MetricHelp`

`apps/web/src/presentation/ui/MetricHelp.tsx` — ícone de ajuda (`lucide-react`, `HelpCircle`, 14px, `text-muted-2`) envolvido no `Tooltip` existente. Usado nos três KPI cards, nos títulos "Tendência geral" e "Sinais por setor", e em cada item de legenda ("Pico", "Mais recente").

**Alteração necessária no `Tooltip`:** o bubble atual é `text-center`, `max-w-[16rem]` e `font-semibold` (`Tooltip.tsx:170`) — dimensionado para rótulo de ícone, não para três linhas com uma fórmula. Adicionar uma prop `align?: 'center' | 'start'` que troque para `text-left`, `max-w-[22rem]` e peso normal. O default permanece o atual, para não mexer em nenhum uso existente.

---

## 5. Copy de cada indicador

Todas as strings abaixo vivem no glossário. Valores entre `{}` são interpolados.

### 5.1 `concerningRate` — decisões D1, D2, D-1, D-2

| Campo | Conteúdo |
| --- | --- |
| `label` | **Respostas com sinal de sofrimento relevante** |
| `plainReading` | `{47}% das {62} respostas na semana de {31 de ago.}` |
| `method` | Proporção de autoavaliações cujo escore total de PHQ-9 ou GAD-7 ficou acima de 9 — o teto da faixa "leve" das duas escalas. Um escore acima disso indica sintomas de depressão ou ansiedade em intensidade ao menos moderada, condição que a literatura associa a maior risco de esgotamento profissional. Não é um diagnóstico de burnout nem de nenhuma outra condição. |
| `window` | Apenas a semana mais recente com dados suficientes — não é média das 6 semanas. |
| `suppression` | Soma somente os setores com 5 respostas ou mais na semana de referência. Setores abaixo desse limite não entram nem no numerador nem no denominador. |

O rótulo antigo desaparece das três superfícies. A palavra "burnout" continua no `method`, no lugar certo: descrevendo a associação, não a medida.

### 5.2 `checkIns`

| Campo | Conteúdo |
| --- | --- |
| `label` | **Questionários respondidos** |
| `plainReading` | `{312}` respostas em `{4}` setores visíveis, nas últimas 4 semanas |
| `method` | Soma das autoavaliações respondidas. Uma mesma pessoa que responde em duas semanas diferentes conta duas vezes; dentro da mesma semana, conta uma única vez, mesmo que refaça o questionário. |
| `window` | As 4 semanas mais recentes que têm dados — não necessariamente os últimos 28 dias corridos. |
| `suppression` | Conta apenas setores visíveis. |

A regra de deduplicação (`record-signal-checkin.use-case.ts:26-30`) nunca esteve documentada e é indispensável para quem vai citar o número.

### 5.3 `followUpRate` — decisão D-4

| Campo | Conteúdo |
| --- | --- |
| `label` | **Taxa de resposta do follow-up** |
| `plainReading` | **Dado de demonstração** — não reflete esta instituição |
| `method` | Proporção de contatos de reengajamento respondidos, na semana mais recente. O mecanismo de follow-up (FR-17) ainda não coleta dado real por instituição: este valor vem de um conjunto de demonstração, igual para todas as instituições, e não deve ser usado em relatório, apresentação ou documento de conformidade. |
| `provenance` | `'demonstration'` |

Tratamento visual: valor em `text-muted` em vez de `text-brand`, e um `Pill` "demonstração" no card. Nas exportações, a linha ganha o sufixo `(dado de demonstração — não usar como evidência)`.

**Decidido em 07/09/2026: o card permanece.** A medição pretendida — como a pessoa está passado um tempo, ao voltar à plataforma — é intencional e é a métrica prioritária declarada pela ACM em 19/07/2026. Manter o card visível preserva a intenção de produto; a rotulagem preserva a honestidade enquanto o dado real não existe.

Registrar uma distinção que a decisão expõe: o que o card mede hoje é **taxa de resposta** (quantos responderam ao contato de reengajamento), e o que se quer medir é **como a pessoa está** no reencontro. São dois indicadores, não um. O segundo não existe em lugar nenhum do produto ainda e provavelmente merece entrada própria no glossário quando B4 for implementado — a taxa de resposta mede a mecânica do follow-up, não o bem-estar de quem respondeu.

#### Faixas de interpretação

Decidido em 07/09/2026: a taxa de resposta ganha faixas, porque "47%" sozinho não diz a ninguém se é bom ou ruim — que é o problema que esta entrega inteira existe para resolver.

| Faixa | Regra | Rótulo |
| --- | --- | --- |
| `good` | acima de 80% | Ótima |
| `fair` | de 70% a 80%, inclusive | Média |
| `poor` | abaixo de 70% | Baixa |

**Novo módulo `packages/domain/src/manager-metric-bands.ts`**, seguindo o padrão já estabelecido por `band-for.ts` (tabela de entradas + função de resolução):

```ts
/**
 * Camada Operacional das configurações por instituição — ver
 * docs/superpowers/specs/2026-08-23-institution-settings-design.md.
 * Nenhum outro ponto do código pode repetir estes números.
 */
export const FOLLOW_UP_RATE_GOOD_MIN = 80;
export const FOLLOW_UP_RATE_FAIR_MIN = 70;

export type FollowUpBandTone = 'good' | 'fair' | 'poor';
export interface FollowUpBand { tone: FollowUpBandTone; label: string; meaning: string }

export function followUpBandFor(percent: number): FollowUpBand;
```

**A função recebe o percentual inteiro já arredondado, não a fração.** O card renderiza `Math.round(rate * 100)`; classificar a fração crua faria uma taxa de 0,804 e uma de 0,7996 exibirem ambas "80%" com faixas diferentes. Banda e número exibido saem do mesmo valor, sempre.

**Fronteiras, ditas explicitamente porque são o que silenciosamente diverge depois:** 80 exato é `fair`, não `good` ("acima de 80"); 70 exato é `fair`, não `poor` ("abaixo de 70"). A assimetria é literal ao que foi pedido — se a intenção era `>= 80` para ótimo, é aqui que se corrige, e o teste de fronteira torna a mudança visível.

**Por que este indicador ganha tom e o `concerningRate` não.** O card de sinais é deliberadamente sem tom, e o motivo está no código: o que conta como taxa preocupante é questão de produto em aberto, e um âmbar incondicional lê como alerta até a 0%. Isso continua valendo e não muda nesta entrega. A diferença é a natureza da pergunta: "qual taxa de burnout é ruim" é uma questão clínica não resolvida; "qual taxa de resposta a uma pesquisa é boa" é metodologia de survey, com resposta razoavelmente assentada. Registrar a distinção aqui evita que a assimetria pareça descuido em uma revisão futura.

**Interação com o rótulo de demonstração.** A faixa **é exibida na tela**, ao lado da pill "demonstração" — ela ensina a ler o indicador, que é o objetivo. As **exportações não carregam faixa nem tom enquanto `provenance === 'demonstration'`**: escrever "Ótima" ao lado de um número simulado dentro do documento oferecido como insumo de PGR é precisamente a falha que D-4 descreve. Quando B4 entregar dado real, a condição cai e a faixa passa a viajar junto.

### 5.4 `sectorCoverage` — indicador novo, decisão D-3

| Campo | Conteúdo |
| --- | --- |
| `label` | **Cobertura desta leitura** |
| `plainReading` | `{4}` de `{7}` setores · `{3}` ocultos por terem menos de 5 respostas |
| `method` | Quantos dos setores selecionados no filtro chegaram ao mínimo de 5 respostas na semana de referência e, portanto, entram em todos os números desta página. |
| `window` | Semana de referência, a mesma do indicador de sofrimento relevante. |
| `suppression` | Este indicador **é** a medida da supressão: quanto maior a diferença entre os dois números, menor a parcela da instituição que os demais indicadores representam. |

Não é um quarto KPI card. Renderiza como uma linha de contexto logo abaixo do `DASHBOARD_DISCLOSURE` atual, que passa a mostrar o número concreto em vez da regra genérica.

---

## 6. Tendência geral: denominador, tooltips e acessibilidade

### 6.1 Mudança de API

`weeklyTrend` passa de `{ weekStart, concerningRate }` para `{ weekStart, concerningRate, checkIns, concerning }`.

Alterar `ManagerSignalsResponse` no use case (`get-manager-signals.use-case.ts:124-132`, onde `totalCheckIns` e `totalConcerning` **já são calculados e descartados**) e o `ManagerSignalsResponseSchema` no port do web.

**Privacidade:** `weeklyTrend` é construído a partir de `visibleRows`, já filtrado por `visibleSectorIds`. Os contadores são somas sobre setores que individualmente passaram no k-anonimato, então expor o total não afrouxa nada. Precisa de teste dedicado que prove isso, porque é a garantia mais importante do produto e não pode depender de leitura de código.

### 6.2 Tooltip por barra

Conteúdo, para cada semana:

```text
Semana de 3 de ago.
42% — 8 de 19 respostas
+2 pontos vs. a semana anterior
```

Terceira linha ausente na primeira semana da série. Se a barra for o pico ou a mais recente, a linha da legenda correspondente aparece ao final.

### 6.3 Acessibilidade — decisão de design

Hoje as barras são `aria-hidden="true"` e existe uma `<ul className="sr-only">` paralela (`ManagerDashboardPage.tsx:283-287`). Pendurar um tooltip numa barra `aria-hidden` cria um trigger focável dentro de conteúdo escondido — violação direta de WCAG.

**Decisão:** cada barra vira um `<button type="button">` com nome acessível vindo de `describeTrendWeek`, agora enriquecido com o denominador e a variação. A `<ul>` `sr-only` da versão desktop é removida, porque passaria a duplicar o que os botões já anunciam. O `Tooltip` existente já abre em `onFocus`, então teclado e leitor de tela recebem o mesmo conteúdo que o mouse — sem caminho separado a manter.

A lista mobile (`:335-364`) recebe o mesmo tratamento; ali cada linha já é uma unidade com rótulo e percentual, e vira o próprio trigger.

### 6.4 Legendas explicadas

"Pico" e "Mais recente" ganham `MetricHelp`:

- **Pico** — "A semana com a maior proporção de sinais dentro destas 6 semanas. É uma comparação relativa à própria série, não um limite de alerta: a barra fica marcada mesmo que o valor seja baixo, porque indica o ponto mais alto do período, não que ele seja preocupante."
- **Mais recente** — "A última semana com dados. Aparece separada porque é a que reflete a situação atual; quando ela também é o pico, prevalece a marcação de pico."

A primeira explicação é importante: hoje um gestor pode ler o âmbar de "Pico" como alerta de gravidade, quando ele é puramente relativo — comportamento que o próprio código documenta mas a interface não.

---

## 7. Rota `/manager/methodology`

Nova página `ManagerMethodologyPage`, adicionada a `routes.ts` como `managerMethodology`.

**Acesso:** link "Como calculamos estes números" no rodapé do painel, e entrada em `MANAGER_PRIMARY_NAV` (`manager-nav.ts:17`) com ícone `BookOpen`. Disponível para os dois papéis (`HOSPITAL_ADMIN` e `SECTOR_MANAGER`) — é conteúdo explicativo, sem dado sensível.

**Conteúdo**, todo gerado a partir do glossário mais texto próprio da página:

1. **O que o Zelo mede** — PHQ-9 e GAD-7, o que cada escala cobre, por que a triagem é em duas etapas (GAD-2/PHQ-2 → GAD-7/PHQ-9, conforme ADR e resposta da ACM de 19/07/2026).
2. **Como um sinal vira um número** — do check-in individual criptografado ao contador agregado; o fato de não existir registro individual no banco, apenas contadores. A regra de deduplicação é por **dispositivo** e semana, e um dispositivo não é uma pessoa: dois profissionais que compartilham um tablet contam como um, e um profissional com dois aparelhos conta como dois. É uma imprecisão inevitável sob anonimato e precisa estar escrita, porque é a primeira coisa que um auditor pergunta ao ver "respostas" tratado como se fosse "pessoas".
3. **Cada indicador** — tabela com `label`, `method`, `window` e `suppression` de cada entrada do glossário. Renderizada a partir do glossário, nunca reescrita à mão.
4. **A regra de privacidade** — o limiar de 5 respostas, por que a semana de referência é a mais recente em que **algum** setor chega ao limiar e não simplesmente a última semana (`get-manager-signals.use-case.ts:70-81`), e o que isso implica para a leitura.
5. **Como ler o gráfico** — a escala relativa com padding de 10 pontos (D-5), dita abertamente: as barras comparam as semanas entre si, não contra 0-100%, e os percentuais impressos acima delas são o valor literal.
6. **O que este painel não é** — a mesma ressalva de `MANAGER_INSIGHT_DISCLAIMER` e do bloco NR-1: insumo para gestão de risco psicossocial, não certificação de conformidade; não é diagnóstico; não permite identificar ninguém.
7. **Data de vigência** — a versão da metodologia e desde quando vale, para dar a Rafael a estabilidade de série descrita em PU-003 §11.8. Qualquer mudança futura de limiar ou janela acrescenta uma entrada datada aqui.

A página é imprimível (`@media print` limpo), porque o uso real previsto é virar anexo de documento de PGR.

---

## 8. Paridade tela ↔ exportação

Regra de PU-003 §11.7: nenhum indicador entra numa superfície sem entrar na outra. Nesta entrega, isso significa:

- CSV e PDF passam a ler `label` do glossário — a renomeação de D-2 chega aos três lugares de uma vez.
- Ambos ganham a linha de cobertura (`sectorCoverage`).
- Ambos marcam o follow-up como demonstração.
- Ambos ganham um rodapé "Metodologia: consulte /manager/methodology, versão {v}".

A tabela semanal bruta no CSV **não** entra aqui — é o item B1 do backlog, e é a mudança que de fato fecha o teste de reprodução. Registrar essa lacuna explicitamente: ao final desta entrega, o painel explica como o número é feito, mas ainda não permite refazê-lo.

---

## 9. Impacto no prompt da IA

`formatSummary` (`generate-manager-insight.use-case.ts:48-65`) envia a série semanal como uma lista de percentuais sem denominador. O modelo interpreta `40%, 42%, 42%, 44%, 46%, 47%` sem saber se cada ponto vem de 8 ou de 180 respostas — e portanto pode afirmar tendência onde há ruído de amostra.

Com D4, o denominador passa a existir na resposta. Incluí-lo no summary é uma melhoria de baixo custo e alto retorno, e mantém a análise da IA falando o mesmo vocabulário do glossário. O summary também passa a informar a cobertura (`4 de 7 setores`) e a marcar o follow-up como demonstrativo, para o modelo não construir recomendação em cima de dado simulado.

---

## 10. Backlog: dashboards e indicadores novos

Ordenado por (valor para decisão) ÷ (custo de dado). As três primeiras linhas usam dado que já existe no banco e não foram incluídas nesta entrega apenas por escopo, não por dificuldade.

### Faixa A — dado já existe, alto valor

| Id | Indicador | Decisão que apoia | O que exige |
| --- | --- | --- | --- |
| **B1** | **CSV bruto: uma linha por setor × semana** com `checkIns`, `concerning` e taxa | Reproduzir o número; levar à diretoria | Nenhum dado novo. `SignalRepository.findAll` já devolve exatamente essa granularidade e o use case a agrega antes de responder. É a mudança que fecha o teste de adoção de PU-003 |
| **B2** | **Setores silenciosos** — setor cadastrado com zero respostas na semana | Onde eu ajo primeiro; a equipe está usando? | Nenhum dado novo. Hoje um setor com zero respostas e um setor suprimido pelo k-anonimato são indistinguíveis, e significam coisas opostas: um é ausência de adesão, o outro é excesso de proteção |
| **B3** | **Variação por setor vs. período anterior** — quem subiu e quem desceu | Isso melhorou ou piorou? | Nenhum dado novo. `segments` hoje só devolve a semana de referência; passar a devolver a anterior permite a comparação |
| **B4** | **Follow-up real por instituição** | Corrige D-4 | `SimulatedFollowUp` ganha `institutionId`, ou o mecanismo de FR-17 passa a gravar dado real. Continua sendo contador (`sent`, `responded`), nunca linha por pessoa. **Exige o piso de k-anonimato que este indicador hoje não tem** — ver D-6. Sem B4, a métrica prioritária declarada pela ACM continua sendo uma demonstração |

### Faixa B — dado existe, requer trabalho de API

| Id | Indicador | Decisão que apoia | O que exige |
| --- | --- | --- | --- |
| **B5** | **Filtro de período componível** (setor × intervalo) e comparação entre dois períodos | Todas as quatro | O endpoint aceitar intervalo de datas. Todas as semanas já estão no banco; hoje a API fixa 6 semanas de tendência e uma semana de referência |
| **B6** | **Relatório de período para diretoria/PGR** — evolução desde a última revisão | O que levo à fiscalização | Depende de B5. Amplia o bloco NR-1 existente |
| **B7** | **Ranking de prioridade de ação** — nível × tendência × tamanho da equipe | Onde eu ajo primeiro | Versão fraca usando `n` como proxy de tamanho é possível hoje; versão correta depende de B8 |

### Faixa C — exige dado novo

| Id | Indicador | Decisão que apoia | O que exige |
| --- | --- | --- | --- |
| **B8** | **Taxa de adesão / cobertura** — respostas ÷ médicos alocados no setor | A equipe está usando? | `Sector.headcount` (`Int?`), preenchido pelo admin. Baixo custo técnico, custo real de processo: alguém precisa manter o número atualizado, e um headcount errado produz uma taxa errada com aparência de precisão. **É o que torna `checkInsLast4Weeks` interpretável pela primeira vez** — 312 respostas é ótimo ou péssimo dependendo de serem 40 ou 400 médicos |
| **B9** | **Registro de ações tomadas pela gestão** | O que levo à fiscalização | Modelo novo. Sob a NR-1 é preciso demonstrar que se **agiu** sobre o risco, não apenas que se mediu — hoje o painel prova metade da obrigação. É o maior salto de valor de conformidade do backlog inteiro |
| **B10** | **Funil de uso agregado** — questionários e conversas iniciados vs. concluídos, com faixa de duração, por setor/semana | A equipe está usando?; melhoria do produto | **Bloqueado por consentimento.** Contador pré-agregado com faixa calculada no aparelho; nunca tabela de sessões. Ver §11 |
| **B11** | **Funil do chat de IA no painel do gestor** | — | **Não recomendado.** A coleta (B10) cobre o dado; o que fica fora é a exibição ao empregador. Ver §11.4 |
| **B12** | **Resposta local ao abandono** — o app percebe que a pessoa parou no meio e oferece retomar ou falar com alguém | Cuidado com quem recuou no momento de crise | **Nenhum dado sai do aparelho; nenhum consentimento novo.** É o item de melhor razão valor/custo do backlog inteiro e o que de fato atende o propósito de crise. Ver §11.2 |

---

## 11. Telemetria de uso e consentimento

### 11.0 A restrição estrutural

`RecordSignalCheckinUseCase` nunca grava uma linha individual: incrementa um contador em `(instituição, setor, semana)` e guarda apenas um hash de deduplicação (`record-signal-checkin.use-case.ts:26-38`). A privacidade do produto não é uma regra de exibição sobre dados individuais armazenados — **não existe dado individual armazenado**.

Qualquer telemetria nova precisa nascer nesse formato: contador pré-agregado por `(instituição, setor, semana)`, sem carimbo de tempo por evento, sem identificador de sessão, sem ordem de eventos. Uma tabela de eventos, ainda que anônima, reintroduz a possibilidade de correlação temporal e destrói a propriedade mais forte que o produto tem — e faz isso silenciosamente, porque nada na interface mudaria.

### 11.1 Dois propósitos que estavam na mesma frase

A intenção declarada em 07/09/2026 contém dois produtos distintos, e separá-los é o que torna os dois baratos:

| Propósito | Quem consome | Granularidade necessária |
| --- | --- | --- |
| "O instrumento tem fricção?" | Gestor e time Zelo | Contador agregado (B10) |
| "Esta pessoa se aproximou de pedir ajuda e recuou" | **A própria pessoa** | Individual — e nunca precisa sair do aparelho (B12) |

O segundo é o propósito de crise: alguém que abre o app num momento difícil e o fecha por medo ou insegurança. Ele não é um dashboard; é o app reagir a ela.

### 11.2 B12 — o aparelho já sabe

`rememberDraft` persiste `{scaleType, answers, questionIndex}` a cada resposta (`assessment-draft.ts:22-28`), e `ShouldShowFollowUpPromptUseCase` já é uma decisão puramente local sobre o que oferecer a esta pessoa agora. A capacidade de perceber o abandono existe e não está sendo usada para reagir.

B12 é a interface que falta: na abertura seguinte, oferecer retomar de onde parou **ou** falar com alguém. Nada trafega, nada é armazenado no servidor, nenhum consentimento novo é necessário.

**Ajuste técnico:** `rememberDraft` usa `sessionStorage` deliberadamente — fechar o navegador apaga o rascunho, que é justamente o caso de crise mais importante. Sobreviver a isso pede uma chave separada em `localStorage` guardando apenas `{abandonouEm, ondeParou}`, **sem as respostas**: a justificativa original do `sessionStorage` (não ressuscitar um instrumento de dias atrás como se fosse desta sessão) continua valendo integralmente para o conteúdo.

### 11.3 B10 — a forma que a coleta tem que ter

**A restrição decisiva não é o relógio, é a forma da linha.** Uma tabela com uma linha por sessão continua sendo um registro individual mesmo sem hora nenhuma — e todo modelo deste schema declara `createdAt DateTime @default(now())`, então o relógio voltaria por omissão, sem ninguém decidir isso.

Forma aprovada:

- O **aparelho** mede a duração e a converte em faixa localmente. Envia a faixa, nunca o valor bruto, nunca um instante.
- O **servidor** incrementa um contador em `usage_counters(institutionId, sectorId, weekStart, event, bucket, count)` — mesma forma de `Signal`, cuja `weekStart` é a única granularidade temporal existente.
- Como a linha é um contador acumulado por upsert, ela não marca nenhum evento individual.
- `event`: `checkin_started`, `checkin_completed`, `chat_opened`, `chat_message_sent`.
- `bucket`: `lt30s`, `30s_2min`, `2_10min`, `gt10min`.

**Duração de fluxo, não de questão.** Medir tempo por tela dentro do instrumento significaria registrar quanto alguém hesitou no item 9 do PHQ-9 — o dado mais sensível que o produto poderia guardar, e sem valor de gestão que o justifique. A medição é do fluxo inteiro.

**Sem deduplicação, por decisão.** `Signal` deduplica por dispositivo/semana porque uma pessoa é um check-in. Aqui múltiplas sessões devem contar, então não há dedup — e portanto um aparelho pode inflar o contador. Aceitável para métrica de uso; precisa estar dito na metodologia.

**Custo técnico real, e onde ele morde:** detectar "abriu e fechou logo em seguida" depende de `visibilitychange`/`pagehide` com `navigator.sendBeacon`, que é notoriamente pouco confiável em Safari mobile e em PWA. Ou seja: **o evento que mais se quer capturar é o que menos se captura de forma confiável.** O número resultante subestima o abandono por uma margem desconhecida, e usá-lo como se fosse completo produziria uma leitura falsamente tranquilizadora. Se B10 for implementado, essa limitação vai na rota de metodologia junto com o indicador — não em nota de rodapé.

### 11.4 O que fica fora: telemetria detalhada

Cliques, sequência de eventos e timestamps por evento ficam fora, e a razão é técnica antes de ser ética: **traço comportamental é impressão digital.** Num setor com 12 médicos, "abriu a tela de crise, ficou 40s, saiu" identifica uma pessoa para quem tem a escala de plantão. O k-anonimato que protege todos os outros indicadores opera sobre contagens por setor e semana — ele não protege sequência de eventos, e nenhuma variação de limiar faria isso.

Também vale registrar o que se perde ao aceitar: hoje não existe linha individual no banco, e é isso que sustenta a frase "impossível de cruzar com identidade, mesmo por acidente" (PU-002 §6). Uma tabela de eventos cria essa linha e transforma uma garantia de arquitetura numa promessa de política.

A **exibição** do funil de chat ao gestor (B11) segue fora por motivo separado: "começou a escrever no chat e desistiu" é a pessoa se aproximando de pedir ajuda sobre o próprio sofrimento e recuando, e entregar isso ao empregador — mesmo agregado — é o que PU-001 chama de vigilância disfarçada de bem-estar e o que PU-002 §11.5 manda recusar. A coleta (B10) segue valendo; o consumidor é o time do Zelo e o próprio app (B12), não o painel.

### 11.5 Consentimento

O consentimento atual autoriza "uso anônimo e agregado dos **meus sinais**" (`ConsentPage.tsx:18-21`), com opt-in separado. "Sinais" é o check-in e o escore; não cobre "como eu uso o aplicativo". `branstorms.md` §4 já registra a atualização como pendência.

**B10 fica bloqueado até os termos serem atualizados. B12 não depende disso** — nada sai do aparelho.

Nova 4ª linha em `ConsentPage`, opt-in independente e recusável sem bloquear o acesso, exatamente como a 2ª:

> Autorizo o registro **anônimo e agregado** de como uso o aplicativo — telas abertas, questionários iniciados e concluídos — para melhorar a ferramenta. **Nunca inclui o que escrevo nem quanto tempo permaneço em cada tela.**

Redações do tipo "interações podem ser salvas" foram descartadas: "podem" não descreve o tratamento e o texto não diz quem vê, o que é insuficiente sob a LGPD. A segunda frase é o que torna a primeira crível — e é uma promessa que só pode ser feita enquanto §11.4 for respeitado. Se a telemetria detalhada entrar depois, esta linha de consentimento vira falsa, e é ela que o médico leu antes de confiar no produto.

---

## 12. Testes

TDD, seguindo o padrão do repositório.

**API — `get-manager-signals.use-case.test.ts`**

- `weeklyTrend` devolve `checkIns` e `concerning` por semana, batendo com a soma dos setores visíveis
- setor abaixo do limiar não contribui com `checkIns` para nenhuma semana da tendência — o teste de privacidade de §6.1
- `sectorCoverage` conta corretamente visíveis e ocultos, inclusive quando todos são ocultos e quando nenhum é
- filtro estreito de `sectorIds` não altera a contagem de ocultos de forma que permita inferir o valor de um setor suprimido por subtração

**Web — `manager-metric-glossary.test.ts`**

- toda entrada tem `label`, `plainReading`, `method`, `window` e `suppression` não vazios
- nenhum `label` do glossário contém a palavra "burnout" — trava de regressão para D2/D-1
- a entrada de follow-up declara `provenance: 'demonstration'`

**Domain — `manager-metric-bands.test.ts`**

- `81 → good`, `80 → fair`, `75 → fair`, `70 → fair`, `69 → poor` — as quatro fronteiras, uma asserção cada, porque é o que muda sem ninguém perceber quando os valores virarem configuráveis
- `0` e `100` resolvem sem erro
- as faixas são contíguas e não se sobrepõem: para todo inteiro de 0 a 100 existe exatamente uma faixa

**Web — `ManagerDashboardPage.test.tsx`**

- cada KPI card renderiza a `plainReading` da sua métrica
- o card de follow-up renderiza a marca de demonstração
- a linha de cobertura mostra visíveis e ocultos
- cada barra da tendência é um botão com nome acessível contendo semana, percentual e denominador
- nenhum elemento focável dentro de container `aria-hidden` — asserção genérica, junto do `a11y.test.tsx` existente

**Web — `download-manager-pgr-report.test.ts`**

- CSV e PDF usam o `label` do glossário
- a linha de follow-up carrega a ressalva de demonstração
- **a faixa de interpretação não aparece em nenhuma das duas exportações enquanto `provenance === 'demonstration'`**
- os rótulos exportados são idênticos aos renderizados na tela — teste de paridade dirigido pelo glossário

**Web — `ManagerMethodologyPage.test.tsx`**

- a tabela de indicadores é gerada a partir do glossário: adicionar uma métrica ao glossário a faz aparecer na página sem edição da página

---

## 13. Fora de escopo

- Qualquer item da §10. O backlog é entregável desta spec; o código dele não é.
- Alterar o cálculo de qualquer indicador. Renomeamos, explicamos e divulgamos; a matemática não muda, para não quebrar a série histórica antes de a política de versionamento de metodologia (§7.7) existir.
- Substituir o dado simulado de follow-up (B4). Esta entrega o rotula; não o conserta.
- Redesenhar o filtro de setor, ainda que `branstorms.md` §2.1 registre insatisfação com ele.

---

## 14. Riscos e perguntas abertas

**R1 — A renomeação afeta material já apresentado.** Se algum gestor ou material de pitch já circulou com "sinais de burnout", a mudança de rótulo precisa ser comunicada, não apenas publicada. Baixo impacto agora (não há cliente institucional real, conforme `problem-statement.md`), alto se demorarmos.

**R2 — Rotular o follow-up como demonstração enfraquece a demo.** É uma das duas métricas que a ACM declarou prioritárias em 19/07/2026. Rotular reduz o impacto da apresentação; não rotular coloca um número simulado dentro de um documento de conformidade. A escolha aqui é deliberada e não deve ser revertida em nome de demo mais bonita — B4 é a resposta certa, e sobe de prioridade por causa disso.

**R3 — A rota de metodologia envelhece em silêncio.** Uma página que descreve o cálculo pode divergir do cálculo. Mitigação parcial: gerar as seções por indicador a partir do glossário, que é o mesmo objeto que a tela usa. As seções em prosa (1, 2, 4, 5) continuam podendo divergir e precisam de revisão sempre que o use case mudar.

**PA1 — resolvida em 07/09/2026.** O glossário vive em `packages/domain`, consumido pelos dois lados. A ressalva fica registrada como comentário no próprio módulo: ele carrega copy de apresentação em pt-BR dentro de um pacote de domínio, o que é uma concessão deliberada — a alternativa (glossário no web, identificadores duplicados no backend) reintroduz a divergência de vocabulário que o glossário existe para eliminar. Se o produto ganhar um segundo idioma, este módulo é o primeiro a se dividir em `id`/`termos` e uma camada de tradução.

**PA2 — A rota de metodologia deve ser pública?** Um auditor externo ou um médico cético que queira conferir a metodologia hoje precisaria de uma conta de gestor. Uma versão pública seria um ativo de confiança forte para PU-001 — e é a resposta mais direta à dor "falta de prova técnica da confidencialidade" de PU-002 §9. Fora de escopo aqui; vale como pergunta de produto.

**PA3 — Qual é a definição de "resposta" para o gestor?** Documentamos que a deduplicação é por dispositivo e semana, mas um dispositivo não é uma pessoa. Dois médicos que compartilham um tablet contam como um; um médico com dois aparelhos conta como dois. Isso é aceitável e provavelmente inevitável dado o anonimato, mas precisa estar dito na metodologia, e não está no texto proposto em §7 — acrescentar antes de publicar.
