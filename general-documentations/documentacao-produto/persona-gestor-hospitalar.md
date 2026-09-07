# Dra. Beatriz Konder — A Gestora Entre a Obrigação Legal e a Confiança da Equipe

**Coordenadora de saúde ocupacional / diretora clínica de um hospital de médio porte em Santa Catarina, que precisa demonstrar gestão real de risco psicossocial da equipe médica — para a fiscalização da NR-1 e para a própria instituição — sem nunca ter acesso ao dado individual de um médico específico.**

| Field | Value |
| --- | --- |
| Persona ID | PU-002 |
| Type | Secondary |
| Product scope | Painel de Monitoramento institucional (PRD FR-12, FR-13, FR-16); todo o lado "comprador/gestor" da plataforma Zelo* |
| Valid for | Gestor(a) hospitalar, coordenador(a) de saúde ocupacional ou diretor(a) clínico(a) de hospital, rede de saúde ou cooperativa médica de porte médio em Santa Catarina, responsável por SST/gestão de risco psicossocial e/ou pela decisão de compra da ferramenta |
| Not valid for | Médico(a) usuário(a) final (ver `persona.md`, Dra. Camila Andrade); pacientes; departamento jurídico/compliance externo (consome o output do painel, mas não é o usuário primário) |
| Confidence | Proto — nenhuma entrevista direta com um gestor hospitalar real feita até o momento; inferida a partir do modelo de negócio ("quem paga não é quem julga", `lean-canvas.md`) e parcialmente informada por ENT-01 (Dr. David Mendes, gestor médico de PS/UTI, 02/07/2026), que ocupa papel de gestão mas foi entrevistado com foco na persona primária |
| Last validated | 2026-07-11 |
| Owner | Equipe do desafio "Saúde do Médico" — 1ª Jornada Incubintech |

`*Zelo é um nome de trabalho sugerido para o produto, ainda não validado (marca/domínio) pela equipe. Ajustar em todos os documentos se o nome mudar.`

**Nota sobre confiança**: até 11/07/2026, não há hospital/cooperativa real formalmente vinculado ao desafio (`problem-statement.md`, demandante institucional é hipotético). Esta persona é, portanto, proto por definição — existe para orientar decisões de design do painel (FR-12/FR-13/FR-16) antes de haver um comprador real para validar, não para substituir essa validação.

**Quick orientation.** O Persona Card é a referência de uso diário — extraia como um resumo de uma página. Seções 1-4 dão contexto e motivação. Seções 5-8 descrevem comportamento e fluxo de trabalho. Seções 9-11 traduzem insight em decisões de produto. Evidência & Confiança calibra a confiança.

---

## Persona Card

**Dra. Beatriz Konder — A Gestora Entre a Obrigação Legal e a Confiança da Equipe**
Beatriz, 47 anos, é diretora clínica e responsável pela saúde ocupacional de um hospital de ~300 leitos na Grande Florianópolis. Reporta ao diretor-geral e responde perante o corpo clínico, o RH e — desde maio de 2026 — perante a fiscalização da NR-1 sobre riscos psicossociais. Ela precisa provar que está gerindo o risco de burnout da equipe médica sem nunca comprometer a confiança que a equipe deposita na confidencialidade da ferramenta.

**Key quote:** "Se eu tiver acesso a quem está mal, perco a confiança da equipe para sempre — e se eu não tiver nenhum dado, não tenho como provar pra fiscalização que estou fazendo gestão de risco de verdade. Preciso das duas coisas ao mesmo tempo."

**Goals.** Demonstrar, de forma auditável, que o hospital gerencia ativamente o risco psicossocial da equipe médica (obrigação legal, NR-1); reduzir custos indiretos de rotatividade, afastamento e erro clínico evitável ligados a burnout; manter — e ser vista mantendo — a confiança da equipe médica na confidencialidade da ferramenta que ela mesma contratou; agir preventivamente em setores/turnos de risco sem nunca poder (ou parecer que pode) apontar um indivíduo.

**Frustrations.** Ferramentas de compliance que geram papelada, mas nenhum cuidado real percebido pela equipe; ferramentas de bem-estar que a equipe percebe como "olho do RH" e por isso não usa de verdade; falta de um formato de dado que sirva tanto para a fiscalização quanto para uma decisão de gestão real (hoje ou é anônimo demais para agir, ou específico demais para ser eticamente aceitável); não ter como provar a um auditor da NR-1 que a "confidencialidade" não é só discurso.

