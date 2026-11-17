---
artefato: brainstorm
frente: conta-do-usuario
criado: 2026-11-17
status: rascunho para discussão
---

# Frente 2 — Conta do usuário e dados próprios

Volta ao [índice](./README.md).

## O que já foi decidido (respostas do Mauricio, 17/11/2026)

- **O modo anônimo sem login continua existindo.** A conta é opcional e convive com o uso de hoje.
- **A conta é do usuário.** O vínculo com uma instituição funciona como um "carimbo": pode ser
  adicionado e removido. Se a pessoa trocar de emprego, o histórico vai junto com ela.
- **A conta deve permitir:**
  1. ver o histórico de questionários e respostas ao longo do tempo;
  2. sincronizar entre aparelhos e não perder dados ao trocar de celular;
  3. exportar e apagar os próprios dados (LGPD);
  4. compartilhar o histórico com o psicólogo, se a pessoa quiser;
  5. agendar e pagar consultas;
  6. metas, lembretes e diário de humor.
- **Testes:** com usuários (protótipo, entrevista, usabilidade) e técnicos (segurança,
  criptografia, migração de dados).

## Ponto de partida: o que o código já faz

Conferido no código em 17/11/2026, não em documentação antiga.

| O que existe | Onde | O que significa para a conta |
|---|---|---|
| Histórico de avaliações guardado no aparelho (IndexedDB `zelo-assessments`) | `apps/web/src/infrastructure/storage/indexeddb-assessment-store.adapter.ts` | Hoje o histórico some se a pessoa trocar de celular ou limpar o navegador. |
| Cada avaliação é cifrada com AES-256-GCM. A chave é gerada uma vez por aparelho e nunca sai dele | `apps/web/src/infrastructure/crypto/web-crypto-encryption.adapter.ts` | — |
| O servidor guarda a avaliação só como `ciphertext`, com `scaleType` e `capturedAt` em claro | `apps/api/prisma/schema.prisma`, `model Assessment` | **Metade da sincronização já existe:** o dado cifrado já está no servidor. Falta a chave chegar em outro aparelho. |
| `deviceSignalId`: chave anônima por aparelho usada para deduplicar sinais agregados do gestor | `Signal` / `SignalDedupKey` no schema | O agregado do gestor não depende de conta, e continua não podendo depender. |
| Modelo `User` (pseudônimo + magic link) desenhado, nunca construído | `docs/superpowers/specs/identity-and-aggregation.md` §2 | Serve de ponto de partida, mas foi pensado para pares e gestor, não para dados pessoais do usuário. |

## A tensão central: a lei do produto sobre `riskSignal`

O `CLAUDE.md` diz: *"`riskSignal` (derived from a PHQ-9 item-9 answer) never crosses the network;
assessment scoring happens on-device."*

A sincronização entre aparelhos e o compartilhamento com o psicólogo fazem o histórico (que
inclui a resposta do item 9) passar pela rede. Mesmo cifrado, isso mexe na regra e **precisa de
decisão explícita registrada em ADR antes de qualquer código**. As leituras possíveis:

| Leitura | Consequência |
|---|---|
| **A.** A regra proíbe o dado *legível* de sair do aparelho. Texto cifrado com chave que o servidor não tem é permitido. | A sincronização cabe, desde que a chave nunca vá para o servidor em claro. Isso já acontece hoje com o `Assessment.ciphertext`. |
| **B.** A regra proíbe qualquer forma, cifrada ou não. | Só sincroniza direto entre aparelhos (QR/arquivo exportado), sem servidor. Compartilhar com psicólogo também teria que ser feito pelo próprio usuário (ex.: PDF). |
| **C.** A regra vale para o modo anônimo. Na conta, o usuário consente explicitamente em sincronizar. | Exige reescrever a lei no `CLAUDE.md` e nas convenções, com texto de consentimento próprio. |

Pelo código, o time já opera na leitura **A** (o `Assessment.ciphertext` existe), mas isso nunca
foi escrito como decisão. ❓ **Decisão pendente.**

## Modelo proposto: três níveis de identidade

A pessoa sobe de nível só quando quiser, e cada nível não enfraquece os anteriores.

| Nível | Quem é | O que o servidor sabe | O que a instituição vê |
|---|---|---|---|
| **0. Anônimo** (hoje) | Qualquer pessoa, sem cadastro | Nada que identifique. Ciphertext + `deviceSignalId` | Só agregado k≥5, se houver vínculo e opt-in |
| **1. Conta pseudônima** | Quem quer histórico e sincronização | Um e-mail (para login) + ciphertext. Não lê as avaliações | Igual ao nível 0. A conta **não** é ligada ao `deviceSignalId` no servidor |
| **2. Identificado para um psicólogo** | Quem agenda consulta | Os dados que o psicólogo e a cobrança exigem (ver [Frente 1](./01-psicologos-parceiros.md)) | Igual ao nível 0. A instituição nunca sabe quem consultou |

