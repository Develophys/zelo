import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDataTableSelection } from './useDataTableSelection';

const NOUN = { singular: 'gestor', article: 'um' };

const rows = [
  { id: 'a', isActive: true },
  { id: 'b', isActive: true },
  { id: 'c', isActive: false },
];

function setup(list = rows) {
  return renderHook(() => useDataTableSelection(list, NOUN));
}

describe('useDataTableSelection — the eight bulk-action states', () => {
  it('disables everything with nothing selected, and says what to do', () => {
    const { result } = setup();
    expect(result.current.edit).toEqual({ enabled: false, reason: 'Selecione um gestor' });
    expect(result.current.pause).toEqual({ enabled: false, reason: 'Selecione ao menos um gestor' });
    expect(result.current.activate).toEqual({ enabled: false, reason: 'Selecione ao menos um gestor' });
    expect(result.current.remove).toEqual({ enabled: false, reason: 'Selecione ao menos um gestor' });
  });

  it('enables Excluir for any non-empty selection, whatever the statuses', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('c'));
    expect(result.current.remove.enabled).toBe(true);
    // …even where Pausar and Ativar both refuse the same mixed selection.
    expect(result.current.pause.enabled).toBe(false);
    expect(result.current.activate.enabled).toBe(false);
  });

  it('enables Editar for exactly one row', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    expect(result.current.edit.enabled).toBe(true);
    expect(result.current.edit.reason).toBeNull();
  });

  it('disables Editar for more than one, and says why', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));
    expect(result.current.edit).toEqual({
      enabled: false,
      reason: 'Selecione apenas um gestor para editar',
    });
  });

  it('enables Pausar when every selected row is active', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));
    expect(result.current.pause.enabled).toBe(true);
    expect(result.current.activate).toEqual({
      enabled: false,
      reason: 'Os selecionados já estão ativos',
    });
  });

  it('enables Ativar when every selected row is inactive', () => {
    const { result } = setup();
    act(() => result.current.toggle('c'));
    expect(result.current.activate.enabled).toBe(true);
    expect(result.current.pause).toEqual({
      enabled: false,
      reason: 'Os selecionados já estão inativos',
    });
  });

  it('disables both on a mixed selection, naming the mix', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('c'));
    expect(result.current.pause.reason).toBe('Selecione apenas gestores com o mesmo status');
    expect(result.current.activate.reason).toBe('Selecione apenas gestores com o mesmo status');
  });
});

describe('useDataTableSelection — select-all', () => {
  it('reports indeterminate while some but not all are selected', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    expect(result.current.someSelected).toBe(true);
    expect(result.current.allSelected).toBe(false);
  });

  it('selects all, then clears on a second toggle', () => {
    const { result } = setup();
    act(() => result.current.toggleAll());
    expect(result.current.allSelected).toBe(true);
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([]);
  });

  // A row that scrolled out of the loaded window must not stay selected — its
  // bulk action would apply to something the manager can no longer see.
  it('drops a selected id that disappears from the rows', () => {
    const { result, rerender } = renderHook(({ list }) => useDataTableSelection(list, NOUN), {
      initialProps: { list: rows },
    });
    act(() => result.current.toggle('c'));
    rerender({ list: rows.filter((row) => row.id !== 'c') });
    expect(result.current.selectedIds).toEqual([]);
  });
});
