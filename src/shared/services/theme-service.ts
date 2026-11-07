export type Theme = 'light' | 'dark';

const themeStorageKey = 'vozflow-theme';

const isTheme = (value: string | null): value is Theme => value === 'light' || value === 'dark';

export const getInitialTheme = (): Theme => {
  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    if (isTheme(storedTheme)) return storedTheme;
  } catch {
    // The panel can still follow the system preference when storage is unavailable.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const applyTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // A blocked storage must not prevent the visual theme from being applied.
  }
};