**Regra de separação proposta:** o identificador da conta e o `deviceSignalId` nunca aparecem
juntos na mesma linha do banco nem na mesma requisição. Sem isso, um vazamento do banco permitiria
cruzar "e-mail X" com "setor Y da instituição Z", e o k-anonimato do painel perde o sentido.

## Como levar a chave para outro aparelho

É o problema técnico mais difícil da frente.

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| **Senha que deriva a chave** (estilo gerenciador de senhas) | A chave é cifrada com uma senha que só o usuário sabe (PBKDF2/Argon2) e guardada no servidor | Funciona em qualquer aparelho. O servidor continua sem ler nada | Esqueceu a senha, perdeu o histórico. Não existe "esqueci minha senha" de verdade |
| **Código de recuperação** | Ao criar a conta, a pessoa anota um código de 12–24 palavras | Mesmo nível de segurança, com recuperação possível | Muita gente perde o código. Fricção alta no cadastro |
| **Passkey (WebAuthn) com sincronização da plataforma** | A chave fica protegida pela passkey, sincronizada pelo Google/Apple | Sem senha, boa experiência | Suporte à extensão PRF ainda varia entre navegadores. Depende do ecossistema do usuário |
| **Servidor guarda a chave** | Login normal, o servidor decifra | Simples. Recuperação fácil | Quebra a promessa central do produto. **Não recomendo.** |

❓ Precisa de spike técnico antes de decidir (ver "Testes").

## Fases sugeridas para o que você marcou

A ordem segue dependência técnica e risco, não importância.

| Fase | Funcionalidade | Por que nessa ordem |
|---|---|---|
| **1** | Exportar e apagar os próprios dados (LGPD) | Dá pra fazer **sem conta**, já no modo anônimo: exportar o IndexedDB em arquivo e apagar tudo. Valor imediato, risco baixo |
| **1** | Ver histórico ao longo do tempo (no aparelho) | Os dados já existem localmente. É tela, não infraestrutura |
| **1** | Lembretes e diário de humor (local) | Lembrete via notificação do PWA. Diário cifrado com a mesma chave das avaliações |
| **2** | Conta + sincronização entre aparelhos | Depende da decisão sobre `riskSignal` e do spike de chave |
| **3** | Compartilhar histórico com o psicólogo | Depende da conta **e** da Frente 1. Exige compartilhar uma chave por psicólogo, revogável |
| **3** | Agendar e pagar consultas | Depende da Frente 1 (psicólogos, cobrança, nota fiscal) |
| **4** | Metas | Pede desenho de produto e validação clínica: meta mal formulada em saúde mental pode gerar culpa. Levar para os psicólogos consultores |

## Testes

### Com usuários

1. **Entrevistas curtas (5–8 pessoas por público)** antes de desenhar telas, com roteiro derivado
   da [pesquisa](./03-pesquisa-de-validacao.md). Pergunta-chave: "o que faria você criar uma conta
   num app de saúde mental, e o que faria você desistir?"
2. **Protótipo navegável (Figma)** do fluxo "anônimo → criar conta → trocar de celular → recuperar
   histórico". Medir onde a pessoa trava, principalmente na senha ou no código de recuperação.
3. **Teste de compreensão da privacidade:** depois do fluxo, perguntar "quem consegue ver suas
   respostas?". Resposta errada indica falha na cópia ou no fluxo.

### Técnicos

1. **Spike de chave:** senha derivada vs. passkey PRF em Chrome Android, Safari iOS e desktop.
   Saída: matriz de suporte e decisão.
2. **Teste de não-vinculação:** com acesso total ao banco, provar que não dá pra ligar uma conta a
   um `deviceSignalId`. Vira teste automatizado.
3. **Migração anônimo → conta:** o histórico local sobe para a conta sem perda e sem duplicar
   sinais agregados já enviados.
4. **Exclusão LGPD:** apagar a conta apaga o ciphertext, o e-mail e as chaves cifradas. Os
   contadores agregados (que não são dado pessoal) ficam. O prontuário do psicólogo **não** entra
   nessa exclusão: tem guarda legal mínima de 5 anos (Res. CFP 001/2009 e 06/2019; LGPD art. 16).
   Por isso, dados do usuário e prontuário precisam ficar separados desde o desenho (ver
   [Frente 1](./01-psicologos-parceiros.md)).
5. **Revogação de compartilhamento:** depois de revogar, o psicólogo não abre mais avaliações
   novas.

## Perguntas em aberto

- ❓ Qual leitura da regra do `riskSignal` (A, B ou C)?
- ❓ Login por e-mail + magic link (como no spec antigo), senha, ou passkey?
- ❓ Diário de humor: texto livre ou só escala/emoji? Texto livre é dado sensível e pede o mesmo
  cuidado das avaliações.
- ❓ O usuário do público geral (sem instituição) usa o mesmo app e a mesma marca, ou uma versão
  separada? Isso afeta a cópia de todas as telas, hoje escritas para médicos.
