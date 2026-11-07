import { useCallback, useState } from 'react';

// Executa uma ação do admin guardando o estado de envio e a mensagem de retorno.
export type ActionFeedback = { message: string; isError: boolean } | null;

export const useAction = (): {
  isBusy: boolean;
  feedback: ActionFeedback;
  run: (task: () => Promise<unknown>, success: string) => Promise<boolean>;
  clear: () => void;
} => {
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback>(null);

  const run = useCallback(async (task: () => Promise<unknown>, success: string): Promise<boolean> => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await task();
      setFeedback({ message: success, isError: false });
      return true;
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Não foi possível concluir a ação.', isError: true });
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { isBusy, feedback, run, clear: () => setFeedback(null) };
};
