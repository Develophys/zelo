---
artifact_type: persona
version: "2.6.0"
generated_by_skill: foundation-persona
mode: product
context: Persona exploratória para um segmento ainda não construído ("Zelo Health" para faculdades de medicina). Gerada por analogia à médica plantonista já validada como formato de referência (persona.md, Dra. Camila Andrade), a partir de um sinal de brainstorm não desenvolvido (branstorms.md) e de literatura pública sobre burnout em estudantes de medicina. Nenhuma entrevista real foi feita com um aluno de medicina. Persona irmã: persona-diretor-escola-medicina.md.
---

# Lucas Menezes — O Interno Que Não Pode Parecer Fraco Antes de Formar

**Estudante do internato médico (5º/6º ano) em uma faculdade brasileira, que esconde sinais de esgotamento porque teme que qualquer registro de sofrimento psíquico chegue à coordenação que também avalia sua nota, sua aprovação e — no fim da linha — sua entrada no mercado de trabalho.**

| Campo | Valor |
| --- | --- |
| Persona ID | PU-004 |
| Tipo | Primária — **exploratória**: modela o usuário final de um segmento novo ("Zelo Health") que ainda não existe como produto |
| Escopo do produto | Hipotético: autoavaliação (mesmas escalas da persona médica, PHQ-9/GAD-7), chat de acolhimento por IA e chat anônimo entre colegas de turma — nada disso foi adaptado ou construído especificamente para este público ainda |
| Válida para | Estudantes de Medicina no Brasil, com ênfase em fases de maior carga assistencial (internato, rodízios de UTI/PS), com sinais de sofrimento psíquico não tratado |
| Não válida para | Médico(a) plantonista já formado(a) (ver `persona.md`, Dra. Camila Andrade — vínculo empregatício, não formativo); coordenador(a)/diretor(a) da faculdade (ver `persona-diretor-escola-medicina.md`, persona irmã — papel de comprador/gestor institucional, não de usuário final); estudantes de outras graduações da área da saúde (enfermagem, psicologia etc. — não mapeados aqui) |
| Confiança | Proto — nenhuma entrevista real com um estudante de medicina foi feita. Inferida por analogia direta à persona primária já validada como formato (Dra. Camila Andrade) e por literatura pública geral sobre saúde mental de estudantes de medicina — não específica da Zelo |
| Última validação | 2026-09-08 |
| Owner | Equipe Zelo — exploração de segmento (ainda não formalizada como iniciativa) |

**Nota sobre confiança:** assim como a persona irmã do coordenador (`persona-diretor-escola-medicina.md`), esta persona nasce de uma nota de brainstorm curta e de segunda mão (`branstorms.md`), sem nenhuma faculdade ou estudante real envolvido até 2026-09-08. Serve para levantar hipóteses de design a testar, não para substituir entrevistas reais.

**Quick orientation.** O Persona Card é a referência de uso diário. Seções 1-4 dão contexto e motivação. Seções 5-8 descrevem comportamento e fluxo de trabalho. Seções 9-11 traduzem insight em decisões de produto. Evidência & Confiança calibra a confiança.

---

## Persona Card

**Lucas Menezes — O Interno Que Não Pode Parecer Fraco Antes de Formar**
Lucas, 24 anos, está no internato (últimos dois anos do curso de Medicina), fazendo rodízio em UTI e Pronto-Socorro. Além da carga assistencial pesada, ainda depende da faculdade para se formar, ser aprovado nos estágios e — depois — conseguir uma boa carta de recomendação para residência. Vem sentindo exaustão, ansiedade antes dos plantões e distanciamento dos colegas, mas nunca comentou isso com ninguém da coordenação.

**Frase-chave (hipotética — nenhuma entrevista real ainda):** "Se o coordenador souber que eu não tô bem, isso não fica só entre mim e ele — ele também assina minha avaliação de estágio. Não dá pra separar as duas coisas."

