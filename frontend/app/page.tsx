'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
  useRoomContext,
  useChat,
  useTranscriptions,
  useTracks,
  useLocalParticipant,
  useDataChannel,
  useConnectionState,
} from '@livekit/components-react';
import {
  ConnectionState,
  Track,
  type RoomConnectOptions,
  type RoomOptions,
  type TrackPublishDefaults,
} from 'livekit-client';
import {
  clearLiveKitRateLimit,
  getLiveKitRateLimitRemainingMs,
  getOrCreateGuestIdentity,
  installLiveKitFetchRateLimitGuard,
  isLiveKitRateLimited,
  isLiveKitRateLimitError,
  markLiveKitRateLimited,
} from '@/lib/livekit-connect-guard';
import { LiveKitRateLimitBridge } from '@/components/livekit-rate-limit-bridge';
import { SafeVoiceOrb } from '@/components/safe-voice-orb';
import { GridBackground } from '@/components/grid-background';
import { useAudioAnalyzer, getAudioContext } from '@/hooks/use-audio-analyzer';
import { requestMicrophonePermission } from '@/lib/microphone-access';
import { useIsElectron } from '@/hooks/use-is-electron';
import { HudDecorators } from '@/components/hud-decorators';
import { EliteTrayMinimizeButton } from '@/components/hud/elite-tray-minimize-button';
import { QuickActions } from '@/components/quick-actions';
import { ScreenshotLightbox } from '@/components/screenshot-lightbox';
import { SystemStatus } from '@/components/system-status';
import { NeuralCore } from '@/components/neural-core';
import { BottomToolbar } from '@/components/dashboard/bottom-toolbar';
import { TextEditorWidget } from '@/components/dashboard/text-editor-widget';
import { WebcamWidget } from '@/components/dashboard/webcam-widget';
import { ChatWidget } from '@/components/dashboard/chat-widget';
import { SystemMonitorWidget } from '@/components/dashboard/system-monitor-widget';
import { MusicWidget } from '@/components/dashboard/music-widget';
import { LogStreamWidget } from '@/components/dashboard/log-stream-widget';
import { ImageGridWidget } from '@/components/dashboard/image-grid-widget';
import { MissionControlWidget } from '@/components/dashboard/mission-control-widget';
import { CommandListWidget } from '@/components/dashboard/command-list-widget';
import { PaiPulseWidget } from '@/components/dashboard/pai-pulse-widget';
import { SettingsWidget } from '@/components/dashboard/settings-widget';
import { MediaPlayerWidget } from '@/components/dashboard/media-player-widget';
import { CadWidget } from '@/components/dashboard/cad-widget';
import { PrinterWidget } from '@/components/dashboard/printer-widget';
import { BrowserAgentWidget } from '@/components/dashboard/browser-agent-widget';
import { KasaWidget } from '@/components/dashboard/kasa-widget';
import { AuthLockWidget } from '@/components/dashboard/auth-lock-widget';
import { ToolConfirmationModal } from '@/components/dashboard/tool-confirmation-modal';
import { EliteChatComposer } from '@/components/dashboard/elite-chat-composer';
import { ChatMessageBody } from '@/components/dashboard/chat-message-body';
import { isPhantomTranscript } from '@/lib/phantom-transcript';
import {
  HERMES_CHAT_STORAGE_KEY,
  HERMES_SESSION_STORAGE_KEY,
  sendHermesChat,
} from '@/lib/hermes-chat-client';
import { parseUnifiedChatInput, UNIFIED_CHAT_PLACEHOLDER } from '@/lib/unified-chat-router';
import { useToast } from '@/components/dashboard/toast-provider';
import { ELITE_LIVEKIT_ROOM } from '@/lib/elite-livekit';
import { playSystemSound } from '@/lib/audio-effects';
import { EliteOnboardingHint } from '@/components/hud/elite-onboarding-hint';
import { WelcomeBriefing } from '@/components/hud/welcome-briefing';
import { EliteAutoAudio } from '@/components/hud/elite-auto-audio';
import { ensureRoomAudio } from '@/lib/livekit-audio';
import { HUD_CHAT_AGENT_BUBBLE, HUD_CHAT_HERMES_BUBBLE, HUD_CHAT_USER_BUBBLE } from '@/components/dashboard/widget-shell';

/** Visuelle Anzeige für den Meeting Guard Status */
function MeetingStatusBadge() {
  const [meeting, setMeeting] = useState<{ active: boolean; label?: string }>({ active: false });

  useEffect(() => {
    const handler = (e: any) => setMeeting(e.detail);
    window.addEventListener('elite-meeting-status', handler);
    return () => window.removeEventListener('elite-meeting-status', handler);
  }, []);

  if (!meeting.active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed top-24 right-8 z-[100] flex items-center gap-3 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 backdrop-blur-md shadow-[0_0_20px_rgba(239,68,68,0.2)]"
    >
      <div className="size-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">On Air: {meeting.label || 'Meeting'}</span>
    </motion.div>
  );
}
import { WidgetManagerProvider, useWidgetManager, type WidgetId } from '@/components/dashboard/widget-manager';
import { WidgetFullscreenPortal } from '@/components/dashboard/widget-fullscreen-portal';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  PhoneOff,
  Loader2,
  MessageSquare,
  Send,
  Settings,
  User,
  Bot,
  BotMessageSquare,
  X,
  ArrowLeft,
  Globe,
  Volume2,
  Trash2,
  Smartphone,
  QrCode,
  LayoutDashboard,
  FileText,
  Camera,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import '@livekit/components-styles';

// Font-Override: Berlin Grotesk Light/Regular/Medium haben defekte Umlaut-Glyphen.
// Deshalb nutzen wir auf der LiveKit-Seite den System-Font für korrekte Darstellung.
const livekitFontOverride = `
  [data-lk-theme],
  .lk-room-container,
  main, main * {
    font-family: 'Inter', system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  }
  
  /* Fix für transparente Menüs und Buttons */
  .lk-device-menu, 
  .lk-settings-menu,
  .lk-focus-layout-menu {
    background-color: #000d1a !important;
    border: 1px solid var(--accent-border) !important;
    backdrop-filter: blur(20px) !important;
    border-radius: 12px !important;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8) !important;
    z-index: 9999 !important;
    margin-bottom: 12px !important; /* Abstand nach unten zur Leiste */
    max-height: 300px !important;
    overflow-y: auto !important;
  }

  /* Scrollbar-Styling für HUD-Look */
  .lk-device-menu::-webkit-scrollbar {
    width: 4px !important;
  }
  .lk-device-menu::-webkit-scrollbar-thumb {
    background: var(--accent-border) !important;
    border-radius: 10px !important;
  }
  .lk-device-menu::-webkit-scrollbar-track {
    background: transparent !important;
  }

  .lk-device-menu-item,
  .lk-button {
    background-color: rgba(255, 255, 255, 0.05) !important;
    color: white !important;
    transition: all 0.2s ease !important;
  }

  .lk-device-menu-item:hover,
  .lk-button:hover {
    background-color: rgba(var(--accent-color), 0.1) !important;
    color: rgb(var(--accent-color)) !important;
  }

  .lk-button-group {
    background: transparent !important;
    border: none !important;
  }

  /* Control Bar Icons */
  .lk-button svg {
    color: rgba(255, 255, 255, 0.7) !important;
  }
  
  .lk-button:hover svg {
    color: rgb(var(--accent-color)) !important;
  }
`;

/**
 * Framer-Motion hängt in Electron oft bei initial={{ opacity: 0 }} –
 * dann bleibt nur Grid/HUD-Rahmen sichtbar, kein Orb/Buttons.
 */
