# Rafael Tissiani — O Analista Que Precisa Reproduzir o Número

**Coordenador do núcleo de qualidade e gestão de indicadores de um hospital de médio porte, que alimenta o PGR e prepara o material que a diretoria clínica apresenta — e que só usa um indicador depois de conseguir refazer a conta por conta própria.**

| Field | Value |
| --- | --- |
| Persona ID | PU-003 |
| Type | Supplemental (segundo arquétipo dentro do mesmo escopo de produto de PU-002, não um novo segmento) |
| Product scope | Painel de Monitoramento institucional (PRD FR-12, FR-13, FR-16, FR-17); camada de profundidade, filtros, metodologia e exportação bruta do lado gestor da plataforma Zelo |
| Valid for | Coordenador(a) de qualidade/segurança do paciente, analista de gestão em saúde, responsável técnico por SESMT/PGR ou coordenador(a) de setor com perfil analítico, em hospital, rede ou cooperativa de porte médio; pessoa que detém uma conta `Manager` no Zelo e a acessa com frequência semanal ou quinzenal |
| Not valid for | Diretor(a) clínico(a)/decisor(a) que consome o painel pronto (ver PU-002, Dra. Beatriz Konder); médico(a) usuário(a) final (PU-001, Dra. Camila Andrade); analista de BI corporativo sem responsabilidade sanitária sobre o indicador |
| Confidence | **Proto / Low** — nenhuma entrevista direta. Esta persona nasce como **hipótese formal** para a pergunta em aberto nº 2 de `persona-gestor-hospitalar.md` ("apetite por relatório exportável vs. dashboard vivo") e para a nº 3 (se a persona do gestor precisa ser dividida em duas). Deve ser confirmada ou descartada por pesquisa, não assumida como verdadeira |
| Last validated | 2026-09-07 |
| Owner | Equipe do desafio "Saúde do Médico" — 1ª Jornada Incubintech |

**Quick orientation.** O Persona Card é a referência de uso diário — extraia como um resumo de uma página. Seções 1-4 dão contexto e motivação. Seções 5-8 descrevem comportamento e fluxo de trabalho. Seções 9-11 traduzem insight em decisões de produto. Evidence & Confidence calibra a confiança.

**Relação com PU-002.** Rafael e Beatriz não competem pela mesma tela: ele produz a leitura, ela carrega a conclusão. Beatriz tem pouca paciência para interpretação estatística e não explora o produto sozinha; Rafael tem as duas coisas, e é justamente por isso que ele é quem descobre um erro de metodologia antes da fiscalização descobrir. Projetar só para Beatriz produz um painel que nunca resiste ao primeiro exame sério. Projetar só para Rafael produz um painel que a decisora não consegue usar. A regra que resolve o par está na seção 11: **profundidade sob demanda, nunca como estado inicial**.

---

## Persona Card

**Rafael Tissiani — O Analista Que Precisa Reproduzir o Número**
Rafael, 38 anos, é enfermeiro de formação e coordena o núcleo de qualidade e gestão de indicadores de um hospital de ~300 leitos. É ele quem monta as planilhas de indicadores assistenciais e ocupacionais, alimenta o PGR exigido pela NR-1 e prepara o material que a diretoria clínica leva ao conselho. Ele não decide sobre escala médica nem sobre contratação, mas nenhuma dessas decisões acontece sem passar pelo número que ele produziu — e a credibilidade dele depende inteiramente de esse número resistir a ser questionado.

**Key quote:** "Não me dá o gráfico bonito, me dá a linha. Se eu não consigo refazer a conta na minha planilha e chegar no mesmo número, eu não levo isso pra diretoria — porque na hora que alguém perguntar 'de onde saiu esses 47%?' quem fica sem resposta sou eu, não o sistema."

**Goals.** Produzir um conjunto de indicadores de risco psicossocial que ele mesmo consiga defender linha por linha; enxergar o quadro por equipe e o quadro do hospital na mesma sessão de trabalho, sem trocar de ferramenta; identificar qual variação é movimento real e qual é ruído de amostra pequena, antes de recomendar uma ação; entregar à diretoria clínica um material que ela possa apresentar sem precisar chamá-lo para explicar.

