import { useCallback, useEffect, useState } from 'react';

// Carrega um recurso com estados de carregamento, erro e recarga.
export type Resource<T> = { data: T | null; isLoading: boolean; error: string | null; reload: () => Promise<void> };

export const useResource = <T>(load: () => Promise<T>): Resource<T> => {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os dados.');
    } finally {
      setIsLoading(false);
    }
  }, [load]);

  useEffect(() => { void reload(); }, [reload]);

  return { data, isLoading, error, reload };
};
