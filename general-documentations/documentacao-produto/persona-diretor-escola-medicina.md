---
artifact_type: persona
version: "2.6.0"
generated_by_skill: foundation-persona
mode: product
context: Persona exploratória para um segmento ainda não construído ("Zelo Health" para faculdades de medicina). Gerada por analogia ao Gestor Hospitalar já validado como formato (persona-gestor-hospitalar.md), a partir de um sinal de brainstorm não desenvolvido (branstorms.md) e de literatura pública sobre saúde mental de estudantes de medicina. Nenhuma entrevista real foi feita com um diretor de faculdade de medicina.
---

# Prof. Dr. Henrique Salgado — O Coordenador Entre a Evasão e o Sigilo do Aluno

**Coordenador do curso de Medicina em uma faculdade brasileira, cobrado pelo MEC e pela mantenedora por reduzir evasão e sofrimento psíquico entre os estudantes — sem nunca ter acesso ao dado individual que identificaria qual aluno está em risco.**

| Campo | Valor |
| --- | --- |
| Persona ID | PU-003 |
| Tipo | Secundária — **exploratória**: modela um segmento novo ("Zelo Health" para faculdades de medicina) que ainda não existe como produto nem como cliente real |
| Escopo do produto | Hipotético painel institucional agregado para faculdades de medicina — análogo ao Painel de Gestor Hospitalar (`persona-gestor-hospitalar.md`), mas nada disso foi especificado ou construído ainda |
| Válida para | Diretor(a) de curso, coordenador(a) pedagógico(a) ou pró-reitor(a) de faculdade de medicina no Brasil, responsável perante o MEC/mantenedora pelo bem-estar estudantil e/ou pela decisão de adotar uma ferramenta de saúde mental para o corpo discente |
| Não válida para | Aluno(a) de medicina usuário final (ver persona complementar, `persona-aluno-medicina.md`); gestor(a) hospitalar (mercado e vínculo empregatício diferentes, ver `persona-gestor-hospitalar.md`); serviço de apoio psicopedagógico/psicológico da faculdade (opera o atendimento, mas tipicamente não decide a compra da ferramenta) |
| Confiança | Proto — nenhuma entrevista real com um diretor/coordenador de faculdade de medicina foi feita. Inferida por analogia ao modelo já usado com o Gestor Hospitalar, a partir de um sinal de brainstorm interno não desenvolvido (`branstorms.md`, "Numa reuniao recente surgiu a possibilidade de implementar a Zelo Health para alunos de medicina...") e de literatura pública geral sobre burnout/ansiedade em estudantes de medicina — não específica da Zelo |
| Última validação | 2026-09-08 |
| Owner | Equipe Zelo — exploração de segmento (ainda não formalizada como iniciativa) |

**Nota sobre confiança:** até 2026-09-08, não existe nenhuma faculdade de medicina, mantenedora ou reitoria formalmente em conversa sobre este produto — a única origem é uma nota de brainstorm curta, de segunda mão ("nos foi relatado"), sem identificar quem relatou ou em que reunião. Esta persona existe para dar forma a uma hipótese antes de qualquer entrevista real, não para substituir essa validação. Tratar toda decisão de investimento maior (roadmap, engenharia, comercial) como bloqueada até haver pelo menos 3-5 conversas reais com o público-alvo (ver Perguntas em aberto).

**Quick orientation.** O Persona Card é a referência de uso diário. Seções 1-4 dão contexto e motivação. Seções 5-8 descrevem comportamento e fluxo de trabalho. Seções 9-11 traduzem insight em decisões de produto. Evidência & Confiança calibra a confiança.

---

## Persona Card

**Prof. Dr. Henrique Salgado — O Coordenador Entre a Evasão e o Sigilo do Aluno**
Henrique, 55 anos, é coordenador do curso de Medicina de uma faculdade de médio porte no Sul do Brasil há 4 anos, depois de 20 anos como docente. Responde à reitoria e à mantenedora por indicadores de evasão, desempenho no Enade e clima institucional — e, cada vez mais, por sofrimento psíquico entre os alunos, tema que hoje ele só enxerga de forma anedótica (relatos informais de professores-tutores, procura pelo NAE¹) e nunca de forma agregada ou objetiva.

**Frase-chave (hipotética — nenhuma entrevista real ainda):** "Eu sei que tem aluno sofrendo, professor me fala isso o tempo todo. O que eu não tenho é nenhum número pra levar pra reitoria e dizer 'olha, é sério, e é aqui que dói mais' — e mesmo se tivesse, não posso saber quem é."

