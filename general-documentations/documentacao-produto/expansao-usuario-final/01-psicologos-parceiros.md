---
artefato: brainstorm
frente: psicologos-parceiros
criado: 2026-11-17
status: rascunho para discussão — não é parecer jurídico
---

# Frente 1 — Psicólogos parceiros e consultas

Volta ao [índice](./README.md).

> ⚠️ A parte regulatória abaixo veio de pesquisa em fontes públicas (CFP, LGPD) feita em
> 17/11/2026. Não substitui parecer jurídico. Os pontos marcados como **inferência** ou
> **não verificado** precisam ser confirmados com advogado e, se possível, com o CRP/CFP antes de
> qualquer decisão de produto ou de cobrança.

## O que já foi decidido (respostas do Mauricio, 17/11/2026)

- **Público:** manter o foco atual (trabalhadores, via instituição) e abrir para a pessoa comum,
  que usa o app sozinha para acompanhar a saúde mental e se conectar com profissionais.
- **Quem paga:** três casos.
  1. A instituição paga e o trabalhador usa sem custo.
  2. O usuário paga direto.
  3. O psicólogo paga para se colocar à disposição na plataforma. **Fase posterior, avaliar com
     cuidado.**
- **Anonimato:** na consulta o usuário se identifica para o psicólogo, mas a instituição e o
  gestor nunca sabem quem consultou.
- **Situação real hoje:** os dois psicólogos parceiros são só consultores. Ainda não há quem
  atenda.
- **Formatos desejados:** vídeo no app, vídeo externo (Meet/Zoom), chat por texto, só agendamento
  com atendimento fora do app, e atendimento imediato (plantão).
- **Pacote grátis:** ainda não definido.

## O que já existe no Zelo e se conecta

- **Chat de acolhimento por IA** com atalho sempre visível para uma pessoa real (FR-6b).
- **Pares voluntários anônimos** (`PeerPartner` no schema).
- **Caminho de crise** com CVV 188, que funciona sem rede.
- **ADR-003** tirou do escopo a conexão ao vivo médico–psicólogo no hackathon e deixou explícito
  que ela pode voltar depois. Esta frente é essa retomada.
- O [roteiro de entrevista com os psicólogos](../roteiro-entrevista-psicologos-parceiros.md),
  Bloco 8, pergunta 23, já perguntava se eles teriam interesse em papel operacional. Continua sem
  resposta.

## Regras que limitam o desenho

### 1. Atendimento online é permitido, inclusive por texto

A norma localizada é a **Resolução CFP nº 11/2018**. Ela permite consultas "de maneira síncrona ou
assíncrona" por tecnologias de informação, sem restringir a vídeo. Exige que **cada psicólogo**
tenha cadastro no CRP (e-Psi), renovado todo ano. A plataforma em si não precisa de cadastro.

- ❔ **Não verificado:** se existe norma mais nova que substitua a 11/2018. A pesquisa não
  conseguiu acessar o diário oficial do CFP. Conferir manualmente em atosoficiais.cfp.org.br.

### 2. ⚠️ Urgência e emergência não podem ser atendidas online

A mesma resolução diz que atendimento online é **inadequado em urgência e emergência** (Art. 6º),
e veda o online em situações de emergência/desastre (Art. 7º) e de violência ou violação de
direitos (Art. 8º).

**Consequência direta para o "atendimento imediato/plantão":** ele não pode ser vendido nem
desenhado como atendimento de crise. Duas saídas possíveis (inferência):

