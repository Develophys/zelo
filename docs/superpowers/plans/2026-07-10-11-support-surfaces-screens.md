# Support Surfaces Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing AI acolhimento chat to Sereno without touching its logic, and add the two remaining support surfaces — anonymous peer matching and the manager aggregate dashboard — both built as designed UI over placeholder data since their backends are Week-2 scope.

**Architecture:** `ChatPage` and `ChatComposer` are re-skinned in place (same hook, same anonymization, same conversation id); the handoff shortcut switches from an in-page modal (`HumanHandoffPanel`) to routing to `/crisis`. `PeersPage` and `ManagerDashboardPage` are new pages over local placeholder arrays with explicit `TODO(week2)` markers — no new use-cases, ports, or domain types.

**Tech Stack:** React 19, `react-router` v8, existing `useChatConversation` hook, Vitest + Testing Library.

## Global Constraints

- **Prerequisites:** Design System Foundation plan (`2026-07-10-07-...`) and Onboarding & Consent plan (`2026-07-10-08-...`) must be implemented first. The Crisis Escalation plan (`2026-07-10-10-...`) should land before or alongside this one — the restyled chat's handoff button routes to `/crisis`, which only resolves once that plan's routes are wired.
- **Do not change chat logic.** `useChatConversation(CONVERSATION_ID)`, `sendMessage(text, false)`, and the anonymization step inside `AnonymizeTextUseCase` (called from the use-case layer, not the component) are untouched. `hasActiveRiskSignal` stays hardcoded `false` — wiring `crisisFallback` back in would be circular (see the existing code comment this plan preserves).
- The disclaimer banner is **non-dismissable** and always present on the chat surface.
- The "falar com uma pessoa real" handoff button is **always visible** on chat (survives scroll and streaming) and must not depend on the network — it navigates to `/crisis`, it does not call anything.
- Peer matching and the aggregation API are **not yet built** (Week-2 scope). `PeersPage` and `ManagerDashboardPage` are designed UI over local placeholder arrays, each marked `// TODO(week2)`. Do not fabricate a use-case or port for either.
- k-anonymity: the manager dashboard **must** filter out any segment with `n < 5` in code, even on placeholder data, so the behavior is already correct when the real aggregation API lands.
- `ManagerDashboardPage` carries a `// TODO(auth): gate behind manager role` comment — it is reachable from Home's demo link with no gate in this build, by design (see `04-home.md`).
- PT-BR copy is normative (per `11-chat.md`, `12-peers.md`, `13-manager.md`).
- Icons replace emoji everywhere in this plan's screens (`HeartHandshake` for 🫂, `Lock` for 🔒), consistent with the icon mapping used in prior plans.

---

## File Structure

```
apps/web/src/presentation/
  components/
    ChatComposer.tsx                              (replace: restyled)
    ChatMessageList.tsx                            (delete — inlined into ChatPage)
    HumanHandoffPanel.tsx                          (delete — superseded by /crisis route)
  pages/
    ChatPage.tsx                                    (replace: restyled, keep logic)
    ChatPage.test.tsx                               (replace)
    PeersPage.tsx                                   (new)
    PeersPage.test.tsx                              (new)
    ManagerDashboardPage.tsx                        (new)
    ManagerDashboardPage.test.tsx                   (new)
apps/web/src/app/
  router.tsx                                        (modify: add /peers, /manager)
  router.test.tsx                                   (modify: extend with the new routes)
```

---

## Task 1: Restyle `ChatPage` and `ChatComposer`

**Files:**
- Replace: `apps/web/src/presentation/pages/ChatPage.tsx`
- Replace: `apps/web/src/presentation/pages/ChatPage.test.tsx`
- Replace: `apps/web/src/presentation/components/ChatComposer.tsx`

**Interfaces:**
- Consumes: `PhoneShell` (Design System); `useChatConversation` (existing, unchanged); `routes` (Onboarding plan).
- Produces: restyled `ChatPage`/`ChatComposer`. The handoff button now navigates to `routes.crisis` instead of opening `HumanHandoffPanel` (removed in Task 5).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { ChatPage } from "./ChatPage";
import * as container from "../../app/container";

