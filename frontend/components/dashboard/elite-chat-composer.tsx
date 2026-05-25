'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, FileText, Loader2, Paperclip, Play, X } from 'lucide-react';
import {
  analyzeUploadedImage,
  compressImageForUpload,
  formatMessageWithAttachments,
  getAttachmentAction,
  isChatAttachmentFile,
  type PendingAttachment,
  uploadChatAttachment,
} from '@/lib/chat-attachments-client';

type Props = {
  onSend: (text: string) => void | Promise<void>;
  autoFocus?: boolean;
  placeholder?: string;
  compact?: boolean;
};

/** HUD-Eingabezeile – optisch wie Sidebar-Panels (black/40, ring-white/10) */
export function EliteChatComposer({
  onSend,
  autoFocus = false,
  placeholder = 'Nachricht an Elite…',
  compact = false,
}: Props) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const onAttach = (e: Event) => {
      const detail = (e as CustomEvent<{ text?: string }>).detail;
      if (!detail?.text) return;
      const chunk = detail.text ?? '';
      setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${chunk}` : chunk));
      setError(null);
      textareaRef.current?.focus();
    };
    window.addEventListener('elite-chat-attach', onAttach);
    return () => window.removeEventListener('elite-chat-attach', onAttach);
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, compact ? 88 : 120)}px`;
  }, [compact]);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter(isChatAttachmentFile);
    if (list.length === 0) {
      setError('Nur PNG/JPG, PDF, DOCX oder MP4 erlaubt');
      return;
    }
    setError(null);
    setPending((prev) => {
      const next = [...prev];
      for (const file of list) {
        const id = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
        const action = getAttachmentAction(file);
        const previewUrl =
          action === 'preview-image' ? URL.createObjectURL(file) : undefined;
        next.push({ id, file, previewUrl });
      }
      return next.slice(0, 6);
    });
  }, []);

  const removePending = useCallback((id: string) => {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  useEffect(() => {
    return () => {
      pending.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
    };
  }, [pending]);

  const canSend = (text.trim().length > 0 || pending.length > 0) && !uploading;

  const submit = async () => {
    if (!canSend) return;
    setUploading(true);
    setError(null);
    try {
      const uploads = [];
      for (const p of pending) {
        const upload = await uploadChatAttachment(p.file);
        uploads.push(upload);

        if (upload.type === 'image') {
          const frame = await compressImageForUpload(p.file);
          const analysis = await analyzeUploadedImage(frame);
          window.dispatchEvent(
            new CustomEvent('elite-image-analyzed', {
              detail: { upload, analysis, frame },
            }),
          );
        } else if (upload.type === 'pdf' || upload.type === 'docx') {
          window.dispatchEvent(
            new CustomEvent('elite-document-import', {
              detail: { text: upload.textPreview || '', name: upload.name },
            }),
          );
        } else if (upload.type === 'video') {
          window.dispatchEvent(
            new CustomEvent('elite-video-play', {
              detail: { url: upload.url, name: upload.name },
            }),
          );
        }
      }

      const message = formatMessageWithAttachments(text, uploads);
      await onSend(message);

      setText('');
      pending.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
      setPending([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const renderPendingIcon = (p: PendingAttachment) => {
    const action = getAttachmentAction(p.file);
    if (action === 'preview-image' && p.previewUrl) {
      return (
        <img src={p.previewUrl} alt="" className="size-9 rounded-md object-cover" />
      );
    }
    if (action === 'video') {
      return (
        <div className="size-9 rounded-md bg-violet-500/10 flex items-center justify-center">
          <Play className="size-4 text-violet-400/80" />
        </div>
      );
    }
    return (
      <div className="size-9 rounded-md bg-amber-500/10 flex items-center justify-center">
        <FileText className="size-4 text-amber-400/80" />
      </div>
    );
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`relative w-full mx-auto rounded-2xl transition-all duration-300 ${
        dragOver
          ? 'ring-2 ring-primary/40 shadow-[0_0_40px_rgba(0,242,255,0.12)]'
          : 'ring-1 ring-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.45)]'
      } bg-black/10 backdrop-blur-xl`}
    >
      <span className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l border-t border-primary/35 rounded-tl-2xl" />
      <span className="pointer-events-none absolute right-0 top-0 h-3 w-3 border-r border-t border-primary/35 rounded-tr-2xl" />
      <span className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-primary/20 rounded-bl-2xl" />
      <span className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-primary/20 rounded-br-2xl" />
      <div className="absolute inset-0 scanlines opacity-[0.04] pointer-events-none rounded-2xl" />

      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-primary/5 border border-dashed border-primary/30 pointer-events-none"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              Loslassen
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.docx,video/mp4,.mp4"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {pending.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 px-4 pt-3">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-lg bg-white/[0.04] ring-1 ring-white/10 pl-1 pr-2 py-1"
            >
              {renderPendingIcon(p)}
              <span className="text-[10px] text-white/50 max-w-[120px] truncate">
                {p.file.name}
              </span>
              <button
                type="button"
                onClick={() => removePending(p.id)}
                className="p-0.5 text-white/30 hover:text-red-400"
                title="Entfernen"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex items-end justify-center gap-2 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="Anhang"
          className="flex shrink-0 size-8 items-center justify-center rounded-lg text-white/35 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30"
        >
          <Paperclip className="size-4" />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={uploading}
          className={`flex-1 min-w-0 resize-none bg-transparent text-center sm:text-left leading-relaxed focus:outline-none placeholder:text-white/25 text-white/90 selection:bg-primary/30 ${
            compact ? 'text-sm py-1' : 'text-[15px] py-1.5'
          }`}
        />

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          title="Senden (Enter)"
          className="flex shrink-0 size-8 items-center justify-center rounded-lg bg-primary text-[#001018] hover:brightness-110 disabled:opacity-25 transition-all active:scale-95 shadow-[0_0_16px_rgba(0,242,255,0.25)]"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4 stroke-[2.5]" />
          )}
        </button>
      </div>

      {error ? (
        <p className="px-4 pb-3 text-center text-[10px] text-red-400/90 leading-snug">{error}</p>
      ) : (
        <p className="px-4 pb-2.5 text-center text-[9px] text-white/20 uppercase tracking-[0.2em]">
          Enter · Shift+Enter · Drag &amp; Drop
        </p>
      )}
    </div>
  );
}
