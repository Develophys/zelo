import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QrCodeModal } from "./QrCodeModal";

describe("QrCodeModal", () => {
  it("renders the title and the payload as text below the code", async () => {
    render(
      <QrCodeModal
        isOpen
        onClose={vi.fn()}
        title="QR Code — UTI"
        payload="uti-2026"
        downloadFilename="zelo-setor-uti-2026.png"
      />,
    );

    await waitFor(() => screen.getByTestId("qr-code-canvas"));
    expect(screen.getByText("Código: uti-2026")).toBeInTheDocument();
  });

  it("shows the same render-error message when the lazy qrcode module itself fails to load, not just when toCanvas throws", async () => {
    // Simulates the real prod failure: a stale deploy leaves this chunk 404ing
    // (server answers with the SPA's index.html), so `import("qrcode")`
    // rejects before toCanvas is ever reached. That rejection used to fall
    // outside the try/catch and surface only as an unhandled promise
    // rejection, leaving the canvas blank with no explanation.
    vi.doMock("qrcode", () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    vi.resetModules();
    const { QrCodeModal: FreshQrCodeModal } = await import("./QrCodeModal");

    render(
      <FreshQrCodeModal
        isOpen
        onClose={vi.fn()}
        title="QR Code — UTI"
        payload="uti-2026"
        downloadFilename="zelo-setor-uti-2026.png"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gerar o QR Code agora");
    expect(screen.queryByTestId("qr-code-canvas")).not.toBeInTheDocument();

    vi.doUnmock("qrcode");
    vi.resetModules();
  });
});
