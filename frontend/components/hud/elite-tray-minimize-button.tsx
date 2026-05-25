'use client';

import { Minimize2 } from 'lucide-react';
import { useIsElectron } from '@/hooks/use-is-electron';

export function EliteTrayMinimizeButton() {
  const { isElectron, mounted } = useIsElectron();

  if (!mounted || !isElectron) return null;

  return (
    <button
      type="button"
      onClick={() => window.eliteAPI?.hideToTray?.()}
      className="group fixed bottom-5 right-5 z-[10002] flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-transparent/10 backdrop-opacity-10 text-white/45 transition-all hover:border-cyan-400/40 hover:bg-transparent hover:text-cyan-300 hover:shadow-[0_0_18px_rgba(6,182,212,0.28)]"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      title="In Systemleiste minimieren"
      aria-label="In Systemleiste minimieren"
    >
      <Minimize2 size={13} strokeWidth={2.25} />
    </button>
  );
}
