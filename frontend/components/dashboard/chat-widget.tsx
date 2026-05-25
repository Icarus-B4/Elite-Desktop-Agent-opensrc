'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  useChat,
  useTranscriptions,
  useDataChannel,
  VoiceAssistantControlBar,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { MessageSquare, X, Bot, User, Trash2, Mic, Loader2, PhoneOff, WifiOff, GripVertical } from 'lucide-react';
import { EliteChatComposer } from './elite-chat-composer';
import { ChatMessageBody } from './chat-message-body';
import { useWidgetManager, type LogEntry, type WidgetId } from './widget-manager';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  HUD_CHAT_AGENT_BUBBLE,
  HUD_CHAT_USER_BUBBLE,
  WIDGET_TITLE_CLASS,
} from './widget-shell';
import { ELITE_LIVEKIT_ROOM } from '@/lib/elite-livekit';
import {
  getLiveKitRateLimitRemainingMs,
  getOrCreateGuestIdentity,
  installLiveKitFetchRateLimitGuard,
  isLiveKitRateLimited,
  isLiveKitRateLimitError,
  markLiveKitRateLimited,
} from '@/lib/livekit-connect-guard';
import { LiveKitRateLimitBridge } from '@/components/livekit-rate-limit-bridge';
import type { RoomConnectOptions } from 'livekit-client';

/**
 * Chat-Widget mit echter LiveKit-Integration.
 * Verbindet sich automatisch zum LiveKit-Room und
 * zeigt Chat-Nachrichten + Voice-Transkriptionen.
 */

// Typ-Definition für eine zusammengeführte Nachricht
type CombinedMessage = {
  id: string;
  text: string;
  isAgent: boolean;
  timestamp: number;
};

// localStorage-Key für Chat-Persistenz
const CHAT_STORAGE_KEY = 'elite-dashboard-chat';