**Objetivos.** Terminar o internato e ser aprovado sem que o sofrimento psíquico apareça em nenhuma avaliação formal; entender se o que sente é "só cansaço de rodízio pesado" ou algo que precisa de atenção real; ter alguém para conversar sobre isso sem que vire assunto na faculdade; eventualmente buscar ajuda de verdade, no seu tempo, sem que isso comprometa a carta de recomendação para a residência.

**Frustrações.** O NAE/apoio psicopedagógico da faculdade, quando existe, é visto como ligado à própria instituição que também o avalia; não tem tempo, entre rodízios e plantões, para terapia particular regular; teme que qualquer autoavaliação formal vire documento que alguém da coordenação possa acessar; já viu ou ouviu falar de colegas "marcados" informalmente depois de pedir dispensa por saúde mental.

**Regras de design — sempre.** Sempre calcular e mostrar o resultado da autoavaliação sem que o dado bruto saia do dispositivo dele — mesma regra da persona médica; sempre deixar claro que a coordenação da faculdade nunca vê dado individual, em toda tela onde isso possa gerar dúvida; sempre oferecer, nunca forçar, o próximo passo de ajuda.

**Regras de design — nunca.** Nunca enviar dado identificável para a faculdade que financia a ferramenta; nunca deixar que o "par anônimo" seja identificável por contexto de turma (ex.: detalhes do rodízio, nome do professor) que um colega de turma reconheceria; nunca emitir diagnóstico dentro do chat de IA.

---

## 1. Demografia & Identidade

| Atributo | Detalhe |
| --- | --- |
| Idade | ~22-26 anos (hipótese — internato ocorre nos dois últimos anos do curso) |
| Localização | Faculdade de medicina de médio porte, mesma região hipotética da persona do coordenador |
| Formação | Cursando Medicina, fase de internato (5º/6º ano) |
| Cargo | Estudante — sem vínculo empregatício formal com o hospital onde faz rodízio |
| Porte da organização | Faculdade de médio porte + hospital(is)-escola onde cumpre o rodízio |
| Equipe | Turma de internato (dezenas de colegas), preceptores/professores-tutores por rodízio |
| Reporta a | Preceptor do rodízio → coordenação de internato → coordenação geral do curso |
| Stakeholders | Preceptores que avaliam seu desempenho clínico; colegas de turma; pacientes atendidos no rodízio |
| Papel de compra | Nenhum — não decide nem influencia a adoção da ferramenta (ver persona do coordenador); é puramente usuário final |
| Acessibilidade | Hipótese, por analogia à persona médica: uso predominante em smartphone pessoal, em pausas curtas do rodízio |

**Estágio e trajetória de carreira.** Está no momento de maior exposição avaliativa de toda a formação — cada rodízio gera uma nota que compõe seu histórico, e é essa mesma fase que definirá as cartas de recomendação para a residência. Qualquer mancha percebida pesa de forma ainda mais direta na carreira do que pesaria para um médico já formado, cuja reputação profissional já está mais consolidada.

**Influência organizacional.** Tem influência organizacional mínima — é avaliado, não avalia; ao contrário do gestor hospitalar ou mesmo da médica plantonista (que já tem alguma seniority clínica), o estudante não tem nenhuma posição de troca com quem o avalia, o que pode aumentar a sensação de vulnerabilidade. **Hipótese não testada.**

---

## 2. Tecnologia & Contexto de Ambiente

| Ferramenta | Papel |
| --- | --- |
| WhatsApp/grupos de turma | Comunicação entre colegas, escalas de rodízio, apoio informal entre pares |
| Sistema acadêmico da faculdade | Notas, frequência, avaliações de estágio — não tem módulo de saúde mental |
| Prontuário eletrônico do hospital-escola | Registro clínico dos pacientes atendidos, não da própria saúde do estudante |
| Instagram/redes sociais | Válvula de escape rápida entre plantões do rodízio |

