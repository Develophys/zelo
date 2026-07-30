---
artefato: prd
versão: "1.3"
criado: 2026-07-02
atualizado: 2026-07-28
status: rascunho
---

# PRD: Zelo* — Plataforma de Triagem e Suporte Confidencial à Saúde Mental do Médico

`*Nome de trabalho, ainda não validado. Ajustar em todo o pacote de documentos se o nome mudar.`

## Visão Geral

### Problem Statement (resumo)

Médicos em sofrimento psíquico não têm hoje um canal de triagem e apoio confidencial que garanta que buscar ajuda não prejudique seu registro no CRM ou sua carreira. Isso mantém a maioria em silêncio, com custo em erros clínicos evitáveis, abandono da profissão e risco de vida. (Ver documento completo: `problem-statement`.)

### Resumo da Solução

Zelo é uma PWA mobile-first que permite a um médico realizar autoavaliação clínica validada (PHQ-9, GAD-7, MBI-HSS) com score calculado inteiramente no próprio dispositivo, conversar com um chat de acolhimento por IA sem receber diagnóstico, ser conectado anonimamente a pares treinados ou, em sinal de risco agudo, receber a oferta — nunca imposição — de conexão com um psicólogo parceiro humano. O hospital ou cooperativa que financia a ferramenta enxerga apenas um painel agregado e anônimo de tendências da equipe.

> **Nota de refinamento (07/07/2026)**: a primeira entrevista de usuário (Dr. David Mendes, gestor médico, 02/07/2026) revelou que médicos desconfiam fortemente de IA em momentos de sofrimento e preferem interação humana real, mesmo valorizando anonimato. O edital exige "Acolhimento por IA" como componente obrigatório, então a decisão do time (07/07/2026) foi manter o chat de IA, mas humanizá-lo e exibir, de forma permanente e visível, um atalho para conexão com um humano — não apenas quando o sistema detecta risco agudo (ver FR-6b).

### Usuários-Alvo

**Primário**: médico(a) com CRM ativo em regime de alta carga assistencial (ver Persona: Dra. Camila Andrade).
**Secundário**: gestor(a) hospitalar / coordenação de saúde ocupacional, consumidor do painel agregado (ver Persona: Dra. Beatriz Konder, `persona-gestor-hospitalar.md`, confiança: Proto).

## Objetivos & Métricas de Sucesso

### Objetivos

1. Demonstrar, em protótipo funcional (TRL3), uma arquitetura de privacidade ponta a ponta que nunca expõe a identidade do médico sem consentimento ativo.
2. Validar tecnicamente o fluxo completo de acolhimento: autoavaliação → chat IA → matching de pares OU escalonamento em crise → painel agregado.
3. Chegar à final da 1ª Jornada Incubintech (25/07/2026) classificada nos 3 checkpoints eliminatórios.

### Métricas de Sucesso

| Métrica | Baseline | Meta | Prazo |
|---|---|---|---|
| Score calculado 100% client-side, sem dado bruto em texto claro no servidor | 0% (não existe) | 100% demonstrado | 25/07/2026 |
| Fluxo de chat de acolhimento funcional (sem diagnóstico) | 0% | Funcional em demo ao vivo | 25/07/2026 |
| Fluxo de escalonamento em crise (aceite e recusa) funcional | 0% | Ambos os caminhos navegáveis | 25/07/2026 |
| Aprovação em checkpoints semanais | 0/3 | 3/3 | 18/07/2026 |

### Não-Objetivos

- Não emitir diagnóstico clínico automatizado (a IA acolhe, não diagnostica).
- Não substituir terapia ou acompanhamento psiquiátrico contínuo.
- Não integrar com prontuário eletrônico hospitalar nesta fase.
- Não expor dado individual ao demandante/pagador em nenhuma circunstância fora do consentimento explícito do próprio médico.
- Não buscar validação clínica formal (comitê de ética/IRB) dentro da janela de 28 dias — fica como próximo passo pós-hackathon.

## User Stories (resumo)