function HudMotion({
  children,
  className,
  layoutKey,
  isElectron,
}: {
  children: React.ReactNode;
  className?: string;
  layoutKey?: string;
  isElectron: boolean;
}) {
  if (isElectron) {
    return (
      <div className={className} data-elite-panel>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      key={layoutKey}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      data-elite-panel
    >
      {children}
    </motion.div>
  );
}

const globalStopAllTracks = () => {
  try {
    if (typeof window !== 'undefined' && (window as any)._globalMediaStream) {
      (window as any)._globalMediaStream.getTracks().forEach((track: MediaStreamTrack) => {
        track.enabled = false;
        track.stop();
        console.log(`[Hardware-Global] Track deaktiviert & gestoppt: ${track.kind}`);
      });
      (window as any)._globalMediaStream = null;
    }
    if (typeof window !== 'undefined') (window as any)._webcamLock = false;
  } catch (e) {
    console.error("[Hardware-Global] Fehler:", e);
  }
};

export default function LiveKitPage() {
  return (
    <WidgetManagerProvider>
      <LiveKitPageContent />
    </WidgetManagerProvider>
  );
}

function LiveKitPageContent() {
  const { addLog, openWidget } = useWidgetManager();
  const { isElectron } = useIsElectron();
  const [token, setToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [rateLimitRemainingMs, setRateLimitRemainingMs] = useState(0);
  const autoConnectAttemptedRef = useRef(false);
  const connectInFlightRef = useRef<Promise<void> | null>(null);
  const [isHardwareInitializing, setIsHardwareInitializing] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [livekitMode, setLivekitMode] = useState<'cloud' | 'local'>('cloud');
  const [llmMode, setLlmMode] = useState<'cloud' | 'local' | 'auto'>('auto');
  const [effectiveLlmMode, setEffectiveLlmMode] = useState<'cloud' | 'local' | null>(null);
  const [llmFallbackReason, setLlmFallbackReason] = useState<string | null>(null);
  const [ollamaReachable, setOllamaReachable] = useState(false);
  const [livekitServerUrl, setLivekitServerUrl] = useState<string>('');
  const [isEliteOnline, setIsEliteOnline] = useState<boolean>(false);

  // Poll system status for Elite agent presence
  useEffect(() => {
    const checkStatus = () => {
      fetch('/api/system-status')
        .then(res => res.json())
        .then(data => {
          setIsEliteOnline(
            data.elite_ready === true ||
              (data.agent_status === 'RUNNING' &&
                data.livekit_status === 'ready' &&
                data.pulse_status === 'ready'),
          );
          if (data.effective_llm_mode === 'cloud' || data.effective_llm_mode === 'local') {
            setEffectiveLlmMode(data.effective_llm_mode);
          }
          setLlmFallbackReason(data.llm_fallback_reason ?? null);
        })
        .catch(err => {
          console.warn("[Status Checker] Error:", err);
          setIsEliteOnline(false);
        });
    };
    checkStatus();
    const interval = setInterval(checkStatus, 12_000);
    return () => clearInterval(interval);
  }, []);

  // Load livekitMode
  useEffect(() => {
    fetch('/api/elite/settings')
      .then(res => res.json())
      .then(data => {
        if (data.livekitMode) {
          setLivekitMode(data.livekitMode);
        }
        if (data.llmMode) {
          setLlmMode(data.llmMode);
        }
        setOllamaReachable(!!data.ollamaReachable);
      })
      .catch(err => console.error("Error loading settings:", err));
  }, []);

  // Face Auth bei manuellem App-Start prüfen
  useEffect(() => {
    fetch('/api/elite/face-auth')
      .then((res) => res.json())
      .then((data) => {
        if (data.enabled && data.has_reference) {
          const params = new URLSearchParams(window.location.search);
          const isAutostart = params.get('autostart') === 'true';
          
          if (!isAutostart) {
            console.log('[FaceAuth] Manueller Start erkannt, öffne Sperrbildschirm...');
            // Kurze Verzögerung für saubere WidgetManager Initialisierung
            setTimeout(() => {
              openWidget('authLock');
            }, 800);
          } else {
            console.log('[FaceAuth] Autostart erkannt, überspringe Sperrbildschirm und schalte Tools frei.');
            fetch('/api/elite/face-auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'set_authenticated', authenticated: true }),
            })
              .then((r) => r.json())
              .then((res) => console.log('[FaceAuth] Autostart-Bypass erfolgreich registriert:', res))
              .catch((err) => console.error('[FaceAuth] Fehler bei Autostart-Bypass:', err));
          }
        }
      })
      .catch((err) => {
        console.error('[FaceAuth] Fehler bei Start-Initialisierung:', err);
      });
  }, [openWidget]);

  const handleToggleLlmMode = async (mode: 'cloud' | 'local' | 'auto') => {
    setLlmMode(mode);
    try {
      const resp = await fetch('/api/elite/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llmMode: mode }),
      });
      await resp.json();
      addLog({
        type: 'system',
        message:
          mode === 'local'
            ? 'KI-Modus: Offline (Ollama + Whisper). Jarvis Core neu starten.'
            : mode === 'auto'
              ? 'KI-Modus: Auto (Cloud wenn API-Key, sonst Offline).'
              : 'KI-Modus: Cloud (OpenAI Realtime). Jarvis Core neu starten.',
      });
    } catch (e) {
      console.error('Error saving llmMode:', e);
      addLog({ type: 'error', message: 'KI-Modus konnte nicht gespeichert werden.' });
    }
  };

  const handleToggleLivekitMode = async (mode: 'cloud' | 'local') => {
    setLivekitMode(mode);
    try {
      const resp = await fetch('/api/elite/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ livekitMode: mode })
      });
      const data = await resp.json();
      
      if (mode === 'local') {
        if (data.dockerStatus?.error) {
          addLog({ type: 'error', message: `Docker-Status: ${data.dockerStatus.error}` });
        } else if (data.dockerStatus?.message) {
          addLog({ type: 'system', message: `Docker-Status: ${data.dockerStatus.message}` });
        } else {
          addLog({ type: 'system', message: `LiveKit-Modus auf LOKAL geändert.` });
        }
      } else {
        addLog({ type: 'system', message: `LiveKit-Modus auf CLOUD geändert.` });
      }
    } catch (e) {
      console.error("Error saving livekitMode:", e);
      addLog({ type: 'error', message: 'Fehler beim Speichern der Server-Einstellungen.' });
    }
  };

  useEffect(() => {
    installLiveKitFetchRateLimitGuard();
  }, []);

  // Globaler Error-Handler gegen DataStreamErrors (Agent-Disconnect Resilienz)
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorMsg = event.message || "";
      const errorName = event.error?.name || "";
      
      if (errorMsg.includes('DataStreamError') || errorName === 'DataStreamError') {
        console.warn('[LiveKit] DataStreamError abgefangen (Agent-Disconnect). Unterdrücke UI-Crash.');
        addLog({ type: 'system', message: 'Verbindung zum Agenten unterbrochen. Warte auf Reconnect...' });
        event.preventDefault();
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [addLog]);

  const onConnect = useCallback(async () => {
    if (isLiveKitRateLimited()) {
      setRateLimitRemainingMs(getLiveKitRateLimitRemainingMs());
      addLog({
        type: 'error',
        message: 'LiveKit Rate Limit — bitte kurz warten, bevor erneut verbunden wird.',
      });
      return;
    }
    if (connectInFlightRef.current) {
      return connectInFlightRef.current;
    }

    const run = async () => {
      setIsConnecting(true);
      if (isElectron) {
        console.log('[Hardware] App-Reset...');
        globalStopAllTracks();
        addLog({ type: 'system', message: 'Bereite Hardware für Desktop-Modus vor...' });
      }

      const micPerm = await requestMicrophonePermission();
      if (micPerm.ok) {
        addLog({ type: 'system', message: 'Mikrofon-Berechtigung erteilt.' });
      } else {
        addLog({
          type: 'error',
          message: micPerm.error ?? 'Mikrofon-Zugriff nicht möglich – später Mic-Icon klicken.',
        });
      }

      try {
        const room = ELITE_LIVEKIT_ROOM;
        const identity = getOrCreateGuestIdentity();

        console.log(`[Elite] Verbindungsversuch: Room=${room}, Identity=${identity}`);
        const params = new URLSearchParams({ room, identity });
        params.set('userName', 'System Admin');

        const resp = await fetch(`/api/livekit?${params}`, { cache: 'no-store' });
        if (resp.status === 429) {
          markLiveKitRateLimited();
          setRateLimitRemainingMs(getLiveKitRateLimitRemainingMs());
          addLog({ type: 'error', message: 'LiveKit Rate Limit (429) — Verbindung pausiert.' });
          return;
        }

        const data = await resp.json();

        if (data.token) {
          console.log('[Elite] Token erhalten, starte LiveKitRoom...');
          setToken(data.token);
          setLivekitServerUrl(data.serverUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL || '');
        } else {
          console.error('[Elite] Token-Fehler:', data);
          const errMsg = data.error || 'Limit überschritten';
          if (isLiveKitRateLimitError(new Error(String(errMsg)))) {
            markLiveKitRateLimited();
            setRateLimitRemainingMs(getLiveKitRateLimitRemainingMs());
          }
          addLog({ type: 'error', message: `Verbindung fehlgeschlagen: ${errMsg}` });
        }
        setRoomName(room);
        sessionStorage.setItem('elite-session-active', 'true');
      } catch (e) {
        console.error(e);
        if (isLiveKitRateLimitError(e)) {
          markLiveKitRateLimited();
          setRateLimitRemainingMs(getLiveKitRateLimitRemainingMs());
        }
        addLog({ type: 'error', message: 'Kritischer Verbindungsfehler – ist LiveKit online?' });
      } finally {
        setIsConnecting(false);
        connectInFlightRef.current = null;
      }
    };

    connectInFlightRef.current = run();
    return connectInFlightRef.current;
  }, [isElectron, addLog]);

  const applyLiveKitRateLimitHit = useCallback(() => {
    markLiveKitRateLimited();
    setRateLimitRemainingMs(getLiveKitRateLimitRemainingMs());
    setToken(null);
    setRoomName(null);
    setLivekitServerUrl('');
    setIsConnecting(false);
    sessionStorage.removeItem('elite-session-active');
    addLog({
      type: 'error',
      message: 'LiveKit Rate Limit — Verbindungsversuche gestoppt.',
    });
  }, [addLog]);

  const handleLiveKitError = useCallback(
    (error: Error) => {
      console.error('[Elite] LiveKit-Fehler:', error);
      if (!isLiveKitRateLimitError(error)) return;
      applyLiveKitRateLimitHit();
    },
    [applyLiveKitRateLimitHit],
  );

  const liveKitConnectOptions = useMemo<RoomConnectOptions>(() => ({ maxRetries: 0 }), []);

  // Auto-Connect nur einmal pro Seitenladung (verhindert 429-Sturm nach Fehlschlag)
  useEffect(() => {
    if (autoConnectAttemptedRef.current || token || isConnecting || !isEliteOnline) return;
    if (isLiveKitRateLimited()) {
      setRateLimitRemainingMs(getLiveKitRateLimitRemainingMs());
      return;
    }
    const timer = window.setTimeout(() => {
      if (autoConnectAttemptedRef.current || token || isConnecting) return;
      autoConnectAttemptedRef.current = true;
      void onConnect();
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [isEliteOnline, token, isConnecting, onConnect]);

  useEffect(() => {
    if (!isLiveKitRateLimited() && rateLimitRemainingMs === 0) return;
    const tick = () => setRateLimitRemainingMs(getLiveKitRateLimitRemainingMs());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [rateLimitRemainingMs]);

  const mainSurfaceClass =
    'relative flex h-screen w-full flex-col items-center overflow-hidden text-white font-sans selection:bg-[#00f2ff]/30 rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] ' +
    (isElectron
      ? 'bg-[#000b1a]/94 backdrop-blur-xl'
      : 'bg-[#000b1a]/95');

  const surfaceStyles = isElectron
    ? `html, body { background: transparent !important; margin: 0; padding: 0; overflow: hidden; }
       html.electron-app #elite-window-shell {
         border-radius: 32px;
         overflow: hidden;
         isolation: isolate;
       }
       html.electron-app [data-elite-panel] :where(:not(.elite-motion-allow, .elite-motion-allow *)),
       html.electron-app .lk-room-container { opacity: 1 !important; transform: none !important; visibility: visible !important; }
       html.electron-app [data-elite-panel] .opacity-20 { opacity: 0.2 !important; }
       html.electron-app [data-elite-panel] .text-slate-500 { color: rgb(148 163 184) !important; }`
    : `html, body { margin: 0; padding: 0; overflow: hidden; }`;

  return (
    <main id="elite-window-shell" className={mainSurfaceClass}>
      <WelcomeBriefing />
      {/* Draggable Area (Fenster verschieben) */}
      <div
        className="fixed top-0 left-0 right-0 h-12 z-[9999]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <style dangerouslySetInnerHTML={{ __html: `${surfaceStyles}\n${livekitFontOverride}` }} />
      
      {/* HUD Background */}
      <GridBackground />
      <HudDecorators />
      <div className="absolute inset-0 scanlines opacity-20 pointer-events-none" />

      {/* Control Buttons (Top Right) */}
      <div className="absolute top-6 right-8 z-[10000] flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={() => {
            if (isElectron && window.eliteAPI?.quitApp) {
              window.eliteAPI.quitApp();
            } else {
              window.close();
            }
          }}
          className="group relative flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 transition-all hover:bg-red-500 hover:border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)] hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]"
          title="Elite beenden"
        >
          <X size={14} className="text-red-500 group-hover:text-white transition-colors" />
        </button>
      </div>

      {/* Zurück zur Hauptseite (No-Drag Bereich) */}
      <a
        href="/"
        className="absolute top-6 left-8 z-[10000] flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/30 hover:text-white/70 transition-colors duration-300"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <ArrowLeft size={14} />
        Webstark
      </a>

      <div className="relative z-10 flex flex-1 min-h-0 w-full flex-col pointer-events-auto">
        <AnimatePresence mode="wait">
          {!token ? (
            <HudMotion isElectron={isElectron} key="landing" layoutKey="landing" className="flex h-full w-full flex-col items-center justify-center p-6">
              {/* Core Visual */}
              <div className="relative mb-12 flex h-64 w-64 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-primary/10 blur-[100px] animate-pulse" />
                <div className="absolute inset-0 rounded-full border border-primary/10 animate-[ping_4s_linear_infinite]" />
                <div className="absolute inset-4 rounded-full border border-primary/20" />
                <div className="relative z-10 h-48 w-48 transition-transform duration-700 hover:scale-110">
                  <SafeVoiceOrb />
                </div>
              </div>

              {/* Title & Branding */}
              <div className="space-y-4 text-center">
                <div>
                  <Badge 
                    variant="outline" 
                    className={`gap-2 px-4 py-1.5 transition-all duration-500 border-none rounded-full backdrop-blur-xl ${
                      isEliteOnline 
                        ? 'bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.15)]' 
                        : 'bg-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)] animate-pulse'
                    }`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isEliteOnline ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${isEliteOnline ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.15em]">
                      Elite Core {isEliteOnline ? 'Online' : 'Offline'}
                    </span>
                  </Badge>
                </div>

                <h1 className="text-6xl font-black tracking-tighter sm:text-8xl md:text-9xl">
                  <span className="block text-white opacity-20 transition-opacity hover:opacity-40 cursor-default">DESKTOP</span>
                  <span className="block text-transparent bg-clip-text bg-gradient-to-b from-primary/80 to-primary text-neon -mt-4 sm:-mt-8">
                    ELITE
                  </span>
                </h1>

                <p className="mx-auto max-w-md text-base font-light leading-relaxed text-slate-500 tracking-wide">
                  Ihr intelligenter Begleiter für System-Automation & Desktop-Interaktion.
                  Sprechen Sie einfach, Elite übernimmt den Rest.
                </p>
              </div>

              {/* Action Area */}
              <div className="mt-16 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onConnect}
                  disabled={isConnecting || !isEliteOnline || rateLimitRemainingMs > 0}
                  className={`group flex h-14 min-w-[260px] items-center justify-center gap-3 rounded-full border px-8 text-[11px] font-semibold uppercase tracking-[0.22em] transition-all duration-300 active:scale-[0.98] ${
                    isEliteOnline && rateLimitRemainingMs === 0
                      ? 'border-emerald-500/35 bg-emerald-500/[0.06] text-emerald-100 hover:border-emerald-400/50 hover:bg-emerald-500/10 hover:shadow-[0_0_24px_rgba(52,211,153,0.12)]'
                      : 'border-white/10 bg-white/[0.02] text-white/25 cursor-not-allowed'
                  }`}
                >
                  {rateLimitRemainingMs > 0 ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400/80" />
                      <span>Warten {Math.ceil(rateLimitRemainingMs / 1000)}s</span>
                    </>
                  ) : isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-400/80" />
                      <span>Verbinde…</span>
                    </>
                  ) : (
                    <>
                      <Mic className={`h-4 w-4 ${isEliteOnline ? 'text-emerald-400' : 'text-white/20'}`} />
                      <span>{isEliteOnline ? 'Elite aktivieren' : 'Backend offline'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/50 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white active:scale-[0.98]"
                  title="System-Einstellungen"
                >
                  <Settings className="size-5" />
                </button>
              </div>
              <p className="mt-4 max-w-sm text-center text-[10px] leading-relaxed tracking-wide text-white/30">
                {rateLimitRemainingMs > 0
                  ? `LiveKit begrenzt Verbindungsversuche. Noch ${Math.ceil(rateLimitRemainingMs / 1000)} Sekunden warten.`
                  : !isEliteOnline
                    ? livekitMode === 'local'
                      ? 'Lokal = LiveKit in Docker auf diesem PC. Zusätzlich: python agent.py (Jarvis Core). KI nutzt OpenAI – kein lokales LLM nötig.'
                      : 'Elite-Backend (agent.py) und LiveKit Cloud müssen erreichbar sein. OPENAI_API_KEY in backend/.env.'
                    : 'Sprachsteuerung starten · „Elite“ oder „Jarvis“ + Befehl'}
              </p>
            </HudMotion>
          ) : (
            <HudMotion isElectron={isElectron} key="active" layoutKey="active" className="flex h-full w-full flex-col items-center">
              <LiveKitRoom
                key={roomName ?? 'elite-room'}
                video={false}
                audio={false}
                token={token}
                serverUrl={livekitServerUrl}
                connectOptions={liveKitConnectOptions}
                onConnected={() => {
                  clearLiveKitRateLimit();
                  setRateLimitRemainingMs(0);
                  setIsConnecting(false);
                }}
                onDisconnected={() => {
                  setToken(null);
                  setRoomName(null);
                  setIsConnecting(false);
                  sessionStorage.removeItem('elite-session-active');
                }}
                onError={handleLiveKitError}
                options={{
                  publishDefaults: {
                    // Lokal: kein TURN im Dev-Container → Relay erzwingen = Publisher-Timeout
                    forceRelay: livekitMode === 'cloud',
                    stopMicTrackOnMute: false,
                  } as TrackPublishDefaults,
                  connectTimeout: 30000,
                } as RoomOptions}
                className="relative flex h-full w-full flex-col items-center"
              >
                <LiveKitRateLimitBridge onRateLimited={applyLiveKitRateLimitHit} />
                <LiveKitBridge />
                <ToolConfirmationModal />
                <EliteAutoAudio />
                <SupportInterface
                  isHardwareInitializing={isHardwareInitializing}
                  setIsHardwareInitializing={setIsHardwareInitializing}
                  showSettings={showSettings}
                  setShowSettings={setShowSettings}
                  livekitMode={livekitMode}
                  llmMode={llmMode}
                />
                <RoomAudioRenderer />
              </LiveKitRoom>
            </HudMotion>
          )}
        </AnimatePresence>
      </div>

      {/* Global Settings Panel Modal (accessible from landing page & support view) */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-36 left-1/2 w-[85%] max-w-md -translate-x-1/2 z-[10001]"
          >
            <div className="rounded-3xl bg-black/90 backdrop-blur-3xl ring-1 ring-white/10 shadow-[0_0_60px_rgba(0,0,0,0.6)] p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">
                  System-Einstellungen
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* LiveKit Connection Mode Toggle */}
              <div className="mb-5">
                <div className="flex items-center gap-3 mb-3">
                  <Globe className="size-4 text-cyan-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    LiveKit Server Modus
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleLivekitMode('cloud')}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                      livekitMode === 'cloud'
                        ? 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30'
                        : 'bg-white/5 text-white/30 ring-1 ring-white/5 hover:bg-white/10 hover:text-white/60'
                    }`}
                  >
                    Cloud (LiveKit)
                  </button>
                  <button
                    onClick={() => handleToggleLivekitMode('local')}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                      livekitMode === 'local'
                        ? 'bg-[#ff0080]/15 text-[#ff0080] ring-1 ring-[#ff0080]/30 shadow-[0_0_15px_rgba(255,0,128,0.15)]'
                        : 'bg-white/5 text-white/30 ring-1 ring-white/5 hover:bg-white/10 hover:text-white/60'
                    }`}
                  >
                    Lokal (Docker)
                  </button>
                </div>
                <p className="mt-2 text-[9px] text-white/30 text-center leading-relaxed">
                  {livekitMode === 'local'
                    ? 'LiveKit-Server lokal (Docker :7880) – Audio-Raum auf deinem PC.'
                    : 'LiveKit & Signaling in der Cloud.'}
                </p>
              </div>

              {/* KI-Modus (OpenAI vs Ollama offline) */}
              <motion.div className="mb-5">
                <motion.div className="flex items-center gap-3 mb-3">
                  <Bot className="size-4 text-emerald-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    KI-Modus
                  </span>
                </motion.div>
                <motion.div className="flex gap-2">
                  {(['auto', 'cloud', 'local'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleToggleLlmMode(mode)}
                      className={`flex-1 h-10 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                        llmMode === mode
                          ? mode === 'local'
                            ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                            : 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30'
                          : 'bg-white/5 text-white/30 ring-1 ring-white/5 hover:bg-white/10'
                      }`}
                    >
                      {mode === 'auto' ? 'Auto' : mode === 'cloud' ? 'Cloud' : 'Offline'}
                    </button>
                  ))}
                </motion.div>
                <p className="mt-2 text-[9px] text-white/30 text-center leading-relaxed">
                  {llmMode === 'local' && (
                    <>
                      Whisper + Ollama + Piper-Stimme (Thorsten, neural offline).
                      {ollamaReachable ? ' Ollama erreichbar.' : ' Ollama nicht erreichbar – ollama serve starten.'}
                    </>
                  )}
                  {llmMode === 'cloud' && 'OpenAI Realtime – beste Sprachqualität, Credits/API-Key nötig.'}
                  {llmMode === 'auto' &&
                    'Mit OPENAI_API_KEY → Cloud, sonst Offline. Ideal wenn Credits ausgehen.'}
                </p>
                {effectiveLlmMode === 'local' && llmFallbackReason === 'insufficient_quota' && (
                  <p className="mt-2 text-[9px] text-amber-400/90 text-center leading-relaxed ring-1 ring-amber-500/20 rounded-lg px-2 py-1.5 bg-amber-500/5">
                    Agent läuft offline: OpenAI-Guthaben aufgebraucht. Abrechnung prüfen oder „Offline“ beibehalten.
                  </p>
                )}
              </motion.div>

              {/* Sprache / Language */}
              <div className="mb-5">
                <div className="flex items-center gap-3 mb-3">
                  <Globe className="size-4 text-[#ff0080]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Sprache
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 h-10 rounded-xl bg-[#ff0080]/15 text-[#ff0080] text-xs font-bold uppercase tracking-wider ring-1 ring-[#ff0080]/30 transition-all">
                    Deutsch
                  </button>
                </div>
              </div>

              {/* Smartphone Connection (Eyes for AI) */}
              <div className="mb-5">
                <div className="flex items-center gap-3 mb-3">
                  <Smartphone className="size-4 text-cyan-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Smartphone (Eyes)
                  </span>
                </div>
                <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10 flex flex-col items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                    <QRCodeSVG 
                      value={
                        typeof window !== 'undefined' 
                          ? window.location.href.replace('localhost', process.env.NEXT_PUBLIC_LOCAL_IP || 'localhost')
                          : ''
                      } 
                      size={140}
                      level="H"
                      includeMargin={false}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-cyan-300 font-bold uppercase tracking-widest mb-1">Scannen zum Verbinden</p>
                    <p className="text-[10px] text-white/30 leading-tight">
                      Nutze dein Handy als Kamera für Elite.<br/>
                      Tritt dem Raum bei & teile Video.
                    </p>
                  </div>
                </div>
              </div>

              {/* Agent Info */}
              <div className="rounded-xl bg-gradient-to-br from-[#ff0080]/5 to-transparent p-4 ring-1 ring-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff0080]/10">
                    <Bot className="size-5 text-[#ff0080]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Elite</p>
                    <p className="text-[11px] text-white/30">Webstark KI-Agent • v2.0</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// LocalStorage Key für Chat-Persistenz
const CHAT_STORAGE_KEY = 'elite-chat-history';

// Typ-Definition für eine Chat-Nachricht (Chat + Voice-Transkription)
type CombinedMessage = {
  id: string;
  text: string;
  isAgent: boolean;
  timestamp: number;
  source?: 'elite' | 'hermes';
  pending?: boolean;
};

/** Widgets, die den Orb verkleinern / Sidebars ausblenden (Chat, Webcam, Terminal ausgenommen). */
function isOrbBlockingWidget(id: string): boolean {
  return id !== 'webcam' && id !== 'chat' && id !== 'terminal';
}

function normalizeMessageTimestamp(raw: unknown, fallback: number): number {
  if (raw == null) return fallback;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? Math.round(raw * 1000) : raw;
  }
  if (typeof raw === 'bigint') return Number(raw);
  const parsed = new Date(raw as string | number).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ==============================================================================
// 1. LiveKitBridge: Verbindet die globale elite-API mit dem LiveKit DataChannel & Chat
// ==============================================================================
function LiveKitBridge() {
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const { state: agentState } = useVoiceAssistant();
  const { send } = useChat();
  const greetingRequestedRef = useRef(false);
  const { updateMusicLibrary, widgets, openWidget, closeWidget, closeAllWidgets, toggleWidget, addLog, appendEditorText, addCapturedImage, setCadModel } = useWidgetManager();
  const { showToast } = useToast();

  const requestStartupGreeting = useCallback(() => {
    if (!localParticipant || greetingRequestedRef.current) return;
    greetingRequestedRef.current = true;
    try {
      const payload = JSON.stringify({
        type: 'startup_greeting_ready',
        participant_id: localParticipant.identity,
      });
      localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
    } catch (err) {
      greetingRequestedRef.current = false;
      console.warn('[LiveKitBridge] Startup-Greeting-Anfrage fehlgeschlagen:', err);
    }
  }, [localParticipant]);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) {
      greetingRequestedRef.current = false;
    }
  }, [connectionState]);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || !room) return;
    void ensureRoomAudio(room);
  }, [connectionState, room]);

  useEffect(() => {
    if (agentState === 'speaking' && room) {
      void ensureRoomAudio(room);
    }
  }, [agentState, room]);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || !room || !localParticipant) return;

    const onAudioReady = () => {
      requestStartupGreeting();
    };

    window.addEventListener('elite-room-audio-ready', onAudioReady);

    void (async () => {
      const ok = await ensureRoomAudio(room);
      if (ok) {
        requestStartupGreeting();
      }
    })();

    const retryTimers = [2500, 6000, 12000].map((ms) =>
      window.setTimeout(() => {
        if (!greetingRequestedRef.current) {
          void ensureRoomAudio(room).then((ready) => {
            if (ready) requestStartupGreeting();
          });
        }
      }, ms),
    );

    return () => {
      window.removeEventListener('elite-room-audio-ready', onAudioReady);
      retryTimers.forEach((id) => window.clearTimeout(id));
    };
  }, [connectionState, room, localParticipant, requestStartupGreeting]);

  const onDataChannelMessageRef = useRef<((data_packet: any) => void) | null>(null);

  useEffect(() => {
    onDataChannelMessageRef.current = (data_packet) => {
      try {
        const decoder = new TextDecoder();
        const decodedText = decoder.decode(data_packet.payload);
        const data = JSON.parse(decodedText);

        if (data.type === 'music_library_update' && data.songs) {
          updateMusicLibrary(data.songs);
        }
        
        if (data.type === 'music_item' && data.song) {
          updateMusicLibrary((prev: any[]) => {
            const current = Array.isArray(prev) ? prev : [];
            if (current.includes(data.song)) return current;
            return [...current, data.song];
          });
        }

        if (data.type === 'system_stats') {
          window.dispatchEvent(new CustomEvent('elite-system-stats', { detail: data }));
        }

        if (data.type === 'trigger_visual_scan') {
          console.log("[LiveKitBridge] KI fordert Kamera-Scan an...");
          try {
            showToast({
              type: 'tool',
              title: 'Kamera-Scan angefordert',
              message: 'Die KI analysiert die Umgebung über die Webcam.'
            });
          } catch (e) { /* ignore toast error */ }

          if (!widgets.webcam) {
            openWidget('webcam');
          }
          
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('elite-trigger-scan'));
          }, 300);
        }

        if (data.type === 'weather_update') {
          window.dispatchEvent(new CustomEvent('elite-weather-update', { detail: data }));
        }

        // --- FIXED BLOCK START ---
        if (data.type === 'widget_control') {
          const widgetId = data.widgetId ?? data.widget_id;
          const { action } = data;
          if (!widgetId && action !== 'close_all') return;
          console.log(`[LiveKitBridge] Widget-Befehl: ${action} ${widgetId}`);
          if (action === 'open') openWidget(widgetId);
          else if (action === 'close') closeWidget(widgetId);
          else if (action === 'close_all') closeAllWidgets();
          else if (action === 'toggle') toggleWidget(widgetId);
        }

        if (data.type === 'captured_image' && data.image?.src) {
          addCapturedImage({
            src: data.image.src,
            labels: Array.isArray(data.image.labels) ? data.image.labels : [],
            confidence: typeof data.image.confidence === 'number' ? data.image.confidence : 0.9,
            analysis: data.image.analysis,
          });
          if (!widgets.imageGrid) openWidget('imageGrid');
        }
        
        if (data.type === 'clipboard_update' && data.content) {
          console.log("[LiveKitBridge] Clipboard-Update empfangen:", data.content);
          appendEditorText(data.content);
        }

        if (data.type === 'log_event' && data.log) {
          addLog(data.log);

          if (
            data.log.type === 'system' &&
            typeof data.log.message === 'string' &&
            data.log.message.includes('[Begrüßung]')
          ) {
            if (room) void ensureRoomAudio(room);
          }
          
          // --- SOUND EFFECTS FOR LOGS ---
          if (data.log.type === 'tool_call') {
            playSystemSound('click', 0.25);
          } else if (data.log.type === 'result') {
            playSystemSound('task_completed', 0.35);
          } else if (data.log.type === 'error') {
            playSystemSound('timer', 0.35);
          }

          // Smart Clipboard: Daten an den Text-Editor weiterleiten + Widget öffnen
          if (data.log.type === 'suggestion' && data.log.data?.clipboard) {
            console.log("[LiveKitBridge] Clipboard-Update erkannt, sende Event...");
            window.dispatchEvent(new CustomEvent('elite-clipboard-update', { detail: data.log.data.clipboard }));
            // Auto-opening disabled on user request
          }
        }

        if (data.type === 'meeting_status') {
          const { active, type_label } = data;
          window.dispatchEvent(new CustomEvent('elite-meeting-status', { detail: data }));
          if (active) {
            showToast({
              type: 'system',
              title: 'Meeting Guard aktiv',
              message: `${type_label} erkannt. Musik pausiert.`
            });
          }
        }

        if (data.type === 'agent_silence') {
          window.dispatchEvent(
            new CustomEvent('elite-agent-silence', { detail: data }),
          );
        }

        if (data.type === 'voice_rejected' && data.message) {
          const heard =
            typeof data.transcript === 'string' && data.transcript.trim()
              ? `Gehört: „${data.transcript.trim()}“ — `
              : '';
          showToast({
            type: 'system',
            title: 'Sprache gehört – kein Wake-Word',
            message: `${heard}${String(data.message)}`,
            duration: 7000,
          });
        }

        if (data.type === 'openai_quota_exhausted') {
          showToast({
            type: 'error',
            title: 'OpenAI-Guthaben aufgebraucht',
            message:
              data.message ||
              'OpenAI-Guthaben aufgebraucht. Offline-KI (Ollama) wird verwendet.',
          });
          addLog({
            type: 'error',
            message:
              'OpenAI-Guthaben aufgebraucht. Elite nutzt Offline-KI (Ollama). ' +
              'Einstellungen → KI-Modus → „Offline“ wählen oder OpenAI-Abrechnung prüfen.',
          });
        }

        if (data.type === 'cad_update') {
          if (data.stl_path) {
            setCadModel(data.stl_path, data.prompt || '');
          }
          window.dispatchEvent(new CustomEvent('elite-cad-update', { detail: data }));
          openWidget('cad');
        }

        if (data.type === 'printer_update') {
          window.dispatchEvent(new CustomEvent('elite-printer-update', { detail: data }));
          openWidget('printer');
        }

        if (data.type === 'web_agent_turn') {
          window.dispatchEvent(new CustomEvent('elite-web-agent-turn', { detail: data }));
        }

        if (data.type === 'kasa_update') {
          openWidget('kasa');
        }

        if (data.type === 'face_auth_required') {
          openWidget('authLock');
          window.dispatchEvent(new CustomEvent('elite-face-auth-required', { detail: data }));
        }

        if (data.type === 'face_auth_enroll') {
          openWidget('authLock');
        }

        if (data.type === 'gesture_settings') {
          window.dispatchEvent(new CustomEvent('elite-gesture-settings', { detail: data }));
        }
        
        if (data.type === 'play_sound' && data.sound) {
          playSystemSound(data.sound);
        }
        // --- FIXED BLOCK END ---
        
      } catch (e) {
        // Ignoriere nicht-JSON
      }
    };
  });

  const stableOnMessage = useCallback((data_packet: any) => {
    onDataChannelMessageRef.current?.(data_packet);
  }, []);

  useDataChannel(stableOnMessage);

  // Mikrofon-Status Überwachung (Passiv)
  useEffect(() => {
    if (!localParticipant) return;
    console.log("[LiveKitBridge] Monitoring aktiv.");
  }, [localParticipant]);

  useEffect(() => {
    if (typeof window !== 'undefined' && localParticipant) {
      console.log("[LiveKitBridge] Verbindung hergestellt. APIs werden registriert.");
      
      // Startup-Sound: Willkommens-Briefing (WelcomeBriefing) — hier kein Duplikat
      if (!(window as any).elite) (window as any).elite = {};
      
      (window as any).elite.sendDataChannel = (payload: string) => {
        try {
          const encoder = new TextEncoder();
          localParticipant.publishData(encoder.encode(payload), { reliable: true });
        } catch (e) {
          console.error("DataChannel send failed:", e);
        }
      };

      (window as any).elite.sendChatMessage = async (text: string) => {
        try {
          if (send) await send(text);
        } catch (e) {
          console.error("Chat send failed:", e);
        }
      };
    }
  }, [localParticipant, send]);

  return null;
}

