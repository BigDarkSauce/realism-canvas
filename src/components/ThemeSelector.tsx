import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type AppTheme = 'light' | 'dark';

export function getStoredTheme(): AppTheme {
  return (localStorage.getItem('app_theme') as AppTheme) || 'dark';
}

export function applyTheme(theme: AppTheme) {
  localStorage.setItem('app_theme', theme);
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const isDark = document.documentElement.classList.contains('dark');

  const toggle = () => {
    const next: AppTheme = isDark ? 'light' : 'dark';
    applyTheme(next);
    // Force re-render by dispatching a custom event
    window.dispatchEvent(new Event('themechange'));
  };

  return (
    <Button variant="outline" size="icon" onClick={toggle} className={className} title={isDark ? 'Switch to White mode' : 'Switch to Eye Care mode'}>
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

interface ThemeChooserProps {
  onChosen: () => void;
}

export function ThemeChooser({ onChosen }: ThemeChooserProps) {
  const choose = (theme: AppTheme) => {
    applyTheme(theme);
    localStorage.setItem('theme_chosen', '1');
    onChosen();
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-4 p-8 rounded-2xl border border-border bg-card shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Choose Your Theme</h1>
          <p className="text-sm text-muted-foreground">You can switch anytime using the toggle button.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => choose('dark')}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary transition-colors bg-[hsl(222,47%,11%)]"
          >
            <Moon className="h-8 w-8 text-[hsl(210,40%,98%)]" />
            <span className="text-sm font-semibold text-[hsl(210,40%,98%)]">Eye Care</span>
            <span className="text-xs text-[hsl(215,16%,46%)]">Dark, easy on the eyes</span>
          </button>
          <button
            onClick={() => choose('light')}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary transition-colors bg-[hsl(209,40%,96%)]"
          >
            <Sun className="h-8 w-8 text-[hsl(222,47%,11%)]" />
            <span className="text-sm font-semibold text-[hsl(222,47%,11%)]">White</span>
            <span className="text-xs text-[hsl(215,16%,46%)]">Bright and clean</span>
          </button>
        </div>
      </div>
    </div>
  );
}
