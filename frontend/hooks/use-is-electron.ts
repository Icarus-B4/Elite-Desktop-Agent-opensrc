'use client';

import { useEffect, useState } from 'react';

/**
 * Erkennt Electron erst nach Mount – verhindert Next.js Hydration-Mismatch
 * (Server rendert immer "Browser", Client gleicht danach an).
 */
export function useIsElectron() {
  const [isElectron, setIsElectron] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const electron = navigator.userAgent.toLowerCase().includes('electron');
    setIsElectron(electron);
    setMounted(true);
    if (electron) {
      document.documentElement.classList.add('electron-app');
    }
    return () => document.documentElement.classList.remove('electron-app');
  }, []);

  return { isElectron, mounted };
}