**Objetivos.** Reduzir evasão e trancamentos ligados a sofrimento psíquico, hoje só percebidos depois que já aconteceram; ter algum indicador agregado e defensável para levar à reitoria/mantenedora e para relatórios de credenciamento junto ao MEC; identificar turmas, períodos ou disciplinas de maior tensão (ex.: internato, rodízios de UTI/PS) para agir preventivamente; manter — e conseguir demonstrar — que o sigilo do aluno nunca é violado, inclusive perante os próprios pais/responsáveis, quando aplicável.

**Frustrações.** Só fica sabendo de um caso grave quando já é uma crise (tentativa de suicídio, afastamento abrupto), nunca antes; iniciativas de bem-estar existentes (palestras, semana da saúde mental) não geram nenhum dado de acompanhamento, só "sensação" de que ajudaram; qualquer ferramenta que peça identificação do aluno esbarra no mesmo medo que o aluno tem do professor/coordenação — o que mata a adesão antes de começar; não tem como provar, hoje, que o curso "cuida" de verdade da saúde mental da turma, além de eventos pontuais.

**Regras de design — sempre.** Sempre agregar e nunca identificar indivíduo no painel institucional — o mesmo k-anonimato que já existe hoje para o gestor hospitalar; sempre deixar claro para o aluno, antes de qualquer uso, que a coordenação nunca vê dado individual; sempre expor o painel como evidência que o curso pode mostrar à mantenedora/MEC, não só como número interno.

**Regras de design — nunca.** Nunca oferecer, nem por acidente de UI, um caminho de drill-down até um aluno específico; nunca cruzar o dado agregado de saúde mental com dado acadêmico individual (notas, frequência) de um jeito que reidentifique alguém; nunca deixar a ferramenta parecer um mecanismo de vigilância disciplinar disfarçado de cuidado.

`¹ NAE = Núcleo de Apoio ao Estudante, nome genérico usado aqui — a nomenclatura exata varia por instituição (NAPE, NAP, etc.) e não foi confirmada para nenhuma faculdade real.`

---

## 1. Demografia & Identidade

| Atributo | Detalhe |
| --- | --- |
| Idade | ~55 anos (hipótese — coordenadores de curso tendem a ser docentes seniores) |
| Localização | Faculdade de medicina de médio porte, capital ou região metropolitana no Sul/Sudeste do Brasil (hipótese, por analogia ao mercado já mapeado da Zelo) |
| Formação | Graduação em Medicina + especialização/mestrado ou doutorado acadêmico; geralmente também clínico ativo |
| Cargo | Coordenador(a) de curso de Medicina (às vezes chamado de diretor(a) acadêmico(a) ou chefe de departamento) |
| Porte da organização | Faculdade privada ou federal de médio porte, uma ou poucas turmas de Medicina por ano |
| Equipe | Corpo docente do curso (dezenas de professores), mais equipe do NAE/apoio psicopedagógico quando existe |
| Reporta a | Reitoria/direção acadêmica → mantenedora (se privada) ou conselho universitário (se pública) |
| Stakeholders | Corpo docente, alunos e famílias (indiretamente), comissão de avaliação do MEC, conselho de classe (CRM) na formação do futuro médico |
| Papel de compra | Provável decisor ou forte influenciador da adoção — mas isso não foi validado; pode haver um comitê (reitoria + NAE + jurídico) |
| Acessibilidade | Não pesquisado — hipótese de uso majoritariamente em desktop, no contexto de reuniões de coordenação e relatórios |

**Estágio e trajetória de carreira.** Está em posição de gestão acadêmica depois de uma carreira longa como docente/clínico — sua autoridade vem de tempo de casa e de credibilidade acadêmica, não de formação em gestão. Isso tende a torná-lo cauteloso com ferramentas que pareçam "corporativas demais" ou alheias à cultura acadêmica.

**Influência organizacional.** Responde de forma pessoal e visível por qualquer evento grave de saúde mental que vire notícia ou processo — o que aumenta a pressão por mostrar alguma ação concreta, mesmo sem ferramenta objetiva hoje.

---

## 2. Tecnologia & Contexto de Ambiente

| Ferramenta | Papel |
| --- | --- |
| Sistema acadêmico (ex.: SEI, sistemas de secretaria) | Gestão de matrícula, notas e frequência — não tem nenhum módulo de saúde mental |
| E-mail institucional | Comunicação oficial com docentes, reitoria e mantenedora |
| Planilhas/relatórios de evasão | Acompanhamento manual de trancamentos e desistências, sem causa estruturada |
| NAE/serviço de apoio ao estudante (quando existe) | Atendimento pontual, sem integração de dado com a coordenação |