**Fluência digital.** Hipótese: fluência digital pelo menos igual à da médica plantonista (geração mais jovem), com ainda menos paciência para processos burocráticos de cadastro/verificação.

**Padrões de adoção e abandono.** Hipótese por analogia direta à persona médica: adota rápido se o primeiro uso já entrega valor percebido sem pedir identificação antecipada; abandona no primeiro sinal de que a confidencialidade é só discurso — possivelmente com limiar de desconfiança ainda mais baixo, dado o vínculo formativo com quem administra a ferramenta.

**Ambiente de trabalho.** Celular pessoal, entre atividades do rodízio, muitas vezes em pé no corredor do hospital-escola ou na sala de descanso dos internos; sessões curtas, interrompidas a qualquer momento.

---

## 3. Jobs to Be Done

**Funcional.** Quando percebe sinais de esgotamento durante um rodízio pesado, ele precisa entender objetivamente se é "só cansaço" ou algo que exige atenção, para decidir se e como buscar ajuda — sem que isso apareça em nenhuma avaliação de estágio.

**Emocional.** Quando busca esse entendimento, ele quer se sentir seguro e não julgado, principalmente por alguém que também vai assinar sua próxima avaliação de rodízio.

**Social.** Quer ser visto pelos colegas de turma e pelos preceptores como o interno competente e resiliente que "aguenta o tranco" — a mesma pressão de imagem da médica plantonista, mas com o agravante de que a turma vai conviver por mais anos e a reputação social entre pares tende a durar além da faculdade.

**Subjacente.** Ele negocia uma versão ainda mais aguda da tensão da persona médica: cuidar de pacientes é a base da identidade profissional que está construindo, e admitir sofrimento psíquico nesse momento de formação ameaça não só a autoimagem, mas literalmente a nota e a carta de recomendação que definem o próximo passo da carreira. **Hipótese central a validar:** essa fusão entre avaliação acadêmica e cuidado é o que mais diferencia este público do médico já empregado.

---

## 4. Objetivos & Motivações

**Objetivo de vida.** Se formar e seguir a carreira médica sem que o sofrimento psíquico do internato vire uma marca permanente — nem no histórico acadêmico, nem na própria relação com a profissão.

**Autoconhecimento seguro.** Entender com clareza se está em burnout, ansiedade ou depressão, com as mesmas escalas validadas já usadas na persona médica (PHQ-9, GAD-7) — implica feedback imediato, sem jargão, sem dado saindo do dispositivo.

**Ajuda sem exposição acadêmica.** Conseguir conversar sobre o que sente sem que isso chegue à coordenação que avalia seu estágio — implica anonimato tecnicamente real perante a instituição de ensino, não apenas perante o hospital onde faz rodízio.

**Rede de apoio entre pares — com um cuidado a mais.** Sentir que não é o único da turma passando por isso, mas sem correr o risco de ser reconhecido por um colega que já convive com ele há anos — **tensão em aberto, não resolvida**: o vínculo de turma pode tornar o par anônimo mais fácil de confiar (já existe proximidade) ou mais arriscado (mais fácil de reconhecer pelo estilo de escrita ou pelo contexto do rodízio que só a turma dele vive).

**Meta de experiência 1.** Sentir alívio, não mais uma avaliação de desempenho disfarçada, ao abrir o app.

**Meta de experiência 2.** Sentir que pode parar de usar a qualquer momento sem que isso seja percebido por ninguém da faculdade.

**Meta de experiência 3.** Sentir que, se piorar, existe uma porta de emergência clara, que não passa pelo mesmo canal que avalia seu desempenho acadêmico.

---

## 5. Padrões Comportamentais & Modelos Mentais