**Frustrations.** Painéis que mostram percentual sem denominador, o que o obriga a tratar 47% de 8 respostas e 47% de 180 como se fossem a mesma informação; ter que exportar para o Excel para fazer qualquer recorte que a tela não previu; síntese automática que ele não consegue auditar contra os dados de origem; descobrir que o rótulo na tela e o conteúdo do arquivo exportado descrevem coisas diferentes.

**Design rules - always.** Sempre expor o denominador junto do percentual, em qualquer superfície onde o percentual apareça; sempre permitir que os filtros se combinem (setor × período × comparação) em vez de oferecer só recortes pré-definidos; sempre documentar na própria ferramenta o método — escala usada, limiar, janela, regra de supressão — de forma citável.

**Design rules - never.** Nunca mostrar um número na tela que não seja reproduzível a partir do arquivo exportado; nunca apresentar interpretação automática sem os dados que a sustentam ao alcance; nunca usar um rótulo de negócio ("burnout") para uma medida que é tecnicamente outra coisa sem dizer qual é.

---

## 1. Demographics & Identity

| Attribute | Detail |
| --- | --- |
| Age | 38 anos |
| Location | Grande Florianópolis / Vale do Itajaí, SC |
| Education | Graduação em Enfermagem + especialização em Qualidade e Segurança do Paciente; curso de epidemiologia aplicada ou gestão de indicadores em saúde |
| Role | Coordenador do núcleo de qualidade e gestão de indicadores; responsável técnico pela alimentação do PGR na parte de risco psicossocial |
| Company size | Hospital de médio porte (~300 leitos) ou rede/cooperativa regional |
| Team | Núcleo pequeno — ele mais 1 a 3 analistas/estagiários; sem equipe de dados dedicada |
| Reports to | Diretoria clínica (PU-002, Beatriz) → Diretoria-geral |
| Stakeholders | Diretoria clínica; SESMT; RH; coordenadores de setor; auditoria de acreditação (ONA/certificações) e fiscalização do trabalho |
| Purchasing role | Influencer — não assina o contrato, mas a recomendação técnica dele derruba ou sustenta a compra que Beatriz assina |
| Accessibility | Desktop institucional, frequentemente dois monitores; trabalha com o painel de um lado e a planilha do outro; uso pontual em notebook ao preparar reunião |

**Career stage and trajectory.** Está no meio da carreira e construiu a própria posição sobre uma competência específica: transformar dado assistencial bagunçado em indicador defensável. Não quer virar gestor assistencial — quer ser a pessoa cuja análise ninguém contesta. Isso faz dele um adotante entusiasmado de qualquer ferramenta que aumente o rigor do trabalho dele, e um crítico implacável de qualquer uma que peça que ele confie sem verificar.

**Organizational leverage.** Tem pouca autoridade formal e influência técnica desproporcional: ele não decide nada sobre escala médica, mas praticamente toda decisão sobre carga e cobertura passa por um número que ele montou. Quando ele erra, quem é exposta publicamente é a diretora clínica — o que torna a relação dos dois altamente dependente de ele nunca entregar um número frágil.

---

## 2. Technology & Environment Context

| Tool | Role |
| --- | --- |
| Excel / Google Sheets | Ferramenta central de trabalho — todo indicador de outra fonte acaba aqui para ser recortado, comparado e conferido |
| Sistema de gestão hospitalar (ERP/prontuário) + extrações CSV | Origem dos indicadores assistenciais e de RH; ele já vive de exportar e cruzar |
| Software de PGR/SST e documentação de acreditação | Destino final do que ele produz; formato rígido, exige rastreabilidade da fonte |
| Power BI ou similar (quando o hospital tem) | Usado com desconfiança — costuma ser mantido por TI e ficar defasado em relação à planilha dele |

**Digital fluency level.** Alta para dados, não para engenharia: domina tabela dinâmica, `PROCV`, média móvel, e sabe o que é intervalo de confiança sem necessariamente saber calculá-lo de cabeça. Não vai escrever SQL nem consumir uma API, mas lê um CSV com naturalidade e percebe na hora quando duas colunas não fecham. O ponto onde ele trava não é complexidade — é opacidade: ele aceita um cálculo difícil desde que descrito, e rejeita um cálculo simples que não esteja explicado.

