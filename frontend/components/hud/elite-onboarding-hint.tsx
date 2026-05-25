'use client';

import { useState } from 'react';
import { X, Mic, MessageSquare } from 'lucide-react';

const STORAGE_KEY = 'elite-onboarding-dismissed-v1';

export function EliteOnboardingHint() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) !== '1';
  });

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  return (
    <div
      className="mx-4 mt-3 mb-1 rounded-xl border border-cyan-500/30 bg-slate-950/90 p-4 text-sm shadow-lg backdrop-blur-md"
      style={{ color: '#9BB0D6' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="font-medium" style={{ color: '#E8EFFF' }}>
            Kurzstart: So arbeitest du mit Elite
          </p>
          <ul className="space-y-1.5 list-none pl-0">
            <li className="flex items-start gap-2">
              <Mic className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
              <span>
                <strong style={{ color: '#E8EFFF' }}>Sprache:</strong> „Elite, …“ oder „Jarvis, …“ — bei VAD Modus 1/2 auch klare Befehle wie „Öffne Chrome“.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
              <span>
                <strong style={{ color: '#E8EFFF' }}>Ein Chat unten:</strong> Elite-Befehle direkt;
                für Hermes <code className="text-violet-300">@hermes …</code> (PDF, Recherche, Multi-Step).
              </span>
            </li>
            <li>
              <strong style={{ color: '#E8EFFF' }}>PAI Pulse</strong> (localhost:31337) zeigt TELOS/Knowledge — Loops startest du per Sprache/Chat, nicht per Stub-Buttons auf Pulse.
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            Ausführlich: <code className="text-cyan-400/90">PAI_HUD_GUIDE.md</code> im Projektordner · Einstellungen: Zahnrad → Dashboard
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 p-1 rounded hover:bg-white/10 text-slate-400"
          aria-label="Hinweis schließen"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