**Design rules - always.** Sempre rotular claramente o que é agregado vs. o que seria dado individual (nunca disponível); sempre exigir um número mínimo de respostas por segmento antes de exibir qualquer métrica; sempre expor o painel como evidência auditável (exportável), não só como dashboard interno bonito.

**Design rules - never.** Nunca oferecer, nem por engano de UI, um caminho de drill-down até um médico específico; nunca deixar a interface sugerir mais certeza estatística do que o tamanho da amostra permite; nunca posicionar o painel como "certificado de conformidade" sem a ressalva de que é insumo, não certificação.

---

## 1. Demographics & Identity

| Attribute | Detail |
| --- | --- |
| Age | 47 anos |
| Location | Florianópolis / Grande Florianópolis, SC |
| Education | Graduação em Medicina + especialização em Gestão em Saúde ou MBA em Gestão Hospitalar |
| Role | Diretora clínica / Coordenadora de saúde ocupacional |
| Company size | Hospital de médio porte (~300 leitos) ou cooperativa médica regional |
| Team | Responde pela saúde ocupacional de toda a equipe médica (dezenas a centenas de médicos, múltiplos setores/turnos) |
| Reports to | Diretor-geral do hospital / Conselho da cooperativa |
| Stakeholders | Corpo clínico (equipe médica); RH; fiscalização do trabalho (NR-1); diretoria/conselho administrativo |
| Purchasing role | Decision-maker (ou fortemente influenciadora da decisão de compra) — é quem assina ou recomenda o contrato institucional |
| Accessibility | Uso predominante em desktop/notebook institucional, em horário de expediente; ocasionalmente em tablet durante reuniões de diretoria |

**Career stage and trajectory.** Está consolidada na carreira de gestão — não é mais só médica assistencial, é gestora com responsabilidade institucional e legal. Seu sucesso profissional agora é medido por indicadores de gestão (retenção, afastamento, conformidade), não só por competência clínica individual.

**Organizational leverage.** Tem autoridade real sobre política de saúde ocupacional, mas pouca autoridade sobre a cultura workaholic da medicina em si — não pode simplesmente "mandar" a equipe confiar numa ferramenta nova; precisa conquistar essa confiança, porque sem adesão da equipe o painel fica vazio e ela não tem nada para mostrar à fiscalização.

---

## 2. Technology & Environment Context

| Tool | Role |
| --- | --- |
| Sistema de gestão hospitalar (ERP/prontuário administrativo) | Indicadores operacionais gerais (não de saúde mental) |
| Planilhas / relatórios de RH | Hoje, principal (e insuficiente) instrumento de acompanhamento de afastamento e rotatividade |
| E-mail institucional | Comunicação oficial com corpo clínico e diretoria |
| Ferramentas de compliance/SST (ex.: software de PGR/NR-1) | Geração de relatórios de conformidade — hoje desconectadas de qualquer dado real de saúde mental da equipe |

**Digital fluency level.** Alta para ferramentas administrativas e de gestão; pouca paciência para dashboards que exigem interpretação estatística não trivial — precisa que o painel já traduza o dado em linguagem de gestão, não em número cru.

**Adoption and abandonment patterns.** Adota uma ferramenta se ela já vier com o argumento de conformidade pronto para usar (evita ter que "vender" internamente por que investiu nisso); abandona se perceber que a equipe médica não está de fato usando o produto (painel vazio não serve para nada, nem para gestão nem para auditoria).

**Work environment.** Reuniões de diretoria, agenda fragmentada entre gestão clínica e gestão administrativa; revisa indicadores em blocos de tempo dedicados (ex.: preparação mensal/trimestral de relatórios), não em tempo real.

---

## 3. Jobs to Be Done

**Functional.** Quando precisa preparar a documentação de gestão de risco psicossocial (PGR) ou reportar à diretoria sobre o bem-estar da equipe médica, ela precisa de uma fonte de dado agregada e confiável sobre sinais de burnout por setor/turno, para poder agir preventivamente e demonstrar conformidade, sem nunca precisar (ou poder) identificar um indivíduo.

**Emotional.** Quando olha o painel, ela quer se sentir segura de que está fazendo a coisa certa pela equipe — não apenas cumprindo uma obrigação legal — para que a gestão de risco psicossocial não vire, aos seus próprios olhos, um exercício burocrático vazio.

**Social.** Quer ser vista pela equipe médica como alguém que investiu em cuidado real, não em vigilância disfarçada de bem-estar — e quer ser vista pela diretoria e pela fiscalização como uma gestora que age preventivamente, não reativamente.

