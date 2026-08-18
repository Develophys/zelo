import { AnonymityNote } from './AnonymityNote';

export function ChatEmptyState() {
  return (
    <div className="mx-auto max-w-[52ch] px-2 py-10">
      <h2 className="text-balance text-h2 text-brand">Comece por onde quiser</h2>
      <p className="mt-3 hyphens-auto text-justify text-body text-muted">
        Escreva o que estiver passando pela sua cabeça — o cansaço do plantão, uma noite ruim, ou
        nada em particular.
      </p>
      <AnonymityNote className="mt-4 text-body">
        Seu texto é anonimizado antes do envio.
      </AnonymityNote>
    </div>
  );
}