// Animierter normaler Bot mit leuchtend roten Augen (für Platzhalter)
const AnimatedBot = ({ className = 'size-10' }: { className?: string }) => (
  <motion.svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`elite-motion-allow ${className ?? ''}`}
    animate={{ y: [0, -2, 0] }}
    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
  >
    <defs>
      <filter id="standbyEyeGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <motion.rect
      x="8.5"
      y="12.5"
      width="2"
      height="2"
      fill="#ff3300"
      stroke="none"
      rx="0.5"
      filter="url(#standbyEyeGlow)"
      animate={{ scaleY: [1, 1, 1, 0.12, 1], opacity: [1, 1, 1, 0.5, 1] }}
      transition={{
        duration: 3.5,
        repeat: Infinity,
        times: [0, 0.5, 0.85, 0.92, 1],
        ease: 'easeInOut',
      }}
      style={{ transformOrigin: '9.5px 13.5px', transformBox: 'fill-box' }}
    />
    <motion.rect
      x="13.5"
      y="12.5"
      width="2"
      height="2"
      fill="#ff3300"
      stroke="none"
      rx="0.5"
      filter="url(#standbyEyeGlow)"
      animate={{ scaleY: [1, 1, 1, 0.12, 1], opacity: [1, 1, 1, 0.5, 1] }}
      transition={{
        duration: 3.5,
        repeat: Infinity,
        times: [0, 0.51, 0.86, 0.93, 1],
        ease: 'easeInOut',
      }}
      style={{ transformOrigin: '14.5px 13.5px', transformBox: 'fill-box' }}
    />
  </motion.svg>
);

