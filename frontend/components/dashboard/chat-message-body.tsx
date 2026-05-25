'use client';

import { FileText, ExternalLink, Play } from 'lucide-react';
import { parseChatMessage, type ParsedChatAttachment } from '@/lib/chat-attachments-client';

type Props = {
  text: string;
  isAgent?: boolean;
  onImageClick?: (src: string) => void;
  /** Agent-Screenshots aus screen_HHMMSS.png (bestehend) */
  screenshotSrc?: string | null;
};

function AttachmentBlock({
  att,
  onImageClick,
}: {
  att: ParsedChatAttachment;
  onImageClick?: (src: string) => void;
}) {
  if (att.type === 'image') {
    return (
      <button
        type="button"
        onClick={() => onImageClick?.(att.url)}
        className="mt-2 block w-full max-w-sm rounded-xl overflow-hidden ring-1 ring-white/10 hover:ring-primary/40 transition-all group text-left"
      >
        <img
          src={att.url}
          alt={att.name}
          className="w-full h-auto max-h-48 object-cover group-hover:brightness-110 transition-all"
          loading="lazy"
        />
        <div className="px-2 py-1.5 text-[9px] text-white/35 uppercase tracking-widest truncate">
          {att.name}
        </div>
      </button>
    );
  }

  if (att.type === 'video') {
    return (
      <div className="mt-2 w-full max-w-sm rounded-xl overflow-hidden ring-1 ring-violet-500/20 bg-black/40">
        <video
          src={att.url}
          controls
          playsInline
          className="w-full max-h-56 bg-black"
        />
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Play className="size-3 text-violet-400/70" />
          <span className="text-[9px] text-white/35 uppercase tracking-widest truncate">
            {att.name}
          </span>
        </div>
      </div>
    );
  }

  const docLabel = att.type === 'docx' ? 'DOCX' : 'PDF';

  return (
    <a
      href={att.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-3 rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-3 py-2.5 hover:ring-primary/30 hover:bg-white/[0.06] transition-all group"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
        <FileText className="size-4 text-amber-400/90" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-white/80 truncate">{att.name}</p>
        {att.excerpt ? (
          <p className="text-[10px] text-white/35 line-clamp-2 mt-0.5 leading-relaxed">{att.excerpt}</p>
        ) : (
          <p className="text-[9px] text-white/25 uppercase tracking-wider mt-0.5">{docLabel} öffnen</p>
        )}
      </div>
      <ExternalLink className="size-3.5 text-white/20 group-hover:text-primary shrink-0" />
    </a>
  );
}

export function ChatMessageBody({ text, isAgent, onImageClick, screenshotSrc }: Props) {
  const parsed = parseChatMessage(text);

  return (
    <div className="space-y-1">
      {parsed.body ? (
        <p className="whitespace-pre-wrap break-words">{parsed.body}</p>
      ) : null}

      {parsed.attachments.map((att, i) => (
        <AttachmentBlock key={`${att.url}-${i}`} att={att} onImageClick={onImageClick} />
      ))}

      {isAgent && screenshotSrc && (
        <button
          type="button"
          onClick={() => onImageClick?.(screenshotSrc)}
          className="mt-3 block w-full rounded-xl overflow-hidden ring-1 ring-white/10 hover:ring-cyan-500/40 transition-all group"
        >
          <img
            src={screenshotSrc}
            alt="Screenshot"
            className="w-full h-auto rounded-xl group-hover:brightness-110 transition-all"
            loading="lazy"
          />
          <div className="text-[9px] text-cyan-400/40 uppercase tracking-widest text-center py-1 group-hover:text-cyan-400/80 transition-colors">
            Klicken für Vollansicht
          </div>
        </button>
      )}
    </div>
  );
}
