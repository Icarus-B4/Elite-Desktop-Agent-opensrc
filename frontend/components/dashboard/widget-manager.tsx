'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { ToastProvider } from './toast-provider';
import { broadcastWidgetSync, subscribeWidgetSync, POPOUTABLE_WIDGETS } from '@/lib/widget-sync';
import { playSystemSound } from '@/lib/audio-effects';
import { dispatchChatCleared } from '@/lib/chat-storage';

/**
 * Widget-Manager: Zentrale Steuerung aller Dashboard-Widgets.
 * Ermöglicht openWidget(name), closeWidget(name), toggleWidget(name)
 * für Multi-Command-Recognition (KI kann mehrere Widgets gleichzeitig steuern).
 */

// Verfügbare Widget-IDs
export type WidgetId =
  | 'webcam'
  | 'imageGrid'
  | 'chat'
  | 'systemMonitor'
  | 'music'
  | 'logStream'
  | 'textEditor'
  | 'commandList'
  | 'missionControl'
  | 'paiPulse'
  | 'settings'
  | 'mediaPlayer'
  | 'cad'
  | 'printer'
  | 'browserAgent'
  | 'kasa'
  | 'authLock'
  | 'terminal';

// Alle Widgets mit Standardzustand
const DEFAULT_WIDGETS: Record<WidgetId, boolean> = {
  webcam: false,
  imageGrid: false,
  chat: false,
  systemMonitor: false,
  music: false,
  logStream: false,
  textEditor: false,
  commandList: false,
  missionControl: false,
  paiPulse: false,
  settings: false,
  mediaPlayer: false,
  cad: false,
  printer: false,
  browserAgent: false,
  kasa: false,
  authLock: false,
  terminal: false,
};

const TOGGLE_ALL_WIDGET_IDS: WidgetId[] = [
  'webcam',
  'imageGrid',
  'chat',
  'systemMonitor',
  'music',
  'logStream',
  'textEditor',
  'commandList',
  'missionControl',
  'paiPulse',
  'cad',
  'printer',
  'browserAgent',
  'kasa',
  'terminal',
];

interface WidgetManagerContextType {
  widgets: Record<WidgetId, boolean>;
  expandedWidgets: Record<WidgetId, boolean>;
  widgetOrder: WidgetId[];
  setWidgetOrder: (order: WidgetId[]) => void;
  fullscreenWidget: WidgetId | null;
  toggleFullscreen: (name: WidgetId | null) => void;
  openWidget: (name: WidgetId) => void;
  closeWidget: (name: WidgetId) => void;
  closeAllWidgets: () => void;
  toggleWidget: (name: WidgetId) => void;
  toggleExpandWidget: (name: WidgetId) => void;
  toggleAllWidgets: () => void;
  getOpenWidgets: () => WidgetId[];
  clearChatHistory: () => void;
  chatLastClearedAt: number;
  /** Simulierte Log-Einträge für den Log-Stream */
  logs: LogEntry[];
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  /** Erfasste Bilder für das Image-Grid */
  capturedImages: CapturedImage[];
  addCapturedImage: (image: Omit<CapturedImage, 'id' | 'timestamp'>) => Promise<string>;
  removeCapturedImage: (id: string) => void;
  updateCapturedImage: (id: string, fields: Partial<CapturedImage>) => void;
  /** Lokale Musikbibliothek */
  musicLibrary: string[];
  updateMusicLibrary: (songs: string[] | ((prev: string[]) => string[])) => void;
  /** Text-Editor Inhalt */
  editorText: string;
  setEditorText: (text: string) => void;
  appendEditorText: (text: string) => void;
  /** Abgetrennte Pop-out-Widgets (eigenes Electron-Fenster) */
  detachedWidgets: Record<WidgetId, boolean>;
  popOutWidget: (name: WidgetId) => void;
  attachWidget: (name: WidgetId) => void;
  /** Media-Player State */
  mediaPlayerUrl: string;
  mediaPlayerName: string;
  playMedia: (url: string, name: string) => void;
  /** CAD-Modell (STL-Pfad überlebt Widget-Mount) */
  cadModel: CadModelState | null;
  setCadModel: (stlPath: string, prompt?: string) => void;
}