// Animiertes BotMessageSquare-Icon mit blinzelnden roten Augen (für Chat-Labels)
const AnimatedBotMessageSquare = ({ className = 'size-5' }: { className?: string }) => {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`elite-motion-allow ${className ?? ''}`}
    >
      {/* BotMessageSquare Basis: Sprechblase + Antenne */}
      <path d="M12 6V2H8" />
      <path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />

      {/* Linkes Auge – blinzelt rot */}
      <motion.rect
        x="8.5"
        y="10.5"
        width="2.5"
        height="3"
        fill="#ff3300"
        stroke="none"
        rx="0.5"
        animate={{
          scaleY: [1, 1, 1, 1, 0.1, 1],
          opacity: [1, 1, 1, 1, 0.4, 1],
        }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          times: [0, 0.5, 0.85, 0.9, 0.95, 1],
          ease: 'easeInOut',
        }}
        style={{ transformOrigin: 'center' }}
      />

      {/* Rechtes Auge – blinzelt rot */}
      <motion.rect
        x="14"
        y="10.5"
        width="1.5"
        height="3"
        fill="#ff3300"
        stroke="none"
        rx="0.5"
        animate={{
          scaleY: [1, 1, 1, 1, 0.1, 1],
          opacity: [1, 1, 1, 1, 0.4, 1],
        }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          times: [0, 0.51, 0.86, 0.91, 0.96, 1],
          ease: 'easeInOut',
        }}
        style={{ transformOrigin: 'center' }}
      />
    </motion.svg>
  );
};

function agentStatusLabel(
  state: string,
  connectionState: ConnectionState,
  hasAgent: boolean,
): string {
  if (state === 'speaking') return 'Elite aktiv...';
  if (state === 'listening') return 'Elite bereit';
  if (state === 'thinking') return 'Analysiere...';
  if (state === 'initializing') return 'Initialisiere...';
  if (state === 'connecting') {
    if (connectionState === ConnectionState.Connected && hasAgent) return 'Elite startet...';
    if (connectionState === ConnectionState.Connected && !hasAgent) return 'Warte auf Elite...';
    return 'Verbinde...';
  }
  return 'System Bereit';
}

