# User Stories: Zelo* — MVP dos 28 dias (1ª Jornada Incubintech)

`*Nome de trabalho, ainda não validado.`

Estas 8 histórias cobrem o escopo "Dentro do Escopo" definido na PRD. Persona de referência: Dra. Camila Andrade (médica usuária), exceto US-006, referente a uma persona secundária de gestor(a) hospitalar ainda não documentada em detalhe.

---

## US-001 — Autoavaliação clínica com score calculado no dispositivo

| Campo | Valor |
|---|---|
| ID | US-001 |
| Persona | Médica usuária (Dra. Camila Andrade) |
| Prioridade | P0 |
| Épico | Autoavaliação e Triagem |
| Estimativa | M |

**Como** médica plantonista que sente sinais de esgotamento,
**eu quero** responder a uma autoavaliação clínica validada (PHQ-9, GAD-7 e/ou MBI-HSS) e ver meu resultado calculado inteiramente no meu dispositivo,
**para que** eu possa entender objetivamente o que sinto sem que meus dados brutos saiam do meu aparelho em texto claro.

**Contexto**: Este é o ponto de entrada de todo o produto (Passos 1 e 2 do fluxo de referência). Sem confiança nesta etapa, nenhuma etapa seguinte é usada.

**Critérios de Aceite**

- *AC-1 — Cálculo local do score*: Dado que a médica respondeu a todas as perguntas da escala, quando ela finaliza o questionário, então o score é calculado no dispositivo e nenhum dado bruto de resposta é enviado ao servidor em texto claro.
- *AC-2 — Feedback imediato*: Dado que o score foi calculado, quando a tela de resultado é exibida, então a médica vê o resultado em linguagem clara (não apenas um número), sem jargão técnico não explicado.
- *AC-3 — Indicador de privacidade visível*: Dado que a médica está respondendo a autoavaliação, quando qualquer tela do fluxo é exibida, então um indicador visível comunica que o processamento é local ("no seu aparelho").

**Notas de Design**: O indicador de privacidade deve aparecer antes da primeira pergunta, não só no resultado.
**Notas Técnicas**: Cálculo via lógica local no client (PWA), sem uso de Web Crypto API nesta etapa específica (reservada à cifragem, ver US posteriores); nenhuma chamada de rede durante o preenchimento das respostas.
**Dependências**: Nenhuma (US inicial).
**Fora do Escopo**: Histórico longitudinal de múltiplas autoavaliações (considerar para painel/v2).
**Perguntas em Aberto**: Qual subconjunto exato de escalas (PHQ-9 + GAD-7 + MBI-HSS completos ou reduzidos) cabe no prazo de 28 dias? — **Encaminhado em 11/07/2026**: pergunta direcionada aos psicólogos parceiros (`roteiro-entrevista-psicologos-parceiros.md`, Bloco 2, itens 5–6).

---

## US-002 — Chat de acolhimento por IA sem diagnóstico

| Campo | Valor |
|---|---|
| ID | US-002 |
| Persona | Médica usuária |
| Prioridade | P0 |
| Épico | Acolhimento por IA |
| Estimativa | M |

**Como** médica que acabou de ver um resultado de autoavaliação indicando sinais de sofrimento leve a moderado,
**eu quero** conversar com um chat de acolhimento por IA que escuta ativamente sem me diagnosticar,
**para que** eu tenha um primeiro espaço de fala confidencial antes de decidir buscar qualquer ajuda formal.

**Contexto**: Fluxo padrão pós-triagem (ver fluxo de referência: "Chat de acolhimento por IA — sem emitir diagnóstico").

**Insight de pesquisa (07/07/2026)**: na entrevista com Dr. David Mendes (gestor médico, 02/07/2026), ele afirmou que desconfiaria "no menor sinal" de estar falando com uma IA em vez de uma pessoa real, e que a alta rotatividade de atendentes também gera insegurança. Por isso, AC-4 abaixo é P0, não nice-to-have.

**Critérios de Aceite**