export interface CadModelState {
  stlPath: string;
  prompt: string;
  updatedAt: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'tool_call' | 'thinking' | 'result' | 'system' | 'error' | 'suggestion' | 'vision' | 'warning';
  message: string;
}

export interface CapturedImage {
  id: string;
  timestamp: number;
  src: string;         // Base64 oder URL
  labels: string[];    // Erkannte Objekte/Labels
  confidence: number;  // Analyse-Konfidenz (0-1)
  analysis?: {
    description?: string;
    face_count?: number;
    object_count?: number;
    brightness?: number;
    resolution?: string;
    filename?: string;
    face_report?: string;
    frame_width?: number;
    frame_height?: number;
    detections?: Array<{
      id: string;
      label: string;
      type: 'face' | 'object';
      confidence: number;
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
    }>;
  };
}

const WidgetManagerContext = createContext<WidgetManagerContextType | null>(null);

export function WidgetManagerProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<Record<WidgetId, boolean>>(DEFAULT_WIDGETS);
  const [expandedWidgets, setExpandedWidgets] = useState<Record<WidgetId, boolean>>(DEFAULT_WIDGETS);
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(Object.keys(DEFAULT_WIDGETS) as WidgetId[]);
  const [fullscreenWidget, setFullscreenWidget] = useState<WidgetId | null>(null);
  const fullscreenRef = useRef<WidgetId | null>(null);
  fullscreenRef.current = fullscreenWidget;
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [musicLibrary, setMusicLibrary] = useState<string[]>([]);
  const [chatLastClearedAt, setChatLastClearedAt] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const val = Number.parseInt(localStorage.getItem('elite-chat-cleared-at') || '0', 10);
    return Number.isFinite(val) ? val : 0;
  });
  const [editorText, setEditorText] = useState<string>('');
  const [detachedWidgets, setDetachedWidgets] = useState<Record<WidgetId, boolean>>(DEFAULT_WIDGETS);
  const detachedRef = useRef(detachedWidgets);
  detachedRef.current = detachedWidgets;
  /** Verhindert, dass ein verzögertes „closed“-Event ein frisch geöffnetes Pop-out wieder schließt. */
  const lastPopoutOpenedAtRef = useRef<Partial<Record<WidgetId, number>>>({});
  const [mediaPlayerUrl, setMediaPlayerUrl] = useState('');
  const [mediaPlayerName, setMediaPlayerName] = useState('');
  const [cadModel, setCadModelState] = useState<CadModelState | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  const allWidgetIds = Object.keys(DEFAULT_WIDGETS) as WidgetId[];

  // Layout-Persistence: gespeicherten Widget-State aus localStorage laden
  useEffect(() => {
    try {
      const saved = localStorage.getItem('elite-widget-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        setWidgets(prev => {
          const merged = { ...prev };
          for (const key of allWidgetIds) {
            if (typeof parsed[key] === 'boolean') merged[key] = parsed[key];
          }
          return merged;
        });
      }

      const savedOrder = localStorage.getItem('elite-widget-order');
      if (savedOrder) {
        try {
          const parsed = JSON.parse(savedOrder);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter((id): id is WidgetId =>
              allWidgetIds.includes(id as WidgetId),
            );
            const missing = allWidgetIds.filter((id) => !valid.includes(id));
            if (valid.length > 0) setWidgetOrder([...valid, ...missing]);
          }
        } catch { /* Ignore */ }
      }

      const savedExpanded = localStorage.getItem('elite-widget-expanded');
      if (savedExpanded) {
        try {
          const parsed = JSON.parse(savedExpanded);
          setExpandedWidgets((prev) => {
            const merged = { ...prev };
            for (const key of allWidgetIds) {
              if (typeof parsed[key] === 'boolean') merged[key] = parsed[key];
            }
            return merged;
          });
        } catch { /* Ignore */ }
      }

      const savedEditor = localStorage.getItem('elite-editor-text');
      if (savedEditor) setEditorText(savedEditor);

      // Pop-out-State nicht persistieren — sonst „Geister-Widgets“ nach Neustart
      localStorage.removeItem('elite-detached-widgets');

      const savedMedia = localStorage.getItem('elite-media-player');
      if (savedMedia) {
        try {
          const parsed = JSON.parse(savedMedia);
          if (parsed.url) setMediaPlayerUrl(parsed.url);
          if (parsed.name) setMediaPlayerName(parsed.name);
        } catch { /* ignore */ }
      }

      const savedCad = localStorage.getItem('elite-cad-model');
      if (savedCad) {
        try {
          const parsed = JSON.parse(savedCad) as CadModelState;
          if (parsed?.stlPath) setCadModelState(parsed);
        } catch { /* ignore */ }
      }

      const savedClearedAt = localStorage.getItem('elite-chat-cleared-at');
      if (savedClearedAt) {
        const val = parseInt(savedClearedAt);
        if (!isNaN(val)) setChatLastClearedAt(val);
      }

      // 🖼️ Persistente Galerie aus localStorage laden
      const savedGallery = localStorage.getItem('elite-gallery');
      if (savedGallery) {
        try {
          const parsed = JSON.parse(savedGallery);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCapturedImages(parsed);
          }
        } catch { /* Korrupte Daten ignorieren */ }
      }

      // Server-Galerie (gallery.json / AppData) nachladen und mit lokalem State mergen
      fetch('/api/elite/gallery')
        .then((res) => (res.ok ? res.json() : []))
        .then((serverGallery: CapturedImage[]) => {
          if (!Array.isArray(serverGallery) || serverGallery.length === 0) return;
          setCapturedImages((prev) => {
            const bySrc = new Map<string, CapturedImage>();
            for (const img of [...serverGallery, ...prev]) {
              if (img?.src) bySrc.set(img.src, { ...img, id: img.id || `img-${img.src}`, timestamp: img.timestamp || Date.now() });
            }
            const merged = Array.from(bySrc.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);
            try { localStorage.setItem('elite-gallery', JSON.stringify(merged)); } catch { /* ignore */ }
            return merged;
          });
        })
        .catch(() => { /* offline / API nicht erreichbar */ });

    } catch (err) {
      console.error("Fehler beim Laden des States:", err);
    } finally {
      setStorageReady(true);
    }
  }, []);

  // Widget-State & chatLastClearedAt bei Änderung in localStorage persistieren
  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem('elite-widget-state', JSON.stringify(widgets));
      localStorage.setItem('elite-widget-order', JSON.stringify(widgetOrder));
      localStorage.setItem('elite-widget-expanded', JSON.stringify(expandedWidgets));
      localStorage.setItem('elite-editor-text', editorText);
      localStorage.setItem('elite-chat-cleared-at', chatLastClearedAt.toString());
      if (mediaPlayerUrl) {
        localStorage.setItem('elite-media-player', JSON.stringify({ url: mediaPlayerUrl, name: mediaPlayerName }));
      }
    } catch { /* Silent fail */ }
  }, [widgets, widgetOrder, expandedWidgets, editorText, chatLastClearedAt, mediaPlayerUrl, mediaPlayerName, storageReady]);

  const toggleFullscreen = useCallback((name: WidgetId | null) => {
    if (name) {
      setWidgets((prev) => ({ ...prev, [name]: true }));
    }
    setFullscreenWidget(name);
  }, []);

  // Widget öffnen (inline im HUD — im Pop-out-Fenster nur lokalen State setzen)
  const openWidget = useCallback((name: WidgetId) => {
    const isPopoutShell =
      typeof window !== 'undefined' && window.location.pathname.startsWith('/widget/');

    if (!isPopoutShell) {
      setDetachedWidgets((prev) => ({ ...prev, [name]: false }));
      window.eliteAPI?.closeWidgetWindow?.(name);
    }
    setWidgets((prev) => ({ ...prev, [name]: true }));
    addLogInternal({ type: 'system', message: `Widget "${name}" geöffnet` });
    playSystemSound('click');
  }, []);

  // Widget schließen
  const closeWidget = useCallback((name: WidgetId) => {
    setWidgets(prev => ({ ...prev, [name]: false }));
    setFullscreenWidget((prev) => (prev === name ? null : prev));
    setDetachedWidgets((prev) => ({ ...prev, [name]: false }));
    broadcastWidgetSync({ type: 'close-widget', widgetId: name });
    if (typeof window !== 'undefined') {
      window.eliteAPI?.closeWidgetWindow?.(name);
    }
    addLogInternal({ type: 'system', message: `Widget "${name}" geschlossen` });
    playSystemSound('click');
  }, []);

  // Widget umschalten
  const toggleWidget = useCallback((name: WidgetId) => {
    const wasDetached = detachedRef.current[name];

    setWidgets((prev) => {
      const wasOpen = prev[name];

      // Pop-out aktiv → zurück ins HUD (bleibt geöffnet)
      if (wasOpen && wasDetached) {
        setDetachedWidgets((d) => ({ ...d, [name]: false }));
        window.eliteAPI?.closeWidgetWindow?.(name);
        addLogInternal({ type: 'system', message: `Widget "${name}" zurück ins HUD` });
        playSystemSound('click');
        return prev;
      }

      const newState = !wasOpen;
      setDetachedWidgets((d) => ({ ...d, [name]: false }));
      window.eliteAPI?.closeWidgetWindow?.(name);

      if (!newState) {
        setFullscreenWidget((current) => (current === name ? null : current));
      }

      addLogInternal({
        type: 'system',
        message: `Widget "${name}" ${newState ? 'geöffnet' : 'geschlossen'}`,
      });
      playSystemSound('click');
      return { ...prev, [name]: newState };
    });
  }, []);

  // Widget vergrößern/verkleinern
  const toggleExpandWidget = useCallback((name: WidgetId) => {
    setExpandedWidgets(prev => ({ ...prev, [name]: !prev[name] }));
    playSystemSound('click');
  }, []);

  const closeAllWidgets = useCallback(() => {
    setWidgets(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated) as WidgetId[]) {
        updated[key] = false;
      }
      return updated;
    });
    addLogInternal({ type: 'system', message: `Alle Widgets geschlossen (Ghost Mode / Reset)` });
    playSystemSound('shutdown');
  }, []);

  // Alle Widgets umschalten (Ein/Aus)
  const toggleAllWidgets = useCallback(() => {
    setWidgets(prev => {
      const hasOpen = TOGGLE_ALL_WIDGET_IDS.some((id) => prev[id] || detachedRef.current[id]);
      const targetState = !hasOpen; // Wenn eins offen ist -> alle zu. Sonst Toolbar-Widgets auf.
      const updated = { ...prev };
      for (const id of TOGGLE_ALL_WIDGET_IDS) {
        updated[id] = targetState;
      }

      // Der globale Toggle soll keine Sonderfenster öffnen.
      updated.settings = false;
      updated.mediaPlayer = false;
      return updated;
    });

    setDetachedWidgets((prev) => {
      const updated = { ...prev };
      for (const id of TOGGLE_ALL_WIDGET_IDS) {
        updated[id] = false;
        window.eliteAPI?.closeWidgetWindow?.(id);
      }
      updated.settings = false;
      updated.mediaPlayer = false;
      return updated;
    });

    setFullscreenWidget(null);
    window.eliteAPI?.closeWidgetWindow?.('mediaPlayer');
    addLogInternal({ type: 'system', message: `Toolbar-Widgets ein/ausgeblendet` });
  }, []);

  // Offene Widgets abfragen (Reihenfolge aus widgetOrder, ohne Pop-out)
  const getOpenWidgets = useCallback((): WidgetId[] => {
    return widgetOrder.filter((id) => widgets[id] && !detachedWidgets[id]);
  }, [widgets, widgetOrder, detachedWidgets]);

  // Interne Log-Funktion (ohne Re-Render Loop)
  const addLogInternal = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLogs(prev => [
      ...prev.slice(-99), // Max 100 Einträge
      {
        ...entry,
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      },
    ]);
  };

  // Öffentliche Log-Funktion
  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    addLogInternal(entry);
  }, []);

  const persistGalleryIndex = (merged: CapturedImage[]) => {
    const indexOnly = merged.filter((img) => img.src && !img.src.startsWith('data:'));
    try {
      localStorage.setItem('elite-gallery', JSON.stringify(indexOnly.slice(0, 50)));
    } catch {
      try {
        localStorage.setItem('elite-gallery', JSON.stringify(indexOnly.slice(0, 20)));
      } catch { /* quota */ }
    }
  };

  const addCapturedImage = useCallback((image: Omit<CapturedImage, 'id' | 'timestamp'>): Promise<string> => {
    const tempId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic: CapturedImage = {
      ...image,
      id: tempId,
      timestamp: Date.now(),
    };

    setCapturedImages((prev) => [optimistic, ...prev].slice(0, 50));

    const finalize = (entry: CapturedImage) => {
      setCapturedImages((prev) => {
        const withoutTemp = prev.filter((img) => img.id !== tempId);
        const merged = [entry, ...withoutTemp.filter((img) => img.src !== entry.src)].slice(0, 50);
        persistGalleryIndex(merged);
        return merged;
      });
    };

    if (!image.src.startsWith('data:image/')) {
      finalize(optimistic);
      return Promise.resolve(tempId);
    }

    return fetch('/api/elite/gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        frame: image.src,
        labels: image.labels,
        confidence: image.confidence,
        analysis: image.analysis,
        prefix: 'webcam',
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((entry) => {
        if (entry?.src) {
          const finalId = entry.id || tempId;
          finalize({
            id: finalId,
            timestamp: entry.timestamp || Date.now(),
            src: entry.src,
            labels: Array.isArray(entry.labels) ? entry.labels : image.labels,
            confidence: typeof entry.confidence === 'number' ? entry.confidence : image.confidence,
            analysis: entry.analysis ?? image.analysis,
          });
          return finalId;
        }
        return tempId;
      })
      .catch((err) => {
        console.warn('[Gallery] Server-Persistenz fehlgeschlagen:', err);
        return tempId;
      });
  }, []);

  const removeCapturedImage = useCallback((id: string) => {
    setCapturedImages(prev => {
      const updated = prev.filter(img => img.id !== id);
      try {
        localStorage.setItem('elite-gallery', JSON.stringify(updated));
      } catch { /* Silent fail */ }
      return updated;
    });
  }, []);

  const updateCapturedImage = useCallback((id: string, fields: Partial<CapturedImage>) => {
    setCapturedImages((prev) => {
      const updated = prev.map((img) => {
        if (img.id !== id) return img;
        return {
          ...img,
          ...fields,
          analysis: {
            ...img.analysis,
            ...fields.analysis,
          },
        };
      });
      persistGalleryIndex(updated);
      return updated;
    });
  }, []);

  // Chat-Verlauf löschen (alle Persistenz-Keys inkl. Hermes)
  const clearChatHistory = useCallback(() => {
    const now = dispatchChatCleared();
    setChatLastClearedAt(now);
    addLogInternal({ type: 'system', message: 'Chat-Verlauf gelöscht' });
  }, []);

  const setEditorTextSynced = useCallback((text: string) => {
    setEditorText(text);
    broadcastWidgetSync({ type: 'editor-text', text });
  }, []);

  const appendEditorText = useCallback((newText: string) => {
    if (!newText.trim()) return;
    setEditorText((prev) => {
      const next = prev ? `${prev}\n${newText}` : newText;
      broadcastWidgetSync({ type: 'editor-text', text: next });
      return next;
    });
  }, []);

  const playMedia = useCallback((url: string, name: string) => {
    setMediaPlayerUrl(url);
    setMediaPlayerName(name);
    broadcastWidgetSync({ type: 'media-player', url, name });
    setWidgets((prev) => ({ ...prev, mediaPlayer: true }));
  }, []);

  const setCadModel = useCallback((stlPath: string, prompt = '') => {
    if (!stlPath) return;
    const next: CadModelState = { stlPath, prompt, updatedAt: Date.now() };
    setCadModelState(next);
    try {
      localStorage.setItem('elite-cad-model', JSON.stringify(next));
    } catch { /* ignore */ }
    broadcastWidgetSync({
      type: 'cad-model',
      stlPath: next.stlPath,
      prompt: next.prompt,
      updatedAt: next.updatedAt,
    });
  }, []);

  const attachWidget = useCallback((name: WidgetId) => {
    setDetachedWidgets((prev) => ({ ...prev, [name]: false }));
    broadcastWidgetSync({ type: 'attach-widget', widgetId: name });
  }, []);

  const finalizePopoutClosed = useCallback((name: WidgetId) => {
    setWidgets((prev) => ({ ...prev, [name]: false }));
    setDetachedWidgets((prev) => ({ ...prev, [name]: false }));
    setFullscreenWidget((prev) => (prev === name ? null : prev));
  }, []);

  const popOutWidget = useCallback(async (name: WidgetId) => {
    if (!POPOUTABLE_WIDGETS.has(name)) return;

    const api = typeof window !== 'undefined' ? window.eliteAPI : undefined;
    if (!api?.openWidgetWindow) {
      addLogInternal({
        type: 'error',
        message: 'Pop-out nur in der Electron-App verfügbar. Bitte Desktop-App neu starten.',
      });
      return;
    }

    lastPopoutOpenedAtRef.current[name] = Date.now();
    setWidgets((prev) => ({ ...prev, [name]: true }));
    setDetachedWidgets((prev) => ({ ...prev, [name]: true }));
    setFullscreenWidget((prev) => (prev === name ? null : prev));

    try {
      const result = await api.openWidgetWindow(name, {});
      if (result && !result.ok) {
        throw new Error(result.error || 'Pop-out fehlgeschlagen');
      }
    } catch (err) {
      setWidgets((prev) => ({ ...prev, [name]: false }));
      setDetachedWidgets((prev) => ({ ...prev, [name]: false }));
      addLogInternal({
        type: 'error',
        message: `Pop-out fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}. Electron-App neu starten (nicht nur F5).`,
      });
    }
  }, []);

  // Globale API auf window für KI-Steuerung (Multi-Command Recognition)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).elite = {
        ...((window as any).elite || {}),
        openWidget,
        closeWidget,
        toggleWidget,
        toggleAllWidgets,
        getOpenWidgets,
        clearChatHistory,
        executeCommand: (cmd: string) => {
          addLogInternal({ type: 'tool_call', message: `Befehl: ${cmd}` });
          // Befehl an den Agenten-Chat weiterleiten (falls Brücke vorhanden)
          const elite = (window as any).elite;
          if (elite?.sendChatMessage) {
            elite.sendChatMessage(cmd);
          }
        },
      };
    }
  }, [openWidget, closeWidget, toggleWidget, getOpenWidgets]);

  // Keyboard Shortcuts: Ctrl+1..9 → Widget Toggle, Escape → alle schließen
  useEffect(() => {
    const SHORTCUT_ORDER: WidgetId[] = [
      'webcam', 'imageGrid', 'chat', 'systemMonitor',
      'music', 'logStream', 'textEditor', 'missionControl',
    ];

    const handleKeyDown = (e: KeyboardEvent) => {
      // Nicht auslösen wenn User in einem Input/Textarea tippt
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Escape → zuerst Vollbild beenden, sonst alle Widgets schließen
      if (e.key === 'Escape') {
        if (fullscreenRef.current) {
          setFullscreenWidget(null);
        } else {
          setWidgets((prev) => {
            const hasOpen = Object.values(prev).some((v) => v);
            if (!hasOpen) return prev;
            const closed = { ...prev };
            for (const key of Object.keys(closed) as WidgetId[]) {
              closed[key] = false;
            }
            return closed;
          });
        }
        return;
      }

      // Ctrl+1..9 → Widget an Position N togglen
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= SHORTCUT_ORDER.length) {
          e.preventDefault();
          toggleWidget(SHORTCUT_ORDER[num - 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleWidget]);

  useEffect(() => {
    const onOpenWidget = (e: Event) => {
      const id = (e as CustomEvent<{ id?: WidgetId }>).detail?.id;
      if (id && id in DEFAULT_WIDGETS) openWidget(id);
    };
    const onCadUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { stl_path?: string; prompt?: string };
      if (detail?.stl_path) setCadModel(detail.stl_path, detail.prompt || '');
    };
    window.addEventListener('elite-open-widget', onOpenWidget);
    window.addEventListener('elite-cad-update', onCadUpdate);
    return () => {
      window.removeEventListener('elite-open-widget', onOpenWidget);
      window.removeEventListener('elite-cad-update', onCadUpdate);
    };
  }, [openWidget, setCadModel]);

  // Cross-Window Sync (Pop-out ↔ HUD)
  useEffect(() => {
    return subscribeWidgetSync((msg) => {
      if (msg.type === 'editor-text') setEditorText(msg.text);
      if (msg.type === 'media-player') {
        setMediaPlayerUrl(msg.url);
        setMediaPlayerName(msg.name);
      }
      if (msg.type === 'cad-model') {
        setCadModelState({
          stlPath: msg.stlPath,
          prompt: msg.prompt,
          updatedAt: msg.updatedAt,
        });
      }
      if (msg.type === 'attach-widget') {
        setDetachedWidgets((prev) => ({ ...prev, [msg.widgetId as WidgetId]: false }));
      }
      if (msg.type === 'close-widget') {
        const id = msg.widgetId as WidgetId;
        setWidgets((prev) => ({ ...prev, [id]: false }));
        setFullscreenWidget((prev) => (prev === id ? null : prev));
        setDetachedWidgets((prev) => ({ ...prev, [id]: false }));
      }
      if (msg.type === 'editor-attach') {
        const header = msg.path ? `\n\n// --- ${msg.path} ---\n` : '\n\n';
        appendEditorText(`${header}${msg.content}`);
        openWidget('textEditor');
      }
      if (msg.type === 'chat-attach') {
        window.dispatchEvent(
          new CustomEvent('elite-chat-attach', { detail: { text: msg.text, paths: msg.paths } }),
        );
      }
    });
  }, [appendEditorText, openWidget]);

  // Pop-out-Fenster geschlossen: State bereinigen (ohne closeWidget → kein erneutes
  // closeWidgetWindow, sonst wird ein gerade geöffnetes Fenster sofort wieder zu).
  // „Zurück ins HUD“ (attach-widget): detached bereits false → hier nichts tun.
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.eliteAPI : undefined;
    if (!api?.onWidgetWindowClosed) return;
    return api.onWidgetWindowClosed((widgetId: string) => {
      if (!(widgetId in DEFAULT_WIDGETS)) return;
      const id = widgetId as WidgetId;
      const openedAt = lastPopoutOpenedAtRef.current[id] ?? 0;
      if (Date.now() - openedAt < 500) return;
      if (!detachedRef.current[id]) return;
      finalizePopoutClosed(id);
    });
  }, [finalizePopoutClosed]);



  // Chat-Attachment Events (Drag & Drop)
  useEffect(() => {
    const onImageAnalyzed = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        upload?: { name: string; url: string };
        analysis?: {
          detections?: Array<{ label: string }>;
          face_count?: number;
          object_count?: number;
          brightness?: number;
          resolution?: string;
          vision_hint?: string;
        };
        frame?: string;
      };
      if (!detail?.upload) return;

      const labels = detail.analysis?.detections?.map((d) => d.label) || [detail.upload.name];
      void addCapturedImage({
        src: detail.frame || detail.upload.url,
        labels,
        confidence: 0.85,
        analysis: {
          face_count: detail.analysis?.face_count,
          object_count: detail.analysis?.object_count,
          brightness: detail.analysis?.brightness,
          resolution: detail.analysis?.resolution,
          detections: detail.analysis?.detections as NonNullable<CapturedImage['analysis']>['detections'],
        },
      });
      openWidget('imageGrid');
      const fc = detail.analysis?.face_count ?? 0;
      const oc = detail.analysis?.object_count ?? 0;
      addLogInternal({
        type: 'result',
        message: `Bildanalyse: ${fc} Gesichter, ${oc} Objekte (${detail.upload.name})`,
      });
    };

    const onDocumentImport = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text?: string; name?: string };
      if (detail?.text) {
        appendEditorText(detail.text);
        openWidget('textEditor');
      } else if (detail?.name) {
        addLogInternal({ type: 'system', message: `Dokument ${detail.name} ohne extrahierbaren Text` });
        openWidget('textEditor');
      }
    };

    const onVideoPlay = (e: Event) => {
      const detail = (e as CustomEvent).detail as { url?: string; name?: string };
      if (detail?.url) playMedia(detail.url, detail.name || 'Video');
    };

    const onEditorAttach = (e: Event) => {
      const detail = (e as CustomEvent<{ path?: string; content?: string }>).detail;
      if (!detail?.content) return;
      const header = detail.path ? `\n\n// --- ${detail.path} ---\n` : '\n\n';
      appendEditorText(`${header}${detail.content}`);
      openWidget('textEditor');
    };

    window.addEventListener('elite-image-analyzed', onImageAnalyzed);
    window.addEventListener('elite-document-import', onDocumentImport);
    window.addEventListener('elite-video-play', onVideoPlay);
    window.addEventListener('elite-editor-attach', onEditorAttach);
    return () => {
      window.removeEventListener('elite-image-analyzed', onImageAnalyzed);
      window.removeEventListener('elite-document-import', onDocumentImport);
      window.removeEventListener('elite-video-play', onVideoPlay);
      window.removeEventListener('elite-editor-attach', onEditorAttach);
    };
  }, [addCapturedImage, openWidget, appendEditorText, playMedia]);

  return (
    <WidgetManagerContext.Provider
      value={{
        widgets,
        expandedWidgets,
        widgetOrder,
        setWidgetOrder,
        fullscreenWidget,
        toggleFullscreen,
        openWidget,
        closeWidget,
        closeAllWidgets,
        toggleWidget,
        toggleExpandWidget,
        toggleAllWidgets,
        getOpenWidgets,
        clearChatHistory,
        chatLastClearedAt,
        logs,
        addLog,
        capturedImages,
        addCapturedImage,
        removeCapturedImage,
        updateCapturedImage,
        musicLibrary,
        updateMusicLibrary: setMusicLibrary,
        editorText,
        setEditorText: setEditorTextSynced,
        appendEditorText,
        detachedWidgets,
        popOutWidget,
        attachWidget,
        mediaPlayerUrl,
        mediaPlayerName,
        playMedia,
        cadModel,
        setCadModel,
      }}
    >
      <ToastProvider>
        {children}
      </ToastProvider>
    </WidgetManagerContext.Provider>
  );
}

/** Hook für den Widget-Manager Zugriff */
export function useWidgetManager() {
  const ctx = useContext(WidgetManagerContext);
  if (!ctx) throw new Error('useWidgetManager muss innerhalb WidgetManagerProvider verwendet werden');
  return ctx;
}