function renderChat() {
  return render(
    <MemoryRouter initialEntries={["/chat"]}>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/crisis" element={<div>Crisis offer screen</div>} />
        <Route path="/home" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function* fakeAssistantStream() {
  yield { delta: "Oi, tudo bem?" };
}

describe("ChatPage", () => {
  it("always shows the non-dismissable disclaimer and the handoff shortcut", () => {
    renderChat();
    expect(screen.getByText(/não substitui atendimento profissional/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /falar com uma pessoa real/i })).toBeInTheDocument();
  });

  it("navigates to /crisis on the handoff shortcut, with no network call", async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(screen.getByRole("button", { name: /falar com uma pessoa real/i }));
    expect(screen.getByText("Crisis offer screen")).toBeInTheDocument();
  });

  it("sends a message and streams the assistant reply into a styled bubble", async () => {
    vi.spyOn(container.sendChatMessageUseCase, "execute").mockReturnValue(fakeAssistantStream());
    const user = userEvent.setup();
    renderChat();

    await user.type(screen.getByPlaceholderText("Escreva como você está…"), "Estou bem");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByText("Estou bem")).toBeInTheDocument();
    expect(await screen.findByText("Oi, tudo bem?")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test presentation/pages/ChatPage -- --run`
Expected: FAIL — the current `ChatPage` has no router dependency and opens a panel instead of navigating.

- [ ] **Step 3: Write the implementation**

`ChatComposer.tsx`:

```tsx
import type { SubmitEvent } from "react";
import { useState } from "react";
import { ArrowUp } from "lucide-react";

export function ChatComposer({
  isStreaming,
  onSend,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim().length === 0 || isStreaming) return;
    onSend(text);
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-surface-brand p-[14px_16px]">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Escreva como você está…"
        disabled={isStreaming}
        className="flex-1 rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
      <button
        type="submit"
        aria-label="Enviar"
        disabled={isStreaming}
        className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-brand text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowUp size={20} />
      </button>
    </form>
  );
}
```

`ChatPage.tsx`:

```tsx
import { HeartHandshake } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "../layout/PhoneShell";
import { useChatConversation } from "../hooks/useChatConversation";
import { ChatComposer } from "../components/ChatComposer";
import { routes } from "../lib/routes";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

export function ChatPage() {
  const navigate = useNavigate();
  const { messages, isStreaming, crisisFallback, providerError, sendMessage } =
    useChatConversation(CONVERSATION_ID);

  return (
    <PhoneShell bg="surface">
      <div className="flex min-h-full flex-col">
        <div className="flex items-center gap-3 border-b border-surface-brand bg-surface p-[14px_20px]">
          <button type="button" aria-label="Voltar" onClick={() => navigate(routes.home)} className="text-ink">
            ←
          </button>
          <div>
            <p className="text-body font-extrabold text-ink">Acolhimento</p>
            <p className="font-mono text-[12px] text-muted-2">texto anonimizado antes do envio</p>
          </div>
        </div>

        <div className="bg-warn-bg p-[9px] text-center text-[12.5px] text-warn-ink">
          Acolhimento por IA — não substitui atendimento profissional.
        </div>

        <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto p-[18px_16px]">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <div
                key={index}
                className="max-w-[80%] self-end rounded-[20px] rounded-br-md bg-brand p-[13px_15px] text-[14.5px] leading-relaxed text-white"
              >
                {message.content}
              </div>
            ) : (
              <div
                key={index}
                className="max-w-[80%] self-start rounded-[20px] rounded-bl-md bg-surface p-[13px_15px] text-[14.5px] leading-relaxed text-ink shadow-card"
              >
                {message.content}
              </div>
            ),
          )}
          {providerError && (
            <p className="text-[13px] text-danger">
              O acolhimento por IA está indisponível no momento. Tente novamente em instantes, ou use o
              atalho "Falar com uma pessoa real" abaixo.
            </p>
          )}
          {crisisFallback && (
            <p className="text-[13px] text-danger">
              Não conseguimos conectar você à IA agora. Se você está em risco, ligue para o CVV: 188.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate(routes.crisis)}
          className="mx-4 mb-3 flex items-center justify-center gap-2 rounded-2xl bg-surface-brand p-[13px] font-bold text-brand"
        >
          <HeartHandshake size={18} />
          Falar com uma pessoa real
        </button>

        {/* hasActiveRiskSignal is hardcoded false: real risk-signal detection is a separate,
            not-yet-built feature. Feeding crisisFallback back in here would be circular — that
            state only ever becomes true as a RESULT of hasActiveRiskSignal already being true. */}
        <ChatComposer isStreaming={isStreaming} onSend={(text) => sendMessage(text, false)} />
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test presentation/pages/ChatPage -- --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ChatPage.tsx apps/web/src/presentation/pages/ChatPage.test.tsx apps/web/src/presentation/components/ChatComposer.tsx
git commit -m "feat(web): restyle ChatPage and ChatComposer to Sereno, route handoff to /crisis"
```

---

## Task 2: `PeersPage`

**Files:**
- Create: `apps/web/src/presentation/pages/PeersPage.tsx`
- Test: `apps/web/src/presentation/pages/PeersPage.test.tsx`

**Interfaces:**
- Consumes: `PhoneShell` (Design System); `routes`.
- Produces: `PeersPage`, mounted at `/peers` in Task 4.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { PeersPage } from "./PeersPage";

function renderPeers() {
  return render(
    <MemoryRouter initialEntries={["/peers"]}>
      <Routes>
        <Route path="/peers" element={<PeersPage />} />
        <Route path="/chat" element={<div>Chat screen</div>} />
        <Route path="/home" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PeersPage", () => {
  it("renders both placeholder peers with role/status only, no identifying info", () => {
    renderPeers();
    expect(screen.getByText("Colega · Clínica médica")).toBeInTheDocument();
    expect(screen.getByText("plantão noturno · ● disponível")).toBeInTheDocument();
    expect(screen.getByText("Colega · Residência")).toBeInTheDocument();
    expect(screen.getByText("responde em ~1h")).toBeInTheDocument();
  });

  it("shows the mutual-anonymity guarantee", () => {
    renderPeers();
    expect(screen.getByText("conexão sem troca de identidade")).toBeInTheDocument();
  });

  it("routes to /chat as a stand-in when tapping a peer", async () => {
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: /Colega · Clínica médica/ }));
    expect(screen.getByText("Chat screen")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test PeersPage -- --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
import { Lock } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "../layout/PhoneShell";
import { routes } from "../lib/routes";

// TODO(week2): peer-matching gateway — this screen is designed UI over placeholder data.
const PEERS = [
  { initial: "C", name: "Colega · Clínica médica", status: "plantão noturno · ● disponível" },
  { initial: "C", name: "Colega · Residência", status: "responde em ~1h" },
] as const;

export function PeersPage() {
  const navigate = useNavigate();

  return (
    <PhoneShell>
      <div className="pt-[26px]">
        <button type="button" onClick={() => navigate(routes.home)} className="text-label font-semibold text-muted">
          ← Início
        </button>
        <h1 className="mt-4 text-h1 text-ink">Pares anônimos</h1>
        <p className="mt-1 text-caption text-muted">
          Médicos treinados para ouvir. Nem você nem seu par veem a identidade um do outro.
        </p>

        <div className="mt-5 flex flex-col gap-[12px]">
          {PEERS.map((peer, index) => (
            <button
              key={index}
              type="button"
              onClick={() => navigate(routes.chat)}
              className="flex items-center justify-between rounded-card bg-surface p-[18px] text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-[38px] w-[38px] items-center justify-center rounded-icon bg-surface-brand font-serif text-brand">
                  {peer.initial}
                </div>
                <div>
                  <p className="text-body font-extrabold text-ink">{peer.name}</p>
                  <p className="text-caption text-muted-2">{peer.status}</p>
                </div>
              </div>
              <span className="text-brand">→</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-1 rounded-2xl bg-surface-brand p-[13px]">
          <Lock size={14} className="text-brand" />
          <span className="font-mono text-[12.5px] text-brand">conexão sem troca de identidade</span>
        </div>
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test PeersPage -- --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/PeersPage.tsx apps/web/src/presentation/pages/PeersPage.test.tsx
git commit -m "feat(web): add PeersPage over placeholder peer data"
```

---

## Task 3: `ManagerDashboardPage`

**Files:**
- Create: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`
- Test: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:**
- Consumes: `PhoneShell`, `SectionLabel`, `Card` (Design System); `routes`.
- Produces: `ManagerDashboardPage`, mounted at `/manager` in Task 4.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { ManagerDashboardPage } from "./ManagerDashboardPage";

function renderManager() {
  return render(
    <MemoryRouter initialEntries={["/manager"]}>
      <Routes>
        <Route path="/manager" element={<ManagerDashboardPage />} />
        <Route path="/home" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ManagerDashboardPage", () => {
  it("renders only segments with n >= 5, suppressing the one below k-anonymity threshold", () => {
    renderManager();
    expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    expect(screen.getByText("Pronto-socorro")).toBeInTheDocument();
    expect(screen.getByText("UTI")).toBeInTheDocument();
    expect(screen.queryByText("Ambulatório")).not.toBeInTheDocument();
  });

  it("renders the privacy/suppression note and KPI figures", () => {
    renderManager();
    expect(screen.getByText(/menos de 5 respostas ficam ocultos/)).toBeInTheDocument();
    expect(screen.getByText("41%")).toBeInTheDocument();
    expect(screen.getByText("111")).toBeInTheDocument();
  });

  it("navigates to /home on back", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "← Sair da demo" }));
    expect(screen.getByText("Home screen")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ManagerDashboardPage -- --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
import { useNavigate } from "react-router";
import { PhoneShell } from "../layout/PhoneShell";
import { SectionLabel } from "../ui/SectionLabel";
import { Card } from "../ui/Card";
import { routes } from "../lib/routes";

// TODO(auth): gate behind manager role before production.
// TODO(week2): aggregation API — placeholder data below.
const SEGMENTS = [
  { label: "Plantão noturno", value: 52, n: 18 },
  { label: "Pronto-socorro", value: 38, n: 24 },
  { label: "UTI", value: 44, n: 9 },
  { label: "Ambulatório", value: 21, n: 3 },
] as const;

export function ManagerDashboardPage() {
  const navigate = useNavigate();
  // Privacy rule enforced here even on placeholder data, so behavior is already
  // correct when the real aggregation API lands (k-anonymity, k=5).
  const visibleSegments = SEGMENTS.filter((segment) => segment.n >= 5);

  return (
    <PhoneShell bg="canvas-alt">
      <div className="pt-[26px]">
        <button type="button" onClick={() => navigate(routes.home)} className="text-label font-semibold text-muted">
          ← Sair da demo
        </button>
        <div className="mt-4">
          <SectionLabel>Painel do gestor</SectionLabel>
        </div>
        <h1 className="mt-2 text-h2 text-ink">Tendências da equipe</h1>
        <p className="mt-1 text-caption text-muted">
          Somente dados anônimos e agregados. Segmentos com menos de 5 respostas ficam ocultos
          para evitar re-identificação.
        </p>

        <div className="mt-5 flex gap-3">
          <Card className="flex-1 text-center">
            <p className="font-serif text-[30px] text-warn">41%</p>
            <p className="text-caption text-muted">sinais de burnout na equipe</p>
          </Card>
          <Card className="flex-1 text-center">
            <p className="font-serif text-[30px] text-brand">111</p>
            <p className="text-caption text-muted">check-ins nas últimas 4 semanas</p>
          </Card>
        </div>

        <div className="mt-[14px]">
          <Card>
            <p className="text-body font-extrabold text-ink">Sinais por setor</p>
            <div className="mt-3 flex flex-col gap-3">
              {visibleSegments.map((segment) => (
                <div key={segment.label}>
                  <div className="flex items-center justify-between text-label text-ink-2">
                    <span>{segment.label}</span>
                    <span className="font-mono text-[12px] text-muted-2">
                      {segment.value}% · n={segment.n}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-pill bg-canvas-alt">
                    <div className="h-full rounded-pill bg-brand" style={{ width: `${segment.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test ManagerDashboardPage -- --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git commit -m "feat(web): add ManagerDashboardPage enforcing k>=5 suppression"
```

---

## Task 4: Wire `/peers` and `/manager`

**Files:**
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/router.test.tsx`

**Interfaces:**
- Consumes: `PeersPage` (Task 2), `ManagerDashboardPage` (Task 3).
- Produces: adds `peers` and `manager` to the route table — this is the last plan that adds routes, so after this task the route table matches `routing-and-state.md` §1 in full.

- [ ] **Step 1: Extend the router test**

Add imports and two children entries to `buildTestRouter` in `apps/web/src/app/router.test.tsx`, then add:

```tsx
it("Home's quick actions reach Peers and the Manager demo link reaches the dashboard", async () => {
  useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
  buildTestRouter("/home");
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Ver painel do gestor (demo)" }));
  expect(await screen.findByText("Tendências da equipe")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test app/router -- --run`
Expected: FAIL — `buildTestRouter` doesn't yet include `peers`/`manager`.

- [ ] **Step 3: Modify `apps/web/src/app/router.tsx`**

Add the import block and two children entries:

```tsx
import { PeersPage } from "../presentation/pages/PeersPage";
import { ManagerDashboardPage } from "../presentation/pages/ManagerDashboardPage";
```

```tsx
      { path: "peers", Component: PeersPage },
      { path: "manager", Component: ManagerDashboardPage },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test app/router -- --run`
Expected: PASS.

- [ ] **Step 5: Run the full test suite and build**

Run: `pnpm --filter web test -- --run && pnpm --filter web build`
Expected: all tests pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/router.tsx apps/web/src/app/router.test.tsx
git commit -m "feat(web): wire peers and manager dashboard routes"
```

---

## Task 5: Retire `ChatMessageList` and `HumanHandoffPanel`

**Files:**
- Delete: `apps/web/src/presentation/components/ChatMessageList.tsx`
- Delete: `apps/web/src/presentation/components/HumanHandoffPanel.tsx`

**Interfaces:** none — cleanup only, now that Task 1's restyled `ChatPage` inlines message bubbles and routes the handoff button to `/crisis` instead of opening the panel.

- [ ] **Step 1: Confirm nothing still imports them**

Run: `grep -rln "ChatMessageList\|HumanHandoffPanel" apps/web/src --include="*.tsx" --include="*.ts"`
Expected: no output.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/web/src/presentation/components/ChatMessageList.tsx apps/web/src/presentation/components/HumanHandoffPanel.tsx
```

- [ ] **Step 3: Run the full test suite and build**

Run: `pnpm --filter web test -- --run && pnpm --filter web build`
Expected: all tests pass, build succeeds — confirms no dangling references.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(web): remove ChatMessageList and HumanHandoffPanel, superseded by restyled ChatPage and /crisis route"
```

---

## Acceptance criteria (whole plan)

- Chat's disclaimer and handoff button survive scroll and streaming; both render with the network forced to error (structurally guaranteed — neither depends on `sendChatMessageUseCase`).
- Chat bubbles are styled per Sereno; a streamed assistant reply appears in a distinct bubble from the user's.
- No change to anonymization or send semantics — `sendMessage(text, false)` signature and `AnonymizeTextUseCase` placement are untouched.
- Peers shows no identifying info (role + availability only); anonymity guarantee copy is present.
- Manager dashboard never renders a segment with `n < 5`; only aggregate figures are shown, no individual drill-down exists.
- After this plan, the full 13-screen nav graph from `routing-and-state.md` §1 is wired end-to-end.

---

## Self-review notes

- **Spec coverage:** `11-chat.md` → Task 1. `12-peers.md` → Task 2. `13-manager.md` (incl. k-anonymity filter, auth/aggregation TODOs) → Task 3. Router wiring → Task 4. File-map cleanup (`ChatMessageList`/`HumanHandoffPanel` superseded) → Task 5.
- **Placeholder scan:** none found. The `// TODO(week2)` and `// TODO(auth)` comments are spec-mandated for genuinely not-yet-built backend features, not plan placeholders.
- **Type consistency:** `useChatConversation`'s return shape (`messages`, `isStreaming`, `crisisFallback`, `providerError`, `sendMessage`) is consumed identically to the pre-restyle `ChatPage` — no signature changes propagate anywhere else, since this plan is presentation-only.
