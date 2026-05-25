'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';

export type HudThemeId = 0 | 1 | 2;

interface HudThemeConfig {
  color: string;
  glow: string;
  border: string;
  surfaceRgb: string;
  onAccentRgb: string;
}

const THEME_CONFIGS: Record<HudThemeId, HudThemeConfig> = {
  0: {
    color: '0, 242, 255',
    glow: 'rgba(0, 242, 255, 0.4)',
    border: 'rgba(0, 242, 255, 0.07)',
    surfaceRgb: '10, 21, 34',
    onAccentRgb: '0, 16, 24',
  },
  1: {
    color: '255, 170, 0',
    glow: 'rgba(255, 170, 0, 0.4)',
    border: 'rgba(255, 170, 0, 0.07)',
    surfaceRgb: '28, 20, 8',
    onAccentRgb: '24, 12, 0',
  },
  2: {
    color: '0, 255, 70',
    glow: 'rgba(0, 255, 70, 0.4)',
    border: 'rgba(0, 255, 70, 0.07)',
    surfaceRgb: '8, 24, 14',
    onAccentRgb: '0, 20, 8',
  },
};

export function applyHudTheme(id: number) {
  const themeId = (id in THEME_CONFIGS ? id : 0) as HudThemeId;
  const config = THEME_CONFIGS[themeId];
  const root = document.documentElement;

  root.style.setProperty('--accent-color', config.color);
  root.style.setProperty('--accent-glow', config.glow);
  root.style.setProperty('--accent-border', config.border);
  root.style.setProperty('--hud-surface-rgb', config.surfaceRgb);
  root.style.setProperty('--hud-on-accent-rgb', config.onAccentRgb);
  root.dataset.hudTheme = String(themeId);

  return themeId;
}

interface ThemeContextType {
  themeId: HudThemeId;
  refreshTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<HudThemeId>(0);

  const refreshTheme = useCallback(async () => {
    try {
      const res = await fetch('/api/elite/settings', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.hudAesthetics !== undefined) {
        const applied = applyHudTheme(data.hudAesthetics);
        setThemeId(applied);
      }
    } catch (e) {
      console.error('Theme fetch failed', e);
    }
  }, []);

  useEffect(() => {
    refreshTheme();
    const interval = setInterval(refreshTheme, 3000);

    const onSettingsUpdated = () => {
      void refreshTheme();
    };
    window.addEventListener('elite-settings-updated', onSettingsUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('elite-settings-updated', onSettingsUpdated);
    };
  }, [refreshTheme]);

  return (
    <ThemeContext.Provider value={{ themeId, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useHudTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useHudTheme must be used within ThemeProvider');
  return context;
};

/** @deprecated Nutze useHudTheme */
export const useTheme = useHudTheme;
