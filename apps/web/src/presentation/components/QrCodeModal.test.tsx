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
});
