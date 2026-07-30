---
artefato: roadmap
versão: "1.0"
criado: 2026-07-07
status: rascunho
---

# Roadmap de Atividades — Zelo* (Desafio Saúde do Médico, 1ª Jornada Incubintech)

`*Nome de trabalho, ainda não validado.`

> Cada pessoa do time tem um arquivo próprio nesta pasta com as tarefas dela por janela de tempo. Este README é a visão geral e a fonte de verdade das datas.

## Time

| Pessoa | Papel | Arquivo |
|---|---|---|
| Raquel Ritter | Marketing / social media | [`raquel-ritter.md`](./raquel-ritter.md) |
| Mauricio Alexandre | Desenvolvedor full stack / arquiteto de software / DevOps | [`mauricio.md`](./mauricio.md) |
| Yasmin | Data analytics — júnior | [`yasmin.md`](./yasmin.md) |
| Kati | Data analytics — sênior | [`kati.md`](./kati.md) |

**Nota (11/07/2026)**: Mauricio assume a coordenação de escopo do produto, além de desenvolvedor full stack/arquiteto/DevOps (ver nota abaixo). A comunicação oficial com a organização da Jornada ainda não tem responsável definido — ver `documentacao-produto/prd.md`, "Perguntas em Aberto".

**Nota (11/07/2026)**: Gui (DevOps) saiu do time. Mauricio confirmou que assume integralmente o papel de DevOps, além de desenvolvedor full stack/arquiteto — ver tarefas herdadas (🔧) em `mauricio.md`.

**Decisão de escopo (11/07/2026)**: o painel do gestor ganha enquadramento de conformidade NR-1 (FR-16, versão mínima rotulada — não um certificado de compliance). Decidido por Mauricio; ver `documentacao-produto/adr-001-fr16-nr1-painel-gestor.md` (status: Aceito) e `documentacao-produto/user-stories.md` (US-006, AC-4).

## Linha do tempo confirmada (07/07/2026, atualizada 19/07/2026)

Hoje é **19/07/2026**. **Correção (19/07/2026, via `jornada-checkpoints/checkpoint-3/checkpoint_3_guide.md`)**: o Checkpoint 3 NÃO passou — o prazo real e oficial é **21/07/2026 às 23h59 (Brasília)**, um PDF eliminatório (`CP3_<NOME_EQUIPE>.pdf` + upload do roteiro/slides), critério "Apta / Apta com ressalvas / Não Apta". Faltam **2 dias** até esse gate e **6 dias corridos** até a final (25/07/2026) — a semana mais apertada do projeto até agora, com Mauricio ainda como único responsável técnico (dev full stack + arquitetura + DevOps).

| Data | Marco | Janela de trabalho |
|---|---|---|
| 27/06/2026 | Lançamento da Jornada | — (já ocorrido) |
| 04/07/2026 | Checkpoint 1 | — (já ocorrido — confirmar status com a organização) |
| **11/07/2026** | **Checkpoint 2** | Semana 1: 07/07 → 11/07 |
| **18/07/2026** | **Checkpoint 3** | Semana 2: 12/07 → 18/07 |
| **25/07/2026** | **Final e Feira de Projetos** (demo TRL3 + pitch até 4 min) | Semana 3: 19/07 → 25/07 |

## Mapeamento de fases do checklist oficial → semanas

O checklist do desafio (`07_07_docs/CHECKLIST DO DESAFIO 19 – BURNOUT MÉDICO.docx`) define 4 fases de desenvolvimento. Elas foram encaixadas nas 3 semanas restantes:

- **Fase 1** (mapear jornada, escalas, níveis de risco) — já coberta pela documentação de produto existente (`persona.md`, `prd.md`, `user-stories.md`); revisão contínua conforme novas entrevistas.
- **Fase 2** (autoavaliação local + IA de acolhimento + testes de risco + prova de não retenção sem consentimento) — **foco da Semana 1 (até 11/07)**.
- **Fase 3** (matching de pares + monitoramento + biblioteca + tela de crise) — **foco da Semana 2 (até 18/07)**.
- **Fase 4** (simulação de perfis de impacto + estimativa de ganhos evitados + modelo de sustentabilidade) — **foco da Semana 3 (até 25/07)**, junto com preparação de pitch e demo.

## Decisão de produto registrada em 07/07/2026