**Modelo mental central (hipótese).** Por analogia direta à médica plantonista, é plausível que Lucas trate qualquer canal de saúde mental ligado à faculdade como extensão da própria estrutura que o avalia — ainda mais do que a médica trata o hospital como extensão do RH, porque a faculdade literalmente assina sua aprovação. Ele provavelmente só confiaria se a arquitetura de privacidade for verificável (ex.: "processado no seu aparelho"), não apenas prometida. **Não confirmado por entrevista.**

**Padrão de trabalho principal.** Ciclos de rodízio intensos e reativos (plantões, escalas do internato), com janelas curtas de tempo pessoal — provavelmente ainda mais fragmentado que o da médica plantonista, já que o estudante muitas vezes não tem nem a autonomia de horário que um médico contratado tem.

**Padrão de qualidade.** Hipótese por analogia: como está em formação clínica, reconhece e valoriza instrumentos validados (PHQ-9/GAD-7) da própria grade curricular — pode inclusive reconhecer os instrumentos de disciplinas de psiquiatria/saúde mental que já cursou.

**Limiares de tolerância.** Hipótese: zero tolerância a qualquer campo que pareça registro acadêmico disfarçado; provavelmente abandona mais rápido que a médica plantonista diante do menor sinal de que o dado poderia chegar a um preceptor ou à coordenação.

---

## 6. Padrões de Decisão & Confiança

**Como a confiança se constrói e se quebra (hipótese).** Por analogia: uma única suspeita de que a coordenação teve acesso a qualquer dado individual destruiria a confiança de forma irreversível — e, diferente do hospital (onde os médicos de plantão rotam e nem sempre se conhecem bem), a turma de faculdade convive por anos, então a notícia se espalharia rápido entre todos os colegas.

**Filtro de adoção (hipótese).** "Isso pode chegar à coordenação que avalia meu estágio?" → "Isso vira parte do meu histórico acadêmico?" → "Um colega da minha turma consegue descobrir que fui eu?" → "Quem mais da minha turma já confia nisso?"

**Perfil de risco.** Hipótese: tão ou mais avesso a risco reputacional que a médica plantonista, com o agravante do vínculo avaliativo formal (nota, aprovação, carta de recomendação) que ela não tem da mesma forma com o hospital.

**Descoberta de funcionalidades.** Hipótese por analogia direta: não explora menus por conta própria; só descobre recursos se apresentados no momento certo do fluxo (ex.: oferta de conexão com psicólogo só no momento de risco identificado).

---

## 7. Fluxo de Trabalho & Contexto de Colaboração

**Ritmo de trabalho.** Rodízios de semanas a meses em diferentes serviços (UTI, PS, enfermarias), com plantões e escalas definidas pela coordenação de internato — picos de sobrecarga emocional após óbito, erro evitado por pouco ou eventos clínicos graves, mesma dinâmica documentada na persona médica.

**Modelo de colaboração.** Majoritariamente solitário no uso do produto; o "par anônimo" seria a única camada colaborativa — mas, diferente do médico de plantão (que pode nunca reencontrar o colega com quem conversou), o par de turma convive diariamente, o que muda o cálculo de risco social do anonimato.

**Principal fricção de colaboração.** Não tem hoje nenhum canal de pares que não passe por relações de amizade pré-existentes na própria turma — o que pode tanto ajudar (já existe confiança) quanto atrapalhar (medo de ser reconhecido) a adoção do chat anônimo entre pares. **Tensão em aberto, central para o desenho do matching de pares neste público.**

**Dependências.** Depende de conexão de internet do hospital-escola (mesma limitação da persona médica); depende também de que a faculdade e o hospital-escola onde faz rodízio não estejam formalmente ligados no fluxo de dado — se o mesmo hospital que já usa Zelo para os médicos também for onde o aluno faz rodízio, a linha entre "aluno" e "médico" no mesmo prédio pode confundir a promessa de anonimato. **Ponto técnico/de produto a esclarecer antes de qualquer piloto.**

---

## 8. Alternativas Atuais & Contornos

