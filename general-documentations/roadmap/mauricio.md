# Roadmap — Mauricio Alexandre (Desenvolvedor full stack / Arquiteto de software / DevOps)

> Ver `README.md` para a linha do tempo completa e as decisões de produto que embasam estas tarefas.
>
> **Nota (11/07/2026):** Gui (DevOps) saiu do time. Mauricio confirmou que assume integralmente as tarefas de DevOps que eram dele, além do papel de desenvolvedor full stack/arquiteto — sem necessidade de novo dono. As tarefas herdadas estão marcadas com 🔧 abaixo.

## Semana 1 — até 11/07/2026 (Checkpoint 2, foco Fase 2)

- [ ] Implementar autoavaliação (PHQ-9, GAD-7, MBI-HSS) com cálculo de score 100% client-side na PWA — nenhum dado bruto em texto claro sai do dispositivo (PRD FR-1, FR-2).
- [ ] Implementar cifragem client-side (Web Crypto API, AES-256) antes de qualquer envio de rede (PRD FR-14).
- [ ] Integrar o chat de acolhimento por IA (provedor de LLM a definir com o time) com anonimização client-side do texto antes do envio (PRD FR-4, FR-5).
- [ ] Implementar o atalho permanente e visível "falar com uma pessoa real" dentro do chat de IA — decisão de produto de 07/07/2026 (PRD FR-6b, user-stories US-002 AC-4).
- [ ] Implementar a identificação automática de sinais de risco agudo (ex.: item 9 do PHQ-9) segundo critério a validar com parceiro clínico (PRD FR-3).
- [ ] Preparar evidência técnica, para o checkpoint, de que nenhuma resposta sensível é retida sem consentimento explícito.
- [ ] 🔧 Montar a infraestrutura de deploy da PWA (hosting, HTTPS, pipeline básico de CI/CD).
- [ ] 🔧 Configurar armazenamento seguro das chaves da API de LLM e demais segredos (secrets management), sem expor credenciais no client.
- [ ] 🔧 Revisar a própria infraestrutura de backend para garantir que o servidor nunca recebe dado bruto de autoavaliação em texto claro (checagem de logs, variáveis de ambiente, payloads).

## Semana 2 — 12/07 a 18/07/2026 (Checkpoint 3, foco Fase 3)

- [ ] Implementar o fluxo de escalonamento em crise **simplificado** (ver `documentacao-produto/adr-003-crisis-protocol-rescope-peer-chat-differentiator.md`, 19/07/2026): sinalização de risco agudo + direcionamento diferenciado e imediato por vínculo (SUS vs. plano de saúde/rede privada) e recusa (exibição imediata de linha externa, ex. CVV 188) — PRD FR-7 a FR-10 revisados. **Não inclui mais** conexão ao vivo com token de sessão efêmero.
- [ ] Implementar matching anônimo de pares (pode usar dados simulados, desde que documentado como tal) — PRD FR-11.
- [ ] Implementar tela de crise e o painel de monitoramento longitudinal local (gráfico de evolução pessoal).
- [ ] Construir o diagrama de fluxo de dados / arquitetura de privacidade (entregável obrigatório do checklist) — antes dividido com Gui, agora integralmente com Mauricio.
- [ ] Registrar consentimento explícito e contextual antes de qualquer momento de possível exposição de identidade (PRD FR-15).
- [ ] Implementar a rotulagem de fatores de risco psicossocial (NR-1/PGR) sobre as métricas já agregadas do painel, com exportação simples (PDF/CSV) — PRD FR-16, user-stories US-006 AC-4, decisão registrada em `adr-001-fr16-nr1-painel-gestor.md`. Revisar o texto do rótulo com um mentor jurídico/SST antes da fala final da banca.
- ~~[ ] 🔧 Configurar o canal cifrado de ponta a ponta usado na conexão ao vivo médico–psicólogo (token de sessão efêmero) no caminho de crise.~~ **Superada em 19/07/2026** por `adr-003-crisis-protocol-rescope-peer-chat-differentiator.md` — a ACM confirmou que integração técnica direta não é esperada nesta fase; substituída pelo item de direcionamento simplificado acima.
- [ ] 🔧 Rodar testes básicos de latência da API de LLM usada no chat de acolhimento.

## Semana 3 — 19/07 a 25/07/2026 (Fase 4 + preparação final)

