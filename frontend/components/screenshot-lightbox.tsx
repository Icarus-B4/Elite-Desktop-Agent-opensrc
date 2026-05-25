'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn } from 'lucide-react';

interface ScreenshotLightboxProps {
  src: string | null;
  onClose: () => void;
}

/**
 * Fullscreen-Lightbox für Screenshots und Bilder.
 * Zeigt das Bild mit Zoom-Effekt und schließt bei Klick auf den Hintergrund.
 */
export function ScreenshotLightbox({ src, onClose }: ScreenshotLightboxProps) {
  if (!src) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl"
        onClick={onClose}
      >
        {/* Schließen-Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 text-white/60 hover:bg-white/20 hover:text-white transition-all"
        >
          <X className="size-5" />
        </button>

        {/* Bild mit Einblende-Animation */}
        <motion.img
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          src={src}
          alt="Screenshot Vollansicht"
          className="max-h-[85vh] max-w-[90vw] rounded-2xl shadow-[0_0_80px_rgba(0,242,255,0.15)] ring-1 ring-white/10"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Hinweis unten */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest text-white/20">
          Klicken zum Schließen
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