| ID | User Story | Prioridade |
|---|---|---|
| US-001 | Autoavaliação com score calculado no dispositivo | P0 |
| US-002 | Chat de acolhimento por IA sem diagnóstico | P0 |
| US-003 | Escalonamento em crise — aceite de conexão humana | P0 |
| US-004 | Escalonamento em crise — recusa e linha externa | P0 |
| US-005 | Matching anônimo de pares treinados | P1 |
| US-006 | Painel agregado para gestor hospitalar | P1 |
| US-007 | Consentimento explícito antes de exposição de identidade | P0 |
| US-008 | Onboarding e transparência do modelo de privacidade | P0 |

Ver documento `user-stories` para critérios de aceite completos.

## Escopo

### Dentro do Escopo (28 dias / must-have para o PoC)

- Autoavaliação com PHQ-9, GAD-7 e/ou MBI-HSS, score calculado no dispositivo.
- Criptografia client-side (Web Crypto API, AES-256) antes de qualquer tráfego de rede.
- Chat de acolhimento por IA com system prompt de escuta ativa clínica e guardrails contra diagnóstico.
- Fluxo de decisão automática de risco agudo (regra combinando item 9 do PHQ-9 + critérios a definir com parceiro clínico).
- Caminho de aceite: token de sessão efêmero conectando a psicólogo parceiro (pode ser simulado/mockado na demo se não houver parceiro real confirmado a tempo).
- Caminho de recusa: exibição imediata de linha de crise externa (CVV 188).
- Matching anônimo de pares (pode ser versão simplificada/simulada para a demo).
- Painel de monitoramento com métricas agregadas fictícias/anonimizadas (não precisa de dado real de produção).
- PWA instalável, mobile-first.

### Fora do Escopo (28 dias)

- Validação clínica formal com comitê de ética.
- Integração com prontuário eletrônico ou sistemas hospitalares existentes.
- Múltiplos idiomas.
- App nativo (iOS/Android via lojas) — fica só PWA.
- Precificação e contrato comercial fechado com hospital pagante.

### Considerações Futuras

- Validação clínica formal e estudo piloto (6-24 meses, ciclo de pré-incubação) — adiado porque exige tempo e parceria institucional que não cabem em 28 dias.
- Expansão para outras categorias profissionais sob risco semelhante (enfermagem, outras carreiras de plantão) — adiado porque o foco do desafio é o médico.
- Multi-estado / expansão nacional — adiado, depende de tração do piloto em Santa Catarina.

## Design da Solução

### Requisitos Funcionais

#### Autoavaliação e Triagem

- **FR-1** *(revisado 19/07/2026, baseado na resposta da ACM à pergunta 1.3 — ver "Perguntas em Aberto")*: O sistema deve aplicar, como primeiro filtro, GAD-2 e PHQ-2 (dois questionários validados, de apenas duas perguntas cada, para rastreio de ansiedade e depressão). Em caso de pontuação positiva (≥3) em qualquer um dos dois, o sistema deve abrir os questionários ampliados GAD-7 e PHQ-9 para uma triagem mais aprofundada. MBI-HSS permanece fora de escopo nesta janela (ver `adr-002-mbi-hss-direction.md`) — a ACM não cita essa escala como necessária para a PoC, o que reforça essa decisão em vez de revertê-la.
- **FR-2**: O score de cada escala deve ser calculado localmente, no dispositivo do usuário, sem envio do dado bruto de respostas ao servidor.
- **FR-3** *(revisado 19/07/2026)*: O sistema deve identificar automaticamente sinais de risco agudo a partir do resultado do primeiro filtro (GAD-2/PHQ-2) e/ou dos questionários ampliados (GAD-7/PHQ-9, ex.: item 9 do PHQ-9 positivo), segundo critérios definidos com parceiro clínico.

#### Chat de Acolhimento por IA