**Fluência digital.** Confortável com sistemas acadêmicos tradicionais e planilhas; pouca exposição a dashboards de produto moderno — hipótese, não confirmada por entrevista.

**Padrões de adoção e abandono.** Hipótese por analogia ao gestor hospitalar: tende a adotar se a ferramenta já vier com alguma validação externa (outra faculdade, órgão de classe) e abandona rápido se perceber qualquer risco de exposição do aluno que possa gerar problema jurídico ou reputacional para a instituição.

**Ambiente de trabalho.** Reuniões de coordenação, relatórios trimestrais/semestrais para a reitoria, picos de atenção em períodos de matrícula, rodízios de internato e após qualquer incidente grave.

---

## 3. Jobs to Be Done

**Funcional.** Quando precisa reportar à reitoria/mantenedora sobre bem-estar estudantil ou responder a uma cobrança do MEC, ele precisa de algum indicador agregado e defensável de saúde mental da turma, para não depender só de relato informal de professores.

**Emocional.** Quando pensa em um aluno que pode estar sofrendo, ele quer sentir que está fazendo algo preventivo e concreto, não apenas reagindo depois que a crise já aconteceu.

**Social.** Quer ser visto pela reitoria, pelo corpo docente e pelos próprios alunos como alguém que cuida de verdade da turma — não como alguém que só administra números de evasão e Enade.

**Subjacente.** No fundo, ele negocia a mesma tensão estrutural do gestor hospitalar (`persona-gestor-hospitalar.md`): precisa de dado para agir e provar que age, mas qualquer dado identificável destrói a única coisa que faz um aluno em sofrimento realmente usar uma ferramenta — a confiança de que a coordenação nunca vai saber que foi ele. **Hipótese não testada:** essa tensão pode ser ainda mais aguda no ambiente acadêmico do que no hospitalar, porque o coordenador também avalia o aluno academicamente (notas, aprovação, futuro CRM) — um conflito de papel que o gestor hospitalar não tem com o médico plantonista da mesma forma.

---

## 4. Objetivos & Motivações

**Objetivo de vida.** Formar médicos tecnicamente competentes e psiquicamente íntegros, sem que o próprio curso seja lembrado como um lugar que "quebrou" alunos pelo caminho.

**Indicador agregado defensável.** Ter algum número para levar à reitoria e ao MEC que mostre gestão real de risco psicossocial estudantil — implica painel agregado, k-anonimato e exportação, no mesmo padrão já validado com o gestor hospitalar.

**Ação preventiva por período crítico.** Identificar quais fases do curso (ex.: internato, rodízios de UTI/PS, provas de residência) concentram mais sinal de sofrimento, para agir antes da crise — implica granularidade por turma/período, nunca por indivíduo.

**Sigilo comprovável perante o aluno.** Conseguir demonstrar publicamente, para a própria turma, que a coordenação nunca acessa dado individual — condição sem a qual nenhum aluno usaria a ferramenta.

**Meta de experiência 1.** Sentir que finalmente tem um dado, não só uma sensação, para embasar uma conversa difícil com a reitoria.

**Meta de experiência 2.** Sentir que pode apresentar a ferramenta à turma sem parecer estar vendendo vigilância disfarçada de cuidado.

**Meta de experiência 3.** Sentir que, se um sinal agregado disparar (ex.: turma inteira em um período de risco), existe um próximo passo claro de ação institucional — não só um número isolado no dashboard.

---

## 5. Padrões Comportamentais & Modelos Mentais

**Modelo mental central (hipótese).** Por analogia ao gestor hospitalar, é plausível que Henrique enxergue qualquer ferramenta de saúde mental estudantil pela mesma lente dupla: "isso me protege de responsabilização" e "isso pode virar o motivo de eu perder a confiança da turma inteira, para sempre, se vazar algo". **Isso não foi confirmado por nenhuma entrevista** — é a hipótese mais importante a validar antes de investir no segmento.

**Padrão de trabalho principal.** Ciclos acadêmicos (semestre, período de matrícula, avaliações do MEC) intercalados com picos reativos a incidentes pontuais — diferente do ritmo de plantão do médico hospitalar, é mais previsível e menos fragmentado.

**Padrão de qualidade.** Como médico e acadêmico, tende a exigir instrumentos clinicamente validados (mesma exigência já mapeada na persona primária, PHQ-9/GAD-7) — hipótese por analogia, não confirmada especificamente para este público.

