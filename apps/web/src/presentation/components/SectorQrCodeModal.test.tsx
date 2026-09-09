import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SectorQrCodeModal } from "./SectorQrCodeModal";

describe("SectorQrCodeModal", () => {
  it("titles the modal with the sector name and encodes the sector's invite code", async () => {
    render(<SectorQrCodeModal isOpen onClose={vi.fn()} sectorName="UTI" inviteCode="uti-2026" />);

    await waitFor(() => screen.getByTestId("sector-qr-canvas"));
    expect(screen.getByText("QR Code — UTI")).toBeInTheDocument();
    expect(screen.getByText("Código: uti-2026")).toBeInTheDocument();
  });
});