- **FR-4**: O chat deve operar sob um system prompt de escuta ativa clínica, com guardrails explícitos contra emissão de diagnóstico.
- **FR-5**: O sistema deve anonimizar o conteúdo enviado à API de IA de terceiro antes do envio (remover identificadores diretos do texto do usuário).
- **FR-6**: O chat deve exibir aviso permanente e visível de que não substitui atendimento profissional.
- **FR-6b** *(adicionado 07/07/2026, baseado em ENT-01 — entrevista com Dr. David Mendes; destino definido em 11/07/2026)*: O chat deve exibir, de forma permanente e visível em qualquer ponto da conversa — não apenas quando o sistema detecta risco agudo —, um atalho para solicitar conexão com um humano. Ao acionar o atalho, o sistema **oferece escolha explícita** entre par médico treinado ou psicólogo — não leva direto a um dos dois. Esse atalho é independente do fluxo automático de escalonamento em crise (FR-7 a FR-10) e existe porque pesquisa com usuário indicou que a desconfiança de IA é, por si só, uma barreira de abandono tão relevante quanto o anonimato.

#### Escalonamento em Crise

> **Revisado em 19/07/2026** — ver `adr-003-crisis-protocol-rescope-peer-chat-differentiator.md`. A ACM confirmou (resposta 1.2) que "não é esperada integração técnica direta" com serviços de emergência nesta fase; o essencial é "o direcionamento correto e imediato". FR-7–FR-10 abaixo substituem a arquitetura anterior de conexão ao vivo com token de sessão efêmero sobre canal cifrado dedicado. Esta simplificação é específica ao protocolo de crise (canais de emergência externos) e não se aplica ao atalho humano do chat de acolhimento (FR-6b), que permanece inalterado — ver ADR-003 para a distinção.

- **FR-7** *(revisado 19/07/2026)*: Ao identificar risco agudo, o sistema deve oferecer — nunca forçar — sinalização e direcionamento imediato a um canal de apoio humano (psicólogo parceiro ou linha de serviço já existente).
- **FR-8** *(revisado 19/07/2026)*: O direcionamento deve ser diferenciado conforme o vínculo do profissional (rede SUS ou plano de saúde/rede privada), sem integração técnica direta com esses serviços de emergência nesta fase — o sistema comunica/indica o canal correto, não estabelece uma conexão ao vivo dedicada nem persiste identidade em texto claro no banco de dados.
- **FR-9**: Caso o médico recuse, o sistema deve exibir imediatamente linhas de crise externas (ex.: CVV 188), mantendo anonimato total.
- **FR-10**: A oferta de conexão humana pode reaparecer em interações futuras, sem bloquear o uso do app caso seja recusada.

#### Matching Anônimo de Pares

- **FR-11**: O sistema deve permitir, por escolha do médico, conexão anônima com outro par treinado, sem exposição de identidade entre as partes.

#### Painel de Monitoramento

- **FR-12**: O painel deve exibir apenas métricas agregadas e anônimas (ex.: sinais de burnout por turno/setor), nunca dados vinculáveis a um indivíduo.
- **FR-13**: O sistema deve impedir, por arquitetura (não apenas por política), que o painel consiga cruzar métricas agregadas com identidade individual.
- **FR-16** *(adicionado 11/07/2026, ver `adr-001-fr16-nr1-painel-gestor.md`, status: Aceito)*: O painel agregado deve apresentar as métricas já existentes (FR-12) também rotuladas como fatores de risco psicossocial mapeáveis ao PGR da NR-1 (ex.: "sobrecarga", "jornada", "esgotamento por setor"), com exportação simples (PDF/CSV), sempre herdando as restrições de anonimato de FR-13. O rótulo e a documentação de apoio devem deixar explícito que isso é um insumo para a gestão de risco psicossocial do empregador, não uma certificação de conformidade NR-1 — essa distinção precisa ser validada com um parceiro jurídico/SST antes da fala final da banca.

#### Acompanhamento (Follow-up)