**Underlying.** No fundo, ela está negociando uma tensão estrutural do próprio cargo: seu mandato institucional pede visibilidade e controle, mas a eficácia real da ferramenta que ela compra depende justamente da equipe confiar que ela nunca vai conseguir esse controle sobre o indivíduo — o produto precisa provar a ela que abrir mão de acesso individual é o que faz a ferramenta funcionar, não uma limitação a ser contornada.

---

## 4. Goals & Motivations

**Life goal.** Ser reconhecida como uma gestora que reduziu de forma mensurável o sofrimento e a rotatividade da equipe médica sob sua responsabilidade, sem comprometer a confiança que essa equipe deposita nela.

**Conformidade legal defensável.** Ter uma evidência concreta e exportável de gestão de risco psicossocial para apresentar à fiscalização da NR-1 — implica que o painel gere algo mais do que um dashboard interno bonito, algo que resista a uma auditoria.

**Ação preventiva real.** Identificar setores/turnos com sinais crescentes de burnout a tempo de agir (redistribuir carga, abrir vaga, rever escala) antes de um afastamento ou erro clínico evitável — implica métricas de tendência, não só uma foto do momento.

**Adesão real da equipe.** Ter confiança de que os médicos estão de fato usando a ferramenta com honestidade, porque sem adesão real o painel não tem valor nem para gestão nem para compliance — implica que ela dependa (e se importe) com a experiência de confiança da persona primária (Dra. Camila).

**Segurança na leitura do dado.** Sentir que não vai, sem querer, tomar uma decisão que prejudique indiretamente algum médico específico ao interpretar um número agregado pequeno demais.

**Prova para cima.** Sentir que tem, a qualquer momento, algo concreto para mostrar à diretoria e à fiscalização sem precisar "traduzir" ou justificar o que o painel significa.

**Sem culpa comercial.** Sentir que investir nessa ferramenta foi uma decisão institucional defensável, não um gasto de bem-estar difícil de justificar em orçamento apertado.

---

## 5. Behavioral Patterns & Mental Models

**Core mental model.** Beatriz trata a gestão de saúde mental da equipe como um problema de dupla exposição: exposição legal (se não gerenciar o risco, o hospital responde) e exposição reputacional/relacional (se gerenciar do jeito errado, perde a confiança da equipe que sustenta o próprio sistema). Ela não enxerga essas duas exposições como opostas — para ela, a ferramenta só é boa se resolver as duas ao mesmo tempo, não uma à custa da outra. Isso é o ponto mais importante da persona: qualquer feature que pareça favorecer compliance às custas de confiança (ou vice-versa) quebra a proposta de valor inteira para ela.

**Primary work pattern.** Revisão periódica (mensal/trimestral) de indicadores agregados, intercalada com decisões operacionais reativas quando um problema já apareceu (ex.: pico de afastamento num setor) — ela quer que o padrão vire mais proativo, mas hoje é majoritariamente reativo por falta de dado antecipado.

**Accuracy and quality approach.** Para ela, "correto" significa estatisticamente defensável — não confia em número que possa ser questionado numa auditoria ou numa reunião de diretoria por ter amostra pequena demais ou metodologia obscura.

**Tolerance thresholds.** Zero tolerância a qualquer sinal, mesmo hipotético, de que o painel poderia ser cruzado para identificar um indivíduo — isso não é só uma preferência de UX, é um risco legal e reputacional para ela pessoalmente.

---

## 6. Decision-Making & Trust Patterns

**How trust is built and broken.** A confiança dela na ferramenta se constrói ao longo de vários ciclos de relatório sem incidente de exposição — e se quebra instantaneamente e de forma irreversível com um único caso, real ou percebido, de re-identificação. Ela também precisa confiar que a equipe médica confia na ferramenta — sua própria confiança depende, em parte, de conseguir observar adesão real (painel não vazio) ao longo do tempo.

**Adoption filter.** "Isso me protege legalmente?" → "Isso é impossível de cruzar com identidade, mesmo por acidente?" → "A equipe vai usar isso de verdade, ou vai ver como espionagem e abandonar?" → "Eu consigo defender esse número numa reunião de diretoria ou numa fiscalização?"

**Risk profile.** Extremamente avessa a risco legal e reputacional-institucional; disposta a investir em uma ferramenta nova se o argumento de conformidade (NR-1) já vier pronto, mas só recomenda a expansão do contrato depois de ver adesão real da equipe ao longo de pelo menos um ciclo de relatório.

**Feature discovery behavior.** Não explora o produto por conta própria — depende de um relatório/resumo pronto (ex.: exportação PDF/CSV) que chegue até ela já formatado para uso em reunião ou auditoria; não vai "descobrir" o valor de uma funcionalidade nova sem alguém apontar explicitamente.