**Limiares de tolerância.** Hipótese: zero tolerância a qualquer coisa que pareça expor a instituição a risco jurídico (LGPD, sigilo, relação com conselho de classe) — provavelmente o limiar mais alto de toda a persona, ainda maior que o do gestor hospitalar, dado o vínculo formativo/avaliativo com o aluno.

---

## 6. Padrões de Decisão & Confiança

**Como a confiança se constrói e se quebra (hipótese).** Por analogia: provavelmente uma única suspeita de reidentificação de aluno destruiria a confiança de forma irreversível, não só com Henrique, mas com toda a turma — que passaria a boicotar a ferramenta coletivamente. Não testado.

**Filtro de adoção (hipótese).** "Isso pode virar processo se um aluno disser que foi exposto?" → "O MEC aceita isso como evidência de gestão de risco?" → "Outra faculdade de medicina já usa isso e não deu problema?" → "O NAE/psicólogo da casa endossa ou vê como concorrência/ameaça?"

**Perfil de risco.** Hipótese: mais avesso a risco que o gestor hospitalar, porque soma dois vínculos de responsabilização — sanitário (se algo grave acontecer) e educacional/MEC (auditoria de curso). Não testado.

**Descoberta de funcionalidades.** Hipótese: baixo apetite para explorar o produto sozinho; provavelmente depende de demonstração guiada e de algum validador externo (outra faculdade, órgão de classe) antes de confiar no que o painel mostra.

---

## 7. Fluxo de Trabalho & Contexto de Colaboração

**Ritmo de trabalho.** Reuniões periódicas de colegiado/coordenação, relatórios semestrais para a reitoria, picos de atenção em avaliações do MEC e após qualquer incidente crítico envolvendo aluno.

**Modelo de colaboração.** Consome o painel, mas provavelmente delega a leitura operacional ao NAE/apoio psicopedagógico e usa o resumo executivo em reuniões com a reitoria — hipótese, não confirmada.

**Principal fricção de colaboração.** Possível tensão entre coordenação e NAE/serviço de psicologia: se o painel agregado "pertencer" à coordenação, o time clínico pode ver isso como invasão do seu domínio de sigilo profissional — ponto de atrito específico deste segmento que não existe (ou existe de forma diferente) no hospitalar.

**Dependências.** Depende de adesão real dos alunos ao produto (sem adesão, não há dado agregado nenhum); depende também de alinhamento prévio com o NAE/psicologia institucional, que provavelmente precisa estar de acordo antes de qualquer rollout — outra dependência que o gestor hospitalar não tem da mesma forma.

---

## 8. Alternativas Atuais & Contornos

**Alternativa principal.** Hoje, na ausência de qualquer ferramenta, depende de relato informal de professores-tutores e da procura espontânea (baixa) pelo NAE — sem nenhum dado estruturado ou agregado.

**Onde o produto entra.** Seria o primeiro indicador objetivo e agregado de saúde mental da turma que a coordenação já teve acesso.

**O gatilho de abandono (hipótese).** Qualquer evento — real ou percebido — em que um aluno associe publicamente o uso da ferramenta a uma consequência acadêmica ou disciplinar, mesmo que a instituição não tenha causado isso diretamente.

---

## 9. Pontos de Dor & Necessidades Não Atendidas

**Nenhum dado até a crise.** Só sabe de um caso grave depois que já virou emergência — não existe hoje nenhum sinal preventivo agregado.

**Ações de bem-estar sem métrica.** Palestras e semanas temáticas acontecem, mas ninguém sabe se mudaram alguma coisa de fato.

**Nada para mostrar ao MEC/mantenedora.** Não tem como demonstrar, com dado, que o curso gerencia ativamente o risco psicossocial da turma — apenas "iniciativas" pontuais e narrativas.

**Tensão de papel duplo (hipótese).** Ele é, ao mesmo tempo, figura de cuidado e figura avaliadora/formadora do mesmo aluno — o que pode tornar qualquer ferramenta de saúde mental estruturalmente mais desconfiada pelo aluno do que no ambiente hospitalar, onde gestor e médico têm vínculo empregatício, não formativo.

---

## 10. Definição de Sucesso & Padrão de Qualidade

**Padrão de precisão.** Hipótese: exige que o indicador agregado seja defensável perante auditoria do MEC — não pode parecer "número inventado" ou marketing de bem-estar.

**Padrão de tempo.** Relatórios semestrais/anuais provavelmente bastam para o ritmo acadêmico — diferente da urgência do gestor hospitalar, que opera por semana/turno.

**Padrão de autossuficiência.** Um indicador agregado só tem valor se vier acompanhado de alguma leitura de causa (qual período, qual turma) — número isolado sem contexto tende a não convencer a reitoria.