function SupportInterface({ 
  isHardwareInitializing, 
  setIsHardwareInitializing,
  showSettings,
  setShowSettings,
  livekitMode,
  llmMode,
}: { 
  isHardwareInitializing: boolean, 
  setIsHardwareInitializing: (v: boolean) => void,
  showSettings: boolean,
  setShowSettings: (v: boolean) => void,
  livekitMode: 'cloud' | 'local',
  llmMode: 'cloud' | 'local' | 'auto',
}) {
  const connectionState = useConnectionState();
  const { state, agent, audioTrack: agentTrack } = useVoiceAssistant();
  const statusLabel = agentStatusLabel(state, connectionState, !!agent);
  const [micLive, setMicLive] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const { chatMessages, send } = useChat();
  const transcriptions = useTranscriptions();
  const [inputText, setInputText] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { widgets, fullscreenWidget, detachedWidgets, addLog } = useWidgetManager();
  const { showToast } = useToast();
  const [hermesMessages, setHermesMessages] = useState<CombinedMessage[]>([]);
  const [hermesSessionId, setHermesSessionId] = useState<string | null>(null);
  const [hermesSending, setHermesSending] = useState(false);
  const hermesApiHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  
  // Bestimmt, ob Widgets aktiv sind, die Platz im Zentrum beanspruchen (Sidebars ausblenden)
  // Die Webcam und Pop-outs werden hier ignoriert, da sie keinen Platz im Zentrum beanspruchen.
  const hasBlockingWidgets =
    fullscreenWidget !== null ||
    Object.entries(widgets).some(
      ([id, active]) => active && !detachedWidgets[id as WidgetId] && isOrbBlockingWidget(id),
    );

  // Gespeicherten Chat-Verlauf aus localStorage laden (einmalig beim Mount)
  const [savedMessages, setSavedMessages] = useState<CombinedMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Flag: Wurde der Verlauf manuell gelöscht? Verhindert sofortiges Neu-Speichern
  const [isCleared, setIsCleared] = useState(false);
  // Merke den Zeitpunkt des Löschens – nur neuere Nachrichten werden danach angezeigt
  const clearedAtRef = useRef<number>(0);

  // Hermes-Verlauf aus Widget-Chat migrieren (einmalig)
  useEffect(() => {
    setHermesSessionId(localStorage.getItem(HERMES_SESSION_STORAGE_KEY));
    try {
      const raw = localStorage.getItem(HERMES_CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{ role: string; content: string; id?: string }>;
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const migrated: CombinedMessage[] = parsed
        .filter((m) => m.content?.trim())
        .map((m, i) => ({
          id: m.id ?? `hermes-mig-${i}`,
          text: m.content,
          isAgent: m.role === 'assistant',
          timestamp: Date.now() - (parsed.length - i) * 100,
          source: 'hermes' as const,
        }));
      setHermesMessages(migrated);
      hermesApiHistoryRef.current = migrated
        .filter((m) => !m.pending)
        .map((m) => ({
          role: (m.isAgent ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.text,
        }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (hermesMessages.length === 0) return;
    const persist = hermesMessages
      .filter((m) => !m.pending && m.text.trim())
      .slice(-80)
      .map((m) => ({
        id: m.id,
        role: m.isAgent ? 'assistant' : 'user',
        content: m.text,
      }));
    localStorage.setItem(HERMES_CHAT_STORAGE_KEY, JSON.stringify(persist));
  }, [hermesMessages]);

  // Umlaut-Reparatur: OpenAI Realtime sendet manchmal kaputte UTF-8 Umlaute
  const fixUmlauts = useCallback((text: string): string => {
    if (!text) return '';
    return (
      text
        // Klassische UTF-8 Korruptionen (mit Hex-Codes für Stabilität)
        .replace(/\u00C3\u00BC/g, '\u00FC') // Ã¼ -> ü
        .replace(/\u00C3\u00A4/g, '\u00E4') // Ã¤ -> ä
        .replace(/\u00C3\u00B6/g, '\u00F6') // Ã¶ -> ö
        .replace(/\u00C3\u009C/g, '\u00DC') // Ãœ -> Ü
        .replace(/\u00C3\u0084/g, '\u00C4') // Ã„ -> Ä
        .replace(/\u00C3\u0096/g, '\u00D6') // Ã– -> Ö
        .replace(/\u00C3\u009F/g, '\u00DF') // ÃŸ -> ß
        // Spezielle Korrekturen für gemeldete Fehler (fÄr -> für etc.)
        .replace(/f\u00C4r/g, 'f\u00FCr')
        .replace(/unterst\u00C4tzen/g, 'unterst\u00FCtzen')
        .replace(/k\u00C4nnen/g, 'k\u00F6nnen')
        .replace(/L\u00C4sungen/g, 'L\u00F6sungen')
    );
  }, []);

  // Voice-Transkriptionen + Chat-Nachrichten + gespeicherte Nachrichten zusammenführen
  const combinedMessages = useMemo<CombinedMessage[]>(() => {
    type OrderedMessage = CombinedMessage & { order: number };
    const messages: OrderedMessage[] = [];
    let order = 0;
    const clearedAt = clearedAtRef.current;
    const includeTs = (ts: number) => !isCleared || ts >= clearedAt;
    const now = Date.now();

    if (!isCleared) {
      for (const msg of savedMessages) {
        if (!includeTs(msg.timestamp)) continue;
        messages.push({ ...msg, order: order++ });
      }
    }

    chatMessages.forEach((msg, i) => {
      const ts = normalizeMessageTimestamp(
        msg.timestamp,
        now - (chatMessages.length - 1 - i) * 50,
      );
      if (!includeTs(ts)) return;
      messages.push({
        id: `msg-chat-${ts}-${i}`,
        text: fixUmlauts(msg.message || ''),
        isAgent: msg.from?.identity === 'agent',
        timestamp: ts,
        order: order++,
      });
    });

    const transcriptionById = new Map<string, OrderedMessage>();
    transcriptions.forEach((segment, i) => {
      if (!segment.text?.trim()) return;
      const identity = segment.participantInfo?.identity ?? 'unknown';
      const isAgent = identity.includes('agent');
      const text = fixUmlauts(segment.text);
      if (!isAgent && isPhantomTranscript(text)) return;

      const segMeta = segment as {
        firstReceivedTime?: number;
        lastReceivedTime?: number;
      };
      const ts = normalizeMessageTimestamp(
        segMeta.lastReceivedTime ?? segMeta.firstReceivedTime,
        now - (transcriptions.length - 1 - i) * 50,
      );
      if (!includeTs(ts)) return;

      const segmentKey =
        (segment as { id?: string }).id ?? `${identity}-${i}`;
      const stableId = `msg-voice-${segmentKey}`;
      const existing = transcriptionById.get(segmentKey);
      if (existing) {
        existing.text = text;
        existing.timestamp = Math.max(existing.timestamp, ts);
        return;
      }
      transcriptionById.set(segmentKey, {
        id: stableId,
        text,
        isAgent,
        timestamp: ts,
        order: order++,
      });
    });
    messages.push(...Array.from(transcriptionById.values()));

    for (const msg of hermesMessages) {
      if (!includeTs(msg.timestamp)) continue;
      messages.push({ ...msg, order: order++ });
    }

    // Eindeutige Nachrichten anhand ihrer ID de-duplizieren 
    // (verhindert doppelte Schlüssel, wenn z. B. hermesMessages sowohl in savedMessages als auch im Live-Zustand existieren)
    const uniqueById = new Map<string, OrderedMessage>();
    for (const msg of messages) {
      uniqueById.set(msg.id, msg);
    }

    const sortedMessages = Array.from(uniqueById.values());
    sortedMessages.sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);

    const deduplicated: CombinedMessage[] = [];
    for (const { order: _order, ...msg } of sortedMessages) {
      const lastMsg = deduplicated[deduplicated.length - 1];
      if (lastMsg && lastMsg.text === msg.text && lastMsg.isAgent === msg.isAgent) continue;
      deduplicated.push(msg);
    }

    return deduplicated;
  }, [chatMessages, transcriptions, savedMessages, hermesMessages, isCleared, fixUmlauts]);

  // Neue Nachrichten automatisch in localStorage speichern (nicht wenn gerade gelöscht)
  useEffect(() => {
    if (combinedMessages.length > 0 && !isCleared) {
      try {
        const toSave = combinedMessages.slice(-100);
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
      } catch {
        // localStorage voll oder nicht verfügbar
      }
    }
    // Wenn nach dem Löschen neue Nachrichten kommen, Speichern wieder aktivieren
    if (isCleared && combinedMessages.length > 0) {
      setIsCleared(false);
    }
  }, [combinedMessages, isCleared]);

  // ─── T1: Tool-Event-Streaming zum Log-Stream Widget ───
  // Nutzt die globale window.elite API (registriert vom WidgetManagerProvider)
  // da SupportInterface NICHT innerhalb des WidgetManagerProvider Kontexts liegt
  const prevMsgCountRef = useRef(0);

  useEffect(() => {
    if (chatMessages.length <= prevMsgCountRef.current) return;

    // Nur neue Nachrichten verarbeiten
    const newMsgs = chatMessages.slice(prevMsgCountRef.current);
    prevMsgCountRef.current = chatMessages.length;

    // Globale Logging-API nutzen (window.elite wird vom WidgetManager gesetzt)
    const elite = (window as any).elite;
    if (!elite?.executeCommand) return;

    for (const msg of newMsgs) {
      const isAgent = msg.from?.identity === 'agent';
      if (!isAgent) continue;

      const text = (msg.message || '').toLowerCase();

      // Tool-Call Erkennung: Keywords die auf Backend-Tool-Aufrufe hinweisen
      const toolPatterns: [RegExp, string][] = [
        [/screenshot|bildschirm|screen.*capture/i, 'capture_screen'],
        [/webcam|kamera|camera/i, 'capture_webcam'],
        [/desktop|maus|tastatur|mouse|keyboard|click/i, 'control_desktop'],
        [/such|search|web.*such|perplexity/i, 'search_web'],
        [/email|mail|nachricht/i, 'send_email'],
        [/system.*info|cpu|ram|speicher/i, 'get_system_info'],
        [/fenster|window|close.*window/i, 'get_open_windows'],
        [/task.*erstell|task.*create|kanban/i, 'mc_create_task'],
        [/memory|erinnerung|merke/i, 'update_agent_memory'],
      ];

      let matched = false;
      for (const [pattern, toolName] of toolPatterns) {
        if (pattern.test(text)) {
          elite.executeCommand(`Tool: ${toolName} – "${msg.message?.slice(0, 80)}..."`);
          matched = true;
          break;
        }
      }

      if (!matched && msg.message) {
        elite.executeCommand(`Agent: ${msg.message.slice(0, 120)}`);
      }
    }
  }, [chatMessages]);

  // Chat-Verlauf löschen (lokal + global)
  const clearChatHistory = useCallback(() => {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem('elite-dashboard-chat');
    setSavedMessages([]);
    clearedAtRef.current = Date.now();
    setIsCleared(true);
  }, []);

  // Auf globales Lösch-Event reagieren (vom Toolbar-Button)
  useEffect(() => {
    const handleClear = () => {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      setSavedMessages([]);
      clearedAtRef.current = Date.now();
      setIsCleared(true);
    };
    window.addEventListener('chat-cleared', handleClear);
    return () => window.removeEventListener('chat-cleared', handleClear);
  }, []);

  // Audio Context aktivieren bei Benutzer-Interaktion
  useEffect(() => {
    const handleInteraction = () => {
      const { getAudioContext } = require('@/hooks/use-audio-analyzer');
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => console.log('[Audio] Context resumed'));
      }
    };
    window.addEventListener('click', handleInteraction, { once: false });
    window.addEventListener('touchstart', handleInteraction, { once: false });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  // AGENT AUDIO: kommt über useVoiceAssistant, NICHT über useTracks(Microphone)!
  const agentMediaTrack = useMemo(() => {
    const track = agentTrack?.publication?.track;
    if (track) {
      console.log('[Audio] Agent-Track gefunden:', track.sid);
    }
    return track ?? null;
  }, [agentTrack]);

  // USER AUDIO: LiveKit Mic-Track finden und KLONEN
  // Der originale Track gehört WebRTC, deshalb klonen wir ihn
  // für eine unabhängige Audio-Analyse.
  // USER AUDIO: LiveKit Mic-Track finden und KLONEN (Nur wenn aktiv!)
  const allMicTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const [clonedMicTrack, setClonedMicTrack] = useState<MediaStreamTrack | null>(null);

  useEffect(() => {
    const localRef = allMicTracks.find(t => t.participant.isLocal);
    const livekitTrack = localRef?.publication?.track;

    if (livekitTrack?.mediaStreamTrack && livekitTrack.mediaStreamTrack.readyState === 'live') {
      // Klon nur erstellen, wenn der Track wirklich aktiv ist
      const clone = livekitTrack.mediaStreamTrack.clone();
      console.log('[Audio] Mic-Track geklont für Visualizer:', clone.label);
      setClonedMicTrack(clone);

      return () => {
        clone.stop();
        setClonedMicTrack(null);
      };
    } else {
      setClonedMicTrack(null);
    }
  }, [allMicTracks]);

  // Audio-Analyse für beide Quellen
  const agentAudio = useAudioAnalyzer(agentMediaTrack);
  const userAudio = useAudioAnalyzer(clonedMicTrack);

  // Kombinierte Levels für den 3D-Orb (Maximum beider Quellen)
  const combinedLevels = useMemo(() => {
    // Wenn das System gerade die Hardware initialisiert, Analyzer pausieren (Resourcen-Schonung)
    if (isHardwareInitializing) return new Array(16).fill(0);
    return agentAudio.levels.map((level, i) => Math.max(level, userAudio.levels[i]));
  }, [agentAudio.levels, userAudio.levels, isHardwareInitializing]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [combinedMessages]);

  const sendToHermes = useCallback(
    async (body: string) => {
      if (hermesSending) return;
      const trimmed = body.trim();
      if (!trimmed) return;

      setHermesSending(true);
      const ts = Date.now();
      const userId = `hermes-u-${ts}`;
      const assistantId = `hermes-a-${ts}`;

      setHermesMessages((prev) => [
        ...prev,
        { id: userId, text: trimmed, isAgent: false, timestamp: ts, source: 'hermes' },
        { id: assistantId, text: '', isAgent: true, timestamp: ts + 1, source: 'hermes', pending: true },
      ]);

      const apiMessages = [
        ...hermesApiHistoryRef.current,
        { role: 'user' as const, content: trimmed },
      ];
      addLog({ type: 'system', message: `[Hermes] ${trimmed.slice(0, 120)}` });

      try {
        const { content, sessionId: newSession } = await sendHermesChat({
          messages: apiMessages,
          sessionId: hermesSessionId,
          stream: true,
          onDelta: (partial) => {
            setHermesMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: partial, pending: true } : m,
              ),
            );
          },
        });

        if (newSession) {
          setHermesSessionId(newSession);
          localStorage.setItem(HERMES_SESSION_STORAGE_KEY, newSession);
        }

        const reply = content || '(leere Antwort)';
        hermesApiHistoryRef.current = [
          ...apiMessages,
          { role: 'assistant' as const, content: reply },
        ].slice(-40);

        setHermesMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: reply, pending: false } : m,
          ),
        );
        addLog({ type: 'system', message: `[Hermes] Antwort (${reply.length} Zeichen)` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setHermesMessages((prev) => prev.filter((m) => m.id !== assistantId));
        showToast({
          type: 'warning',
          title: 'Hermes nicht erreichbar',
          message: 'Gateway starten: START_JARVIS.bat oder wsl: hermes gateway run',
          duration: 7000,
        });
        addLog({ type: 'error', message: `[Hermes] ${msg}` });
      } finally {
        setHermesSending(false);
      }
    },
    [addLog, hermesSending, hermesSessionId, showToast],
  );

  const handleSend = async (text?: string) => {
    const message = (text || inputText).trim();
    if (!message) return;

    const { route, body } = parseUnifiedChatInput(message);
    if (route === 'hermes') {
      if (!body) {
        showToast({
          type: 'info',
          title: '@hermes',
          message: 'Formuliere die Aufgabe nach @hermes, z. B. @hermes Öffne webstark.org und erstelle ein PDF.',
          duration: 6000,
        });
        return;
      }
      await sendToHermes(body);
      if (!text) setInputText('');
      return;
    }

    await send(message);
    if (!text) setInputText('');
  };

  // Screenshot-URL aus Nachrichtentext extrahieren
  const extractScreenshot = useCallback((text: string): string | null => {
    // Erkennung: "Gespeichert unter ...screenshots\screen_HHMMSS.png"
    const match = text.match(/screen_(\d{6})\.png/);
    if (match) return `/api/screenshots/screen_${match[1]}.png`;
    return null;
  }, []);

  return (
    <>
      <div className="fixed top-16 left-0 right-0 z-[60] pointer-events-auto max-w-3xl mx-auto">
        <EliteOnboardingHint />
      </div>

      {/* Background Layer: Grid & Webcam HUD */}
      <div className="fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden pointer-events-none">
        <AnimatePresence>
          {widgets.webcam && fullscreenWidget !== 'webcam' && (
            <motion.div
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 1.2 }}
              className="absolute inset-0 pointer-events-auto"
            >
              <WebcamWidget variant="hud" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div data-elite-panel className="relative flex flex-1 min-h-0 w-full max-w-3xl mx-auto flex-col px-4 pt-30">
      
      {/* Elite System Monitor Dashboard (Sidebar Left) */}
      <AnimatePresence>
        {!hasBlockingWidgets && (
          <motion.div 
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="fixed left-6 top-32 z-40 hidden xl:block w-64"
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-cyan-500 animate-pulse" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500/50">
                System Live Feed
              </h3>
            </div>
            <div className="rounded-2xl bg-black/40 p-4 backdrop-blur-2xl ring-1 ring-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <SystemStatus />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Elite Neural Core Dashboard (Sidebar Right) */}
      <AnimatePresence>
        {!hasBlockingWidgets && (
          <motion.div 
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="fixed right-6 top-32 z-40 hidden xl:block w-64"
          >
            <div className="mb-4 flex items-center justify-end gap-2 text-right">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/50">
                Neural Link Matrix
              </h3>
              <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="rounded-2xl bg-black/40 p-4 backdrop-blur-2xl ring-1 ring-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <NeuralCore />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamischer Agenten-Status */}
      <div className="flex items-center justify-center gap-2 mb-3 mt-20">
        <div
          className={`h-2 w-2 rounded-full transition-colors duration-500 ${
            state === 'speaking'
              ? 'bg-[#00f2ff] shadow-[0_0_8px_#00f2ff] animate-pulse'
              : state === 'listening'
                ? 'bg-[#00f2ff] opacity-50 animate-pulse'
                : state === 'thinking'
                  ? 'bg-cyan-400 animate-pulse'
                  : 'bg-white/20'
          }`}
        />
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300/40 transition-all duration-500">
          {statusLabel}
          {state === 'listening' && (
            <span className={micLive ? 'text-green-400/80' : 'text-amber-400/80'}>
              {' · '}{micLive ? 'Mic AN – „Elite“ + Befehl' : 'Mic AUS – Toolbar-Klick'}
            </span>
          )}
        </span>
      </div>
      {statusLabel === 'Warte auf Elite...' && (
        <p className="mb-2 max-w-md px-4 text-center text-[9px] leading-relaxed text-white/35">
          {llmMode === 'local'
            ? 'Raum verbunden – agent.py + Ollama + Whisper. pip install faster-whisper pyttsx3, dann ollama pull llama3.1'
            : livekitMode === 'local'
              ? 'Raum verbunden – agent.py & Docker livekit-server. Bei Auto/Cloud: OPENAI_API_KEY in backend/.env'
              : 'Raum verbunden – warte auf Agent-Worker (agent.py, LiveKit, OPENAI_API_KEY).'}
        </p>
      )}

      {/* Visualizer Hero: Orb – dynamisch nach rechts unten wenn Widgets aktiv */}
      <OrbSection
        levels={combinedLevels}
        inputLevel={inputLevel}
        agentState={state}
        paused={isHardwareInitializing}
      />

      {/* Mobile/Tablet System Monitor (Top Row - Immer sichtbar oben) */}
      <div className="xl:hidden w-full mb-6">
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500/50">
            System Live Feed
          </h3>
        </div>
        <div className="rounded-2xl bg-black/40 p-4 backdrop-blur-2xl ring-1 ring-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.3)]">
           <SystemStatus />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 w-full flex-col">
      <section
        ref={scrollRef}
        className="flex-1 min-h-[8rem] overflow-y-auto space-y-6 flex flex-col no-scrollbar pt-1 pb-3"
      >
        {combinedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <AnimatedBot className="h-20 w-20 mb-6 opacity-20" />
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-widest uppercase text-white/40">System Standby</h2>
              <p className="text-sm font-light tracking-wide max-w-sm opacity-40">
                {micLive
                  ? 'Sage laut: „Elite“ + Befehl'
                  : 'Mikrofon in der Toolbar aktivieren (rotes Icon), dann „Elite“ + Befehl.'}
              </p>
            </div>
          </div>
        ) : (
          combinedMessages.map(msg => (
            <motion.div
              initial={{ opacity: 0, x: msg.isAgent ? -20 : 20, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              key={msg.id}
              className={`flex w-full ${msg.isAgent ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`flex flex-col w-full max-w-[min(100%,42rem)] ${
                  msg.isAgent ? 'items-start mr-auto' : 'items-end ml-auto max-w-[85%]'
                }`}
              >
                <div
                  className={`relative w-fit min-w-[14rem] max-w-full rounded-2xl px-5 py-4 text-[14px] text-white/85 leading-relaxed transition-all ${
                    msg.isAgent
                      ? msg.source === 'hermes'
                        ? `${HUD_CHAT_HERMES_BUBBLE} rounded-tl-none min-h-[3.25rem]`
                        : `${HUD_CHAT_AGENT_BUBBLE} rounded-tl-none`
                      : `${HUD_CHAT_USER_BUBBLE} rounded-tr-none`
                  } ${msg.pending ? 'opacity-90' : ''}`}
                >
                  {msg.isAgent && msg.source === 'hermes' && (
                    <div className="mb-2.5 flex items-center gap-2 border-b border-violet-400/15 pb-2">
                      <Sparkles className="size-3.5 text-violet-400 shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">
                        Hermes Agent
                      </span>
                      {msg.pending ? (
                        <Loader2 className="size-3 ml-auto animate-spin text-violet-400/80" />
                      ) : null}
                    </div>
                  )}
                  {msg.pending && !msg.text.trim() ? (
                    <div className="flex items-center gap-2.5 py-1 min-h-[1.75rem]">
                      <Loader2
                        className={`size-4 animate-spin shrink-0 ${
                          msg.source === 'hermes' ? 'text-violet-400' : 'text-primary'
                        }`}
                      />
                      <span
                        className={`text-[13px] ${
                          msg.source === 'hermes' ? 'text-violet-200/85' : 'text-white/65'
                        }`}
                      >
                        {msg.source === 'hermes' ? 'Hermes arbeitet…' : 'Elite denkt nach…'}
                      </span>
                    </div>
                  ) : (
                    <ChatMessageBody
                      text={msg.text}
                      isAgent={msg.isAgent}
                      screenshotSrc={msg.isAgent ? extractScreenshot(msg.text) : null}
                      onImageClick={(src) => setLightboxSrc(src)}
                    />
                  )}
                  <motion.div
                    className={`absolute top-0 ${msg.isAgent ? '-left-1' : '-right-1'} h-2 w-2 ${
                      msg.isAgent
                        ? msg.source === 'hermes'
                          ? 'bg-violet-400/40'
                          : 'bg-white/10'
                        : 'bg-primary/65'
                    }`}
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 opacity-50">
                  {msg.isAgent ? (
                    msg.source === 'hermes' ? null : (
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                        Elite Core
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                      {msg.source === 'hermes' ? 'Admin · @hermes' : 'Admin User'}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </section>

      {/* Einheitlicher Chat — im Flex-Layout, nicht über Nachrichten gelegt */}
      <div className="shrink-0 w-full pb-[5.75rem] pt-2">
        <EliteChatComposer
          onSend={handleSend}
          placeholder={UNIFIED_CHAT_PLACEHOLDER}
        />
      </div>
      </div>

      {/* Widget-Overlay: alle aktiven Widgets als floating Grid über dem Voice-Interface */}
      <MainWidgetOverlay onSend={handleSend} />

      {/* Screenshot Lightbox */}
      <ScreenshotLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      </div>
      {/* HUD-Modus: Schwebender Scan Frame Button unten links */}
      <AnimatePresence>
        {widgets.webcam && (
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="fixed bottom-24 left-6 z-50 pointer-events-auto"
          >
            <button
              onClick={() => {
                window.dispatchEvent(new Event('elite-trigger-scan'));
              }}
              className="px-5 py-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 backdrop-blur-xl hover:bg-cyan-500/20 text-xs font-black uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(6,182,212,0.15)] flex items-center gap-2 group transition-all"
            >
              <Camera className="size-4 group-hover:scale-110 transition-transform text-cyan-400" />
              <span>Scan Frame</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomToolbar
        prepend={
          <CustomVoiceControls
            isInitializing={isHardwareInitializing}
            setIsInitializing={setIsHardwareInitializing}
            onMicLiveChange={setMicLive}
            onInputLevelChange={setInputLevel}
          />
        }
      />

      {widgets.authLock && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-2xl z-[9998] flex items-center justify-center pointer-events-auto">
          <div className="w-[95%] max-w-lg shadow-[0_0_80px_rgba(6,182,212,0.15)] rounded-3xl overflow-hidden border border-cyan-500/20">
            <AuthLockWidget />
          </div>
        </div>
      )}

      <EliteTrayMinimizeButton />
    </>
  );
}

/**
 * OrbSection: Reagiert auf aktive Widgets.
 * - Kein Widget aktiv → Orb groß, zentriert (Haupt-Hero)
 * - Widget aktiv     → Orb klein, fixed bottom-right (weicht Widgets aus)
 */
function OrbSection({
  levels,
  inputLevel = 0,
  agentState,
  paused = false,
}: {
  levels: number[];
  inputLevel?: number;
  agentState: string;
  paused?: boolean;
}) {
  const { isElectron } = useIsElectron();
  const { widgets, fullscreenWidget, detachedWidgets } = useWidgetManager();
  const hasBlockingWidgets =
    fullscreenWidget !== null ||
    Object.entries(widgets).some(
      ([id, active]) => active && !detachedWidgets[id as WidgetId] && isOrbBlockingWidget(id),
    );

  // WORKAROUND für Three.js + Framer Motion Bug:
  // Wenn der Mini-Orb gemountet wird, während Framer Motion animiert, 
  // berechnet das Canvas manchmal seine Bounding-Box falsch (wird klein & oben links).
  // Ein künstlicher Resize-Event nach der Animation zwingt R3F zur Neubrechnung.
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 450); // Kurz nach der Spring-Animation
    return () => clearTimeout(timer);
  }, [hasBlockingWidgets]);

  if (hasBlockingWidgets) {
    // Kompakter Orb unten rechts – weicht dem Widget-Overlay aus
    return (
      <motion.div
        layout
        key="orb-mini"
        initial={isElectron ? false : { opacity: 0, scale: 0.5, x: 60, y: 60 }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={isElectron ? undefined : { opacity: 0, scale: 0.5 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="fixed bottom-20 right-6 z-50 flex flex-col items-center gap-1"
        data-elite-panel
      >
        {/* Status-Dot */}
        <div className="flex items-center gap-1 mb-0.5">
          <div className={`h-1 w-1 rounded-full ${
            agentState === 'speaking' ? 'bg-cyan-400 animate-pulse' :
            agentState === 'listening' ? 'bg-cyan-400/50 animate-pulse' : 'bg-white/20'
          }`} />
          <span className="text-[7px] font-mono uppercase tracking-wider text-white/20">
            {agentState === 'speaking' ? 'spricht' :
             agentState === 'listening' ? 'hört' :
             agentState === 'thinking' ? 'denkt' : 'bereit'}
          </span>
        </div>
        {/* Mini-Orb – Flex Center, Canvas ist etwas größer (110%), damit es den 80px Kreis vollflächig ohne Ränder ausfüllt */}
        <div
          className="size-20 rounded-full ring-1 ring-cyan-500/20 overflow-hidden bg-black/40 backdrop-blur-sm cursor-pointer flex items-center justify-center"
          title="Elite Voice Agent"
        >
          <div className="w-[110%] h-[110%] shrink-0">
            <SafeVoiceOrb levels={levels} className="w-full h-full" paused={paused} />
          </div>
        </div>
      </motion.div>
    );
  }

  // Standard: großer, zentrierter Orb
  const avgLevel = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const signalPct = Math.min(100, Math.max(avgLevel, inputLevel / 100, ...levels) * 140);

  return (
    <motion.section
      layout
      key="orb-full"
      initial={isElectron ? false : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={isElectron ? undefined : { opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className="mb-4 mt-35 flex flex-col items-center justify-center relative h-[400px] w-[350px] mx-auto"
      data-elite-panel
    >
      <div className="relative h-[350px] w-[350px] flex items-center justify-center">
        <SafeVoiceOrb levels={levels} paused={paused} />
      </div>
      
      {/* Visual Mic Indicator Bar */}
      <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden mt-4 ring-1 ring-white/10 backdrop-blur-sm">
        <motion.div 
          className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
          animate={{ width: `${signalPct}%` }}
          transition={{ type: 'spring', bounce: 0, duration: 0.1 }}
        />
      </div>
      <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/20 mt-2">Signal Input</span>
    </motion.section>
  );
}

/** Floating Widget-Overlay für die Hauptseite.
 *  Zeigt alle aktiven Dashboard-Widgets als Grid-Overlay über dem Voice-Interfa */
function renderMainOverlayWidget(id: WidgetId, onSend: (text: string) => void) {
  switch (id) {
    case 'webcam':
      return <WebcamWidget />;
    case 'imageGrid':
      return <ImageGridWidget />;
    case 'systemMonitor':
      return <SystemMonitorWidget />;
    case 'music':
      return <MusicWidget />;
    case 'logStream':
      return <LogStreamWidget />;
    case 'textEditor':
      return <TextEditorWidget onSend={onSend} />;
    case 'missionControl':
      return <MissionControlWidget />;
    case 'commandList':
      return <CommandListWidget />;
    case 'paiPulse':
      return <PaiPulseWidget />;
    case 'settings':
      return <SettingsWidget />;
    case 'mediaPlayer':
      return <MediaPlayerWidget />;
    case 'cad':
      return <CadWidget />;
    case 'printer':
      return <PrinterWidget />;
    case 'browserAgent':
      return <BrowserAgentWidget />;
    case 'kasa':
      return <KasaWidget />;
    case 'authLock':
      return <AuthLockWidget />;
    default:
      return null;
  }
}

function MainWidgetOverlay({ onSend }: { onSend: (text: string) => void }) {
  const { widgets, widgetOrder, expandedWidgets, fullscreenWidget, detachedWidgets } = useWidgetManager();
  const anyExpanded =
    Object.values(expandedWidgets).some(Boolean) || fullscreenWidget !== null;

  // Chat, Webcam und authLock im Grid ausgeschlossen; Pop-out ausgeblendet
  const openGridIds = widgetOrder.filter(
    (id) => widgets[id] && id !== 'chat' && id !== 'webcam' && id !== 'authLock' && !detachedWidgets[id],
  );
  const gridWidgets = fullscreenWidget
    ? openGridIds.filter((id) => id !== fullscreenWidget)
    : openGridIds;
  const nonChatActive = gridWidgets.length;
  const isCameraActive = widgets.webcam && fullscreenWidget !== 'webcam';

  return (
    <>
      <WidgetFullscreenPortal>
        {(id) => renderMainOverlayWidget(id, onSend)}
      </WidgetFullscreenPortal>

      {/* Alle anderen Widgets als Grid-Overlay */}
      {nonChatActive > 0 && (
        <div
          className={`fixed bottom-24 top-4 left-4 right-6 xl:left-[280px] xl:right-[280px] z-40 pointer-events-none flex flex-col ${anyExpanded ? 'items-center justify-center' : 'items-start'}`}
        >
          <div
            className={`pointer-events-auto h-auto grid gap-4 auto-rows-min w-full ${
              anyExpanded ? 'grid-cols-1 max-w-4xl mx-auto' :
              isCameraActive ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' :
              nonChatActive === 1 ? 'grid-cols-1 max-w-xl' :
              nonChatActive === 2 ? 'grid-cols-1 lg:grid-cols-2' :
              'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            } overflow-y-auto pb-4 no-scrollbar`}
          >
            <AnimatePresence mode="popLayout">
              {gridWidgets.map((id, idx) => {
                const gridClass =
                  fullscreenWidget || anyExpanded
                    ? ''
                    : isCameraActive
                      ? idx % 2 === 0
                        ? 'xl:col-start-1'
                        : 'xl:col-start-3'
                      : '';

                return (
                  <motion.div
                    key={id}
                    className={gridClass}
                    layout
                    data-widget-id={id}
                  >
                    {renderMainOverlayWidget(id, onSend)}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Eigene Mikrofon-Steuerung:
 * - Direkter Zugriff auf localParticipant
 * - Manueller Toggle von Mute/Unmute
 * - Robustere Geräteauswahl
 */
// ==============================================================================
// 4. CustomVoiceControls: Eigene Mikrofon-Steuerung mit Desktop-Hardware-Fixes
// ==============================================================================
function CustomVoiceControls({
  isInitializing,
  setIsInitializing,
  onMicLiveChange,
  onInputLevelChange,
}: {
  isInitializing: boolean;
  setIsInitializing: (v: boolean) => void;
  onMicLiveChange?: (live: boolean) => void;
  onInputLevelChange?: (level: number) => void;
}) {
  const { isElectron } = useIsElectron();
  const connectionState = useConnectionState();
  const { state: agentState } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const { addLog } = useWidgetManager();
  const [manualMute, setManualMute] = useState(false);
  const [micTrack, setMicTrack] = useState<MediaStreamTrack | null>(null);
  const autoMicStartedRef = useRef(false);
  const micLiveRef = useRef(false);
  const { levels: micAnalyzerLevels } = useAudioAnalyzer(micTrack);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('elite-mic-device') || '';
  });
  const isLoadedRef = useRef(false);
  const emitDebugLog = useCallback(
    (hypothesisId: string, location: string, message: string, data: Record<string, unknown> = {}) => {
      // Debug logging disabled to prevent console flooding
    },
    [],
  );

  const micEnabled = localParticipant?.isMicrophoneEnabled ?? false;
  const micReady = micEnabled && !manualMute;

  const toolbarMicLevel =
    micAnalyzerLevels.length > 0
      ? Math.max(...micAnalyzerLevels) * 100
      : 0;

  useEffect(() => {
    onInputLevelChange?.(toolbarMicLevel);
  }, [toolbarMicLevel, onInputLevelChange]);

  const syncMicTrack = useCallback(() => {
    if (!localParticipant) {
      setMicTrack((prev) => (prev === null ? prev : null));
      if (micLiveRef.current) {
        micLiveRef.current = false;
        onMicLiveChange?.(false);
      }
      return;
    }
    const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = pub?.track?.mediaStreamTrack ?? null;
    const live =
      localParticipant.isMicrophoneEnabled &&
      !manualMute &&
      !!pub?.track &&
      (!track || track.readyState !== 'ended');

    setMicTrack((prev) => (prev?.id === track?.id ? prev : track));

    if (micLiveRef.current !== live) {
      micLiveRef.current = live;
      onMicLiveChange?.(live);
    }
  }, [localParticipant, manualMute, onMicLiveChange]);

  useEffect(() => {
    if (!localParticipant) return;
    const onChange = () => syncMicTrack();
    localParticipant.on('trackMuted', onChange);
    localParticipant.on('trackUnmuted', onChange);
    localParticipant.on('trackPublished', onChange);
    localParticipant.on('trackUnpublished', onChange);
    syncMicTrack();
    return () => {
      localParticipant.off('trackMuted', onChange);
      localParticipant.off('trackUnmuted', onChange);
      localParticipant.off('trackPublished', onChange);
      localParticipant.off('trackUnpublished', onChange);
    };
  }, [localParticipant, syncMicTrack]);

  // Zentrale Funktion zum Freigeben von Hardware-Ressourcen
  const stopAllTracks = useCallback(() => {
    try {
      if ((window as any)._globalMediaStream) {
        (window as any)._globalMediaStream.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop();
          console.log(`[Hardware] Track gestoppt: ${track.kind}`);
        });
        (window as any)._globalMediaStream = null;
      }
      // Auch Webcam-spezifische Locks lösen
      (window as any)._webcamLock = false;
    } catch (e) {
      console.error("[Hardware] Fehler beim Stoppen der Tracks:", e);
    }
  }, []);

  // Geräte laden
  const loadDevices = useCallback(async () => {
    if (isLoadedRef.current) return;
    
    console.log("[Hardware] Initialisiere Geräte-Liste...");
    try {
      // Erstmal schauen was da ist, OHNE zu blockieren
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some(d => d.label !== "");
      
      if (!hasLabels) {
        console.log('[Hardware] Geräteliste ohne Labels – warte auf Mic-Berechtigung.');
        return;
      }

      const updatedDevices = devices;
      const audioInputs = updatedDevices.filter(d => d.kind === 'audioinput');
      setDevices(audioInputs);
      
      if (audioInputs.length > 0 && !selectedDeviceId) {
        // Priorisierung: Suche nach Logitech oder C922
        const preferred = audioInputs.find(d => 
          d.label.toLowerCase().includes('logitech') || 
          d.label.toLowerCase().includes('c922') ||
          d.label.toLowerCase().includes('usb audio')
        );
        const bestId = preferred ? preferred.deviceId : audioInputs[0].deviceId;
        setSelectedDeviceId(bestId);
        console.log(`[Hardware] Bevorzugtes Gerät gewählt: ${preferred?.label || 'Standard'}`);
      }
      isLoadedRef.current = true;
    } catch (error: any) {
      console.error("[Hardware] Fehler beim Laden der Geräte:", error);
      if (error.name === 'NotAllowedError') {
        addLog({ type: 'system', message: 'Hardware-Zugriff verweigert. Bitte Berechtigungen prüfen.' });
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        addLog({ type: 'system', message: 'Hardware wird von einer anderen App (z.B. Chrome/Teams) blockiert.' });
      }
    }
  }, [selectedDeviceId, addLog, stopAllTracks]);

  useEffect(() => {
    if (localParticipant) void loadDevices();
  }, [localParticipant, loadDevices]);

  const pickPreferredDeviceId = useCallback((inputs: MediaDeviceInfo[]) => {
    const real = inputs.filter(
      (d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications',
    );
    const list = real.length > 0 ? real : inputs;
    const preferred = list.find(
      (d) =>
        d.label.toLowerCase().includes('logitech') ||
        d.label.toLowerCase().includes('c922') ||
        d.label.toLowerCase().includes('usb audio'),
    );
    return preferred?.deviceId || list[0]?.deviceId || '';
  }, []);

  const enableMicrophone = useCallback(
    async (deviceId?: string, opts?: { hardReset?: boolean; skipPermissionPrompt?: boolean }) => {
      if (!localParticipant) return;

      if (!opts?.skipPermissionPrompt) {
        const perm = await requestMicrophonePermission();
        if (!perm.ok) {
          throw new Error(perm.error ?? 'Mikrofon-Berechtigung fehlt');
        }
      }

      const baseAudio = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      if (opts?.hardReset) {
        await localParticipant.setMicrophoneEnabled(false).catch(() => {});
        await new Promise((r) => setTimeout(r, 200));
      }

      const tryEnable = async (withDeviceId: boolean) => {
        const audioOpts = withDeviceId && deviceId
          ? { ...baseAudio, deviceId: { exact: deviceId } as const }
          : baseAudio;
        await localParticipant.setMicrophoneEnabled(true, audioOpts);
      };

      try {
        await tryEnable(!!deviceId);
      } catch (firstErr) {
        console.warn('[Hardware] Mic mit Geräte-ID fehlgeschlagen, Fallback Standard:', firstErr);
        if (deviceId) {
          localStorage.removeItem('elite-mic-device');
          await tryEnable(false);
        } else {
          throw firstErr;
        }
      }

      setManualMute(false);

      // Track-Publikation abwarten (LiveKit async)
      for (let i = 0; i < 20; i++) {
        const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
        if (pub?.track?.mediaStreamTrack?.readyState === 'live') break;
        await new Promise((r) => setTimeout(r, 100));
      }

      syncMicTrack();

      const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
      const lkTrack = pub?.track as { unmute?: () => Promise<void> } | undefined;
      await lkTrack?.unmute?.();

      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === 'audioinput' && d.deviceId);
      if (inputs.length > 0) setDevices(inputs);

      if (room) {
        void ensureRoomAudio(room).catch((err) => {
          console.debug('[Hardware] startAudio nach Mic-Freigabe:', err);
        });
      }
    },
    [localParticipant, room, syncMicTrack],
  );

  const selectDevice = async (deviceId: string) => {
    if (!localParticipant) return;
    setIsInitializing(true);
    setSelectedDeviceId(deviceId);
    localStorage.setItem('elite-mic-device', deviceId);

    try {
      console.log(`[Hardware] Aktiviere Mic (ID: ${deviceId || 'default'})...`);
      await enableMicrophone(deviceId, { hardReset: true });
      addLog({
        type: 'system',
        message: 'Mikro aktiv – sage „Elite“ + Befehl.',
      });
    } catch (e: any) {
      console.error('[Hardware] Kritischer Fehler im selectDevice:', e);
      const msg = e.message === 'Timeout' ? 'Zeitüberschreitung (Kernel-Lock)' : e.name;
      addLog({ type: 'error', message: `Hardware-Fehler: ${msg}. Bitte Mic aus/einstecken.` });
    } finally {
      setIsInitializing(false);
    }
  };

  const toggleMic = async () => {
    emitDebugLog('H2', 'frontend/app/page.tsx:2113', 'toggle-mic-invoked', {
      hasLocalParticipant: !!localParticipant,
      manualMute,
      micLiveRef: micLiveRef.current,
      selectedDeviceId: selectedDeviceId || null,
      micTrackReadyState: micTrack?.readyState ?? null,
    });
    if (!localParticipant) {
      addLog({ type: 'error', message: 'Verbindung zu Jarvis noch nicht stabil.' });
      return;
    }

    const micActive = micLiveRef.current;

    try {
      // Mic noch nie aktiv oder manuell aus → einschalten (Nutzer-Geste = Berechtigungsdialog)
      if (manualMute || !micActive) {
        const perm = await requestMicrophonePermission();
        if (!perm.ok) {
          addLog({ type: 'error', message: perm.error ?? 'Mikrofon-Zugriff verweigert.' });
          return;
        }

        let deviceId = selectedDeviceId;
        if (!deviceId) {
          const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === 'audioinput' && d.deviceId,
          );
          setDevices(inputs);
          deviceId = pickPreferredDeviceId(inputs);
        }
        await enableMicrophone(deviceId || undefined, {
          hardReset: true,
          skipPermissionPrompt: true,
        });
        emitDebugLog('H2', 'frontend/app/page.tsx:2141', 'toggle-mic-enabled', {
          manualMuteAfterEnable: false,
          usedDeviceId: deviceId || null,
        });
        addLog({
          type: 'system',
          message: 'Mikro aktiv – „Elite“ + Befehl sprechen.',
        });
      } else {
        await localParticipant.setMicrophoneEnabled(false);
        setManualMute(true);
        setMicTrack(null);
        micLiveRef.current = false;
        onMicLiveChange?.(false);
        emitDebugLog('H2', 'frontend/app/page.tsx:2152', 'toggle-mic-disabled', {
          manualMuteAfterDisable: true,
        });
        addLog({ type: 'system', message: 'Mikrofon manuell AUS.' });
      }
    } catch (err: any) {
      emitDebugLog('H2', 'frontend/app/page.tsx:2155', 'toggle-mic-error', {
        name: err?.name ?? null,
        message: err?.message ?? null,
      });
      console.error('[Hardware] Toggle Mic Fehler:', err);
      addLog({ type: 'error', message: err?.message || `Hardware-Fehler: ${err.name}` });
    }
  };

  // Mikro bei Connect/Reconnect automatisch aktivieren (Page-Reload bricht sonst den Stream ab)
  useEffect(() => {
    if (connectionState === ConnectionState.Disconnected) {
      autoMicStartedRef.current = false;
    }

    if (
      connectionState !== ConnectionState.Connected ||
      !localParticipant ||
      manualMute
    ) {
      return;
    }

    let cancelled = false;

    const isMicStreamLive = () => {
      const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
      return (
        localParticipant.isMicrophoneEnabled &&
        pub?.track?.mediaStreamTrack?.readyState === 'live'
      );
    };

    const activateMic = async (): Promise<boolean> => {
      try {
        const alreadyGranted =
          typeof window !== 'undefined' &&
          (window as unknown as { _eliteMicPermissionGranted?: boolean })._eliteMicPermissionGranted;

        await enableMicrophone(undefined, { skipPermissionPrompt: alreadyGranted });

        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all.filter((d) => d.kind === 'audioinput' && d.deviceId);
        setDevices(inputs);

        const preferred = selectedDeviceId || pickPreferredDeviceId(inputs);
        if (preferred && preferred !== selectedDeviceId) {
          setSelectedDeviceId(preferred);
          localStorage.setItem('elite-mic-device', preferred);
          await enableMicrophone(preferred, { skipPermissionPrompt: true });
        }

        return isMicStreamLive();
      } catch (err) {
        console.error('[Hardware] Auto-Mic fehlgeschlagen:', err);
        return false;
      }
    };

    void (async () => {
      if (isMicStreamLive()) {
        autoMicStartedRef.current = true;
        return;
      }

      const retryDelaysMs = [400, 1600, 3500];
      for (const delay of retryDelaysMs) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        if (await activateMic()) {
          autoMicStartedRef.current = true;
          addLog({
            type: 'system',
            message: 'Mikro sendet an Elite – sage „Elite“ oder „Jarvis“ + Befehl.',
          });
          return;
        }
      }

      if (!cancelled) {
        autoMicStartedRef.current = false;
        addLog({
          type: 'system',
          message: 'Mikro nicht aktiv – bitte Mic-Icon unten klicken (Berechtigung erlauben).',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    connectionState,
    localParticipant,
    manualMute,
    enableMicrophone,
    pickPreferredDeviceId,
    selectedDeviceId,
    addLog,
  ]);

  return (
    <div className="relative flex items-center gap-1 p-0.5 rounded-xl bg-white/5 ring-1 ring-white/10">
      <motion.button
        whileHover={{ scale: 1.1, y: -1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          emitDebugLog('H1', 'frontend/app/page.tsx:2223', 'mic-button-click', {
            showMenu,
            isInitializing,
            connectionState,
          });
          void toggleMic();
        }}
        title={
          !micReady
            ? 'Mikro aktivieren (Berechtigung anfordern)'
            : toolbarMicLevel > 8
              ? 'Sprache erkannt – Elite hört zu'
              : 'Mic AN – sage „Elite“ + deinen Befehl'
        }
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-all overflow-hidden ${
          !micReady
            ? 'bg-red-500/10 text-red-500 border border-red-500/20'
            : toolbarMicLevel > 8
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/40 shadow-[0_0_15px_rgba(0,242,255,0.35)]'
              : 'bg-cyan-500/10 text-cyan-400/80 border border-cyan-500/20'
        }`}
      >
        {micReady && (
          <motion.div
            className={`absolute bottom-0 left-0 right-0 ${toolbarMicLevel > 8 ? 'bg-cyan-400/35' : 'bg-cyan-400/10'}`}
            style={{ height: `${Math.min(toolbarMicLevel * 2.5, 100)}%` }}
          />
        )}
        <Mic
          className={`relative z-10 size-[15px] ${micReady && toolbarMicLevel > 5 ? 'scale-110' : ''} transition-transform`}
        />
      </motion.button>

      <button 
        onClick={() => setShowMenu(!showMenu)}
        className="flex h-8 w-4 items-center justify-center rounded-r-lg hover:bg-white/5 transition-colors group"
      >
        <div className={`border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] ${showMenu ? 'border-t-cyan-400 rotate-180' : 'border-t-white/20 group-hover:border-t-white/50'} transition-all`} />
      </button>

      <AnimatePresence>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setShowMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute bottom-12 left-0 z-[101] w-72 p-2 rounded-2xl bg-[#000d1a]/95 backdrop-blur-3xl ring-1 ring-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
            >
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 px-3 py-2 border-b border-white/5 mb-1 flex items-center justify-between">
                <span>Microphone Core</span>
                <span className="size-1 rounded-full bg-cyan-500 animate-pulse" />
              </div>
              <div className="max-h-60 overflow-y-auto no-scrollbar py-1">
                {devices.map((d) => (
                  <button
                    key={d.deviceId}
                    onClick={() => selectDevice(d.deviceId)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] transition-all flex items-center gap-3 group ${
                      d.deviceId === selectedDeviceId
                        ? 'bg-cyan-500/10 text-cyan-400'
                        : 'text-white/60 hover:bg-white/5 hover:text-cyan-400'
                    }`}
                  >
                    <motion.div
                      className={`size-1.5 rounded-full transition-colors ${
                        d.deviceId === selectedDeviceId ? 'bg-cyan-400' : 'bg-white/10 group-hover:bg-cyan-500/40'
                      }`}
                    />
                    <span className="truncate flex-1">{d.label || 'Eingang (Unbekannt)'}</span>
                    {d.deviceId === selectedDeviceId && (
                      <span className="text-[9px] uppercase tracking-wider text-cyan-500/80">aktiv</span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