- posicionar o plantão como **acolhimento ou primeira conversa eletiva** ("quero falar com alguém
  hoje"), sem prometer atendimento de crise;
- manter a crise sempre no caminho que já existe: **CVV 188, SAMU 192, CAPS**, que o Zelo mostra
  sem depender de rede.

Isso combina com a lei do produto: o caminho de crise não depende de nada que possa falhar.

### 3. O psicólogo precisa identificar o paciente e guardar o registro por 5 anos

- A **Resolução CFP 001/2009** torna obrigatório o registro documental, com identificação do
  usuário. A **Resolução CFP 06/2019** fixa guarda mínima de **5 anos**.
- Por isso, consulta totalmente anônima diante do psicólogo não parece viável. **Isso confirma a
  decisão de que o usuário se identifica para o psicólogo.**
- Anonimato diante do **empregador** é compatível: o Código de Ética protege o sigilo e não obriga
  repasse ao pagador (inferência, ver item 5).

**Tensão com a LGPD:** o usuário pode pedir para apagar os próprios dados (art. 18), mas o
prontuário tem guarda legal de 5 anos. Proposta: separar no produto **dados do usuário**
(autoavaliações, diário, histórico; apagáveis) de **prontuário do psicólogo** (guardado pelo
psicólogo pelo prazo legal). Ver [Frente 2](./02-conta-do-usuario.md).

### 4. ⚠️ Comissão por consulta tem risco ético

O Código de Ética do Psicólogo (Resolução CFP 010/2005), Art. 2º, veda ao psicólogo:

- **(o)** "Pleitear ou receber comissões [...] além dos honorários contratados, assim como
  intermediar transações financeiras";
- **(p)** "Receber, pagar remuneração ou porcentagem por encaminhamento de serviços".

E o Art. 20, (d), proíbe usar **o preço do serviço como forma de propaganda**.

Leitura da pesquisa (**inferência, sem parecer do CFP**):

| Modelo | Risco | Comentário |
|---|---|---|
| Plataforma paga ao psicólogo valor fixo por sessão (Zelo contrata o psicólogo) | Baixo | O psicólogo recebe honorário; a Zelo vende o serviço para a instituição ou o usuário |
| Assinatura fixa do psicólogo pela ferramenta/visibilidade | Baixo a médio | Remunera software, não indicação. Zenklub usa algo parecido (plano Premium anual) |
| Psicólogo define preço e a plataforma retém % por consulta | **Médio** | Pode ser lido como "porcentagem por encaminhamento". Telavita opera assim, e não foi achada decisão do CFP proibindo, mas o risco existe |
| Destaque pago na busca ("ranking") | Médio a alto | Aproxima de pagar por encaminhamento e de propaganda |
| Anúncio "a partir de R$ X" no marketing | Médio | Esbarra no Art. 20 (d) |

**Recomendação:** começar pelo modelo em que a **Zelo contrata os psicólogos** e paga valor fixo
por sessão. Deixar o marketplace (psicólogo paga para aparecer) para a fase posterior, como você
já tinha pensado, e só depois de parecer jurídico.

### 5. Empregador paga, mas não sabe quem usou

Não foi encontrada norma que proíba o modelo. O sigilo profissional (Arts. 9º e 10 do Código)
protege o paciente, e o Art. 1º (f, g) limita o que se repassa a terceiros. Relatório **agregado
e com k-mínimo** para a instituição é compatível — e o Zelo já faz isso no painel (k=5).

Dois cuidados:

- **O psicólogo deve ser contratado pela Zelo, não pela instituição.** Psicólogo vinculado ao
  empregador do paciente cria conflito de interesse (Art. 2º, k e m). (inferência)
- **Uso de consultas também é dado sensível.** "3 consultas usadas no setor X" em setor pequeno
  pode identificar a pessoa. O consumo do pacote, se for mostrado à instituição, entra na mesma
  regra de k-anonimato do painel.
- A LGPD (art. 11, §4º) veda compartilhar dado de saúde entre controladores para obter vantagem
  econômica. A instituição nunca recebe dado individual, nem sob a pressão da NR-1.

### 6. Piso de preço em discussão

O CFP defende um **piso de R$ 100 por atendimento** em convênios e plataformas (proposta
SUG 12/2025, em consulta no Senado em jan/2026). Se virar lei, define o custo mínimo por sessão
para a Zelo.

### 7. IA e escalas de triagem

- O CFP publicou nota sobre IA (jul/2025) e dois guias (dez/2025). Pedem supervisão humana e
  alertam contra substituir o vínculo humano. Isso **reforça** o desenho atual (IA de acolhimento
  com atalho humano) e a ideia desta frente.
- ❔ **Não verificado:** se PHQ-9/GAD-7 em app para público geral pode ser enquadrado como
  dispositivo médico pela Anvisa (RDC 657/2022). Risco aberto, aumenta ao abrir para o público
  geral.

## Mercado (preços públicos, 17/11/2026)

| Plataforma | Dado encontrado | Confiança |
|---|---|---|
| Zenklub | Listagem de R$ 50 a R$ 500 por sessão; exemplo de perfil a R$ 220 (50 min). Psicólogo tem plano grátis (fila para aparecer) e Premium anual (valor ambíguo na página) | Média |
| Vittude | "A partir de R$ 50"; empresas podem subsidiar | Alta |
| Telavita | Sem mensalidade para o psicólogo; plataforma retém % da consulta. Preço B2C não localizado | Alta (modelo) |
| Psicologia Viva | Virou Conexa. Preço e modelo não verificados | — |
| Wellhub | Empresa paga por colaborador; colaborador paga assinatura. Preço da terapia não verificado | Média |

Faixa típica estimada: **R$ 80 a R$ 300 por sessão de 50 min** (inferência a partir das
listagens, sem amostra).

## Modelos de negócio, lado a lado

| | A. Instituição paga (B2B) | B. Usuário paga (B2C) | C. Psicólogo paga (marketplace) |
|---|---|---|---|
| Quem é o cliente | Hospital, empresa, escola | A pessoa | O psicólogo |
| O que ele compra | Pacote de consultas + painel agregado | Sessões avulsas ou plano mensal | Visibilidade/ferramenta |
| Encaixe com o Zelo atual | Alto: amplia o contrato B2B que já existe | Médio: precisa de conta, pagamento e cópia nova para público geral | Baixo agora |
| Risco regulatório | Baixo, se a instituição não vê ninguém | Baixo a médio (pagamento, nota fiscal, Anvisa ao abrir ao público) | **Médio a alto** (Código de Ética, Art. 2º o/p) |
| Dependência | Psicólogos contratados | Conta + pagamento + psicólogos | Massa de usuários antes |
| Fase sugerida | **1** | **2** | **3**, só com parecer jurídico |

### Ideias para o "pacote inicial grátis" (para você escolher)

Você deixou em aberto. Algumas opções para discutir, sem recomendação ainda:

1. **1 primeira conversa grátis** (acolhimento, 30 min), paga pela instituição ou pela Zelo como
   aquisição.
2. **X sessões por pessoa por ano** inclusas no contrato da instituição (modelo EAP).
3. **Pool de sessões por instituição**, consumido por quem precisar (mais barato para o cliente,
   mas a instituição só pode ver o consumo agregado com k-mínimo).
4. **Grátis = tudo que não é consulta** (autoavaliação, histórico, IA, pares); premium = consulta.

❓ Quem banca o grátis no B2C (sem instituição)? A Zelo como custo de aquisição, ou não existe
consulta grátis fora do B2B?

## Formatos de consulta, por fase

| Formato | Fase sugerida | Por quê |
|---|---|---|
| Agendamento no app + atendimento fora (canal do psicólogo) | **1** | Menor esforço técnico; o app só faz a ponte |
| Vídeo externo (Meet/Zoom) | **1** | Link gerado no agendamento; nada de infraestrutura de vídeo |
| Chat por texto | **2** | Permitido pela Res. 11/2018, mas exige guarda segura das mensagens (são prontuário) |
| Vídeo dentro do app | **2–3** | Custo de infraestrutura (WebRTC/serviço pago) e de segurança |
| Atendimento imediato (plantão) | **2**, como acolhimento eletivo | Nunca como atendimento de crise (Art. 6º). Exige escala de psicólogos de plantão |

## Próximos passos

1. **Conversa com os dois psicólogos consultores** com perguntas novas:
   - topariam atender (Bloco 8, pergunta 23 do roteiro)?
   - qual valor por sessão consideram justo?
   - como tratam prontuário quando atendem por plataforma?
   - leitura deles sobre o Art. 2º (o, p) e sobre o plantão.
2. **Parecer jurídico** sobre: modelo de remuneração, base legal LGPD da plataforma, enquadramento
   na Anvisa ao abrir para o público geral.
3. **Rodar a [pesquisa F4](./03-pesquisa-de-validacao.md#f4--psicólogos)** com psicólogos para ter
   número sobre interesse e preço.
4. **ADR** registrando: modelo de contratação dos psicólogos, separação dados do usuário vs.
   prontuário, e a regra de que consumo de consultas visível à instituição segue k-anonimato.

## Perguntas em aberto

- ❓ Como é o pacote grátis (opções acima)?
- ❓ A Zelo contrata os psicólogos (CLT, PJ, por sessão) ou eles são autônomos parceiros?
- ❓ Quem guarda o prontuário: o psicólogo, no sistema dele, ou a Zelo oferece prontuário dentro
  da plataforma? (Oferecer aumenta muito a responsabilidade LGPD.)
- ❓ Abrir para o público geral muda a marca e a cópia (hoje tudo fala com médicos). Mesma marca
  ou linha separada?