**Alternativa principal.** Não fazer nada — normalizar o cansaço do internato como "rito de passagem" — ou desabafar informalmente com um colega específico de confiança, sem qualquer instrumento validado; hipótese por analogia direta à médica plantonista.

**Onde o produto entra.** Seria o primeiro ponto de checagem objetiva que o aluno usaria antes de considerar qualquer ajuda formal — inclusive antes do NAE da própria faculdade, que ele hipoteticamente evita por desconfiança.

**O gatilho de abandono (hipótese).** Qualquer sinal de que o dado agregado da faculdade poderia ser cruzado com informação de rodízio/turma de um jeito que o identificasse individualmente — o equivalente acadêmico do medo que a médica tem do cruzamento com escala de plantão.

---

## 9. Pontos de Dor & Necessidades Não Atendidas

**Medo de registro que vire avaliação acadêmica.** Evita qualquer canal formal de saúde mental porque não confia que a informação fique isolada do processo que define sua aprovação e sua carta de recomendação.

**Falta de tempo para terapia tradicional.** Consultas semanais presenciais não cabem na escala de rodízio, com agravante: diferente do médico contratado, o estudante muitas vezes não tem nem autonomia para negociar sua própria escala.

**Ausência de instrumento de autoavaliação confiável e privado.** As escalas clínicas que já estudou na própria grade curricular (PHQ-9, GAD-7) não estão disponíveis para autoaplicação anônima fora de um contexto de disciplina ou de consultório.

**Isolamento entre pares com risco social elevado.** Não existe hoje um espaço seguro para trocar com colegas de turma que sentem o mesmo, sem o risco de ser reconhecido por alguém que vai continuar convivendo com ele pelos próximos anos de curso e possivelmente de profissão.

**Desconfiança de iniciativas institucionais de bem-estar.** Palestras e ações do NAE, quando existem, são percebidas como ligadas à mesma estrutura que avalia o aluno — não como cuidado independente. **Hipótese, ecoa achado da persona do coordenador sobre a mesma tensão vista do outro lado.**

---

## 10. Definição de Sucesso & Padrão de Qualidade

**Padrão de precisão.** O score da autoavaliação precisa corresponder ao que as escalas clínicas realmente medem — mesma exigência da persona médica, plausivelmente reforçada pelo fato de o estudante ter estudado essas escalas na própria grade curricular.

**Padrão de tempo.** Uma autoavaliação completa deve caber em uma pausa de rodízio (poucos minutos); em sinal de risco, a resposta precisa ser imediata.

**Padrão de autossuficiência.** O resultado da autoavaliação sozinho já precisa gerar valor, mesmo que ele nunca avance para o chat ou o matching com colega de turma.

**Padrão de qualidade por contexto.** Em uso rotineiro, "bom o suficiente" é entender a tendência do próprio score ao longo do internato; em sinal de risco agudo, o padrão sobe para resposta imediata e sem fricção para conexão humana — que precisa, idealmente, não passar pelo mesmo canal que avalia seu desempenho.

---

## 11. Princípios de Design & Heurísticas de Tradeoff

1. **Anonimato perante a faculdade sobre conveniência de gestão acadêmica** — nunca pedir dado identificável, mesmo que isso ajudasse a coordenação a agir mais rápido em um caso grave.
2. **Separação técnica entre "aluno" e "médico" no mesmo hospital-escola sobre reaproveitamento de infraestrutura** — se o hospital onde o aluno faz rodízio já usa Zelo para médicos, a arquitetura precisa deixar claro que são contextos e promessas de anonimato distintos, mesmo compartilhando o mesmo prédio.
3. **Verificação técnica da privacidade sobre promessa de marketing** — mesma heurística da persona médica, com reforço: o público estuda ciência e tende a exigir explicação verificável de onde o dado é processado.
4. **Cautela no desenho do par anônimo de turma sobre replicar o matching do médico sem ajuste** — o vínculo de longa duração entre colegas de turma muda o cálculo de risco de reidentificação; não assumir que o mesmo mecanismo de matching da persona médica funciona igual aqui sem validação.
5. **Oferecer sobre forçar o próximo passo** — mesma regra da persona médica: em sinal de risco agudo, a IA sugere conexão humana, nunca impõe.
6. **Velocidade sobre completude** — uma autoavaliação curta que ele realmente termina entre atividades do rodízio vale mais que uma bateria completa que ele abandona.