- **FR-17** *(adicionado 19/07/2026, ver `user-stories.md` US-009)*: Após a interação inicial (autoavaliação e/ou direcionamento), o sistema deve disparar um único contato de reengajamento perguntando como o médico está, e registrar de forma agregada e anonimizada se houve resposta, para compor duas métricas no painel do gestor: (1) número de questionários/autoavaliações respondidos e (2) taxa de resposta da pesquisa de seguimento (follow-up) — herdando as mesmas restrições de anonimato e limiar mínimo por segmento de FR-13. Fonte: resposta da ACM (Dr. Marcello Alberton Herdt, Diretor de Inovação) de 19/07/2026: *"os KPIs prioritários para esta fase são, essencialmente, o número de questionários respondidos e a taxa de resposta da pesquisa de seguimento (follow-up)"*; e *"o critério de avaliação está na robustez desse fluxo de triagem → direcionamento → follow-up"*.

#### Privacidade & Segurança (transversal)

- **FR-14**: Toda comunicação entre dispositivo e servidor relativa a dados de saúde deve trafegar cifrada (E2E), nunca em texto claro.
- **FR-15**: O sistema deve registrar consentimento explícito e contextual antes de qualquer momento em que a identidade do médico possa ser exposta.

### Experiência do Usuário

Fluxo mobile-first (PWA): abrir app → autoavaliação (< 5 min) → score imediato no dispositivo → ramificação (fluxo padrão: chat IA → matching de pares opcional; ou fluxo de crise: oferta de conexão → aceite/recusa). Indicadores visuais de anonimato ("processado no seu aparelho", "ninguém mais vê isso") devem aparecer nos pontos de maior ansiedade do usuário — antes da autoavaliação e antes de qualquer possível exposição de identidade. Ver diagrama de referência fornecido pela equipe: "Fluxo de Acolhimento e Escalonamento em Crise" (Caminho B).

### Casos de Borda

| Cenário | Comportamento esperado |
|---|---|
| API de LLM indisponível durante o chat | Sistema informa indisponibilidade temporária e, se já houver sinal de risco identificado antes da falha, aciona diretamente o caminho de crise (linha externa) em vez de deixar o usuário sem saída |
| Nenhum par ou psicólogo disponível no momento do matching/escalonamento | Sistema comunica isso claramente e mantém a oferta de linha de crise externa sempre visível como alternativa |
| Usuário tenta reverter uma recusa de identificação anterior | Sistema permite reabrir a oferta de conexão a qualquer momento, sem penalidade ou fricção adicional |
| Conexão instável (dispositivo fica offline no meio da autoavaliação) | Progresso é preservado localmente até haver conexão para prosseguir; nenhum dado é perdido ou enviado incompleto |
| Uso simultâneo por médicos da mesma equipe (dashboard) | Painel agregado deve ter um limiar mínimo de respostas por segmento antes de exibir métricas, para evitar re-identificação por dedução (ex.: turno com um único médico) |

## Considerações Técnicas

### Restrições

- Privacy-by-design é requisito não negociável: score sempre calculado no dispositivo; servidor nunca recebe dado bruto em texto claro.
- Uso da API de LLM de terceiro **Groq** (decidido/em uso em 11/07/2026; Anthropic e Gemini descartados por bloqueio de billing/quota) para o chat de acolhimento, com anonimização do texto antes do envio — trade-off explícito assumido para viabilizar os 28 dias. Política de retenção de dados da API do Groq ainda precisa ser confirmada e documentada aqui.
- Janela de 28 dias corridos com checkpoints eliminatórios semanais (edital) — qualquer requisito que não caiba nesse prazo vira "Consideração Futura".
- LGPD (Lei nº 13.709/2018) aplica-se integralmente a qualquer dado pessoal tratado, mesmo em protótipo.
- CID-11 reconhece burnout como fenômeno ocupacional desde 2022; NR-1 exige gestão de riscos psicossociais dos empregadores, com vigência fiscalizatória plena a partir de maio/2026 (fonte: checklist oficial do desafio).
- Disponibilidade de parceiro clínico (psicólogo) para o caminho de crise: **confirmada em 11/07/2026** — dois psicólogos parceiros, a princípio em papel consultivo (feedback e parametrização de risco, ver `roteiro-entrevista-psicologos-parceiros.md`). O canal operacional do caminho de aceite em crise (quem atende de fato uma conexão ao vivo) ainda não está fechado — pode seguir exigindo simulação controlada na demo, documentada como tal para a banca, até essa conversa avançar.