O chat de acolhimento por IA continua obrigatório (exigência do edital), mas passa a ser humanizado e a exibir, em qualquer momento da conversa, um atalho visível para falar com uma pessoa real — não só quando o sistema detecta risco agudo. Essa decisão nasceu da entrevista com Dr. David Mendes (02/07/2026), que revelou desconfiança de médicos em relação a IA em momentos de sofrimento. Detalhes técnicos em `documentacao-produto/prd.md` (FR-6b) e `documentacao-produto/user-stories.md` (US-002, AC-4).

## Entregáveis obrigatórios do checklist — dono principal

| Entregável | Dono principal | Apoio |
|---|---|---|
| Protótipo funcional da plataforma | Mauricio | — |
| Documentação da arquitetura de privacidade (com diagrama de fluxo de dados) | Mauricio | — |
| Documentação do protocolo de escalonamento | Mauricio | Raquel (redação) |
| Estimativa de impacto (médicos alcançados, custo de afastamento evitado) | Kati | Yasmin |
| Modelo de sustentabilidade (financiamento, psicólogos conveniados) | Kati | Raquel |
| Simulação de perfis (residente / plantonista) | Kati | Yasmin |
| Pitch deck e apresentação final (até 4 min) | Raquel | Kati (dados), Mauricio (demo) |

## Rodada de decisões — 11/07/2026

Mauricio, como coordenador de escopo, respondeu de forma definitiva ou parcial as perguntas em aberto acumuladas nos documentos de produto. Resumo (detalhe completo em cada documento-fonte):

| Decisão | Resultado | Documento-fonte |
|---|---|---|
| Coordenação de escopo | Mauricio assume | `documentacao-produto/prd.md` |
| DevOps (após saída do Gui) | Mauricio assume integralmente | `mauricio.md` |
| FR-16 / enquadramento NR-1 no painel | Aceito (versão mínima rotulada) | `documentacao-produto/adr-001-fr16-nr1-painel-gestor.md` |
| Provedor de LLM | Groq | `documentacao-produto/prd.md` |
| Parceiro psicólogo | 2 confirmados, papel consultivo | `documentacao-produto/roteiro-entrevista-psicologos-parceiros.md` |
| Limiar k-anonimato (n) do painel | Pendência intencional — aguarda Bloco 6 do roteiro | `documentacao-produto/user-stories.md` (US-006) |
| Destino do atalho humano (FR-6b) | Oferece escolha (par médico ou psicólogo) | `documentacao-produto/prd.md` |
| Simulação do matching de pares | Perfis fictícios pré-cadastrados, rotulados como demo | `documentacao-produto/user-stories.md` (US-005) |
| Revisão jurídica/SST do rótulo NR-1 | Mauricio busca mentor na Jornada | `mauricio.md` |
| Demandante institucional real | Hipotético (nenhum confirmado) | `documentacao-produto/problem-statement.md` |
| Piloto real | Equipe do Dr. David Mendes (PS/UTI), logins reais | `documentacao-produto/problem-statement.md`, `lean-canvas.md` |
| Faixa de preço | R$15–20/médico/mês (hipótese para o pitch) | `documentacao-produto/lean-canvas.md` |
| Sindicatos como canal | Hipótese não testada, mantida no radar | `documentacao-produto/lean-canvas.md` |
| Persona gestor hospitalar | Criada (Dra. Beatriz Konder, confiança Proto) | `documentacao-produto/persona-gestor-hospitalar.md` |
| Ferramenta de backlog | GitHub Projects | `documentacao-produto/okrs.md` |
| Piso de qualidade do checkpoint | Prazo + aderência ao edital | `documentacao-produto/okrs.md` |

## Rodada de decisões — 19/07/2026 (respostas da ACM)

A ACM (Dr. Marcello Alberton Herdt, Diretor de Inovação) respondeu formalmente às perguntas do time (`Perguntas encaminhadas a ACM.pdf`). Resumo das decisões derivadas (detalhe completo em `documentacao-produto/2026-07-19-action-plan-respostas-acm.md` e `documentacao-produto/adr-003-crisis-protocol-rescope-peer-chat-differentiator.md`):

