<div align="center">

<img src="apps/web/public/zelo_logo.png" alt="Zelo" width="120" />

# Zelo

**Triagem confidencial de burnout e apoio entre pares para médicos — construído para que o empregador que paga pela ferramenta nunca saiba quem a usou.**

[![API](https://github.com/Develophys/zelo/actions/workflows/api.yml/badge.svg)](https://github.com/Develophys/zelo/actions/workflows/api.yml)
[![Web](https://github.com/Develophys/zelo/actions/workflows/web.yml/badge.svg)](https://github.com/Develophys/zelo/actions/workflows/web.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A59-F69220?logo=pnpm&logoColor=white)
![License](https://img.shields.io/badge/license-proprietary-lightgrey)

🇧🇷 Português · [🇺🇸 English](README.md)

</div>

---

## Por que o Zelo existe

57% dos médicos brasileiros relatam sintomas de burnout; menos de 12% buscam ajuda profissional, e a taxa de suicídio entre médicos é mais que o dobro da população geral (CFM/AMB, 2022). O motivo não é falta de cuidado disponível — é o medo de que admitir sofrimento chegue ao empregador ou ao conselho profissional e prejudique a carreira.

O Zelo é um PWA mobile-first que oferece ao médico uma autoavaliação clínica validada (PHQ-9, GAD-7, MBI-HSS) com **score calculado no próprio dispositivo**, um chat de acolhimento assistido por IA com apoio humano, matching anônimo de pares e escalonamento em crise opt-in — enquanto hospitais e cooperativas que financiam a ferramenta só enxergam tendências de risco agregadas e anonimizadas, nunca a identidade de um indivíduo.

> Desenvolvido durante a **1ª Jornada Incubintech**, programa de inovação aberta (27/06 a 25/07/2026), para o desafio "Saúde do Médico".

## Como a confidencialidade é garantida

- **Score calculado no dispositivo (client-side)** — os resultados da autoavaliação são calculados localmente; as respostas brutas nunca são persistidas em texto claro no servidor.
- **Empregador só vê dados agregados** — o painel institucional reporta métricas anonimizadas por turno/setor, nunca por indivíduo.
- **Exposição de identidade é opt-in** — a identidade do médico só é revelada se *ele próprio* decidir escalar para um atendimento humano.
- **Sem diagnóstico por IA** — o chat de acolhimento é uma camada de triagem humanizada, com atalho sempre visível para uma pessoa real, nunca uma ferramenta de diagnóstico.

Veja [`general-documentations/documentacao-produto/prd.md`](general-documentations/documentacao-produto/prd.md) para os requisitos completos do produto e [`docs/superpowers/specs/2026-07-07-pwa-architecture.md`](docs/superpowers/specs/2026-07-07-pwa-architecture.md) para a arquitetura técnica.

## Stack técnica

| | |
| --- | --- |
| **Frontend** | React 19 + Vite, TanStack Query, Zustand, Tailwind CSS 4, PWA (instalável, funciona offline) |
| **Backend** | NestJS 10, Prisma 7 (adapter serverless do Neon Postgres), Groq SDK para inferência de LLM |
| **Compartilhado** | Schemas de domínio em Zod (`packages/domain`), config base de lint/tsconfig (`packages/config`) |
| **Ferramental** | Turborepo, workspaces do pnpm, dependency-cruiser para limites de arquitetura, Vitest |
| **Infra** | Fly.io (API), GitHub Pages (Web), Neon Postgres, Docker Compose para paridade local |

## Mapa do repositório

```text
apps/
  web/      Frontend React + Vite (PWA)
  api/      Backend NestJS
packages/
  domain/   Schemas Zod compartilhados + tipos TS (sem lógica de negócio)
  config/   Config base compartilhada de tsconfig/eslint/prettier/dependency-cruiser
docker/     Ambiente Docker Compose local (builds próximos de produção)
general-documentations/   Documentos de produto: PRD, personas, roadmap, problem statement
docs/superpowers/         Specs técnicas e planos de implementação
```

## Como rodar

**Pré-requisitos:** Node ≥20 (o repo fixa 24 via `.nvmrc`), pnpm ≥9.

```bash
pnpm install
```

### Backend (`apps/api`)

Requer `DATABASE_URL`. Copie o env de exemplo e aponte para uma instância Postgres em execução:

```bash
cp apps/api/.env.example apps/api/.env
pnpm --filter @zelo/api dev
```

Veja [`docs/superpowers/plans/2026-07-07-02-backend-foundation.md`](docs/superpowers/plans/2026-07-07-02-backend-foundation.md) (Tarefa 2) para uma configuração manual do Postgres, ou use o ambiente Docker abaixo.

### Frontend (`apps/web`)

Requer `VITE_API_BASE_URL`:

```bash
cp apps/web/.env.example apps/web/.env
pnpm --filter @zelo/web dev
```

Rode junto com a API para ver o banner de health-check ao vivo.

### Comandos comuns

| Comando | Descrição |
| --- | --- |
| `pnpm build` | Builda todos os pacotes/apps na ordem de dependência (Turborepo) |
| `pnpm dev` | Roda todos os apps em modo dev |
| `pnpm lint` | Lint em todos os pacotes/apps |
| `pnpm lint:boundaries` | Garante os limites de Clean Architecture (dependency-cruiser) |
| `pnpm test` | Roda todas as suítes de teste |

## Ambiente Docker local

Executa builds reais de produção de `apps/api` e `apps/web` contra um Postgres containerizado — use para pegar problemas específicos de build antes de uma demo, não para o dia a dia de desenvolvimento.

```bash
cd docker
cp .env.example .env.docker   # apenas na primeira vez
docker compose up --build -d
```

- API: http://localhost:3000 (health check: `curl http://localhost:3000/health`)
- Web: http://localhost:8080
- Postgres: `localhost:5432` (credenciais em `docker/.env.docker`)

Derrube com `docker compose down` (adicione `-v` para também apagar o volume do Postgres).

## Deploy

- **`apps/api`** faz deploy no Fly.io (`zelo-api`), com Neon Postgres.
- **`apps/web`** faz deploy no GitHub Pages.

Ambos fazem deploy automático a partir de `main` via `.github/workflows/api.yml` / `web.yml`, condicionados a mudanças no app correspondente mais `packages/domain`/`packages/config`. Migrations **não** rodam no boot do container — aplique manualmente antes de fazer deploy de uma mudança de schema:

```bash
pnpm --filter @zelo/api exec prisma migrate deploy   # DIRECT_DATABASE_URL deve apontar para o Neon
```

### Rollback (Fly.io)

O rollback é intencionalmente manual — trate como uma decisão deliberada, não uma rede de segurança automática:

```bash
fly releases --app zelo-api                                    # lista releases anteriores
fly deploy --image <previous-image-ref> --app zelo-api         # reimplanta uma imagem específica
```

## Documentação

- [`general-documentations/documentacao-produto/`](general-documentations/documentacao-produto/) — PRD, personas, lean canvas, OKRs, ADRs, análise competitiva
- [`general-documentations/jornada-checkpoints/`](general-documentations/jornada-checkpoints) — entregáveis oficiais dos checkpoints da Jornada Incubintech
- [`docs/superpowers/specs/`](docs/superpowers/specs) — specs de arquitetura técnica
- [`docs/superpowers/plans/`](docs/superpowers/plans) — planos de implementação passo a passo

---

<div align="center">
<sub>Projeto privado e proprietário — não licenciado para uso ou redistribuição externa.</sub>
</div>