### Pontos de Integração

- **API de LLM (terceiro)**: recebe apenas texto anonimizado do chat; nunca recebe o score bruto nem identificadores diretos.
- **Web Crypto API (client-side)**: cálculo de score e cifragem AES-256 antes de qualquer envio de rede.
- **Canal de tempo real** (detalhado no documento de arquitetura técnica): conexão ao vivo médico-psicólogo no caminho de crise, via token de sessão efêmero.
- **Banco de dados de métricas agregadas**: recebe apenas ciphertext/dados anonimizados, nunca texto claro identificável.

### Requisitos de Dados

Dado bruto de autoavaliação nunca sai do dispositivo em texto claro. Apenas ciphertext (quando aplicável) e métricas agregadas anonimizadas chegam ao servidor. A identidade do médico só é persistida, de forma efêmera e por consentimento explícito, no canal de conexão com o psicólogo durante um episódio de crise aceito — nunca em texto claro no banco principal.

## Dependências & Riscos

### Dependências

| Dependência | Responsável | Status | Impacto se atrasar |
|---|---|---|---|
| Parceiro clínico para validar critérios de risco agudo e escalas | Equipe (Mauricio) | Parceiros confirmados, validação em andamento — ver `roteiro-entrevista-psicologos-parceiros.md`, Bloco 1 | Sem critério clínico validado, o escalonamento de crise vira uma regra hipotética não defensável perante a banca |
| Psicólogo(a) parceiro(a) para o caminho de aceite (canal operacional) | Equipe (Mauricio) | Parceiros confirmados em papel consultivo; canal operacional do caminho de aceite ainda a definir (Bloco 8 do roteiro) | Caminho de aceite pode precisar ser simulado/mockado na demo, com isso declarado explicitamente |
| Escolha final do provedor de LLM | Equipe técnica (Mauricio) | **Resolvido**: Groq | — |
| Revisão jurídica/SST do rótulo NR-1 do painel (FR-16) | Mauricio | Não encontrado (28/07/2026) — segue em aberto na trilha de evolução independente do produto pós-hackathon | Sem revisão, o rótulo "insumo para o PGR" fica sem validação externa; bloqueia uso real com gestor hospitalar |

### Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| IA do chat emitir algo interpretável como diagnóstico | Média | Alto | System prompt com guardrails explícitos + revisão humana do prompt por mentor especializado + disclaimers visíveis |
| Não atingir TRL3 dentro dos 28 dias | Média | Alto | Priorizar rigorosamente o "Dentro do Escopo" desta PRD; simular partes dependentes de terceiros |
| Dado anonimizado enviado à API de LLM ainda permitir re-identificação indireta | Baixa/Média | Alto (viola a proposta central de privacidade) | Checklist de anonimização antes do envio; revisão específica desse ponto em cada checkpoint |
| Reprovação em checkpoint eliminatório por atraso de entrega | Média | Alto (eliminação, edital item 8.4) | Cronograma interno com folga antes de cada data de checkpoint do edital |

## Cronograma & Marcos

| Marco | Descrição | Data alvo |
|---|---|---|
| Lançamento da Jornada | Escolha do desafio, formação da equipe | 27/06/2026 |
| Checkpoint 1 | Entender + início do Desenvolver (fases 1-2 do Método Incubintech) | ~04/07/2026 (semanal, a confirmar) |
| Checkpoint 2 | Desenvolver avançado + início de Validar | ~11/07/2026 (a confirmar) |
| Checkpoint 3 | Validar + Refinar | ~18/07/2026 (a confirmar) |
| Final e Feira de Projetos | Demo ao vivo do PoC (TRL3), pitch de até 4 min | 25/07/2026 |