- *AC-1 — Ausência de diagnóstico*: Dado que a médica está conversando com o chat, quando a IA responde a qualquer mensagem, então a resposta nunca contém linguagem que possa ser lida como diagnóstico clínico formal.
- *AC-2 — Disclaimer permanente*: Dado que o chat está ativo, quando a médica abre a conversa, então um aviso permanente e visível informa que o chat não substitui atendimento profissional.
- *AC-3 — Anonimização antes do envio a terceiro*: Dado que a médica envia uma mensagem, quando a mensagem é encaminhada à API de IA externa, então identificadores diretos (nome, CRM, hospital) são removidos antes do envio.
- *AC-4 — Atalho humano sempre visível*: Dado que a médica está em qualquer ponto da conversa com a IA, quando ela olha a tela, então um atalho claramente visível permite pedir conexão com uma pessoa real (par médico ou psicólogo) a qualquer momento, não apenas quando o sistema detecta risco agudo (ver PRD FR-6b).

**Notas de Design**: Tom de voz acolhedor, nem clínico-frio nem informal demais; o atalho humano (AC-4) precisa ser visualmente distinto de um botão de menu comum — não deve parecer uma opção secundária escondida.
**Notas Técnicas**: API de LLM de terceiro (provedor a definir) com anonimização client-side antes do envio; system prompt com guardrails revisado por mentor especializado.
**Dependências**: US-001 (o chat também pode ser acessado de forma independente, mas o fluxo natural vem após o score).
**Fora do Escopo**: Histórico de conversas entre sessões (avaliar implicação de privacidade antes de implementar).
**Perguntas em Aberto**: ~~Qual provedor de LLM?~~ **Resolvido 11/07/2026: Groq** (política de retenção de dados da API ainda a confirmar). ~~Qual o destino exato do atalho humano (AC-4)?~~ **Resolvido 11/07/2026: oferece escolha** entre par médico e psicólogo.

---

## US-003 — Escalonamento em crise: aceite de conexão humana

| Campo | Valor |
|---|---|
| ID | US-003 |
| Persona | Médica usuária |
| Prioridade | P0 |
| Épico | Escalonamento em Crise |
| Estimativa | M |

**Como** médica cujo padrão de respostas indica risco agudo,
**eu quero** receber a oferta de conexão imediata com um psicólogo parceiro humano e poder aceitar me identificar apenas para esse canal,
**para que** eu tenha ajuda real em um momento crítico, sem que isso vire um registro permanente e identificável em outro lugar do sistema.

**Contexto**: Caminho "SIM — escalonamento em crise" → "ACEITA" do fluxo de referência.

**Critérios de Aceite**

- *AC-1 — Oferta, não imposição*: Dado que o sistema identificou sinal de risco agudo, quando a tela de oferta é exibida, então a médica pode recusar sem qualquer bloqueio de uso do restante do app.
- *AC-2 — Token efêmero*: Dado que a médica aceita se identificar, quando a conexão com o psicólogo é estabelecida, então um token de sessão efêmero é usado, e a identidade não é persistida em texto claro no banco de dados principal.
- *AC-3 — Escopo da exposição*: Dado que a identificação foi aceita, quando a sessão com o psicólogo termina, então a identidade exposta não se torna visível em nenhum outro canal do produto (chat de IA, matching de pares, painel institucional).

**Notas de Design**: A tela de oferta deve deixar claríssimo o que muda (identificação) e o que não muda (o resto do app continua anônimo).
**Notas Técnicas**: Geração de token de sessão efêmero; canal de comunicação ao vivo (detalhado no documento de arquitetura técnica) isolado do restante da base de dados.
**Dependências**: Definição dos critérios de risco agudo (parceiro clínico); disponibilidade de psicólogo parceiro (ou simulação para demo).
**Fora do Escopo**: Histórico de sessões passadas com psicólogos.
**Perguntas em Aberto**: Como a demo vai representar essa conexão se não houver psicólogo parceiro real disponível a tempo? — **Atualizado 11/07/2026**: há dois psicólogos parceiros confirmados, por ora em papel consultivo (`roteiro-entrevista-psicologos-parceiros.md`). O canal operacional do caminho de aceite (quem atende de fato uma conexão ao vivo na demo) segue em aberto — ver Bloco 8 do roteiro.

