import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [currentTheme, setCurrentTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('sop-portal-theme');
      if (saved) return saved;
    } catch (e) {
      console.error(e);
    }
    return 'dark';
  });

  const getSystemTheme = () => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const resolvedTheme = currentTheme === 'system' ? getSystemTheme() : currentTheme;

  useEffect(() => {
    try {
      localStorage.setItem('sop-portal-theme', currentTheme);
    } catch (e) {
      console.error(e);
    }

    document.documentElement.dataset.theme = resolvedTheme;

    if (currentTheme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e) => {
        const newResolved = e.matches ? 'dark' : 'light';
        document.documentElement.dataset.theme = newResolved;
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [currentTheme, resolvedTheme]);

  const toggleTheme = () => {
    setCurrentTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, resolvedTheme, setTheme: setCurrentTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
