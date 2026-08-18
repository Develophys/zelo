import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ explode }: { explode: boolean }): React.ReactNode {
  if (explode) throw new Error('render falhou');
  return <p>conteúdo</p>;
}

function silenceReactErrorLog() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('ErrorBoundary', () => {
  it('renders children untouched while nothing throws', () => {
    render(
      <ErrorBoundary fallback={() => <p>alternativa</p>}>{<Boom explode={false} />}</ErrorBoundary>,
    );

    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    expect(screen.queryByText('alternativa')).not.toBeInTheDocument();
  });

  it('swaps in the fallback instead of letting one broken child blank the whole surface', () => {
    const log = silenceReactErrorLog();

    render(<ErrorBoundary fallback={() => <p>alternativa</p>}>{<Boom explode />}</ErrorBoundary>);

    expect(screen.getByText('alternativa')).toBeInTheDocument();
    log.mockRestore();
  });

  it('reports the error to the caller so a crash is never swallowed silently', () => {
    const log = silenceReactErrorLog();
    const onError = vi.fn();

    render(
      <ErrorBoundary fallback={() => <p>alternativa</p>} onError={onError}>
        {<Boom explode />}
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    log.mockRestore();
  });

  it('recovers through the retry handed to the fallback, so a transient failure is not a dead end until reload', async () => {
    const log = silenceReactErrorLog();
    const user = userEvent.setup();

    function Host() {
      const [explode, setExplode] = useState(true);
      return (
        <ErrorBoundary
          fallback={(retry) => (
            <button
              type="button"
              onClick={() => {
                setExplode(false);
                retry();
              }}
            >
              Tentar de novo
            </button>
          )}
        >
          <Boom explode={explode} />
        </ErrorBoundary>
      );
    }

    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    log.mockRestore();
  });

  it('announces recovery only once the children actually render again, so a caller can move focus off the fallback it just unmounted', async () => {
    const log = silenceReactErrorLog();
    const user = userEvent.setup();
    const onRecover = vi.fn();

    function Host() {
      const [explode, setExplode] = useState(true);
      return (
        <ErrorBoundary
          onRecover={onRecover}
          fallback={(retry) => (
            <button
              type="button"
              onClick={() => {
                setExplode(false);
                retry();
              }}
            >
              Tentar de novo
            </button>
          )}
        >
          <Boom explode={explode} />
        </ErrorBoundary>
      );
    }

    render(<Host />);
    expect(onRecover).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(onRecover).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it('stays silent when the retry throws again, so the caller never treats a still-broken subtree as recovered', async () => {
    const log = silenceReactErrorLog();
    const user = userEvent.setup();
    const onRecover = vi.fn();

    render(
      <ErrorBoundary
        onRecover={onRecover}
        fallback={(retry) => (
          <button type="button" onClick={retry}>
            Tentar de novo
          </button>
        )}
      >
        <Boom explode />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(onRecover).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
