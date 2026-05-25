'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, X, Send, Trash2, Copy, Check, MessageSquarePlus } from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import { attachToChat, formatFileAttachBlock } from '@/lib/elite-attach-events';
import { useWidgetFullscreen, WidgetFullscreenButton, WidgetPopOutButton, WIDGET_PANEL_CLASS, WIDGET_HEADER_CLASS, WIDGET_FOOTER_CLASS, WIDGET_TITLE_CLASS } from './widget-shell';

/**
 * TextEditorWidget – Panel-Widget (kein Modal) für langen Text / Befehle.
 * Erscheint im Widget-Grid wie alle anderen Widgets.
 * Optional: onSend-Callback um Text an den Chat-Agent zu senden.
 */
interface Props {
  onSend?: (text: string) => void;
}

export function TextEditorWidget({ onSend }: Props) {
  const { closeWidget, editorText, setEditorText } = useWidgetManager();
  const { layout, getShellClass, isFullscreen } = useWidgetFullscreen('textEditor');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editorText]);

  const handleSend = useCallback(() => {
    if (!editorText.trim() || !onSend) return;
    onSend(editorText.trim());
    setEditorText('');
  }, [editorText, onSend, setEditorText]);

  const handleAttachSelectionToChat = useCallback(() => {
    const sel = typeof window !== 'undefined' ? window.getSelection()?.toString() : '';
    const snippet = sel?.trim() || editorText.trim();
    if (!snippet) return;
    const block = formatFileAttachBlock('Auswahl · Text-Editor', snippet, 200);
    attachToChat({ text: block, paths: ['text-editor/selection'] });
  }, [editorText]);


  return (
    <motion.div
      key="textEditor"
      layout={layout}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={getShellClass(`flex flex-col ${WIDGET_PANEL_CLASS}`)}
    >
      {/* Header */}
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          <FileText className="size-3.5 text-orange-400" />
          <span className={WIDGET_TITLE_CLASS}>
            Text Editor
          </span>
        </div>
        <div className="flex items-center gap-1">
          <WidgetPopOutButton widgetId="textEditor" iconClassName="size-3" />
          <WidgetFullscreenButton widgetId="textEditor" iconClassName="size-3" />
          <button
            onClick={handleAttachSelectionToChat}
            disabled={!editorText.trim()}
            title="Auswahl / Inhalt an Chat"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 hover:text-violet-400 hover:bg-violet-500/10 transition-all disabled:opacity-20"
          >
            <MessageSquarePlus className="size-3" />
          </button>
          {/* Kopieren */}
          <button
            onClick={handleCopy}
            disabled={!editorText.trim()}
            title="Kopieren"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 hover:text-white/60 hover:bg-white/5 transition-all disabled:opacity-20"
          >
            {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          </button>
          {/* Leeren */}
          <button
            onClick={() => setEditorText('')}
            disabled={!editorText.trim()}
            title="Leeren"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/5 transition-all disabled:opacity-20"
          >
            <Trash2 className="size-3" />
          </button>
          {/* Senden – nur wenn onSend vorhanden */}
          {onSend && (
            <button
              onClick={handleSend}
              disabled={!editorText.trim()}
              title="An Elite senden"
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-cyan-500/15 text-primary text-[9px] font-bold uppercase tracking-wider hover:bg-primary/25 transition-all disabled:opacity-20"
            >
              <Send className="size-3" /> Senden
            </button>
          )}
          {/* Schließen */}
          <button
            onClick={() => closeWidget('textEditor')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/5 transition-all ml-1"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className={`relative flex-1 flex ${isFullscreen ? 'min-h-0' : 'min-h-[280px]'}`}>
        {/* Line Numbers Gutter */}
        <div className="w-10 bg-[#081420]/95 border-r border-white/5 flex flex-col items-center py-4 select-none">
          {Array.from({ length: Math.max(12, editorText.split('\n').length) }, (_, i) => (
            <span key={i} className="text-[9px] font-mono text-white/10 h-6 flex items-center">
              {i + 1}
            </span>
          ))}
        </div>

        {/* Textarea with HUD Background */}
        <div className="relative flex-1">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
               style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          
          <textarea
            value={editorText}
            onChange={e => setEditorText(e.target.value)}
            placeholder="System-Input eingeben... (Notes, Snippets, Commands)"
            onKeyDown={e => {
              if (e.key === 'Enter' && e.ctrlKey && onSend) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="w-full h-full bg-transparent text-[13px] text-cyan-50/80 font-mono leading-6 px-4 py-3 focus:outline-none placeholder:text-white/10 resize-none custom-scrollbar"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Footer: Metrics & Shortcuts */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${WIDGET_FOOTER_CLASS}`}>
        <div className="flex items-center gap-4 text-[9px] font-mono text-white/20">
          <span className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-cyan-500/40" />
            {editorText.length} CHR
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-purple-500/40" />
            {editorText.split('\n').length} LN
          </span>
        </div>
        {onSend && (
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/10">
            <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5">CTRL</kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5">ENTER</kbd>
            <span className="ml-1 text-[8px] opacity-60">To Transmit</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