**Adoption and abandonment patterns.** Adota testando: pega o primeiro número que a ferramenta mostra e tenta reproduzi-lo por fora. Se bate, a ferramenta ganha um crédito grande de confiança e ele passa a explorar o resto. Se não bate — ou se não há como tentar, porque a exportação não traz a granularidade da tela — ele não reclama, apenas rebaixa a ferramenta a "fonte de referência" e volta a trabalhar na planilha. Esse rebaixamento é silencioso e quase sempre definitivo.

**Work environment.** Trabalha em blocos longos e relativamente protegidos — tem, sim, uma manhã inteira para entender um indicador, e essa é a diferença comportamental mais importante em relação a PU-002. Interrupções vêm de coordenadores de setor pedindo recorte específico ("me manda só o meu setor, dos últimos três meses"), o que o obriga a produzir versões sob demanda que a ferramenta raramente cobre.

---

## 3. Jobs to Be Done

**Functional.** Quando precisa fechar o ciclo mensal de indicadores ou responder a um pedido de recorte de um coordenador, ele precisa navegar do agregado do hospital até o detalhe de uma equipe e voltar, cruzando setor, período e comparação entre períodos, para chegar a uma recomendação que ele consiga sustentar tecnicamente — sem nunca acessar nada individual, o que para ele é uma restrição confortável e não um obstáculo.

**Emotional.** Quando entrega uma análise, ele quer se sentir imune a ser desmontado — que nenhuma pergunta de diretoria, auditor ou coordenador cético o pegue sem resposta — para que o trabalho dele seja tratado como evidência, não como opinião.

**Social.** Quer ser a pessoa que a diretoria chama quando o número precisa estar certo, e quer que os coordenadores de setor o vejam como alguém que traz leitura útil sobre a equipe deles, não como o núcleo de qualidade que cobra planilha.

**Underlying.** No fundo, ele está construindo autoridade a partir de método, não de cargo: é a única forma de influência disponível para alguém sem poder hierárquico. Por isso qualquer ferramenta que peça confiança sem oferecer verificação ameaça diretamente a fonte da influência dele — não é preciosismo técnico, é sobrevivência profissional. Uma ferramenta que o torna mais auditável o torna mais poderoso, e ele vai defendê-la internamente com um empenho desproporcional ao que a ferramenta custou.

---

## 4. Goals & Motivations

**Life goal.** Ser reconhecido como a referência técnica de gestão de indicadores da instituição — a pessoa cuja análise vira decisão sem precisar de aval de mais ninguém.

**Indicador defensável linha a linha.** Chegar a um conjunto de números de risco psicossocial que ele possa explicar da origem ao resultado — implica que o produto exponha método, denominador e regra de supressão como parte do dado, não como texto de rodapé.

**Uma única sessão de trabalho, do hospital à equipe.** Fazer a análise inteira sem trocar de ferramenta nem exportar no meio do caminho — implica filtros componíveis e navegação entre nível agregado e nível de setor dentro do mesmo painel.

**Separar movimento de ruído.** Saber quais variações merecem uma ação e quais são flutuação de amostra pequena — implica que o produto comunique incerteza junto do valor, em vez de entregar percentuais igualmente confiantes.

**Autonomia para o recorte inesperado.** Atender ao pedido de um coordenador sem depender de alguém do Zelo nem de uma feature nova — implica exportação bruta em granularidade igual ou maior que a da tela.

**Sensação de rigor, não de simplificação.** Quer que a ferramenta o trate como alguém capaz de lidar com nuance; texto que explica demais o óbvio e esconde o método o irrita mais do que ajuda.

**Confiança que ele consegue transferir.** Quer sair do painel com material que sustente a conversa seguinte — com a diretora, com o coordenador, com o auditor — sem ele precisar estar na sala.

---

## 5. Behavioral Patterns & Mental Models

