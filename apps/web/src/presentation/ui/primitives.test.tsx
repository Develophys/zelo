import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Trash2 } from 'lucide-react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Pill } from './Pill';
import { Tooltip } from './Tooltip';
import { Checkbox } from './Checkbox';

function KitchenSink() {
  return (
    <div>
      <h1>Primitivas</h1>
      {(['primary', 'outline', 'ghost', 'danger', 'soft'] as const).map((variant) =>
        (['md', 'sm'] as const).map((size) => (
          <Button key={`${variant}-${size}`} variant={variant} size={size} full={false}>
            {variant} {size}
          </Button>
        )),
      )}
      <Button variant="primary" isLoading>
        Enviando
      </Button>
      <Button variant="primary" disabled>
        Indisponível
      </Button>

      {(['outline', 'ghost', 'danger'] as const).map((variant) => (
        <IconButton key={variant} variant={variant} label={`Excluir ${variant}`} icon={<Trash2 size={16} />} />
      ))}

      {(['neutral', 'positive', 'warning', 'danger'] as const).map((tone) => (
        <Pill key={tone} tone={tone}>
          {tone}
        </Pill>
      ))}

      <label htmlFor="all">Selecionar tudo</label>
      <Checkbox id="all" indeterminate />
      <label htmlFor="one">Linha 1</label>
      <Checkbox id="one" defaultChecked />

      <Tooltip content="Explicação">
        <button type="button">Com dica</button>
      </Tooltip>
    </div>
  );
}

describe('ui primitives', () => {
  it('renders every variant with no axe violations', async () => {
    const { container } = render(<KitchenSink />);
    const results = await axe(container, { rules: { region: { enabled: false } } });
    expect(results).toHaveNoViolations();
  });

  // Scoped to the control boxes themselves: a decorative descendant that is a
  // circle by geometry — the loading spinner's ring — is not a control shape.
  it('gives every control the sharp corner scale, never a pill or a soft radius', () => {
    const { container } = render(<KitchenSink />);
    const controls = [...container.querySelectorAll('button, input')];
    expect(controls.length).toBeGreaterThan(10);
    for (const el of controls) {
      expect(el.className.toString()).not.toMatch(/rounded-(pill|full|xl|2xl|3xl)\b/);
    }
  });
});

