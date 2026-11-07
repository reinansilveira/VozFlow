import type { ReactElement } from 'react';

type StateMessageProps = { isLoading: boolean; error: string | null; isEmpty: boolean; emptyText: string; onRetry: () => void };

// Estados comuns de uma lista: carregando, erro com nova tentativa e vazio.
export const StateMessage = ({ isLoading, error, isEmpty, emptyText, onRetry }: StateMessageProps): ReactElement | null => {
  if (isLoading) return <p className="state-message" role="status">Carregando...</p>;
  if (error) {
    return <p className="state-message state-message--error" role="alert">
      {error} <button type="button" className="link-button" onClick={onRetry}>Tentar de novo</button>
    </p>;
  }
  if (isEmpty) return <p className="state-message">{emptyText}</p>;
  return null;
};