**Core mental model.** Rafael trata todo indicador como uma afirmação que vai ser contestada. Antes de olhar o que o número diz, ele olha de onde ele veio: qual a base, qual o recorte, o que foi excluído. O vocabulário dele é o da epidemiologia aplicada — numerador, denominador, janela, viés de seleção — e é assim que ele lê qualquer tela, mesmo uma que não foi desenhada nessa linguagem. Consequência prática: um percentual sem denominador não é, para ele, uma informação incompleta; é uma informação **suspeita**, porque o desenho que esconde o denominador normalmente esconde uma base pequena. E a supressão por k-anonimato não o incomoda — ele reconhece nela a mesma lógica que já aplica em indicador de evento raro. O que o incomoda é não saber **quanta coisa** foi suprimida.

**Primary work pattern.** Predominantemente proativo e cíclico: fecha indicadores em blocos mensais, com picos trimestrais ligados a acreditação e reporte. Cria mais do que consome — o output dele é o insumo de outras pessoas. A parte reativa é o pedido de recorte pontual, que ele gostaria de reduzir dando autonomia aos coordenadores, mas hoje faz na mão.

**Accuracy and quality approach.** Verifica por reprodução: refaz o cálculo em paralelo pelo menos uma vez por fonte nova. "Bom o suficiente" para ele é "eu consigo mostrar como cheguei aqui" — precisão decimal importa pouco, rastreabilidade importa quase tudo. Um número aproximado com método claro passa; um número exato de origem obscura não.

**Tolerance thresholds.** Tem paciência longa para complexidade e paciência curtíssima para opacidade. Investe uma manhã entendendo uma metodologia bem documentada e desiste em dois minutos de uma tela que não deixa ver a base de cálculo. Também perde a paciência com filtro que não compõe: se precisa escolher entre filtrar por setor **ou** por período, ele já abriu o Excel.

---

## 6. Decision-Making & Trust Patterns

**How trust is built and broken.** A confiança dele se constrói num único teste bem-sucedido — reproduzir um número da tela por fora — e depois se acumula rápido. Quebra também num único evento: encontrar uma divergência entre a tela e o export, ou um rótulo que descreve a medida errada. Diferente de Beatriz, cuja quebra de confiança é sobre privacidade, a de Rafael é sobre **integridade do dado**: descobrir que "sinais de burnout" na verdade conta PHQ-9/GAD-7 acima da faixa leve não o faz achar o produto invasivo, o faz achar o produto descuidado — e um produto descuidado num lugar é presumidamente descuidado em outros que ele ainda não checou.

**Adoption filter.** "Consigo refazer esse número?" → "O que exatamente foi suprimido e quanto isso pesa?" → "Consigo recortar do meu jeito ou só do jeito que previram?" → "Se um auditor perguntar da metodologia, tem onde eu apontar?" → "O que sai no arquivo é o mesmo que está na tela?"

**Risk profile.** Avesso a risco de reputação técnica, tolerante a risco de esforço: topa investir horas explorando uma ferramenta nova, e não topa colocar o nome dele em um número que não conferiu. Prefere entregar uma análise com incerteza declarada a uma análise limpa que possa desmoronar.

**Feature discovery behavior.** Explora ativamente — clica em tudo, abre todo filtro, testa combinações que ninguém previu, e é o primeiro a encontrar o estado vazio que ninguém desenhou. É o oposto exato de PU-002 nesse eixo: enquanto Beatriz precisa que o valor seja apontado explicitamente, Rafael encontra sozinho e ainda documenta para os outros. Isso o torna um multiplicador interno barato e, ao mesmo tempo, o detector de bugs mais rápido que o produto tem.

---

## 7. Workflow & Collaboration Context

**Work rhythm.** Ciclo mensal com picos trimestrais, e blocos de foco de 2 a 4 horas reservados para análise — o recurso que PU-002 não tem. É nesses blocos que ele consome profundidade, e é por isso que a profundidade pode viver a um clique de distância sem prejudicar ninguém: ele vai procurar.

**Collaboration model.** Criador e curador. Produz o material que a diretoria clínica apresenta e que os coordenadores de setor consomem. Raramente é o consumidor final de alguma coisa — quase tudo que ele lê vira insumo de outro documento.