export function ChatWidget() {
  const { closeWidget, addLog } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('chat');
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [reconnectTimer, setReconnectTimer] = useState(0);

  // Reconnect Timer
  useEffect(() => {
    let interval: any;
    if (isConnecting || !token) {
      interval = setInterval(() => setReconnectTimer(prev => prev + 1), 1000);
    } else {
      setReconnectTimer(0);
    }
    return () => clearInterval(interval);
  }, [isConnecting, token]);

  const connectToRoom = useCallback(async () => {
    if (isLiveKitRateLimited()) {
      const waitSec = Math.ceil(getLiveKitRateLimitRemainingMs() / 1000);
      setConnectionError(`LiveKit Rate Limit — ${waitSec}s warten`);
      return;
    }
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const room = ELITE_LIVEKIT_ROOM;
      const identity = getOrCreateGuestIdentity();
      const params = new URLSearchParams({ room, identity });
      params.set('userName', 'System Admin');

      addLog({ type: 'tool_call', message: 'KI-Sitzung wird initialisiert...' });
      const resp = await fetch(`/api/livekit?${params}`, { cache: 'no-store' });

      if (resp.status === 429) {
        markLiveKitRateLimited();
        throw new Error('LiveKit Rate Limit (429)');
      }
      if (!resp.ok) throw new Error(`Server-Fehler: ${resp.status}`);

      const data = await resp.json();
      if (!data.token) {
        throw new Error(data.error || 'Kein Token erhalten');
      }
      setToken(data.token);
      setServerUrl(
        data.serverUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL || '',
      );
      addLog({ type: 'result', message: 'Elite-Sitzung bereit ✓' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isLiveKitRateLimitError(err)) {
        markLiveKitRateLimited();
      }
      setConnectionError(msg);
      addLog({ type: 'error', message: `Verbindung fehlgeschlagen: ${msg}` });
    } finally {
      setIsConnecting(false);
    }
  }, [addLog]);

  const chatConnectOptions = useMemo<RoomConnectOptions>(() => ({ maxRetries: 0 }), []);

  const applyChatRateLimitHit = useCallback(() => {
    markLiveKitRateLimited();
    setToken(null);
    setServerUrl(null);
    const waitSec = Math.ceil(getLiveKitRateLimitRemainingMs() / 1000);
    setConnectionError(`LiveKit Rate Limit — ${waitSec}s warten`);
    addLog({ type: 'error', message: 'LiveKit Rate Limit — Verbindung pausiert.' });
  }, [addLog]);

  useEffect(() => {
    installLiveKitFetchRateLimitGuard();
  }, []);

  return (
    <motion.div layout={layout} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className={getShellClass(`flex flex-col ${WIDGET_PANEL_CLASS} h-full min-h-[300px]`)}>
      
      {token && serverUrl ? (
        <LiveKitRoom
          audio={false}
          video={false}
          token={token}
          serverUrl={serverUrl}
          connectOptions={chatConnectOptions}
          onDisconnected={() => {
            setToken(null);
            setServerUrl(null);
            addLog({ type: 'system', message: 'Verbindung verloren' });
          }}
          onError={(error) => {
            if (!isLiveKitRateLimitError(error)) return;
            applyChatRateLimitHit();
          }}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <LiveKitRateLimitBridge onRateLimited={applyChatRateLimitHit} />
          <LiveChatInterface addLog={addLog} closeWidget={closeWidget} />
          <RoomAudioRenderer />
        </LiveKitRoom>
      ) : (
        <>
          <div className={WIDGET_HEADER_CLASS}>
            <div className="flex items-center gap-3">
              <div className="p-1 cursor-grab active:cursor-grabbing text-white/20 hover:text-primary transition-colors">
                <GripVertical className="size-3.5" />
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-primary" />
                <span className={WIDGET_TITLE_CLASS}>Elite Assistant</span>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5">
              <WidgetFullscreenButton widgetId="chat" />
              <button 
                onClick={() => closeWidget('chat')} 
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {isConnecting ? (
              <>
                <Loader2 className="size-8 text-primary animate-spin" />
                <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Initialisiere Verbindung...</p>
              </>
            ) : (
              <>
                <Mic className={`size-10 ${connectionError ? 'text-red-400/20' : 'text-primary/20'}`} />
                <div className="space-y-1">
                  <p className="text-[11px] text-white/60 font-bold uppercase tracking-wider">
                    {connectionError ? 'Verbindung unterbrochen' : 'Elite ist offline'}
                  </p>
                  {connectionError && <p className="text-[9px] text-red-400/40 max-w-[180px]">{connectionError}</p>}
                </div>
                <button onClick={connectToRoom}
                  className="mt-2 px-6 py-2.5 rounded-xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em] ring-1 ring-primary/30 hover:bg-primary/20 transition-all active:scale-95 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                  System Starten
                </button>
              </>
            )}
            {reconnectTimer > 10 && !isConnecting && !connectionError && (
              <p className="text-[9px] text-white/20 italic animate-pulse">Suche nach verfügbaren Agenten...</p>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

/**
 * Innere Chat-Oberfläche – nur innerhalb eines LiveKitRoom gerendert.
 * Nutzt die gleiche Logik wie die bestehende page.tsx (Chat + Transkriptionen).
 */
function LiveChatInterface({
  addLog,
  closeWidget,
}: {
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  closeWidget: (name: WidgetId) => void;
}) {
  const { state } = useVoiceAssistant();
  const { chatMessages, send } = useChat();
  const transcriptions = useTranscriptions();
  const scrollRef = useRef<HTMLDivElement>(null);

  useDataChannel((data_packet) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(data_packet.payload));
      if (data.type === 'log_event' && data.log) {
        addLog(data.log);
      }
    } catch {
      /* Nicht für uns bestimmt */
    }
  });

  // Chat-Verlauf aus localStorage laden
  const [savedMessages, setSavedMessages] = useState<CombinedMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY);
      const clearedAt = parseInt(localStorage.getItem('elite-chat-cleared-at') || '0');
      const messages: CombinedMessage[] = stored ? JSON.parse(stored) : [];
      // Nur Nachrichten laden, die nach dem letzten Löschen kamen
      return messages.filter(m => m.timestamp > clearedAt);
    } catch { return []; }
  });

  const { clearChatHistory, chatLastClearedAt } = useWidgetManager();

  // Chat-Verlauf sofort leeren, wenn globaler Zeitstempel sich ändert
  useEffect(() => {
    if (chatLastClearedAt > 0) {
      setSavedMessages([]);
    }
  }, [chatLastClearedAt]);

  // Umlaut-Reparatur (bekanntes OpenAI Realtime Problem)
  const fixUmlauts = useCallback((text: string): string => {
    if (!text) return '';
    return text
      .replace(/\u00C3\u00BC/g, '\u00FC')
      .replace(/\u00C3\u00A4/g, '\u00E4')
      .replace(/\u00C3\u00B6/g, '\u00F6')
      .replace(/\u00C3\u009C/g, '\u00DC')
      .replace(/\u00C3\u0084/g, '\u00C4')
      .replace(/\u00C3\u0096/g, '\u00D6')
      .replace(/\u00C3\u009F/g, '\u00DF')
      .replace(/f\u00C4r/g, 'f\u00FCr')
      .replace(/unterst\u00C4tzen/g, 'unterst\u00FCtzen')
      .replace(/k\u00C4nnen/g, 'k\u00F6nnen')
      .replace(/L\u00C4sungen/g, 'L\u00F6sungen');
  }, []);

  // Chat + Voice-Transkriptionen zusammenführen (gleiche Logik wie page.tsx)
  const combinedMessages = useMemo<CombinedMessage[]>(() => {
    const messages: CombinedMessage[] = [];

    // 1. Gespeicherte Nachrichten (bereits gefiltert beim Laden)
    messages.push(...savedMessages);

    // 2. Live Chat-Nachrichten
    chatMessages.forEach((msg, i) => {
      const rawTs = msg.timestamp ?? Date.now();
      const ts = typeof rawTs === 'number' ? rawTs : new Date(rawTs).getTime();
      
      // Radikaler Filter: Alles VOR oder ZUM Zeitpunkt des Löschens ignorieren (+500ms Puffer)
      if (chatLastClearedAt > 0 && ts <= chatLastClearedAt + 500) return;

      messages.push({
        id: `chat-${ts}-${i}`,
        text: fixUmlauts(msg.message || ''),
        isAgent: msg.from?.identity === 'agent',
        timestamp: ts,
      });
    });

    // 3. Transkriptionen
    transcriptions.forEach((segment, i) => {
      if (!segment.text?.trim()) return;
      const identity = segment.participantInfo?.identity ?? 'unknown';
      const segMeta = segment as {
        firstReceivedTime?: number;
        lastReceivedTime?: number;
        id?: string;
      };
      const rawTs = segMeta.lastReceivedTime ?? segMeta.firstReceivedTime ?? Date.now();
      const ts = typeof rawTs === 'number' ? rawTs : new Date(rawTs).getTime();

      if (chatLastClearedAt > 0 && ts <= chatLastClearedAt + 500) return;

      const segmentKey = segMeta.id ?? `${identity}-${i}`;
      messages.push({
        id: `msg-voice-${segmentKey}`,
        text: fixUmlauts(segment.text),
        isAgent: identity.includes('agent'),
        timestamp: ts,
      });
    });

    messages.sort((a, b) => a.timestamp - b.timestamp);

    // Deduplizierung
    const deduped: CombinedMessage[] = [];
    for (const msg of messages) {
      const last = deduped[deduped.length - 1];
      if (last && last.text === msg.text && last.isAgent === msg.isAgent) continue;
      deduped.push(msg);
    }
    return deduped;
  }, [chatMessages, transcriptions, savedMessages, chatLastClearedAt, fixUmlauts]);

  // Persistenz in localStorage
  useEffect(() => {
    if (combinedMessages.length > 0) {
      try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(combinedMessages.slice(-100))); }
      catch { /* localStorage voll */ }
    }
  }, [combinedMessages]);

  // Auto-Scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [combinedMessages]);

  const handleSend = useCallback(
    async (message: string) => {
      if (!message.trim()) return;
      await send(message.trim());
      addLog({ type: 'tool_call', message: `Chat: "${message.trim().slice(0, 50)}..."` });
    },
    [send, addLog],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.elite = {
      ...window.elite,
      sendChatMessage: async (text: string) => {
        if (!text?.trim()) return;
        await send(text.trim());
        addLog({ type: 'tool_call', message: `Chat: "${text.trim().slice(0, 50)}..."` });
      },
    };
  }, [send, addLog]);

  // Chat löschen logic
  const clearChat = useCallback(() => {
    clearChatHistory();
  }, [clearChatHistory]);

  return (
    <>
      {/* Header (im Live-Modus) */}
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" />
          <span className={WIDGET_TITLE_CLASS}>KI Chat</span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[9px] text-green-400 font-bold uppercase">Live</span>
          </span>
        </div>
        <motion.div className="flex items-center gap-1">
          <WidgetFullscreenButton widgetId="chat" />
          <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-red-400 transition-colors mr-2" title="Chat-Verlauf löschen">
            <Trash2 className="size-4" />
          </button>
          <button onClick={() => closeWidget('chat')} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors">
            <X className="size-3.5" />
          </button>
        </motion.div>
      </div>

      {/* Agent-Status Zeile */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-cyan-400/5">
        <div className="flex items-center gap-2">
          <div className={`size-1.5 rounded-full transition-colors ${
            state === 'speaking' ? 'bg-cyan-400 shadow-[0_0_6px_#22d3ee] animate-pulse' :
            state === 'listening' ? 'bg-cyan-400/50 animate-pulse' :
            state === 'thinking' ? 'bg-purple-400 animate-pulse' :
            'bg-white/20'
          }`} />
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">
            {state === 'speaking' ? 'Elite spricht...' :
             state === 'listening' ? 'Hört zu...' :
             state === 'thinking' ? 'Analysiert...' :
             state === 'connecting' ? 'Verbinde...' :
             'Bereit'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Mikrofon & Disconnect Controls */}
          <div className="flex items-center gap-1 [&_.lk-button]:!bg-transparent [&_.lk-button]:!border-none [&_.lk-button]:!p-1 [&_.lk-button]:!min-w-0 [&_.lk-button_svg]:!w-3 [&_.lk-button_svg]:!h-3 [&_.lk-button_svg]:!text-white/30 [&_.lk-button:hover_svg]:!text-primary">
            <VoiceAssistantControlBar controls={{ leave: false, microphone: true }} className="flex gap-0.5" />
          </div>
        </div>
      </div>

      {/* Nachrichten */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[350px]">
        {combinedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Bot className="size-8 text-white/10" />
            <p className="text-[11px] text-white/20 text-center">
              {state === 'connecting' || state === 'initializing'
                ? 'Warte auf Elite Agent...'
                : 'Spreche oder tippe eine Nachricht...'}
            </p>
          </div>
        ) : (
          combinedMessages.map(msg => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.isAgent ? 'justify-start' : 'justify-end'}`}>
              <div className={`flex items-start gap-2 max-w-[85%] ${msg.isAgent ? '' : 'flex-row-reverse'}`}>
                <div className={`flex-shrink-0 size-6 rounded-lg flex items-center justify-center ${msg.isAgent ? 'bg-primary/10' : 'bg-white/5'}`}>
                  {msg.isAgent ? <Bot className="size-3.5 text-primary" /> : <User className="size-3.5 text-white/40" />}
                </div>
                <div className={`rounded-2xl px-3.5 py-2 text-[12px] leading-relaxed ${
                  msg.isAgent
                    ? `${HUD_CHAT_AGENT_BUBBLE} rounded-tl-sm`
                    : `${HUD_CHAT_USER_BUBBLE} rounded-tr-sm`
                }`}>
                  <ChatMessageBody text={msg.text} isAgent={msg.isAgent} />
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Chat-Input */}
      <div className="px-3 py-3 border-t border-white/5">
        <EliteChatComposer onSend={handleSend} compact placeholder="Nachricht an Elite…" />
      </div>
    </>
  );
}