---

## US-004 — Escalonamento em crise: recusa e linha externa

| Campo | Valor |
|---|---|
| ID | US-004 |
| Persona | Médica usuária |
| Prioridade | P0 |
| Épico | Escalonamento em Crise |
| Estimativa | S |

**Como** médica em sinal de risco agudo que não quer se identificar,
**eu quero** recusar a conexão humana oferecida e ainda assim ver imediatamente uma linha de crise externa,
**para que** eu tenha uma saída de emergência sem abrir mão do meu anonimato.

**Contexto**: Caminho "SIM — escalonamento em crise" → "RECUSA" do fluxo de referência.

**Critérios de Aceite**

- *AC-1 — Exibição imediata de linha externa*: Dado que a médica recusa a oferta de conexão, quando a recusa é confirmada, então o app exibe imediatamente linhas de crise externas (ex.: CVV 188).
- *AC-2 — Anonimato preservado*: Dado que a médica recusou a identificação, quando qualquer dado da sessão é registrado, então nenhuma informação identificável é persistida em decorrência dessa recusa.
- *AC-3 — Oferta pode reaparecer*: Dado que a médica recusou uma vez, quando ela volta a usar o app em uma sessão futura com novo sinal de risco, então a oferta de conexão humana pode ser apresentada novamente, sem penalidade pela recusa anterior.

**Notas de Design**: Linha de crise deve ser uma ação de um toque (discar/abrir chat), não apenas texto informativo.
**Notas Técnicas**: Lista de linhas de crise configurável (permitir adicionar linha específica de SC além do CVV 188, se existir).
**Dependências**: Nenhuma além do fluxo de detecção de risco (parte da US-001/US-003).
**Fora do Escopo**: Acionamento automático de terceiros (ex.: SAMU) sem ação do usuário.
**Perguntas em Aberto**: Existe uma linha de apoio específica ao médico em SC a incluir além do CVV 188? — **Encaminhado em 11/07/2026**: pergunta direcionada aos psicólogos parceiros (`roteiro-entrevista-psicologos-parceiros.md`, Bloco 3, item 9).

---

## US-005 — Matching anônimo de pares treinados

| Campo | Valor |
|---|---|
| ID | US-005 |
| Persona | Médica usuária |
| Prioridade | P1 |
| Épico | Matching de Pares |
| Estimativa | M |

**Como** médica que concluiu o fluxo padrão de acolhimento,
**eu quero** ser conectada, por escolha própria, a outro médico (par treinado) de forma anônima,
**para que** eu sinta que não estou sozinha, sem expor minha identidade a essa pessoa.

**Contexto**: Fluxo padrão pós-chat de IA, opcional ("sob escolha do médico").

**Critérios de Aceite**

- *AC-1 — Opt-in explícito*: Dado que a médica concluiu a conversa com o chat de IA, quando a opção de matching é apresentada, então ela só é conectada a um par se escolher ativamente essa opção.
- *AC-2 — Anonimato mútuo*: Dado que o matching foi aceito, quando a conversa com o par se inicia, então nenhuma das duas partes vê dados identificáveis da outra.
- *AC-3 — Encerramento a qualquer momento*: Dado que a conversa com o par está em andamento, quando qualquer uma das partes decide encerrar, então a conversa termina sem necessidade de justificativa e sem penalidade.

**Notas de Design**: Deixar claro que o par é "treinado", não um profissional de saúde mental.
**Notas Técnicas**: Para o hackathon, pode ser implementado com dados/pares simulados, desde que documentado como tal. **Decidido em 11/07/2026**: usar um pequeno conjunto de perfis fictícios pré-cadastrados, rotulados explicitamente como dado de demonstração na tela e na fala para a banca — não pares reais treinados.
**Dependências**: US-002 (fluxo de chat concluído).
**Fora do Escopo**: Curadoria e treinamento real de pares (processo institucional, fora do escopo técnico do PoC).
**Perguntas em Aberto**: ~~Como simular de forma honesta o matching na demo sem uma base real de pares treinados?~~ **Resolvido em 11/07/2026** — ver Notas Técnicas.

