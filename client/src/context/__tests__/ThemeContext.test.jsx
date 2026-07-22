import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';
import ThemeToggle from '../../components/ThemeToggle';

function TestComponent() {
  const { currentTheme, resolvedTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{currentTheme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <button data-testid="toggle-btn" onClick={toggleTheme}>Toggle</button>
      <ThemeToggle />
    </div>
  );
}

describe('ThemeProvider and ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'dark';
  });

  it('initializes with dark theme by default and sets dataset.theme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('toggles theme from dark to light and updates localStorage', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-btn');
    fireEvent.click(toggleBtn);

    expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('sop-portal-theme')).toBe('light');
  });

  it('ThemeToggle has accessible aria-label', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const ariaBtn = screen.getByRole('button', { name: /switch to light mode/i });
    expect(ariaBtn).toBeInDocument();
  });
});
