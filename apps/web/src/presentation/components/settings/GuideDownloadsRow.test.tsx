import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuideDownloadsRow } from './GuideDownloadsRow';

describe('GuideDownloadsRow', () => {
  it('links straight to the pocket and complete PDF files, each set to download', () => {
    render(
      <GuideDownloadsRow
        pocketHref="/guides/zelo-guia-de-bolso-medico.pdf"
        completeHref="/guides/zelo-guia-completo-medico.pdf"
      />,
    );

    const pocket = screen.getByRole('link', { name: /guia de bolso/i });
    expect(pocket).toHaveAttribute('href', '/guides/zelo-guia-de-bolso-medico.pdf');
    expect(pocket).toHaveAttribute('download');

    const complete = screen.getByRole('link', { name: /guia completo/i });
    expect(complete).toHaveAttribute('href', '/guides/zelo-guia-completo-medico.pdf');
    expect(complete).toHaveAttribute('download');
  });

  it('names the section and explains the difference between the two PDFs', () => {
    render(<GuideDownloadsRow pocketHref="/a.pdf" completeHref="/b.pdf" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Guias em PDF' })).toBeInTheDocument();
    expect(screen.getByText(/de bolso.*essencial/i)).toBeInTheDocument();
  });
});