*Nota: o edital define os checkpoints como semanais ao longo dos 28 dias, mas não publica as datas exatas de cada um nas informações disponíveis. As datas acima são uma estimativa de planejamento interno e devem ser confirmadas com o cronograma oficial divulgado pela organização.*

## Perguntas em Aberto

- [x] ~~Qual provedor de LLM será usado, e qual sua política de retenção de dados?~~ — **Resolvido em 11/07/2026**: Groq. Política de retenção de dados da API ainda precisa ser confirmada e documentada — **status em 28/07/2026: ainda não lida/confirmada**, segue em aberto.
- [x] ~~Existe parceiro clínico (psicólogo) confirmado?~~ — **Resolvido em 11/07/2026**: sim, dois parceiros, papel consultivo por ora (ver `roteiro-entrevista-psicologos-parceiros.md`).
- [x] ~~O painel institucional terá uma persona "gestor hospitalar" documentada?~~ — **Resolvido em 11/07/2026**: sim. Ver `persona-gestor-hospitalar.md` (Dra. Beatriz Konder, confiança: Proto — sem entrevista direta ainda).
- [x] ~~Qual o limiar mínimo de respostas por segmento no painel agregado?~~ — **Resolvido em 28/07/2026**: n≥5, já implementado em código (`apps/api/src/modules/manager/application/constants.ts`, `K_ANONYMITY_THRESHOLD = 5`). Validação clínica/jurídica formal do valor segue em aberto (`roteiro-entrevista-psicologos-parceiros.md`, Bloco 6) — Responsável: Mauricio + psicólogos parceiros.
- [x] ~~Qual o texto e a posição exata do atalho "falar com uma pessoa real" (FR-6b)?~~ — **Resolvido em 11/07/2026**: oferece escolha explícita entre par médico e psicólogo (ver FR-6b acima). Texto/posição exata de copy ainda com Raquel.
- [x] ~~O time ainda não tem uma função de PM/liderança de produto formalmente definida~~ — **Resolvido em 11/07/2026**: Mauricio assume a coordenação de escopo do produto (além de dev full stack/arquitetura/DevOps). Raquel segue com marketing/social media; Yasmin e Kati com dados. A comunicação oficial com a organização da Jornada ainda precisa de um responsável definido — Mauricio decide escopo, mas isso não implica automaticamente ser o ponto de contato oficial com a Jornada.
- [x] ~~O painel do gestor deve ganhar enquadramento explícito de conformidade NR-1 (PGR/GRO)?~~ — **Resolvido em 11/07/2026**: sim. Ver `adr-001-fr16-nr1-painel-gestor.md` (status: Aceito) e FR-16 acima.
- [x] ~~Qual subconjunto de escalas cabe no prazo de 28 dias, e qual é o critério de avaliação da PoC?~~ — **Resolvido em 19/07/2026**: a ACM (Dr. Marcello Alberton Herdt, Diretor de Inovação) confirmou, em resposta formal (`Perguntas encaminhadas a ACM.pdf`), que o critério de avaliação está na "robustez desse fluxo de triagem (GAD-2/PHQ-2) → direcionamento (SUS/privado) → follow-up", e recomendou GAD-2/PHQ-2 como primeiro filtro, expandindo para GAD-7/PHQ-9 em caso de pontuação positiva. Não é necessário desenvolver os quatro formulários originalmente mencionados na documentação do desafio. Ver FR-1, FR-3, FR-7–FR-10, FR-17 acima e `adr-003-crisis-protocol-rescope-peer-chat-differentiator.md`.
- [x] ~~Qual o intervalo exato entre a interação inicial e o disparo do follow-up (FR-17)?~~ — **Resolvido**: 3 dias, já implementado em código (`apps/web/src/use-cases/should-show-followup-prompt.usecase.ts`, `FOLLOWUP_INTERVAL_DAYS = 3`), com justificativa registrada em `docs/superpowers/specs/2026-07-19-followup-mechanism-design.md` §5.

## Apêndice

### Documentos Relacionados

