import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeerChatRoom } from "./PeerChatRoom";

describe("PeerChatRoom", () => {
  it("renders messages from both sides", () => {
    render(
      <PeerChatRoom
        messages={[{ from: "me", text: "oi" }, { from: "peer", text: "olá" }]}
        onSend={() => {}}
        onLeave={() => {}}
        peerLeft={false}
      />,
    );

    expect(screen.getByText("oi")).toBeInTheDocument();
    expect(screen.getByText("olá")).toBeInTheDocument();
  });

  it("calls onSend with the trimmed message and clears the input", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<PeerChatRoom messages={[]} onSend={onSend} onLeave={() => {}} peerLeft={false} />);

    const input = screen.getByLabelText("Mensagem");
    await user.type(input, "  oi  ");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSend).toHaveBeenCalledWith("oi");
    expect(input).toHaveValue("");
  });

  it("does not call onSend for an empty message", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<PeerChatRoom messages={[]} onSend={onSend} onLeave={() => {}} peerLeft={false} />);

    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onLeave when 'Sair da conversa' is clicked", async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    render(<PeerChatRoom messages={[]} onSend={() => {}} onLeave={onLeave} peerLeft={false} />);

    await user.click(screen.getByRole("button", { name: "Sair da conversa" }));

    expect(onLeave).toHaveBeenCalled();
  });

  it("shows a banner when the other side has left", () => {
    render(<PeerChatRoom messages={[]} onSend={() => {}} onLeave={() => {}} peerLeft={true} />);
    expect(screen.getByRole("status")).toHaveTextContent("O colega saiu da conversa.");
  });

  it("keeps the browser spellchecker and writing extensions off the message field, which carries the same mental-health text as the AI chat with no anonymizer in front of it at all", () => {
    render(<PeerChatRoom messages={[]} onSend={() => {}} onLeave={() => {}} peerLeft={false} />);
    const field = screen.getByLabelText("Mensagem");

    expect(field).toHaveAttribute("spellcheck", "false");
    expect(field).toHaveAttribute("data-gramm", "false");
    expect(field).toHaveAttribute("data-gramm_editor", "false");
    expect(field).toHaveAttribute("data-enable-grammarly", "false");
  });
});