**Key collaboration friction.** Os coordenadores de setor querem o recorte do próprio setor e não têm como obtê-lo sozinhos, então cada pedido vira trabalho manual dele; e a diretoria às vezes pede uma conclusão mais afirmativa do que a amostra sustenta, empurrando-o a ou enfraquecer a ressalva ou parecer inconclusivo. Um painel que já entrega o recorte por setor com a incerteza declarada resolve os dois atritos de uma vez.

**Dependencies.** Depende da adesão dos médicos para ter denominador que sustente análise; depende de a metodologia do Zelo permanecer estável entre períodos, porque uma mudança silenciosa de limiar ou de janela quebra a série histórica que ele monta há meses — e ele descobriria isso do pior jeito, no meio de uma apresentação.

---

## 8. Current Alternatives & Workarounds

**Primary alternative.** Uma planilha mestre que ele mantém há anos, alimentada por exportações de várias fontes e por indicadores digitados à mão. É lenta, frágil e dependente dele, mas faz exatamente o recorte que ele quer e ele conhece cada célula — é a alternativa mais difícil de bater, porque compete em flexibilidade, não em funcionalidade.

**Where the product enters.** O Zelo entra como a primeira fonte estruturada de sinal de sofrimento da equipe médica — dado que hoje simplesmente não existe na planilha dele. Essa posição é forte no conteúdo e frágil no formato: se o painel não entregar granularidade exportável, o Zelo vira uma célula digitada à mão na planilha, e um número digitado à mão é um número que ninguém revisita.

**The firing trigger.** Encontrar um valor na tela que ele não consegue reconstruir a partir do que a ferramenta exporta. Não gera reclamação nem churn imediato — gera rebaixamento silencioso a "fonte de referência", e a partir daí o painel deixa de ser visitado. O sinal de alerta observável não é cancelamento; é a frequência de acesso dele caindo enquanto a exportação continua.

---

## 9. Pain Points & Unmet Needs

**Percentual sem denominador.** A tela mostra taxa e esconde a base, então ele não consegue distinguir um movimento real de uma oscilação de amostra pequena. Persiste porque denominador polui o design e quase todo painel opta pela limpeza visual. Custa a ele uma exportação e um cruzamento manual toda vez que precisa citar o número.

**Filtro que não compõe.** Ele pode filtrar por setor, mas não combinar setor com período nem comparar dois períodos na mesma tela. Persiste porque cada combinação nova é uma decisão de produto, e o caminho barato é oferecer recortes pré-definidos. Custa o abandono da ferramenta no meio da análise — exatamente o momento em que ela deveria estar provando valor.

**Interpretação automática não auditável.** Uma síntese gerada por IA é útil como rascunho e inútil como evidência, porque ele não consegue amarrar cada afirmação ao dado que a sustenta. Persiste porque a síntese é desenhada para quem quer pular a análise, não para quem vai fazê-la. Custa credibilidade: ele não repassa uma conclusão que não consegue rastrear, então a feature que mais economiza tempo de Beatriz é a que ele mais ignora.

**Método não citável.** A regra de supressão, o limiar do que conta como sinal e a janela de agregação existem no produto mas não em um lugar que ele possa apontar para um auditor. Persiste porque metodologia é vista como documentação, não como parte do dado. Custa a ele reescrever a explicação por conta própria a cada ciclo de reporte — e a versão dele pode divergir da real sem ninguém perceber.

**Invisibilidade do que foi suprimido.** Ele aceita o k-anonimato, mas hoje não sabe quantos setores ficaram de fora nem quanto do total eles representam — um painel de 60% da instituição e um de 95% parecem idênticos na tela. Persiste porque mostrar a supressão parece expor uma fraqueza do produto. Custa o risco mais caro possível: ele generalizar para o hospital inteiro uma leitura que vale para pouco mais da metade dele.

**Instabilidade silenciosa de metodologia.** Se o limiar ou a janela mudarem entre versões sem aviso, a série histórica que ele mantém quebra sem sinal. Persiste porque mudanças de regra são tratadas como detalhe de implementação. Custa, no pior caso, uma apresentação à diretoria com números que não conversam com os do trimestre anterior.