- [ ] **Prioridade máxima da semana** (ver `documentacao-produto/2026-07-19-action-plan-respostas-acm.md`, Esforço P2): implementar o mecanismo mínimo de acompanhamento (follow-up) — contato de reengajamento após a interação inicial + registro local de resposta (sim/não) — e expor as duas métricas que a ACM citou como KPI prioritário (nº de questionários respondidos + taxa de resposta do follow-up) no painel do gestor. Escopo estritamente limitado a essas duas métricas; qualquer coisa além disso vira Consideração Futura na PRD (ver US-009, `user-stories.md`, e FR-17, `prd.md`). Timebox: 2 dias.
- [ ] Implementar a biblioteca de conteúdo (com curadoria de temas feita por Raquel).
- [ ] Ajustes finais de UX e performance para a demo ao vivo — funcionamento offline-first, mobile, autoavaliação em menos de 5 minutos.
- [ ] Testar o painel institucional com o limiar mínimo por segmento (n) definido por Kati, para evitar re-identificação por dedução.
- [ ] Preparar o ambiente e o roteiro técnico da demo ao vivo (TRL3).
- [ ] 🔧 Garantir funcionamento offline (PWA) e testar em condição de conexão instável, simulando o cenário real de plantão hospitalar.
- [ ] 🔧 Preparar o ambiente estável para a demo ao vivo do dia 25/07 (plano de rollback, monitoramento de disponibilidade no dia da apresentação).
- [ ] 🔧 Revisão final de segurança: confirmar que toda comunicação dispositivo-servidor relativa a dados de saúde trafega cifrada (PRD FR-14), antes da entrega final.

## Novidades registradas em 11/07/2026 (fora do ciclo semanal original)

- [ ] Provisionar logins reais para a equipe do Dr. David Mendes (PS/UTI) testar o Zelo — piloto de uso real, não simulado. Como esses médicos vão gerar dados de saúde reais (não fictícios), revisar a cadeia de anonimização/cifragem (FR-1, FR-2, FR-14) antes de liberar acesso, não só para a demo. **Status (28/07/2026): nunca saiu do papel** — não houve provisionamento de login nem uso real. Fica como item em aberto a retomar (ou descartar) na trilha de evolução independente do produto pós-hackathon, não mais como compromisso do edital.
- [ ] Buscar mentor jurídico/SST na Jornada para revisar o texto do rótulo NR-1/PGR do painel (FR-16, US-006 AC-4, `adr-001-fr16-nr1-painel-gestor.md`) antes da fala final da banca. **Status (28/07/2026): nunca encontrado** — segue em aberto. Como o rótulo NR-1 continua no painel do produto que Mauricio quer evoluir, esta revisão permanece necessária antes de qualquer uso real com um gestor hospitalar.
- [ ] Confirmar política de retenção de dados da API do Groq e registrar em `prd.md` (Considerações Técnicas).

## Backlog da trilha de evolução independente (pós-hackathon, 28/07/2026)

- [ ] **Canal WhatsApp para o chat de acolhimento e follow-up** — spec de design pronta e aprovada em brainstorm (28/07/2026): `docs/superpowers/specs/2026-07-28-whatsapp-channel-design.md`, `documentacao-produto/user-stories.md` US-010. **Não agendado para implementação** — nenhum plano de execução foi feito ainda, por decisão explícita de Mauricio ("não vamos fazer nenhum plan pra isso agora"). Retomar com `superpowers:writing-plans` quando for priorizado.
- [ ] Chat par-a-par via WebSocket entre médicos anônimos (extensão de US-005), com pares adicionados pelo gestor — mencionado no mesmo brainstorm de 28/07/2026, mas ainda **sem spec de design** (o brainstorm cobriu só o canal WhatsApp primeiro). Fazer o brainstorm deste quando for priorizado.

## Pendências que dependem de decisão do time

- ~~Provedor de LLM e política de retenção de dados da API~~ — **Resolvido em 11/07/2026: Groq** (retenção de dados ainda a confirmar, ver acima).
- Texto e posicionamento exato do atalho humano (FR-6b) — destino resolvido (oferece escolha par médico/psicólogo); copy exato ainda junto com Raquel.
- ~~Confirmação (ou simulação documentada) de parceiro psicólogo real~~ — **Resolvido em 11/07/2026**: dois parceiros confirmados em papel consultivo. Ver `documentacao-produto/roteiro-entrevista-psicologos-parceiros.md`. Canal operacional do caminho de aceite em crise ainda em aberto (Bloco 8 do roteiro).