---

## US-006 — Painel agregado para gestor hospitalar

| Campo | Valor |
|---|---|
| ID | US-006 |
| Persona | Gestor(a) hospitalar / coordenação de saúde ocupacional (persona secundária, a documentar) |
| Prioridade | P1 |
| Épico | Painel de Monitoramento |
| Estimativa | M |

**Como** gestor(a) hospitalar responsável por saúde ocupacional,
**eu quero** ver um painel com métricas agregadas e anônimas de tendências de burnout na equipe (ex.: por turno/setor),
**para que** eu possa agir preventivamente sem jamais ver dados de um médico específico.

**Contexto**: Contrapartida do modelo de negócio ("quem paga não é quem julga", pitch deck da equipe).

**Critérios de Aceite**

- *AC-1 — Nenhum dado individual*: Dado que o painel está sendo exibido, quando qualquer métrica é renderizada, então não é possível identificar, direta ou indiretamente, um médico específico.
- *AC-2 — Limiar mínimo por segmento*: Dado que um segmento (ex.: turno) tem poucas respostas, quando o número de respostas está abaixo de um limiar mínimo definido, então a métrica desse segmento não é exibida, para evitar re-identificação por dedução.
- *AC-3 — Métricas de tendência, não de evento único*: Dado que o gestor acessa o painel, quando ele visualiza os dados, então as métricas são apresentadas como tendências ao longo do tempo, não como eventos pontuais atribuíveis a um dia/turno específico com poucas pessoas.
- *AC-4 — Rotulagem como insumo para o PGR (NR-1)* *(adicionada 11/07/2026, PRD FR-16, `adr-001-fr16-nr1-painel-gestor.md`)*: Dado que o gestor acessa o painel, quando ele visualiza as métricas agregadas, então elas também aparecem rotuladas como fatores de risco psicossocial mapeáveis ao PGR (ex.: "sobrecarga", "jornada", "esgotamento por setor"), com uma exportação simples (PDF/CSV) disponível, e com texto explícito de que isso é um insumo para a gestão de risco psicossocial do empregador — não uma certificação de conformidade NR-1.

**Notas de Design**: O painel deve reforçar visualmente a mensagem "isso é agregado", por exemplo via rótulos e mínimos de amostra. Para AC-4, o rótulo de risco psicossocial deve ser visualmente distinto da métrica bruta, sem parecer um selo oficial de conformidade.
**Notas Técnicas**: Para a demo, usar dados agregados simulados/anonimizados; nenhuma base real de médicos é necessária. AC-4 reaproveita os mesmos dados agregados de AC-1/AC-2 — é camada de rotulagem/exportação, não uma nova fonte de dado.
**Dependências**: Volume mínimo de dados simulados suficiente para o limiar (AC-2) não esvaziar o painel na demo. AC-4 depende de revisão do texto do rótulo com um mentor jurídico/SST antes da fala final da banca (ver ADR-001).
**Fora do Escopo**: Integração com sistemas de BI ou eSocial do hospital; qualquer alegação de "conformidade garantida" com a NR-1.
**Perguntas em Aberto**: Qual o limiar mínimo de respostas por segmento (n=3? n=5?) e quem valida esse número (parceiro clínico/jurídico)? — **Mantido como pendência intencional (11/07/2026)**: n≥5 fica como placeholder técnico até validação nos psicólogos parceiros (`roteiro-entrevista-psicologos-parceiros.md`, Bloco 6). ~~Quem revisa o texto do rótulo de AC-4 com um mentor jurídico/SST antes do checkpoint de 18/07?~~ **Resolvido em 11/07/2026**: Mauricio busca esse mentor na Jornada.

---

## US-007 — Consentimento explícito antes de qualquer exposição de identidade