---

## Evidência & Confiança

| Fonte | Tipo | Detalhe |
| --- | --- | --- |
| BRN-01 | Nota de brainstorm interna | `general-documentations/branstorms.md`, seção "New - no taged yet" — mesma nota curta e de segunda mão usada na persona irmã do coordenador; não identifica origem nem detalhe da reunião mencionada |
| PER-01 | Persona análoga já existente e validada como formato | `persona.md` (Dra. Camila Andrade) — usada como estrutura de analogia direta para o usuário final que precisa de anonimato extremo perante a instituição, não como evidência direta deste público específico |
| PER-03 | Persona irmã, mesma sessão | `persona-diretor-escola-medicina.md` — usada para mapear a tensão entre usuário final e comprador institucional no mesmo segmento hipotético |
| LIT-GERAL | Literatura pública geral (não específica da Zelo) | Alta prevalência de burnout, ansiedade e depressão em estudantes de medicina é amplamente documentada internacionalmente, especialmente em fases de internato — citada aqui apenas como sinal de que o problema subjacente é real e conhecido no campo, não como dado específico de nenhuma instituição brasileira nem como fonte verificada nesta sessão |

**Validado.** Nada nesta persona está validado com o público-alvo real. Apenas o problema geral (saúde mental de estudantes de medicina, especialmente no internato) é amplamente discutido na literatura internacional de saúde — o que não confirma nenhum traço específico de Lucas.

**Assumido.** Praticamente toda a persona é assumida por analogia direta à médica plantonista (já em uso como formato de referência validado) e por raciocínio de primeiros princípios sobre a fase de internato — o vínculo avaliativo com a faculdade, o risco social do par de turma, os limiares de tolerância. Nenhum desses traços vem de entrevista direta com um estudante real.

**Perguntas em aberto.**

1. O vínculo de longa duração entre colegas de turma torna o par anônimo mais confiável (já existe proximidade) ou mais arriscado (mais fácil de ser reconhecido)? Esta é a pergunta mais estratégica para o desenho do matching neste público, e só entrevista real resolve.
2. Quando o hospital-escola do rodízio já é (ou vier a ser) cliente Zelo do lado médico, como o aluno reage à ideia de estar no mesmo produto, mesmo com dados tecnicamente separados? Risco de percepção, não só arquitetura técnica.
3. O NAE/serviço de apoio ao estudante seria visto pelo aluno como aliado (encaminhamento de confiança) ou como extensão da mesma estrutura que ele já evita? Pergunta compartilhada com a persona do coordenador, mas que precisa de resposta do lado do aluno também.
4. Em que fase do curso (pré-internato vs. internato) o sofrimento psíquico realmente aparece com mais força, e é nessa fase que o aluno abriria o app pela primeira vez — ou o uso seria mais preventivo, desde o início da graduação? Sem dado real, a persona assume o internato como pico, mas isso não está confirmado.

**Governança.** Assim como a persona irmã do coordenador, esta persona não deve orientar nenhuma decisão de investimento de engenharia ou roadmap além de exploração/discovery. Critério de promoção a "Proto validado": pelo menos 5-8 entrevistas convergentes com estudantes de medicina reais, idealmente cobrindo fases diferentes do curso (pré-internato e internato). Próxima ação recomendada: buscar, junto com a validação do lado do coordenador, pelo menos uma faculdade disposta a uma conversa exploratória conjunta (coordenação + amostra de alunos) antes de qualquer decisão de roadmap para este segmento.
