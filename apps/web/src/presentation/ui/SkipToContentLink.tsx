export const CONTENT_ID = 'conteudo';

/**
 * The first focusable thing in either shell.
 *
 * Without it a keyboard user on a manager admin page tabs through eight sidebar
 * destinations, the theme switch, the select-all checkbox and the search field
 * before reaching the first row — on every page load. Hidden until focused, so
 * it costs a sighted user nothing.
 */
export function SkipToContentLink() {
  return (
    <a
      href={`#${CONTENT_ID}`}
      className="sr-only rounded-control bg-brand-fill px-4 py-2 text-label font-semibold text-on-fill focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      Pular para o conteúdo
    </a>
  );
}