---

## 10. Success Definition & Quality Bar

**Accuracy standard.** "Correto" é **reproduzível**: dado o que a ferramenta exporta e o método que ela documenta, ele chega ao mesmo número. Um valor arredondado com regra explícita passa; um valor exato sem origem rastreável não passa. É um padrão diferente do de PU-002 — ela quer defensável em discussão, ele quer reproduzível em conferência, e o segundo é estritamente mais exigente.

**Timeliness standard.** Tolerante: dado consolidado semanal é mais do que suficiente, e ele prefere um número estável com uma semana de atraso a um número em tempo real que muda enquanto ele analisa. O que ele exige é que a data de corte esteja declarada.

**Self-sufficiency standard.** O output precisa sustentar a conversa seguinte sem ele presente — tanto a exportação quanto a tela precisam carregar consigo base, período e método, porque ele não estará na sala quando alguém questionar.

**Quality bar by context.** No fechamento mensal de rotina, bom o suficiente é a série por setor com denominador visível. Para alimentar o PGR ou uma auditoria de acreditação, a régua sobe para rastreabilidade completa — método citável, data de corte e escopo de supressão declarados. Para responder ao pedido pontual de um coordenador, a régua desce para "recorte rápido e correto", e a velocidade passa a valer mais que o formato — é o único contexto em que ele aceita um número sem conferir, porque não vai assinar nada com ele.

---

## 11. Design Principles & Tradeoff Heuristics

1. **Profundidade sob demanda sobre profundidade padrão** — a tela inicial continua sendo a de PU-002 (poucos números, linguagem de gestão); todo o detalhe de Rafael vive a um clique, em painel expansível ou rota própria. Esta regra é o que permite atender os dois arquétipos sem construir dois produtos, e ela vence qualquer proposta de "só colocar mais um indicador na home".
2. **Denominador visível sobre número limpo** — onde houver percentual, mostrar a base. Quando o espaço não comportar, o denominador vai para o tooltip, nunca para lugar nenhum. Um percentual sozinho não economiza espaço; ele transfere para o leitor um trabalho que só Rafael consegue fazer.
3. **Método reproduzível sobre síntese pronta** — a análise automática pode existir e ajuda PU-002, mas nunca ocupa o lugar dos dados que a sustentam: toda afirmação sintética precisa ter, ao alcance, o número de onde saiu. Síntese sem lastro não é atalho para Rafael, é motivo de descarte.
4. **Incerteza declarada sobre precisão aparente** — quando a base é pequena, dizer isso na própria superfície do indicador vale mais do que entregar um percentual de aparência confiante. Vale para os dois arquétipos: protege Beatriz de decidir errado e ganha Rafael de vez.
5. **Filtro componível sobre atalho pré-definido** — investir em combinar setor × período × comparação vale mais que adicionar mais um recorte pronto, porque o recorte que ele precisa hoje é justamente o que ninguém previu. Um filtro que não compõe empurra a análise para o Excel na metade do caminho.
6. **Exportação bruta sobre exportação formatada** — o PDF apresentável serve a PU-002 e deve continuar existindo; o CSV com granularidade igual ou maior que a da tela é o que mantém Rafael dentro do produto. Quando os dois competirem por esforço, o CSV vem primeiro, porque é ele que sustenta a confiança de que o PDF depende.
7. **Paridade entre tela e export sobre riqueza de qualquer um dos dois** — antes de adicionar um indicador em uma das superfícies, garantir que a outra o acompanhe. Uma divergência entre as duas é o gatilho de abandono descrito na seção 8, e vale mais evitar isso do que ganhar um indicador novo.
8. **Estabilidade de método sobre melhoria silenciosa** — mudar limiar, janela ou regra de supressão exige registro visível e datado no produto. Uma melhoria metodológica não anunciada quebra a série histórica dele e destrói mais confiança do que o ganho da própria melhoria.

---

## Evidence & Confidence

