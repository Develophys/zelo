import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PhoneShell } from "./PhoneShell";

// PhoneShell mounts the shared AppHeader, which reads the pathname, so even the
// geometry-only cases need a router around them.
function renderShell(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("PhoneShell", () => {
  it("renders children in a scrollable body with horizontal padding by default", () => {
    renderShell(<PhoneShell>content</PhoneShell>);
    const body = screen.getByTestId("phone-shell-body");
    expect(body).toHaveClass("px-6");
    expect(body).toHaveTextContent("content");
  });

  it("removes horizontal padding when bleed is set", () => {
    renderShell(<PhoneShell bleed>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-body")).not.toHaveClass("px-6");
  });

  it("renders the footer in a flex-none slot when provided", () => {
    renderShell(<PhoneShell footer={<div data-testid="my-footer">nav</div>}>content</PhoneShell>);
    expect(screen.getByTestId("my-footer")).toBeInTheDocument();
  });

  it("defaults to the canvas background", () => {
    renderShell(<PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-root")).toHaveClass("bg-canvas");
  });

  it("uses dynamic viewport height so mobile browser toolbars don't clip content", () => {
    renderShell(<PhoneShell>content</PhoneShell>);
    const root = screen.getByTestId("phone-shell-root");
    expect(root).toHaveClass("min-h-dvh");
    expect(root).not.toHaveClass("min-h-screen");
  });
});

describe("PhoneShell nav mode", () => {
  it("does not render a Sidebar when nav is unset", () => {
    renderShell(<PhoneShell>content</PhoneShell>);
    expect(screen.queryByRole("navigation", { name: "Navegação principal" })).not.toBeInTheDocument();
  });

  it("does not add flex-1 to phone-shell-root when nav is unset", () => {
    renderShell(<PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-root")).not.toHaveClass("flex-1");
  });

  it("renders the Sidebar when nav is set", () => {
    render(
      <MemoryRouter>
        <PhoneShell nav>content</PhoneShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
  });

  it("adds flex-1 to phone-shell-root when nav is set", () => {
    render(
      <MemoryRouter>
        <PhoneShell nav>content</PhoneShell>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("phone-shell-root")).toHaveClass("flex-1");
  });

  it("hides the footer at the tablet breakpoint when nav is set", () => {
    render(
      <MemoryRouter>
        <PhoneShell nav footer={<div data-testid="my-footer">nav</div>}>
          content
        </PhoneShell>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("my-footer").parentElement).toHaveClass("md:hidden");
  });

  it("uses dynamic viewport height on the outer nav wrapper too", () => {
    const { container } = render(
      <MemoryRouter>
        <PhoneShell nav>content</PhoneShell>
      </MemoryRouter>,
    );
    expect(container.firstElementChild).toHaveClass("min-h-dvh");
    expect(container.firstElementChild).not.toHaveClass("min-h-screen");
  });
});

describe("PhoneShell fill mode", () => {
  it("pins to an exact viewport height instead of a minimum, so a page owning its own scroller keeps its chrome on screen", () => {
    renderShell(<PhoneShell fill>content</PhoneShell>);
    const root = screen.getByTestId("phone-shell-root");
    expect(root).toHaveClass("h-dvh");
    expect(root).not.toHaveClass("min-h-dvh");
  });

  it("hands scrolling to the page rather than scrolling the body itself", () => {
    renderShell(<PhoneShell fill>content</PhoneShell>);
    const body = screen.getByTestId("phone-shell-body");
    expect(body).toHaveClass("overflow-hidden", "min-h-0", "flex-1");
    expect(body).not.toHaveClass("overflow-y-auto");
  });

  it("also pins the outer nav wrapper so the Sidebar cannot push the column taller than the viewport", () => {
    const { container } = render(
      <MemoryRouter>
        <PhoneShell nav fill>
          content
        </PhoneShell>
      </MemoryRouter>,
    );
    expect(container.firstElementChild).toHaveClass("h-dvh", "overflow-hidden");
    expect(container.firstElementChild).not.toHaveClass("min-h-dvh");
  });
});

describe("PhoneShell centered mode", () => {
  it("does not constrain body width when centered is unset", () => {
    renderShell(<PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-body")).not.toHaveClass("md:max-w-170");
  });

  it("constrains and centers the body from the tablet breakpoint when centered is set", () => {
    renderShell(<PhoneShell centered>content</PhoneShell>);
    const body = screen.getByTestId("phone-shell-body");
    expect(body).toHaveClass("md:max-w-170", "md:mx-auto");
  });
});

describe("PhoneShell header", () => {
  function mountAt(path: string, element: ReactElement) {
    return render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
  }

  it("renders the shared header above the body on a route that has one", () => {
    mountAt("/you", <PhoneShell>content</PhoneShell>);
    const header = screen.getByTestId("app-header");
    const body = screen.getByTestId("phone-shell-body");
    expect(header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no header on a route that has none", () => {
    mountAt("/", <PhoneShell>content</PhoneShell>);
    expect(screen.queryByTestId("app-header")).not.toBeInTheDocument();
  });

  it("pins the header with sticky when the document owns the scroll", () => {
    mountAt("/you", <PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("app-header")).toHaveClass("sticky", "top-0", "z-30");
  });

  it("keeps the header out of the scroller when the page owns it", () => {
    mountAt("/chat", <PhoneShell fill>content</PhoneShell>);
    const header = screen.getByTestId("app-header");
    expect(header).toHaveClass("flex-none");
    expect(header).not.toHaveClass("sticky");
  });

  it("passes the override through to the header", () => {
    mountAt("/you", <PhoneShell headerOverride={{ title: "Sobrescrito" }}>content</PhoneShell>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sobrescrito");
  });

  it("matches the header column to the centered body by default", () => {
    mountAt("/you", <PhoneShell centered>content</PhoneShell>);
    expect(screen.getByTestId("app-header-row").className).toContain("md:max-w-170");
  });

  it("lets the caller override the header column", () => {
    mountAt("/chat", <PhoneShell centered headerColumn="max-w-chat">content</PhoneShell>);
    const row = screen.getByTestId("app-header-row").className;
    expect(row).toContain("max-w-chat");
    expect(row).not.toContain("md:max-w-170");
  });

  it("gives the scrolling body its top padding, so pages stop setting their own", () => {
    mountAt("/you", <PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-body")).toHaveClass("pt-6");
  });

  it("keeps the fill body flush against the header, since the page owns its own chrome", () => {
    mountAt("/chat", <PhoneShell fill bleed>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-body")).not.toHaveClass("pt-6");
  });
});
