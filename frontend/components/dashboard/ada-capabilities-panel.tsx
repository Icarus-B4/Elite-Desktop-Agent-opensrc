'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Lock, Shield, Cpu } from 'lucide-react';
import { useWidgetManager } from './widget-manager';

interface AdaSettings {
  face_auth_enabled?: boolean;
  mock_hardware?: boolean;
  gesture_sensitivity?: number;
  camera_flipped?: boolean;
}

export function AdaCapabilitiesPanel() {
  const { openWidget } = useWidgetManager();
  const [ada, setAda] = useState<AdaSettings>({
    face_auth_enabled: false,
    mock_hardware: true,
    gesture_sensitivity: 2,
    camera_flipped: true,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/elite/ada/settings');
      const data = await res.json();
      setAda({
        face_auth_enabled: data.face_auth_enabled ?? false,
        mock_hardware: data.mock_hardware ?? true,
        gesture_sensitivity: data.gesture_sensitivity ?? 2,
        camera_flipped: data.camera_flipped ?? true,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: AdaSettings) => {
    const next = { ...ada, ...patch };
    setAda(next);
    setSaving(true);
    try {
      await fetch('/api/elite/ada/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      window.dispatchEvent(new CustomEvent('elite-gesture-settings', { detail: next }));
    } finally {
      setTimeout(() => setSaving(false), 400);
    }
  };

  const toggles = [
    {
      key: 'face_auth_enabled' as const,
      title: 'Face Auth',
      desc: 'Biometrischer Login vor riskanten Tools',
      icon: Lock,
      onEnable: () => openWidget('authLock'),
    },
    {
      key: 'mock_hardware' as const,
      title: 'Mock Hardware',
      desc: 'Drucker & Kasa simulieren bis Geräte da sind',
      icon: Cpu,
    },
  ];

  return (
    <div className="col-span-1 md:col-span-2 lg:col-span-3 rounded-2xl bg-white/[0.03] p-6 ring-1 ring-cyan-500/20">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white/[0.04] text-white/40 ring-1 ring-white/8">
            <Box className="size-4" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white/90">ADA Capabilities</h3>
            <p className="text-[10px] text-white/30">CAD · Drucker · Web-Agent · Kasa · Auth</p>
          </div>
        </div>
        <span className="text-[9px] font-mono text-white/35">{saving ? 'Sync…' : 'Live'}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {toggles.map(({ key, title, desc, icon: Icon, onEnable }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              const next = !ada[key];
              void save({ [key]: next });
              if (next && onEnable) onEnable();
            }}
            className={`text-left rounded-xl p-4 ring-1 transition-all ${
              ada[key]
                ? 'bg-cyan-500/15 ring-cyan-400/40 text-cyan-100'
                : 'bg-white/5 ring-white/10 text-white/50 hover:bg-white/8'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="size-4 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider">{title}</span>
            </div>
            <p className="text-[10px] leading-relaxed opacity-80">{desc}</p>
            <p className="mt-2 text-[9px] font-black uppercase tracking-widest">
              {ada[key] ? 'Aktiv' : 'Aus'}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['cad', 'printer', 'browserAgent', 'kasa'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => openWidget(id)}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase tracking-wider text-white/55"
          >
            {id} öffnen
          </button>
        ))}
        <button
          type="button"
          onClick={() => openWidget('authLock')}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase tracking-wider text-white/55 flex items-center gap-1"
        >
          <Shield className="size-3" />
          Auth Lock
        </button>
      </div>

      <div className="mt-4">
        <label className="text-[10px] text-white/45 uppercase tracking-wider">
          Gesten-Sensitivität: {ada.gesture_sensitivity?.toFixed(1)}
        </label>
        <input
          type="range"
          min={0.5}
          max={4}
          step={0.5}
          value={ada.gesture_sensitivity ?? 2}
          onChange={(e) => void save({ gesture_sensitivity: Number(e.target.value) })}
          className="w-full mt-2 accent-cyan-400"
        />
      </div>
    </div>
  );
}