| Campo | Valor |
|---|---|
| ID | US-007 |
| Persona | Médica usuária |
| Prioridade | P0 |
| Épico | Privacidade & Segurança (transversal) |
| Estimativa | S |

**Como** médica usando qualquer parte do produto,
**eu quero** que meu consentimento seja pedido de forma específica e no momento exato em que minha identidade poderia ser exposta,
**para que** eu nunca seja surpreendida por uma exposição que eu não autorizei conscientemente.

**Contexto**: Requisito transversal (FR-15 da PRD), aplicável à US-003 e a qualquer fluxo futuro que envolva identificação.

**Critérios de Aceite**

- *AC-1 — Consentimento contextual, não genérico*: Dado que qualquer fluxo do produto pode levar à exposição de identidade, quando esse ponto é alcançado, então o sistema pede consentimento específico para aquele momento, não um "aceite os termos" genérico do cadastro.
- *AC-2 — Consentimento revogável*: Dado que a médica já consentiu em um momento, quando ela decide não continuar, então ela pode recusar prosseguir sem perder acesso às partes anônimas do produto.
- *AC-3 — Registro do consentimento*: Dado que o consentimento foi dado, quando a ação subsequente ocorre (ex.: conexão com psicólogo), então existe um registro técnico do consentimento vinculado apenas ao token efêmero da sessão, não à identidade permanente do usuário.

**Notas de Design**: Nenhum "aceite tudo" escondido em letras miúdas — todo consentimento relevante aparece no momento da decisão.
**Notas Técnicas**: Aplica-se transversalmente onde quer que FR-15 da PRD seja relevante.
**Dependências**: US-003.
**Fora do Escopo**: Gestão de consentimento para finalidades de marketing (não aplicável a este produto).
**Perguntas em Aberto**: Nenhuma pendente além das já listadas na PRD.

---

## US-008 — Onboarding e transparência do modelo de privacidade

| Campo | Valor |
|---|---|
| ID | US-008 |
| Persona | Médica usuária — primeiro uso |
| Prioridade | P0 |
| Épico | Onboarding |
| Estimativa | S |

**Como** médica usando o Zelo pela primeira vez,
**eu quero** entender, antes de responder qualquer pergunta sensível, como meus dados são protegidos,
**para que** eu confie o suficiente no sistema para de fato completar a autoavaliação.

**Contexto**: Sem esta etapa, a barreira de desconfiança descrita na persona (Dra. Camila) impede o uso de qualquer outra funcionalidade.

**Critérios de Aceite**

- *AC-1 — Explicação antes da primeira pergunta*: Dado que é o primeiro acesso da médica ao app, quando ela abre a autoavaliação pela primeira vez, então uma explicação curta e não técnica do modelo de privacidade é exibida antes da primeira pergunta.
- *AC-2 — Linguagem verificável, não promocional*: Dado que a explicação de privacidade é exibida, quando a médica lê o conteúdo, então a linguagem descreve o que tecnicamente acontece (ex.: "processado no seu aparelho") em vez de apenas afirmar "seus dados estão seguros".
- *AC-3 — Onboarding não bloqueante*: Dado que a médica já viu o onboarding uma vez, quando ela abre o app novamente, então o onboarding completo não é repetido, mas o indicador de privacidade continua visível nas telas relevantes.

**Notas de Design**: Evitar tom infantilizado; a persona é uma profissional de saúde que reconhece explicações técnicas superficiais.
**Notas Técnicas**: Onboarding é apenas conteúdo estático/local; não depende de nenhuma chamada de API.
**Dependências**: Nenhuma (primeira tela do produto).
**Fora do Escopo**: Onboarding personalizado por perfil de usuário.
**Perguntas em Aberto**: Nenhuma.

---

## US-009 — Acompanhamento (follow-up) pós-interação inicial

| Campo | Valor |
|---|---|
| ID | US-009 |
| Persona | Médica usuária (Dra. Camila Andrade) |
| Prioridade | P0 |
| Épico | Acompanhamento (Follow-up) |
| Estimativa | S |