---

## 7. Workflow & Collaboration Context

**Work rhythm.** Ciclo institucional (mensal/trimestral) para revisão de indicadores, intercalado com reuniões de diretoria e, a partir de maio de 2026, com obrigações de reporte ligadas à NR-1 — pouco tempo contínuo dedicado só a esse tema.

**Collaboration model.** Majoritariamente consumidora do painel, não criadora — recebe o relatório pronto e leva adiante para diretoria/RH/fiscalização. Seus contrapartes internos (RH, diretor-geral) usam o output dela para decisões operacionais e de conformidade.

**Key collaboration friction.** RH e diretoria muitas vezes esperam dela um nível de granularidade (por indivíduo, por caso) que ela mesma não tem e não deveria ter — parte do trabalho dela é justamente administrar essa expectativa internamente, o que é mais fácil se o próprio produto deixa essa limitação clara e defensável.

**Dependencies.** Depende de adesão real da equipe médica ao Zelo para o painel não ficar vazio; depende de o time do Zelo manter a arquitetura de privacidade realmente inquebrável, porque ela está colocando a própria credibilidade institucional nisso.

---

## 8. Current Alternatives & Workarounds

**Primary alternative.** Hoje, gestão de risco psicossocial se apoia em planilhas de RH (afastamento, rotatividade) e em percepção informal de coordenadores de setor — nenhum instrumento estruturado e confidencial de autoavaliação da equipe.

**Where the product enters.** Seria a primeira fonte de dado agregado e sistemático que ela teria sobre sinais de burnout por setor/turno, além de virar evidência para o PGR exigido pela NR-1.

**The firing trigger.** Qualquer indício, mesmo hipotético, de que o painel poderia expor um indivíduo — isso não é só motivo de abandono do produto, é risco legal/reputacional pessoal para ela, o que torna o "gatilho de demissão" muito mais sensível do que em um SaaS de gestão comum.

---

## 9. Pain Points & Unmet Needs

**Ferramentas de compliance sem cuidado real.** As soluções de gestão de risco psicossocial (NR-1) disponíveis hoje mapeiam risco no papel, mas não oferecem nenhum canal real de cuidado à equipe — isso deixa a conformidade "no papel", sem impacto real na retenção/erro clínico que ela também precisa reduzir.

**Ferramentas de bem-estar sem lastro de compliance.** Soluções de bem-estar corporativo genéricas não geram nada que sirva como evidência de gestão de risco psicossocial para a NR-1 — força a instituição a comprar (e justificar) duas ferramentas separadas.

**Falta de prova técnica da confidencialidade.** Ela precisa afirmar, para a própria equipe médica, que a ferramenta que ela contratou é confidencial de verdade — mas hoje não tem como provar isso tecnicamente, só repetir a política de privacidade, o que a própria equipe médica (ver persona.md, Dra. Camila) já desconfia por padrão.

**Ambiguidade sobre o que o painel pode e não pode virar evidência.** Sem um enquadramento claro do que é "insumo para o PGR" vs. "certificado de conformidade", ela corre o risco de superprometer para a fiscalização ou para a diretoria algo que a ferramenta não sustenta.

**Amostra pequena demais para agir com segurança.** Em setores pequenos ou turnos com poucos médicos, ela não consegue nenhum dado (limiar de k-anonimato) — o que é correto do ponto de vista de privacidade, mas frustrante do ponto de vista de gestão, porque são justamente esses setores pequenos que às vezes mais precisam de atenção.

---

## 10. Success Definition & Quality Bar

**Accuracy standard.** Número correto significa estatisticamente defensável — ela não aceita um dado que possa ser desmontado numa auditoria por metodologia frágil, mas também não precisa de precisão acadêmica; "defensável" é o padrão, não "perfeito".

**Timeliness standard.** Não precisa de tempo real — indicadores mensais/trimestrais bastam para a maior parte do uso dela, exceto quando algo já virou problema operacional (ex.: pico de afastamento), quando ela quer o dado mais recente disponível.

**Self-sufficiency standard.** O relatório/exportação precisa ser autossuficiente o bastante para ela levar direto a uma reunião de diretoria ou a uma auditoria, sem precisar "traduzir" ou justificar cada número.

**Quality bar by context.** Para reporte de rotina, "bom o suficiente" é a tendência ao longo do tempo por setor; para uma auditoria de NR-1, o padrão sobe para "documentação que resiste a questionamento metodológico"; para uma decisão operacional urgente (ex.: redistribuir plantão), o padrão é "sinal claro o bastante para justificar a ação, mesmo sem certeza estatística plena".

