'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, Bot, User, Sparkles } from 'lucide-react';
import { EliteChatComposer } from './elite-chat-composer';
import { ChatMessageBody } from './chat-message-body';
import {
  HERMES_CHAT_STORAGE_KEY,
  HERMES_SESSION_STORAGE_KEY,
  sendHermesChat,
  type HermesHudMessage,
} from '@/lib/hermes-chat-client';
import { dispatchChatCleared, getChatClearedAt } from '@/lib/chat-storage';
import { HUD_CHAT_AGENT_BUBBLE, HUD_CHAT_USER_BUBBLE } from './widget-shell';

type Props = {
  gatewayReady: boolean;
  onLog?: (message: string) => void;
};

function loadStoredMessages(): HermesHudMessage[] {
  if (typeof window === 'undefined') return [];
  if (getChatClearedAt() > 0 && !localStorage.getItem(HERMES_CHAT_STORAGE_KEY)) return [];
  try {
    const raw = localStorage.getItem(HERMES_CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HermesHudMessage[];
    return Array.isArray(parsed) ? parsed.filter((m) => m.role && m.content) : [];
  } catch {
    return [];
  }
}

export function HermesChatPanel({ gatewayReady, onLog }: Props) {
  const [messages, setMessages] = useState<HermesHudMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadStoredMessages());
    setSessionId(localStorage.getItem(HERMES_SESSION_STORAGE_KEY));
    const onCleared = () => {
      setMessages([]);
      setSessionId(null);
      setSending(false);
      setError(null);
    };
    window.addEventListener('chat-cleared', onCleared);
    return () => window.removeEventListener('chat-cleared', onCleared);
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      localStorage.removeItem(HERMES_CHAT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(HERMES_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-80)));
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!gatewayReady) {
        setError('Hermes Gateway offline — START_JARVIS.bat oder hermes gateway run');
        return;
      }
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setError(null);
      setSending(true);
      const userMsg: HermesHudMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: 'assistant', content: '', pending: true },
      ]);
      onLog?.(`[Hermes] Anfrage: ${trimmed.slice(0, 120)}`);

      const apiMessages = [...messages, userMsg]
        .filter((m) => !m.pending)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const { content, sessionId: newSession } = await sendHermesChat({
          messages: apiMessages,
          sessionId,
          stream: true,
          onDelta: (partial) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: partial, pending: true } : m,
              ),
            );
          },
        });

        if (newSession) {
          setSessionId(newSession);
          localStorage.setItem(HERMES_SESSION_STORAGE_KEY, newSession);
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    content ||
                    '(Keine Textantwort — Gateway offline, Timeout oder leerer Stream.)',
                  pending: false,
                }
              : m,
          ),
        );
        onLog?.(`[Hermes] Antwort (${content.length} Zeichen)`);

        const api = (window as any).elite;
        if (api?.sendDataChannel && content) {
          api.sendDataChannel(
            JSON.stringify({
              type: 'hermes_speak',
              text: content,
            })
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        onLog?.(`[Hermes] Fehler: ${msg}`);
      } finally {
        setSending(false);
      }
    },
    [gatewayReady, messages, onLog, sending, sessionId],
  );

  const clearChat = () => {
    dispatchChatCleared();
    setMessages([]);
    setSessionId(null);
    setSending(false);
    setError(null);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {!gatewayReady && (
        <div className="px-2 py-1.5 rounded-lg bg-red-500/10 ring-1 ring-red-500/20 text-[9px] text-red-300/90">
          Gateway offline — Chat erst nach Start von Hermes (Port 8642).
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 min-h-[140px] max-h-[280px] overflow-y-auto rounded-lg bg-black/30 p-2 ring-1 ring-white/5 space-y-2"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-6 text-center">
            <Sparkles className="size-6 text-violet-400/40" />
            <p className="text-[10px] text-white/35 max-w-[220px]">
              Agentischer Chat über Hermes Gateway — Tools, Memory, Multi-Step.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <Bot className="size-3 text-violet-400 shrink-0 mt-1" />
              )}
              <div
                className={`max-w-[92%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed ${
                  m.role === 'user' ? HUD_CHAT_USER_BUBBLE : HUD_CHAT_AGENT_BUBBLE
                }`}
              >
                {m.pending && !m.content ? (
                  <span className="flex items-center gap-1.5 text-white/40">
                    <Loader2 className="size-3 animate-spin" />
                    Hermes denkt…
                  </span>
                ) : (
                  <ChatMessageBody text={m.content} isAgent={m.role === 'assistant'} />
                )}
              </div>
              {m.role === 'user' && (
                <User className="size-3 text-cyan-400/60 shrink-0 mt-1" />
              )}
            </div>
          ))
        )}
      </div>

      {error && (
        <p className="text-[9px] text-red-400/90 px-1">{error}</p>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <EliteChatComposer
            compact
            placeholder="Nachricht an Hermes…"
            onSend={handleSend}
            autoFocus={false}
          />
        </div>
        <button
          type="button"
          onClick={clearChat}
          title="Verlauf löschen"
          className="p-2 rounded-lg hover:bg-white/5 text-white/25 hover:text-red-400 transition-colors shrink-0"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {sessionId && (
        <p className="text-[7px] text-white/20 font-mono truncate px-1" title={sessionId}>
          Session: {sessionId.slice(0, 24)}…
        </p>
      )}
    </div>
  );
}
