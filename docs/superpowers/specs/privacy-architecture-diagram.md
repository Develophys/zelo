# Privacy Architecture — Data Flow Diagram

**Status:** mandatory challenge-checklist deliverable ("Documentação da arquitetura de
privacidade, com diagrama de fluxo de dados"). Owner: Mauricio (absorbed from Gui's DevOps
scope after Gui left the team on 2026-07-11; see `general-documentations/roadmap/README.md`).
Due: Checkpoint 3, 2026-07-18.

**Purpose:** make the product's central trust claim ("processado no seu aparelho", "ninguém
do hospital vê quem você é") verifiable at a glance, not just asserted in copy
(`docs/superpowers/specs/screens/02-privacy.md`). Audience: the Jornada's evaluation board and
any future hospital/cooperativa buyer who asks "how do I know this is true."

## Planning worksheet

- **What relationship/flow needs to be visible:** which data crosses the device boundary, in
  what form (cleartext / encrypted-anonymized-individual / aggregated), and the two crisis
  branches (accept identification vs. decline and stay anonymous).
- **Cardinal-rule check:** yes — this has real branching (crisis accept/decline) and a
  boundary-crossing relationship (device vs. server vs. third party) that a list would flatten.
  A flowchart is the right type (decision points + multi-party data flow).
- **Node inventory:** device-side (assessment, local score, chat message, anonymization,
  encryption, risk-signal decision), server-side (aggregator/k-anonymity gate, ephemeral-token
  generator, main database), third parties (LLM provider, partner psychologist, external crisis
  line), plus the manager dashboard as the terminal aggregated-data consumer.
- **Type rationale:** Flowchart (TD) over Sequence, because the point is *what crosses which
  boundary in what form*, not strict message ordering between named actors.

## Diagram

Edge-style legend (style + label together — color is never the only signal):

- **Solid `-->`** = cleartext, never leaves the device.
- **Dotted `-.->`** = encrypted/anonymized, individual-level data crossing a boundary.
- **Thick `==>`** = aggregated, anonymized data (k-anonymity, k≥5) crossing a boundary.

```mermaid
%% Zelo — Privacy Architecture Data Flow
%% Edge style encodes data sensitivity: solid = cleartext (device-only),
%% dotted = encrypted/anonymized individual data, thick = aggregated (k>=5) data.
flowchart TD
    subgraph DEV["📱 Médico's device (client-side)"]
        A["Self-assessment PHQ-9 / GAD-7 / MBI-HSS<br/>(raw answers)"]
        B["Score computed 100% locally<br/>(FR-1, FR-2)"]
        C{"Score signals<br/>acute risk?"}
        D["Chat message<br/>(original text)"]
        E["Client-side anonymization<br/>strips name / CRM / hospital (FR-5)"]
        F["Client-side encryption<br/>AES-256, Web Crypto API (FR-14)"]
        A -- "cleartext, never leaves the device" --> B
        B --> C
        D -- "cleartext, never leaves the device" --> E
        B -.->|"encrypted/anonymized individual score"| F
    end

    subgraph SRV["🖥️ Zelo backend"]
        G["Anonymized aggregator<br/>k-anonymity, hides segments<br/>with n below 5 (FR-12, FR-13)"]
        H["Ephemeral session-token<br/>generator (FR-8)"]
        I[("Main database<br/>identity never stored in cleartext")]
    end

    subgraph EXT["🌐 Third parties"]
        J["LLM API (acolhimento chat)<br/>receives anonymized text only (FR-4)"]
        K["Partner psychologist<br/>reachable only via ephemeral token"]
        L["External crisis line<br/>CVV 188 — no data sent"]
    end

    M["📊 Manager dashboard<br/>(FR-12, FR-13)"]

    F ==>|"aggregated, anonymized (n>=5)"| G
    G ==>|"aggregated, anonymized (n>=5)"| M
    E -.->|"anonymized text"| J
    J -.->|"reply, no diagnosis"| E

    C -- "yes: offer human connection (FR-7)" --> N{"Médico accepts<br/>identifying?"}
    C -- "no: no risk signal" --> D
    N -- "accepts" --> H
    H -.->|"ephemeral token only, never identity (FR-8)"| I
    H -.->|"E2E channel via token"| K
    N -- "declines (FR-9)" --> L
    L -.->|"no identifiable data recorded"| I

    classDef device fill:#e8f4f8,stroke:#0c5a7a,stroke-width:2px,color:#0c2733
    classDef server fill:#fdf2e3,stroke:#a15c00,stroke-width:2px,color:#3d2500
    classDef ext fill:#f3e8fd,stroke:#6b21a8,stroke-width:2px,color:#2e0f47
    class A,B,C,D,E,F device
    class G,H,I,M server
    class J,K,L ext
```

## What this diagram is evidence of

| Claim made in `02-privacy.md` copy | Where it's proven above |
|---|---|
| "Processado no seu aparelho" | `A -- cleartext --> B`: the score is computed before any edge leaves the `DEV` subgraph. |
| "Ninguém do hospital vê quem você é — nem o seu CRM" | Every edge crossing into `SRV`/`EXT` is dotted (anonymized/encrypted) or thick (aggregated) — no solid (cleartext) edge ever crosses a subgraph boundary. |
| "Nada é compartilhado sem o seu aceite explícito" | The only edge that reaches a named human (`K`, the partner psychologist) is gated behind the `N` decision node's "accepts" branch. |
| k-anonymity floor (`13-manager.md`, `n >= 5`) | `G`'s label states the suppression rule explicitly; `M` (manager dashboard) only ever receives `G`'s output, never `F`'s individual-level data directly. |

## Known simplifications (declare these to the board, don't hide them)

- The diagram shows the target architecture from the PRD (FR-1 through FR-14). `PeersPage` still
  has a `// TODO` placeholder (no doctor-side identity exists — see `identity-and-aggregation.md`).
  `ManagerDashboardPage` no longer belongs in that "not wired yet" bucket: `G`→`M` (the
  k-anonymous aggregator feeding the manager dashboard) is real and institution-scoped as of
  `2026-08-02-multi-institution-data-partitioning-design.md` — a médico's device fires an
  anonymous, deduplicated signal (`POST /signals/checkin`) that increments real counters,
  separate from the encrypted `Assessment` write `B -.-> F` already shows. Say so live rather
  than letting the diagram imply either extreme (all real, or all still mocked).
- The LLM provider box (`J`) is generic by design — the PRD still lists "Escolha final do
  provedor de LLM" as an open dependency. If that gets locked (see the team's action-plan P5),
  update this label with the real provider name.
- The partner-psychologist path (`K`) may be simulated for the live demo if no real partner is
  confirmed by the checkpoint — the PRD already anticipates this (`prd.md`, Dependências). The
  diagram documents the intended architecture either way; the demo script should say explicitly
  which parts are live vs. simulated.

## Validation checklist

- [x] Renders without error (verified in mermaid.live).
- [x] Cardinal rule satisfied — branching (accept/decline) and boundary-crossing relationships a list would flatten.
- [x] All labels with spaces/parentheses/colons are quoted.
- [x] No unescaped `<`/`>`/`#` outside of `<br/>` line breaks.
- [x] Node count (14) within flowchart readability range, grouped into 3 subgraphs.
- [x] Color is not the only differentiator — subgraph grouping, node shape (process / decision `{}` / database `[()]`), and edge style (solid/dotted/thick) all carry meaning independently of color.
- [x] Title and surrounding prose context present (this file).
