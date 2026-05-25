'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { percentBoxToContainPixels } from '@/lib/draw-detection-overlay';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Grid3X3, X, Tag, Clock,
  ShieldCheck, Maximize2,
  Trash2, Info, LayoutGrid, GripVertical, ArrowLeft,
  Eye, Sparkles,
} from 'lucide-react';
import { useWidgetManager, CapturedImage } from './widget-manager';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WidgetPopOutButton,
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_TITLE_CLASS,
} from './widget-shell';
import { FaceReportOverlay } from './face-report-overlay';

/** Über Widget-Vollbild-Portal (z-[20001]) und Dashboard-Overlay (z-[9999]) */
const IMAGE_ARCHIVE_LIGHTBOX_Z = 21000;

const SCROLL_AREA =
  'overflow-y-auto overscroll-y-contain min-h-0 [scrollbar-width:thin] [scrollbar-color:rgba(34,211,238,0.45)_transparent]';

function ArchiveDetectionOverlay({
  detections,
  frameWidth,
  frameHeight,
}: {
  detections: NonNullable<CapturedImage['analysis']>['detections'];
  frameWidth: number;
  frameHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!detections?.length || !canvasRef.current || !wrapRef.current) return;

    const redraw = () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 1 || h < 1) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      detections.forEach((det) => {
        const mapped = percentBoxToContainPixels(
          { x: det.x, y: det.y, w: det.w, h: det.h },
          frameWidth,
          frameHeight,
          w,
          h,
        );
        const { x, y, w: boxW, h: boxH } = mapped;
        if (boxW < 2 || boxH < 2) return;
        ctx.strokeStyle = det.color || '#00f2ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, boxW, boxH);
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = det.color || '#00f2ff';
        ctx.fillText(`${det.label}`, x + 4, y - 4 < 0 ? y + 12 : y - 4);
      });
    };

    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [detections, frameWidth, frameHeight]);

  return (
    <motion.div ref={wrapRef} className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </motion.div>
  );
}