**Como** médica que já respondeu a uma autoavaliação e, se aplicável, foi direcionada a um canal de apoio,
**eu quero** receber um único contato de reengajamento perguntando como estou depois dessa interação,
**para que** o time por trás do Zelo (e o hospital que financia a ferramenta) saibam se o encaminhamento inicial teve continuidade, sem que isso vire vigilância contínua sobre mim.

**Contexto**: Adicionada em 19/07/2026 a partir das respostas da ACM (Dr. Marcello Alberton Herdt, Diretor de Inovação) a perguntas formais do time (`general-documentations/Perguntas encaminhadas a ACM.pdf`): *"os KPIs prioritários para esta fase são, essencialmente, o número de questionários respondidos e a taxa de resposta da pesquisa de seguimento (follow-up) — ou seja, o quanto conseguimos acompanhar como o profissional está após a interação inicial e o encaminhamento"*, e *"o critério de avaliação está na robustez desse fluxo de triagem → direcionamento → follow-up"*. Até esta data não havia nenhuma história cobrindo acompanhamento pós-interação no backlog — é o gap mais crítico identificado no plano de ação `2026-07-19-action-plan-respostas-acm.md` (Esforço P2) e registrado em `adr-003-crisis-protocol-rescope-peer-chat-differentiator.md`.

**Critérios de Aceite**

- *AC-1 — Disparo do follow-up*: Dado que a médica concluiu uma autoavaliação (US-001) e, se aplicável, foi direcionada a um canal de apoio (US-003/US-004), quando o intervalo de tempo definido para acompanhamento é atingido, então o sistema dispara um único contato de reengajamento (notificação/mensagem no app) perguntando de forma simples como ela está.
- *AC-2 — Registro de resposta sem identificação individual no painel*: Dado que o contato de follow-up foi enviado, quando a médica responde (ou não responde) dentro da janela definida, então o sistema registra esse evento de forma anonimizada e agregada, suficiente para calcular taxa de resposta, sem vincular a resposta individual a nenhuma visualização identificável no painel do gestor.
- *AC-3 — Métricas agregadas no painel do gestor*: Dado que existem respostas de follow-up registradas, quando o gestor acessa o painel (US-006), então ele vê duas métricas agregadas: (1) número de autoavaliações/questionários respondidos e (2) taxa de resposta da pesquisa de follow-up — ambas herdando as mesmas restrições de anonimato e limiar mínimo por segmento já definidas em US-006 (AC-1, AC-2).
- *AC-4 — Sem penalidade por não resposta*: Dado que a médica não responde ao contato de follow-up, quando ela volta a usar o app normalmente, então nenhuma funcionalidade fica bloqueada ou degradada por causa disso.

**Notas de Design**: O contato de follow-up deve ter o mesmo tom de acolhimento do restante do produto (ver US-002) — uma pergunta aberta e simples, não um formulário longo nem um lembrete de cobrança.
**Notas Técnicas**: Para o hackathon, um único follow-up agendado por interação é suficiente (não recorrente); intervalo de disparo pode ser simulado/acelerado na demo, desde que documentado como tal, no mesmo padrão já usado em US-005/US-006.
**Dependências**: US-001 (autoavaliação concluída); US-003/US-004 (quando o follow-up decorre de um episódio de crise); US-006 (painel do gestor, para exibição das métricas).
**Fora do Escopo**: Acompanhamento longitudinal contínuo/recorrente (múltiplos follow-ups ao longo do tempo) — considerar como evolução pós-hackathon, mesmo padrão de honestidade de escopo já usado em `adr-001-fr16-nr1-painel-gestor.md` e `adr-002-mbi-hss-direction.md`.
**Perguntas em Aberto**: Qual o intervalo exato entre a interação inicial e o disparo do follow-up (ex.: 48h? 7 dias?) — decisão de produto pendente, a resolver por Mauricio antes do início da implementação (timebox de 2 dias, ver `roadmap/mauricio.md`, Semana 3).

## US-010 — Canal WhatsApp para o chat de acolhimento e follow-up