---

## 11. Design Principles & Tradeoff Heuristics

1. **Anonimato absoluto sobre granularidade de gestão** — nunca reduzir o limiar de k-anonimato para dar a ela mais detalhe, mesmo que ela peça.
2. **Evidência exportável sobre dashboard bonito** — priorizar um formato que sirva como documento defensável (PDF/CSV rotulado) sobre uma visualização interna elegante mas não portátil.
3. **Rótulo honesto sobre alegação forte** — sempre comunicar "insumo para gestão de risco psicossocial", nunca "certificado de conformidade NR-1", mesmo que isso soe menos vendável.
4. **Tendência sobre evento pontual** — preferir sempre mostrar padrão ao longo do tempo a um número isolado de um período curto, para reduzir o risco de decisão precipitada sobre um segmento pequeno.
5. **Confiança da equipe sobre poder de gestão** — em qualquer conflito de design entre dar a ela mais controle/visibilidade e proteger o anonimato do médico, o anonimato do médico vence, porque é o que sustenta a adesão que torna o painel útil para ela em primeiro lugar.
6. **Clareza de limitação sobre aparência de completude** — melhor um painel que diz explicitamente "dado insuficiente neste segmento" do que um que pareça completo à custa de mascarar uma amostra pequena.

---

## Evidence & Confidence

| Source | Type | Detail |
| --- | --- | --- |
| ENT-01 | Interview (parcial) | Entrevista com Dr. David Mendes, gestor médico de PS/UTI, 02/07/2026 — ele ocupa papel de gestão, mas a entrevista teve foco na persona primária (medo do médico usuário); usada aqui apenas como indício indireto, não como validação direta desta persona |
| LC-01 | Documento interno | `lean-canvas.md` — modelo de negócio "o hospital paga, mas nunca vê o indivíduo"; segmento de cliente pagante (b) |
| PRD-01 | Documento interno | `prd.md` — FR-12, FR-13, FR-16 e a nota de que a persona secundária "gestor hospitalar" ainda não estava documentada em detalhe até 11/07/2026 |
| PS-01 | Documento interno | `problem-statement.md` — confirma que não há demandante institucional real vinculado ao desafio até 11/07/2026 |

**Validated.** Nada nesta persona é validado por entrevista direta com um gestor hospitalar real. O contexto legal (NR-1, vigência fiscalizatória plena a partir de maio/2026) é dado publicado e verificável, não uma inferência sobre a persona em si.

**Assumed.** Todo o comportamento específico de "Beatriz" (padrão de decisão, filtro de adoção, tolerância a risco, fricção de colaboração com RH/diretoria) é inferência plausível a partir do modelo de negócio e do contexto regulatório — não de entrevista direta com alguém nessa função.

**Open questions.**

1. Um gestor hospitalar real prioriza mais a defesa legal (NR-1) ou a redução de custo operacional (rotatividade/afastamento) ao decidir comprar? A ordem de prioridade muda o pitch e o design do painel.
2. Qual o real apetite de um gestor hospitalar por um relatório exportável (PDF/CSV) vs. um dashboard vivo que ele acessa recorrentemente? Isso muda a priorização de FR-16. — **Hipótese formalizada em 07/09/2026** como PU-003 (`persona-gestor-analitico.md`): o apetite por profundidade não é uma variação de temperamento de Beatriz, é outra pessoa. Ainda não validada; ver as perguntas em aberto de PU-003.
3. Existe uma figura real que acumule diretoria clínica + saúde ocupacional, ou essas são pessoas/papéis diferentes na maioria dos hospitais de porte médio em SC? Isso pode exigir dividir esta persona em duas. — **Divisão proposta em 07/09/2026**: PU-003 (`persona-gestor-analitico.md`) separa quem monta o indicador de quem o apresenta. Confirmar ou descartar na primeira entrevista com gestor real, perguntando "quem monta o número que você apresenta?".

**Governance.** Esta persona deve ser tratada como Proto até a primeira entrevista direta com um gestor hospitalar ou de saúde ocupacional real — recomenda-se buscar isso via a mesma rede que viabilizou ENT-01 (Dr. David Mendes) ou via a pré-incubação da Incubintech. Critério de aposentadoria/promoção: substituir por versão "Directional" assim que houver pelo menos 1 entrevista direta; por "Validated" com 3-5 entrevistas convergentes. Revisar também assim que houver um demandante institucional real confirmado (`problem-statement.md`).