**Padrão de qualidade por contexto.** Em uso rotineiro, "bom o suficiente" é acompanhar tendência semestral por período do curso; diante de um sinal agregado de risco alto, o padrão sobe para articular resposta institucional (reforço do NAE, ajuste de carga do rodízio) — não apenas registrar o número.

---

## 11. Princípios de Design & Heurísticas de Tradeoff

1. **Sigilo do aluno sobre conveniência de gestão** — nunca oferecer atalho de identificação individual, mesmo que facilitasse a vida da coordenação em um caso grave.
2. **Evidência agregada sobre narrativa institucional** — o painel precisa ser number, não discurso, para servir de defesa perante MEC/mantenedora.
3. **Alinhamento com o NAE antes de rollout sobre velocidade de lançamento** — lançar sem o serviço de psicologia institucional alinhado arrisca a percepção de vigilância disfarçada.
4. **Granularidade por período/turma sobre granularidade por indivíduo** — a mesma régua de k-anonimato do gestor hospitalar, adaptada à unidade "turma/período" em vez de "setor".
5. **Confiança demonstrável ao aluno sobre confiança apenas declarada à coordenação** — sem a adesão do aluno, não existe dado agregado nenhum; a arquitetura de privacidade precisa ser verificável pelo próprio usuário final, não só pelo comprador institucional.

---

## Evidência & Confiança

| Fonte | Tipo | Detalhe |
| --- | --- | --- |
| BRN-01 | Nota de brainstorm interna | `general-documentations/branstorms.md`, seção "New - no taged yet" — nota curta, de segunda mão ("nos foi relatado"), sem identificar origem, data ou detalhe da reunião mencionada; texto termina de forma incompleta |
| PER-02 | Persona análoga já existente | `persona-gestor-hospitalar.md` (Dra. Beatriz Konder) — usada como estrutura de analogia para o papel de "comprador/gestor institucional que só vê dado agregado", não como evidência direta deste público |
| LIT-GERAL | Literatura pública geral (não específica da Zelo) | Prevalência de burnout, ansiedade e depressão em estudantes de medicina é amplamente documentada internacionalmente (ex.: revisões sistemáticas frequentemente citadas na área, como Rotenstein et al. 2016, JAMA) — citada aqui apenas como sinal de que o problema subjacente é real e conhecido no campo, não como dado específico de nenhuma instituição brasileira nem como fonte verificada nesta sessão |

**Validado.** Nada nesta persona está validado com o público-alvo real. A única coisa "validada" é que o problema geral (saúde mental de estudantes de medicina) é amplamente discutido na literatura internacional de saúde — o que não confirma nenhum traço específico de Henrique.

**Assumido.** Praticamente toda a persona é assumida por analogia ao gestor hospitalar e por raciocínio de primeiros princípios sobre o contexto acadêmico brasileiro — idade, rotina, filtro de adoção, tensão de papel duplo, dependência do NAE. Nenhum desses traços vem de entrevista direta.

**Perguntas em aberto.**

1. Quem, exatamente, decidiria a adoção de uma ferramenta como essa em uma faculdade real — o coordenador de curso sozinho, a reitoria, o NAE, ou um comitê? A persona assume "coordenador" como proxy, mas isso pode estar errado.
2. A tensão de papel duplo (coordenador como avaliador acadêmico *e* como responsável por bem-estar) é de fato mais forte que a tensão já mapeada no gestor hospitalar, ou é equivalente? Só entrevista real resolve isso.
3. O NAE/serviço de psicologia institucional veria uma ferramenta como essa como apoio ou como concorrência/ameaça ao seu próprio papel? Isso muda completamente a estratégia de entrada (vender para a coordenação vs. vender junto com o NAE).
4. Qual é, hoje, a origem real da nota de brainstorm ("nos foi relatado")? Sem saber quem disse isso e em que contexto, não dá para calibrar se o sinal é forte (ex.: veio de uma faculdade real interessada) ou fraco (especulação em uma conversa qualquer).

**Governança.** Esta persona não deve orientar nenhuma decisão de investimento de engenharia ou roadmap além de exploração/discovery. Critério de promoção a "Proto validado": pelo menos 3-5 conversas reais com coordenadores/diretores de faculdades de medicina brasileiras, incluindo ao menos uma que também envolva o NAE/serviço de psicologia da mesma instituição. Próxima ação recomendada: transformar a nota de brainstorm em uma pergunta de discovery concreta (quem relatou isso, em que reunião) antes de buscar as entrevistas.