| Campo | Valor |
|---|---|
| ID | US-010 |
| Persona | Médica usuária (Dra. Camila Andrade) |
| Prioridade | A definir (primeira feature priorizada na trilha de evolução independente do produto pós-hackathon, decisão de Mauricio em 28/07/2026) |
| Épico | Engajamento Contínuo |
| Estimativa | A definir |
| Status | **Spec de design pronta e aprovada, não agendada para implementação** — pendência registrada, ver `roadmap/mauricio.md`. |

**Como** médica que não quer depender de abrir o app para manter contato com o Zelo,
**eu quero** conversar com a IA de acolhimento do Zelo e receber o follow-up (US-009) também pelo WhatsApp, vinculando meu número ao app,
**para que** o acompanhamento aconteça no canal que já uso no dia a dia.

**Contexto**: Ideia registrada em `general-documentations/ideas.md`, revisada em brainstorm com Mauricio em 28/07/2026: a proposta original de "IA aprender sobre o médico a partir de dados de plantão fornecidos pelo hospital" foi **descartada pelo próprio autor da ideia** antes do brainstorm ("isso foi apenas uma ideia rápida anotada") — não faz parte do escopo desta US. O escopo real é o chat de IA existente (US-002) e o follow-up (US-009) ficarem acessíveis também via WhatsApp, com o médico vinculando o número ao app. Design completo em `docs/superpowers/specs/2026-07-28-whatsapp-channel-design.md`.

**Critérios de Aceite**

- *AC-1 — Vinculação com prova de posse do número*: Dado que a médica já usa o app, quando ela opta por vincular o WhatsApp, então o sistema envia um código OTP via WhatsApp e só confirma o vínculo se ela digitar esse código de volta no app.
- *AC-2 — Continuidade da conversa*: Dado que o número está vinculado, quando a médica manda uma mensagem livre no WhatsApp, então a IA responde com o mesmo padrão de tom e guardrails do chat do app (US-002), com histórico persistido (anonimizado) para dar continuidade entre os dois canais.
- *AC-3 — Direcionamento de crise também funciona no WhatsApp*: Dado que a IA detecta risco agudo durante uma conversa no WhatsApp, quando isso acontece, então o mesmo fluxo de direcionamento simplificado (FR-7–FR-10) dispara ali, com aceite/recusa via botões interativos.
- *AC-4 — Follow-up via WhatsApp*: Dado que um vínculo de WhatsApp existe e o intervalo do follow-up (US-009, 3 dias) foi atingido, quando o gatilho dispara, então o Zelo manda o template de follow-up aprovado pela Meta pelo WhatsApp, e a resposta é contabilizada na mesma métrica já exibida no painel do gestor (US-006).
- *AC-5 — Sem dado bruto persistido em claro no servidor*: Dado que uma mensagem chega pelo webhook do WhatsApp, quando ela é processada, então o texto é anonimizado em memória no servidor antes de qualquer persistência — exceção documentada ao padrão de anonimização client-side (FR-5), válida só para este canal.

**Notas de Design**: Tom de continuidade de cuidado, não vigilância — mesmo cuidado já aplicado em US-009.
**Notas Técnicas**: WhatsApp Cloud API da Meta (decisão registrada no spec, não BSP terceiro). Introduz o primeiro conceito de identidade persistente por dispositivo do produto (`deviceLinkToken`) e as primeiras tabelas de conversa/mensagem persistidas (hoje o chat não persiste em lugar nenhum). Ver spec para arquitetura completa, incluindo por que a anonimização precisa migrar para o servidor só neste canal.
**Dependências**: US-002 (chat de IA), US-009 (follow-up), US-006 (métrica de follow-up no painel).
**Fora do Escopo**: Qualquer uso de dados de plantão/escala do hospital para customizar respostas da IA (descartado); mídia (áudio/imagem); múltiplos números por dispositivo; chat par-a-par via WebSocket (US separada).

**Perguntas em Aberto**: nenhuma bloqueante para o design — todas resolvidas no brainstorm de 28/07/2026 (ver spec). Falta apenas a decisão de **quando** priorizar a implementação.