- Problem Statement — `problem-statement.docx` (mesmo pacote de entrega)
- Persona (médica usuária) — `persona.docx` (mesmo pacote de entrega)
- Persona (gestor hospitalar) — `persona-gestor-hospitalar.md` (mesma pasta, criada 11/07/2026)
- Lean Canvas — `lean-canvas.docx` (mesmo pacote de entrega)
- OKRs — `okrs.docx` (mesmo pacote de entrega)
- User Stories — `user-stories.docx` (mesmo pacote de entrega)
- Fluxo de Acolhimento e Escalonamento em Crise (`fluxo-escalonamento-crise.pdf`, fornecido pela equipe)
- Pitch Deck (`pitch-deck.pdf`, fornecido pela equipe)
- Edital 1ª Jornada Incubintech (`EDITAL-Incubintech_1a-Jornada.pdf`)
- Checklist do Desafio 19 — Burnout Médico (`07_07_docs/CHECKLIST DO DESAFIO 19 – BURNOUT MÉDICO.docx`)
- Entrevista com Dr. David Mendes, 02/07/2026 (`07_07_docs/Entrevista com Dr. David Mendes...docx`)
- Roadmap de atividades por pessoa (`roadmap/`)
- Análise Competitiva — `competitive-analysis.md` (mesma pasta)
- Rastreabilidade de Diferenciação Competitiva — `differentiation-traceability.md` (mesma pasta)
- ADR-001 (FR-16, NR-1 no painel do gestor) — `adr-001-fr16-nr1-painel-gestor.md` (mesma pasta)
- ADR-002 (direção do MBI-HSS) — `adr-002-mbi-hss-direction.md` (mesma pasta)
- ADR-003 (re-escopo do protocolo de crise e preservação do chat entre pares como diferencial) — `adr-003-crisis-protocol-rescope-peer-chat-differentiator.md` (mesma pasta)
- Respostas da ACM às perguntas do time (19/07/2026) — `general-documentations/Perguntas encaminhadas a ACM.pdf`
- Plano de ação priorizado a partir das respostas da ACM — `2026-07-19-action-plan-respostas-acm.md` (mesma pasta)
- Roteiro de entrevista com psicólogos parceiros — `roteiro-entrevista-psicologos-parceiros.md` (mesma pasta)
- Diagrama de arquitetura de privacidade — `docs/superpowers/specs/privacy-architecture-diagram.md`

### Histórico de Revisões

| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 1.3 | 2026-07-28 | Reconciliação pós-Jornada (via `foundation-prioritized-action-plan` + `deliver-prd`) | "Perguntas em Aberto" sincronizadas com o estado real do código: limiar de k-anonimato (n≥5) e intervalo de follow-up (3 dias) marcados como resolvidos, citando `constants.ts` e `should-show-followup-prompt.usecase.ts` como fonte — ambos já estavam decididos em código, mas o PRD ainda os listava como pendência intencional |
| 1.0 | 2026-07-02 | Rascunho gerado via pm-skills a partir do edital, brief, pitch deck e fluxo de crise fornecidos; revisão da equipe pendente | Versão inicial |
| 1.1 | 2026-07-07 | Atualizado a partir da entrevista com Dr. David Mendes e dos documentos de 07/07 (checklist oficial, resumos revisados) | Adicionado FR-6b (atalho humano visível no chat de IA); adicionados marcos legais CID-11/NR-1; registrada decisão de produto sobre IA humanizada vs. desconfiança de IA |
| 1.2 | 2026-07-19 | Atualizado a partir das respostas formais da ACM (Dr. Marcello Alberton Herdt, Diretor de Inovação) a perguntas encaminhadas pelo time | FR-1/FR-3 revisados (triagem em duas etapas GAD-2/PHQ-2 → GAD-7/PHQ-9); FR-7–FR-10 simplificados (sinalização + direcionamento SUS/privado, sem integração técnica direta — ver ADR-003); adicionado FR-17 (acompanhamento/follow-up, ver US-009); registrado o critério de avaliação da PoC confirmado pela ACM em "Perguntas em Aberto" |