function ImageDetailLightbox({
  image,
  onClose,
}: {
  image: CapturedImage;
  onClose: () => void;
}) {
  const { removeCapturedImage, updateCapturedImage } = useWidgetManager();
  const [showReport, setShowReport] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    setGenerationError(null);
    try {
      const resp = await fetch('/api/elite/analyze-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame: image.src }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || 'Generierung des Berichts fehlgeschlagen');
      }

      // Persistent auf Server speichern
      const putResp = await fetch('/api/elite/gallery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: image.id, face_report: data.report }),
      });

      if (!putResp.ok) {
        console.warn('[Gallery] Konnte den erzeugten Gesichtsbericht nicht serverseitig persistieren.');
      }

      // Lokalen React-Zustand updaten
      updateCapturedImage(image.id, { analysis: { face_report: data.report } });
      
      // Bericht sofort öffnen
      setShowReport(true);
    } catch (err) {
      console.error('[LiveReport]', err);
      setGenerationError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingReport(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center p-4 bg-[#000814]/95 backdrop-blur-2xl"
      style={{ zIndex: IMAGE_ARCHIVE_LIGHTBOX_Z }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bild-Detailansicht"
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        className="relative flex flex-col md:flex-row w-full max-w-5xl max-h-[min(92vh,900px)] bg-[#020810]/98 rounded-3xl overflow-hidden ring-1 ring-white/10 shadow-[0_0_100px_rgba(34,211,238,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bild – Klick schließt Detail und zeigt wieder das Archiv-Grid */}
        <button
          type="button"
          onClick={onClose}
          className="relative flex-1 min-h-[200px] md:min-h-0 bg-black flex items-center justify-center cursor-zoom-out group/img focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          title="Zurück zum Bild-Archiv"
        >
          <div className="relative max-w-full max-h-[min(50vh,480px)] md:max-h-[min(72vh,640px)] w-full h-full flex items-center justify-center">
            <img
              src={image.src}
              alt="Aufnahme"
              className="max-w-full max-h-[min(50vh,480px)] md:max-h-[min(72vh,640px)] object-contain pointer-events-none"
            />
            {image.analysis?.detections &&
              image.analysis.detections.length > 0 &&
              image.analysis.frame_width &&
              image.analysis.frame_height && (
                <ArchiveDetectionOverlay
                  detections={image.analysis.detections}
                  frameWidth={image.analysis.frame_width}
                  frameHeight={image.analysis.frame_height}
                />
              )}
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 ring-1 ring-white/10 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none">
            <ArrowLeft className="size-3 text-primary" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/90">
              Zurück zum Archiv
            </span>
          </div>
        </button>

        {/* Metadaten – scrollbar bei vielen Labels */}
        <motion.div className="w-full md:w-[340px] flex flex-col min-h-0 max-h-[min(92vh,900px)] border-t md:border-t-0 md:border-l border-white/5 bg-[#081420]/95">
          <motion.div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white">KI-Analyse</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  removeCapturedImage(image.id);
                  onClose();
                }}
                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 ring-1 ring-red-500/20 transition-colors"
                title="Bild löschen"
              >
                <Trash2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/5 text-white/30 hover:text-white transition-colors"
                title="Schließen"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>

          <div className={`flex-1 px-5 py-4 space-y-4 ${SCROLL_AREA}`}>
            <motion.div className="space-y-1.5">
              <label className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30">Zeitpunkt</label>
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-100">
                <Clock className="size-3 text-primary" />
                {new Date(image.timestamp).toLocaleString('de-DE')}
              </div>
            </motion.div>

            <motion.div className="space-y-2 pt-1 pb-2 border-b border-white/8 bg-[#061018]/95">
              {image.analysis?.face_report && !image.analysis.face_report.includes('OPENAI_API_KEY') && !image.analysis.face_report.includes('Fehler') && image.analysis.face_report.length > 100 ? (
                <button
                  type="button"
                  onClick={() => setShowReport(true)}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary/30 to-cyan-500/20 hover:from-primary/45 hover:to-cyan-500/35 border border-primary/30 text-[9px] font-black uppercase tracking-[0.2em] text-white flex items-center justify-center gap-2 group transition-all duration-300 shadow-[0_0_20px_rgba(34,211,238,0.1)] hover:shadow-[0_0_30px_rgba(34,211,238,0.25)] hover:scale-[1.02]"
                >
                  <Eye className="size-4 text-primary animate-pulse group-hover:scale-110 transition-transform" />
                  Editorial-Report öffnen
                </button>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={isGeneratingReport}
                    onClick={handleGenerateReport}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-primary/10 hover:from-cyan-500/20 hover:to-primary/20 border border-cyan-500/20 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-400 flex items-center justify-center gap-2 group transition-all duration-300 disabled:opacity-50"
                  >
                    <Sparkles className={`size-4 text-cyan-400 group-hover:scale-110 transition-transform ${isGeneratingReport ? 'animate-spin' : 'animate-pulse'}`} />
                    {isGeneratingReport ? 'Report generieren...' : 'Editorial-Report generieren'}
                  </button>
                  {generationError && (
                    <p className="text-[9px] text-red-400 font-mono leading-relaxed p-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                      {generationError}
                    </p>
                  )}
                </div>
              )}
            </motion.div>

            <motion.div className="space-y-2">
              <label className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30">Erkennungen</label>
              {image.analysis?.description ? (
                <p className="text-[11px] text-cyan-100/80 leading-relaxed font-medium bg-cyan-500/5 p-3 rounded-xl border border-cyan-500/10">
                  {image.analysis.description}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(image.labels.length > 0 ? image.labels : ['Keine Labels']).map((label, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-primary/10 border border-cyan-500/20 text-[10px] font-bold text-primary flex items-center gap-1.5"
                    >
                      <Tag className="size-2.5 shrink-0" />
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>

            {image.analysis && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-[#081420]/95 ring-1 ring-white/[0.06] space-y-1">
                  <span className="text-[7px] font-black uppercase text-white/45 block">Faces</span>
                  <span className="text-sm font-black text-primary">{image.analysis.face_count ?? 0}</span>
                </div>
                <div className="p-3 rounded-2xl bg-[#081420]/95 ring-1 ring-white/[0.06] space-y-1">
                  <span className="text-[7px] font-black uppercase text-white/45 block">Objects</span>
                  <span className="text-sm font-black text-primary">{image.analysis.object_count ?? 0}</span>
                </div>
                <div className="p-3 rounded-2xl bg-[#081420]/95 ring-1 ring-white/[0.06] space-y-1">
                  <span className="text-[7px] font-black uppercase text-white/45 block">Brightness</span>
                  <span className="text-sm font-black text-primary">{image.analysis.brightness ?? 0}%</span>
                </div>
                <div className="p-3 rounded-2xl bg-[#081420]/95 ring-1 ring-white/[0.06] space-y-1">
                  <span className="text-[7px] font-black uppercase text-white/45 block">Resolution</span>
                  <span className="text-[10px] font-black text-primary">{image.analysis.resolution || '—'}</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-cyan-500/5 ring-1 ring-cyan-500/10">
              <Info className="size-4 text-primary shrink-0" />
              <p className="text-[9px] leading-relaxed text-cyan-200/50">
                Konfidenz: {(image.confidence * 100).toFixed(1)}%. Klick auf das Bild oder Esc → Archiv.
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showReport && (
          <FaceReportOverlay image={image} onClose={() => setShowReport(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Dynamisches Bild-Grid: Zeigt aufgenommene Webcam-Fotos mit Fly-In Animation.
 */
export function ImageGridWidget() {
  const { closeWidget, capturedImages, removeCapturedImage } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('imageGrid');
  const [selectedImage, setSelectedImage] = useState<CapturedImage | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggleImageDetail = useCallback((img: CapturedImage) => {
    setSelectedImage((prev) => (prev?.id === img.id ? null : img));
  }, []);

  const closeDetail = useCallback(() => setSelectedImage(null), []);

  return (
    <>
      <motion.div
        layout={layout}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={getShellClass(`flex flex-col ${WIDGET_PANEL_CLASS} w-full`)}
      >
        <div className={`${WIDGET_HEADER_CLASS} px-5 py-4`}>
          <motion.div className="flex items-center gap-4">
            <div className="p-1 cursor-grab active:cursor-grabbing text-white/20 hover:text-primary transition-colors">
              <GripVertical className="size-3.5" />
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <LayoutGrid className="size-4 text-primary" />
                <motion.div className="absolute inset-0 size-4 bg-cyan-400/20 blur-sm animate-pulse" />
              </div>
              <div>
                <span className={`${WIDGET_TITLE_CLASS} block`}>
                  Bild-Archiv
                </span>
                <span className="text-[8px] text-primary/50 font-mono uppercase tracking-widest">
                  {capturedImages.length} Aufnahmen erfasst
                </span>
              </div>
            </div>
          </motion.div>

          <div className="flex items-center gap-2 relative z-50">
            <WidgetPopOutButton widgetId="imageGrid" />
            <WidgetFullscreenButton widgetId="imageGrid" />
            <button
              type="button"
              onClick={() => closeWidget('imageGrid')}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all active:scale-90"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className={`flex-1 min-h-0 p-4 ${SCROLL_AREA}`}>
          {capturedImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-20">
              <Grid3X3 className="size-12 text-white" />
              <p className="text-[10px] text-white uppercase tracking-[0.3em] font-bold">
                Warte auf Daten-Input...
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-2">
              <AnimatePresence mode="popLayout">
                {capturedImages.map((img, i) => (
                  <motion.div
                    key={img.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8, y: 24 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{
                      type: 'spring',
                      stiffness: 260,
                      damping: 20,
                      delay: i < 8 ? i * 0.04 : 0,
                    }}
                    className={`group relative rounded-xl ring-1 transition-all ${
                      selectedImage?.id === img.id
                        ? 'ring-1 ring-cyan-400/50 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                        : 'ring-white/8 hover:ring-cyan-500/25'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleImageDetail(img)}
                      className="relative aspect-[4/3] w-full rounded-xl overflow-hidden text-left"
                      title={selectedImage?.id === img.id ? 'Zurück zum Archiv' : 'Vergrößern'}
                    >
                      <img
                        src={img.src}
                        alt="Capture"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Maximize2 className="size-6 text-primary drop-shadow-lg" />
                        </div>
                        <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end">
                          <span className="text-[9px] text-white font-bold truncate">
                            {img.labels[0] || 'Aufnahme'}
                          </span>
                          <span className="text-[8px] font-mono text-white/50">
                            {new Date(img.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                      <motion.div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 ring-1 ring-white/10">
                        <span className="text-[8px] font-black text-primary">
                          {(img.confidence * 100).toFixed(0)}%
                        </span>
                      </motion.div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCapturedImage(img.id);
                        if (selectedImage?.id === img.id) setSelectedImage(null);
                      }}
                      className="absolute top-2 left-2 p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 ring-1 ring-red-500/30 opacity-0 group-hover:opacity-100 transition-all z-10"
                      title="Bild löschen"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>

      {mounted &&
        selectedImage &&
        createPortal(
          <motion.div className="fixed inset-0" style={{ zIndex: IMAGE_ARCHIVE_LIGHTBOX_Z }}>
            <AnimatePresence>
              <ImageDetailLightbox key={selectedImage.id} image={selectedImage} onClose={closeDetail} />
            </AnimatePresence>
          </motion.div>,
          document.body,
        )}
    </>
  );
}