describe('IconButton', () => {
  it('uses its label as the accessible name, since the icon carries no text', () => {
    render(<IconButton label="Reenviar convite" icon={<Trash2 size={16} />} />);
    expect(screen.getByRole('button', { name: 'Reenviar convite' })).toBeInTheDocument();
  });

  it('hides the icon from assistive tech so the name is not read twice', () => {
    const { container } = render(<IconButton label="Excluir" icon={<Trash2 size={16} />} />);
    expect(container.querySelector('button > span')).toHaveAttribute('aria-hidden', 'true');
  });

  it('wins over an aria-label a caller slipped past the type, which cannot reject one', () => {
    render(
      // No @ts-expect-error here, and that is the point: `aria-label` is Omit-ed
      // from IconButtonProps, yet TypeScript accepts it anyway because it skips
      // excess-property checks on hyphenated JSX attributes.
      <IconButton label="Excluir" icon={<Trash2 size={16} />} aria-label="algo errado" />,
    );
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('keeps a 44px tap target around a 32px box', () => {
    render(<IconButton label="Excluir" icon={<Trash2 size={16} />} />);
    const button = screen.getByRole('button', { name: 'Excluir' });
    expect(button.className).toContain('h-8');
    expect(button.className).toContain('before:-inset-1.5');
  });
});

describe('Tooltip', () => {
  it('opens on focus and closes on blur, so keyboard users reach the same hint as the mouse', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Explicação">
        <button type="button">Ação</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Explicação');
    await user.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('closes on Escape while the trigger keeps focus', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Explicação">
        <button type="button">Ação</button>
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ação' })).toHaveFocus();
  });

  it('describes the trigger when the hint adds information the name does not carry', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Selecione apenas um gestor">
        <button type="button">Editar</button>
      </Tooltip>,
    );
    await user.tab();
    const button = screen.getByRole('button', { name: 'Editar' });
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
  });

  it('stays out of the accessibility tree when it only restates the accessible name', async () => {
    const user = userEvent.setup();
    render(<IconButton label="Excluir" icon={<Trash2 size={16} />} />);
    await user.tab();
    const button = screen.getByRole('button', { name: 'Excluir' });
    expect(button).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('still fires the trigger own handlers it wraps', async () => {
    const user = userEvent.setup();
    let clicks = 0;
    render(
      <Tooltip content="Dica">
        <button type="button" onClick={() => (clicks += 1)}>
          Ação
        </button>
      </Tooltip>,
    );
    await user.click(screen.getByRole('button', { name: 'Ação' }));
    expect(clicks).toBe(1);
  });

  // z-50 does not help against an ancestor with overflow: hidden — the bubble
  // is clipped, not stacked behind. Portaling to document.body sidesteps any
  // clipping ancestor instead of hunting each one down.
  it('portals the bubble past a clipping ancestor instead of being cut off by it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div style={{ overflow: 'hidden' }}>
        <Tooltip content="Explicação">
          <button type="button">Ação</button>
        </Tooltip>
      </div>,
    );
    await user.tab();
    const tooltip = screen.getByRole('tooltip');
    expect(container.contains(tooltip)).toBe(false);
    expect(document.body.contains(tooltip)).toBe(true);
  });

  it('clamps the bubble inside the viewport instead of running off the edge near the trigger', async () => {
    const user = userEvent.setup();
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    const rectSpy = vi
      .spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        top: 40,
        left: 380,
        right: 420,
        bottom: 60,
        width: 40,
        height: 20,
        x: 380,
        y: 40,
        toJSON() {},
      } as DOMRect);
    const widthSpy = vi.spyOn(HTMLSpanElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
    const heightSpy = vi.spyOn(HTMLSpanElement.prototype, 'offsetHeight', 'get').mockReturnValue(32);

    try {
      render(
        <Tooltip content="Texto bem comprido para a dica de contexto">
          <button type="button">Ação</button>
        </Tooltip>,
      );
      await user.tab();
      const tooltip = screen.getByRole('tooltip');
      expect(parseFloat(tooltip.style.left)).toBe(400 - 8 - 200);
      expect(parseFloat(tooltip.style.left)).toBeGreaterThanOrEqual(8);
    } finally {
      rectSpy.mockRestore();
      widthSpy.mockRestore();
      heightSpy.mockRestore();
      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    }
  });

  it('flips below the trigger instead of running off the top when there is no room above it', async () => {
    const user = userEvent.setup();
    const rectSpy = vi
      .spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        top: 10,
        left: 100,
        right: 140,
        bottom: 30,
        width: 40,
        height: 20,
        x: 100,
        y: 10,
        toJSON() {},
      } as DOMRect);
    const widthSpy = vi.spyOn(HTMLSpanElement.prototype, 'offsetWidth', 'get').mockReturnValue(80);
    const heightSpy = vi.spyOn(HTMLSpanElement.prototype, 'offsetHeight', 'get').mockReturnValue(32);

    try {
      render(
        <Tooltip content="Explicação">
          <button type="button">Ação</button>
        </Tooltip>,
      );
      await user.tab();
      const tooltip = screen.getByRole('tooltip');
      expect(parseFloat(tooltip.style.top)).toBe(30 + 8);
    } finally {
      rectSpy.mockRestore();
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it('does not detach and reattach a caller-supplied callback ref while the tooltip opens and closes', async () => {
    const user = userEvent.setup();
    const calls: Array<HTMLElement | null> = [];
    const refCallback = (node: HTMLElement | null) => {
      calls.push(node);
    };

    render(
      <Tooltip content="Explicação">
        <button type="button" ref={refCallback}>
          Ação
        </button>
      </Tooltip>,
    );
    expect(calls).toHaveLength(1);

    await user.tab();
    await user.tab();

    expect(calls).toHaveLength(1);
  });

  it('bails out of re-rendering the trigger when a scroll leaves the measured position unchanged', async () => {
    const user = userEvent.setup();
    const rectSpy = vi
      .spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        top: 100,
        left: 100,
        right: 140,
        bottom: 120,
        width: 40,
        height: 20,
        x: 100,
        y: 100,
        toJSON() {},
      } as DOMRect);
    const widthSpy = vi.spyOn(HTMLSpanElement.prototype, 'offsetWidth', 'get').mockReturnValue(80);
    const heightSpy = vi.spyOn(HTMLSpanElement.prototype, 'offsetHeight', 'get').mockReturnValue(32);

    let renderCount = 0;
    function Trigger(props: Record<string, unknown>) {
      renderCount += 1;
      return (
        <button type="button" {...props}>
          Ação
        </button>
      );
    }

    try {
      render(
        <Tooltip content="Explicação">
          <Trigger />
        </Tooltip>,
      );
      await user.tab();
      const countAfterOpen = renderCount;

      fireEvent.scroll(window);

      expect(renderCount).toBe(countAfterOpen);
    } finally {
      rectSpy.mockRestore();
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });
});

describe('Checkbox', () => {
  it('exposes the indeterminate state on the real input, where assistive tech reads it', () => {
    render(
      <>
        <label htmlFor="all">Selecionar tudo</label>
        <Checkbox id="all" indeterminate />
      </>,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Selecionar tudo').indeterminate).toBe(true);
  });

  it('toggles from the keyboard like a native checkbox', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [checked, setChecked] = useState(false);
      return (
        <>
          <label htmlFor="row">Linha 1</label>
          <Checkbox id="row" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        </>
      );
    }
    render(<Controlled />);
    const input = screen.getByLabelText('Linha 1');
    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard(' ');
    expect(input).toBeChecked();
  });
});

describe('Pill', () => {
  it('borders only the warning tone, the one that asks for an action', () => {
    render(
      <div>
        <Pill tone="warning">Convite pendente</Pill>
        <Pill tone="positive">Ativa</Pill>
      </div>,
    );
    expect(screen.getByText('Convite pendente').className).toContain('border-warn');
    expect(screen.getByText('Ativa').className).not.toContain('border');
  });

  it('never wraps a status mid-label', () => {
    render(<Pill tone="danger">Convite expirado</Pill>);
    expect(screen.getByText('Convite expirado').className).toContain('whitespace-nowrap');
  });
});

describe('Button', () => {
  it('swaps the label for a spinner while loading but keeps the accessible name', () => {
    render(<Button isLoading>Enviar</Button>);
    const button = screen.getByRole('button', { name: 'Enviar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(within(button).getByTestId('button-spinner')).toBeInTheDocument();
  });
});