| Source | Type | Detail |
| --- | --- | --- |
| PU-002-OQ | Documento interno | `persona-gestor-hospitalar.md`, perguntas em aberto nº 2 e nº 3 — esta persona é a formalização da hipótese ali registrada (apetite por dashboard vivo vs. relatório; possível divisão da persona do gestor em duas) |
| ENT-01 | Interview (parcial) | Dr. David Mendes, gestor médico de PS/UTI, 02/07/2026 — indício indireto de que existe papel de gestão intermediária consumindo indicador; não abordou perfil analítico |
| ACM-01 | Documento externo | Resposta formal da ACM (Dr. Marcello Alberton Herdt), 19/07/2026 — prioriza "número de questionários respondidos e taxa de resposta do follow-up", ambos métricas de base/denominador, coerentes com o comportamento desta persona (PRD FR-17) |
| COD-01 | Analytics de produto (código) | O modelo `Signal` agrega em `(instituição, setor, semana)` com `checkIns` e `concerning`; o denominador existe no banco e hoje não chega à tela em `weeklyTrend`. A dor "percentual sem denominador" da seção 9 é uma limitação real e verificável do produto, não uma inferência sobre a persona |
| NR1-01 | Contexto regulatório | NR-1 / GRO-PGR, fiscalização plena a partir de maio/2026 — a exigência de rastreabilidade metodológica é do regime, não uma preferência pessoal inventada para a persona |

**Validated.** Nada do comportamento desta persona é validado por entrevista direta. Dois elementos, porém, não são inferência: a lacuna de denominador descrita na seção 9 é um fato do código (COD-01), e a exigência de rastreabilidade para PGR decorre do próprio regime da NR-1 (NR1-01). As **regras de design** da seção 11 são, portanto, defensáveis mesmo que a persona venha a ser descartada — elas se sustentam no produto e na norma, não no arquétipo.

**Assumed.** Todo o restante — a existência do papel como pessoa distinta da diretoria clínica, o teste de reprodução como filtro de adoção, o padrão de abandono silencioso, a disponibilidade de blocos de 2 a 4 horas — é inferência a partir de como núcleos de qualidade operam em hospitais de porte médio no Brasil. Validar exige entrevistar quem hoje monta os indicadores, não quem os apresenta: uma entrevista com Beatriz não valida Rafael, e é exatamente esse o erro mais provável na próxima rodada de pesquisa.

**Open questions.**

1. Em hospital de médio porte em SC, quem de fato monta o indicador de risco psicossocial para o PGR — existe um núcleo de qualidade com essa atribuição, ou isso cai no SESMT, no RH ou na própria diretoria clínica? A resposta decide se PU-003 é uma pessoa real ou um modo de trabalho de PU-002.
2. Se a pessoa existe, ela receberia login próprio no Zelo, ou operaria pela conta da diretoria? Isso muda o modelo de permissão: hoje `ManagerRole` só distingue `HOSPITAL_ADMIN` de `SECTOR_MANAGER`, e nenhum dos dois descreve "analista com visão institucional e sem poder administrativo".
3. O teste de reprodução ("refazer o número por fora") é mesmo o filtro de adoção decisivo, ou basta metodologia documentada sem exportação granular? A resposta muda a prioridade relativa entre o CSV bruto e a seção de metodologia — hoje os dois estão empatados no backlog e não deveriam estar.

**Governance.** Proto até a primeira entrevista com alguém que ocupe a função de montar indicadores institucionais — não com um decisor. Revisar junto com PU-002, já que as duas se definem por contraste e uma mudança em qualquer delas afeta a outra. Critério de promoção: "Directional" com 1 entrevista direta; "Validated" com 3 convergentes. **Critério de aposentadoria:** se a pesquisa mostrar que o perfil analítico não é uma pessoa separada, esta persona deve ser retirada e suas regras de design migradas para PU-002 como um modo de uso — as regras da seção 11 sobrevivem à aposentadoria da persona, porque nenhuma delas depende de o arquétipo existir. Próxima ação de pesquisa: incluir a pergunta "quem monta o número que você apresenta?" no roteiro da primeira entrevista com gestor hospitalar real.