| Decisão | Resultado | Documento-fonte |
|---|---|---|
| Escala de triagem inicial | GAD-2/PHQ-2 como primeiro filtro; expande para GAD-7/PHQ-9 se pontuação ≥3 | `documentacao-produto/prd.md` (FR-1, FR-3) |
| Protocolo de crise (FR-7–FR-10) | Simplificado: sinalização + direcionamento SUS/privado, sem integração técnica ao vivo | `documentacao-produto/adr-003-crisis-protocol-rescope-peer-chat-differentiator.md` |
| Chat anônimo entre pares (FR-6b) | Mantido como diferencial deliberado (evidência: entrevista Dr. David Mendes), não é resposta a pedido da ACM | `documentacao-produto/adr-003-crisis-protocol-rescope-peer-chat-differentiator.md` |
| Matching de pares standalone (US-005) | Não recebe polimento adicional; primeiro item a cortar se o follow-up atrasar | `documentacao-produto/adr-003-crisis-protocol-rescope-peer-chat-differentiator.md` |
| Métrica de follow-up (nova) | Aceita como FR-17/US-009, prioridade máxima da Semana 3 | `documentacao-produto/prd.md` (FR-17), `documentacao-produto/user-stories.md` (US-009) |
| Critério de avaliação da PoC | Confirmado: robustez do fluxo triagem → direcionamento → follow-up | `documentacao-produto/prd.md`, "Perguntas em Aberto" |

## Nota (28/07/2026) — Resultado da Jornada e trilha pós-hackathon

O time **não avançou para a pré-incubação** da 1ª Jornada Incubintech. Mauricio decidiu continuar evoluindo o Zelo por conta própria, fora do vínculo formal com a Incubintech/ACM, rumo a um produto mais completo — não como exigência de edital, mas como iniciativa própria. Isso muda a natureza do roadmap a partir daqui: os itens amarrados a checkpoints eliminatórios (linha do tempo abaixo) estão encerrados; o trabalho passa a ser priorizado por valor de produto, não por prazo de banca. Ver plano de ação `2026-07-28` (gerado via `foundation-prioritized-action-plan`) para o mapeamento do que ficou pendente e os próximos passos.

## Próximos passos abertos (não datados)

- ~~Confirmar com Dr. David Mendes se o time vai avançar com entrevistas à equipe médica dele~~ — **Resolvido e ampliado em 11/07/2026**: vira piloto de uso real com logins. Ver `raquel-ritter.md` e `mauricio.md` (provisionamento de login).
- Confirmar status do Checkpoint 1 (04/07) com a organização da Jornada.
- ~~Definir quem assume a coordenação geral de escopo~~ — **Resolvido em 11/07/2026**: Mauricio.
- ~~Reatribuir as tarefas de DevOps que eram do Gui~~ — **Resolvido em 11/07/2026**: Mauricio assumiu integralmente (infraestrutura de deploy da PWA, secrets management, documentação da arquitetura de privacidade/diagrama de fluxo de dados, canal cifrado médico-psicólogo, teste offline-first, ambiente da demo ao vivo). Ver tarefas marcadas 🔧 em `mauricio.md`.
- Confirmar política de retenção de dados da API do Groq e documentar em `prd.md`.
- Buscar mentor jurídico/SST na Jornada para revisar o rótulo NR-1 do painel (ver `mauricio.md`).
- ~~Marcar a conversa com os dois psicólogos parceiros [...] priorizar Blocos 1–3 antes do checkpoint de 18/07~~ — checkpoint já passou; status a confirmar com o time.
- Definir logística de provisionamento de login para a equipe do Dr. David Mendes (piloto real).
- **Novo (19/07/2026)**: enviar e-mail de esclarecimento à ACM (hudsonsilva@acm.org.br, cc preincubadora.fln@ifsc.edu.br) sobre lista concreta de canais SUS/privado para o direcionamento de crise (FR-8) — ver `documentacao-produto/2026-07-19-action-plan-respostas-acm.md`, Esforço P4. Não bloqueia o restante do trabalho da semana.
- **Novo (19/07/2026)**: definir o intervalo exato de disparo do follow-up (FR-17/US-009) antes de iniciar a implementação — pendência intencional, responsável Mauricio.
- **Novo (19/07/2026)**: incorporar o critério de avaliação da ACM e o benchmark Zenklub (já citado de forma independente pela própria ACM) na narrativa do pitch final — ver `documentacao-produto/2026-07-19-action-plan-respostas-acm.md`, Esforço P5 (apoio: Raquel).
