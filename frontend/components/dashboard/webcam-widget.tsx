'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, ScanSearch, X, Loader2, Eye,
  Maximize2, RefreshCw, AlertTriangle,
  Play, GripVertical
} from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import {
  bakeDetectionsOntoDataUrl,
  percentBoxToContainPixels,
  type DetectionOverlay,
} from '@/lib/draw-detection-overlay';
import { useWidgetFullscreen, WidgetFullscreenButton, WIDGET_PANEL_CLASS, WIDGET_HEADER_CLASS, WIDGET_FOOTER_CLASS, WIDGET_TITLE_CLASS } from './widget-shell';

/**
 * Webcam-Widget mit echtem Vision-Backend:
 * - Objekterkennung via GPT-4o Vision (präzise Labels + Bounding Boxes)
 * - Face-Clustering via HAAR-Cascades (Fallback) oder KI
 * - Visual Window Utils: Canvas-Overlay mit echten Bounding Boxes
 * - Bridge: /api/elite/analyze-frame → Python frame_analyzer.py (Port 8001)
 */

interface Detection {
  id: string;
  label: string;
  type: 'face' | 'object';
  confidence: number;
  x: number;   // % der Bild-Breite
  y: number;   // % der Bild-Höhe
  w: number;   // % der Bild-Breite
  h: number;   // % der Bild-Höhe
  color: string;
}

interface AnalysisResult {
  detections: Detection[];
  vision_source?: string;
  vision_hint?: string;
  face_count: number;
  object_count: number;
  brightness: number;
  resolution: string;
  frame_width?: number;
  frame_height?: number;
  error?: string;
  offline?: boolean;
  face_report?: string;
}

interface WebcamWidgetProps {
  variant?: 'default' | 'hud';
}

export function WebcamWidget({ variant = 'default' }: WebcamWidgetProps) {
  const { closeWidget, addLog, addCapturedImage, updateCapturedImage, openWidget, expandedWidgets, toggleExpandWidget } = useWidgetManager();
  const { layout, getShellClass, isFullscreen } = useWidgetFullscreen('webcam');
  const isHUD = variant === 'hud';
  const isExpanded = expandedWidgets['webcam'];
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);       
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null); 
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFaceReportLoading, setIsFaceReportLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [faceReport, setFaceReport] = useState<string | null>(null);
  const [faceReportError, setFaceReportError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanSeqRef = useRef(0);
  const overlayLoopRef = useRef(0);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const refreshDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error("Fehler beim Auflisten der Kameras:", err);
    }
  }, [selectedDeviceId]);

  const startCamera = useCallback(async () => {
    if ((window as any)._activeCameraUsers?.has('authLock')) {
      const errorMsg = 'Kamera wird von Face Auth belegt.';
      setCameraError(errorMsg);
      addLog({ type: 'error', message: errorMsg });
      return;
    }

    setCameraError(null);
    setAnalysisResult(null);

    const config = { 
      video: { 
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        width: { ideal: 640 }, 
        height: { ideal: 480 } 
      },
      audio: false
    };

    if ((window as any)._webcamLock) return;
    (window as any)._webcamLock = true;

    try {
      addLog({ type: 'tool_call', message: `Starte Kamera (Video-Only Modus)...` });
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(config);
      } catch (videoErr: any) {
        console.warn("[Webcam] 480p fehlgeschlagen, versuche Minimal-Profil...");
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      (window as any).eliteWebcamStream = stream;
      (window as any).eliteWebcamActive = true;
      // Kamera-Ressourcennutzung registrieren
      const activeUsers = (window as any)._activeCameraUsers || new Set();
      activeUsers.add('webcam');
      (window as any)._activeCameraUsers = activeUsers;
      
      setIsStreaming(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        addLog({ type: 'result', message: 'Video-Feed aktiv ✓' });
      }
    } catch (err: any) {
      (window as any).eliteWebcamActive = false;
      const errorMsg = `Kamera-Fehler: ${err.name}`;
      setCameraError(errorMsg);
      addLog({ type: 'error', message: errorMsg });
    } finally {
      (window as any)._webcamLock = false;
    }
  }, [selectedDeviceId, addLog]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (isHUD && !isStreaming && !cameraError && selectedDeviceId) {
      // Verzögerter Start, um Hardware-Konflikte mit dem Mikrofon beim Booten zu vermeiden
      const timer = setTimeout(() => {
        startCamera();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isHUD, isStreaming, cameraError, startCamera, selectedDeviceId]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    (window as any).eliteWebcamStream = null;
    (window as any).eliteWebcamActive = false;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsStreaming(false);
    setAnalysisResult(null);
    setCameraError(null);

    // Kamera-Ressourcennutzung aufheben
    const activeUsers = (window as any)._activeCameraUsers || new Set();
    activeUsers.delete('webcam');
    (window as any)._activeCameraUsers = activeUsers;
  }, []);

  useEffect(() => {
    const handleForceStop = () => {
      if (streamRef.current) {
        addLog({ type: 'system', message: 'Kamera durch Face Auth freigegeben.' });
        stopCamera();
      }
    };
    window.addEventListener('elite-webcam-force-stop', handleForceStop);
    return () => {
      window.removeEventListener('elite-webcam-force-stop', handleForceStop);
    };
  }, [stopCamera, addLog]);

  useEffect(() => () => stopCamera(), [stopCamera]);



  const clearOverlay = useCallback(() => {
    overlayLoopRef.current += 1;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawDetections = useCallback(
    (
      detections: Detection[],
      containerW: number,
      containerH: number,
      captureW: number,
      captureH: number,
      loopId: number,
    ) => {
      if (loopId !== overlayLoopRef.current) return;

      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      canvas.width = containerW;
      canvas.height = containerH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, containerW, containerH);

      const imgW = captureW || containerW;
      const imgH = captureH || containerH;

      detections.forEach((det) => {
        const mapped = percentBoxToContainPixels(
          { x: det.x, y: det.y, w: det.w, h: det.h },
          imgW,
          imgH,
          containerW,
          containerH,
        );
        const { x, y, w, h } = mapped;
        if (w < 4 || h < 4) return;
        const color = det.color;

        const time = Date.now() / 1000;
        const pulse = Math.sin(time * 4) * 0.5 + 0.5;

        ctx.save();
        ctx.shadowBlur = 12 * pulse;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        const cornerLen = Math.min(16, w * 0.2, h * 0.2);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + cornerLen);
        ctx.lineTo(x, y);
        ctx.lineTo(x + cornerLen, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + w - cornerLen, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + cornerLen);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + h - cornerLen);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + cornerLen, y + h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + w - cornerLen, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w, y + h - cornerLen);
        ctx.stroke();

        ctx.fillStyle = `${color}1A`;
        ctx.fillRect(x, y, w, h);
        ctx.restore();

        ctx.font = 'bold 11px monospace';
        const label = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
        const textW = ctx.measureText(label).width + 12;
        const pillY = y - 20 < 0 ? y + 2 : y - 20;

        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.beginPath();
        ctx.roundRect(x, pillY, textW, 18, 4);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillText(label, x + 6, pillY + 13);
      });

      if (detections.length > 0 && loopId === overlayLoopRef.current) {
        requestAnimationFrame(() =>
          drawDetections(detections, containerW, containerH, captureW, captureH, loopId),
        );
      }
    },
    [],
  );

  const captureFrameData = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const MAX_WIDTH = 960;
    const scale = Math.min(1, MAX_WIDTH / (video.videoWidth || 640));
    canvas.width = (video.videoWidth || 640) * scale;
    canvas.height = (video.videoHeight || 480) * scale;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    return canvas.toDataURL('image/jpeg', 0.72);
  }, []);

  const fetchFaceReport = useCallback(
    async (frameData: string, savedId?: string | null) => {
      setIsFaceReportLoading(true);
      setFaceReportError(null);
      try {
        const resp = await fetch('/api/elite/analyze-face', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frame: frameData }),
        });
        const data = await resp.json();
        if (!resp.ok || data.error) {
          setFaceReport(null);
          setFaceReportError(data.error || 'Gesichts-Report fehlgeschlagen');
          addLog({ type: 'error', message: data.error || 'Gesichts-Report fehlgeschlagen' });
          return;
        }
        setFaceReport(data.report);
        setAnalysisResult((prev) => (prev ? { ...prev, face_report: data.report } : prev));
        addLog({ type: 'result', message: 'Gesichtsästhetik-Report erstellt' });

        if (savedId) {
          try {
            await fetch('/api/elite/gallery', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: savedId, face_report: data.report }),
            });
            updateCapturedImage(savedId, { analysis: { face_report: data.report } });
          } catch (updateErr) {
            console.warn('[Gallery] Fehler beim Verknüpfen des Gesichtsberichts:', updateErr);
          }
        }

        if (typeof window !== 'undefined' && (window as any).elite?.sendChatMessage) {
          const excerpt = String(data.report).slice(0, 400);
          (window as any).elite.sendChatMessage(
            `[GESICHTS-REPORT] Analyse abgeschlossen. Kurzfassung:\n${excerpt}…`,
          );
        }
      } catch (err) {
        setFaceReportError(String(err));
      } finally {
        setIsFaceReportLoading(false);
      }
    },
    [addLog, updateCapturedImage],
  );

  const scanAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;
    const scanId = ++scanSeqRef.current;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setFaceReport(null);
    setFaceReportError(null);
    clearOverlay();

    const frameData = captureFrameData();
    if (!frameData) {
      setIsAnalyzing(false);
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const captureW = canvas?.width || 640;
    const captureH = canvas?.height || 480;
    const resolutionLabel = `${captureW}x${captureH}`;

    try {
      const resp = await fetch('/api/elite/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame: frameData }),
      });

      const result: AnalysisResult = await resp.json();

      if (scanId !== scanSeqRef.current) return;

      const archiveEntry = {
        src: frameData,
        labels: [] as string[],
        confidence: 0.85,
        analysis: {
          face_count: 0,
          object_count: 0,
          brightness: 0,
          resolution: resolutionLabel,
        },
      };

      if (!resp.ok || result.error) {
        setAnalysisResult({ detections: [], face_count: 0, object_count: 0, brightness: 0, resolution: '', error: result.error || 'Fetch failed', offline: true });
        archiveEntry.labels = ['Kamera-Scan'];
        await addCapturedImage(archiveEntry);
      } else {
        const frameW = result.frame_width || captureW;
        const frameH = result.frame_height || captureH;
        const enriched: AnalysisResult = {
          ...result,
          frame_width: frameW,
          frame_height: frameH,
          resolution: resolutionLabel,
        };
        setAnalysisResult(enriched);

        let archiveSrc = frameData;
        if (result.detections.length > 0) {
          const loopId = overlayLoopRef.current;
          drawDetections(
            result.detections,
            video.clientWidth,
            video.clientHeight,
            captureW,
            captureH,
            loopId,
          );
          try {
            archiveSrc = await bakeDetectionsOntoDataUrl(
              frameData,
              result.detections as DetectionOverlay[],
            );
          } catch (bakeErr) {
            console.warn('[Vision] Archiv-Overlay:', bakeErr);
          }
        }
        if (result.vision_hint) {
          addLog({ type: 'system', message: result.vision_hint });
        }
        const savedId = await addCapturedImage({
          src: archiveSrc,
          labels: result.detections.map((d) => d.label),
          confidence: 0.85,
          analysis: {
            face_count: result.face_count,
            object_count: result.object_count,
            brightness: result.brightness,
            resolution: resolutionLabel,
            frame_width: captureW,
            frame_height: captureH,
            detections: result.detections,
          },
        });
        if (result.detections.length > 0) openWidget('imageGrid');

        if (result.face_count > 0) {
          void fetchFaceReport(frameData, savedId);
        }
      }

      if (typeof window !== 'undefined' && (window as any).elite) {
        if (!result?.error && resp.ok) {
          const msg = `[SYSTEM-VISION] Scan fertig: ${result.face_count} Gesichter, ${result.object_count} Objekte.`;
          (window as any).elite.sendChatMessage?.(msg);
        }

        if (frameData.length < 64000) {
          (window as any).elite.sendDataChannel?.(JSON.stringify({ type: 'vision_frame', frame: frameData }));
        } else {
          console.warn('Frame zu groß für DataChannel:', frameData.length);
          addLog({ type: 'error', message: 'Bild zu groß für KI-Übertragung. Kompression wird angepasst.' });
        }
      }
    } catch (err) {
      setAnalysisResult({ detections: [], face_count: 0, object_count: 0, brightness: 0, resolution: '', error: String(err), offline: true });
      await addCapturedImage({
        src: frameData,
        labels: ['Kamera-Scan'],
        confidence: 0.7,
        analysis: { resolution: `${canvas.width}x${canvas.height}` },
      });
      openWidget('imageGrid');
    } finally {
      setIsAnalyzing(false);
    }
  }, [addLog, addCapturedImage, openWidget, drawDetections, clearOverlay, isAnalyzing, captureFrameData, fetchFaceReport]);

  useEffect(() => {
    if (!isStreaming || !analysisResult?.detections?.length) return;
    const video = videoRef.current;
    if (!video) return;

    const capW = analysisResult.frame_width || canvasRef.current?.width || 640;
    const capH = analysisResult.frame_height || canvasRef.current?.height || 480;
    const loopId = overlayLoopRef.current;

    const redraw = () => {
      if (video.clientWidth > 0) {
        drawDetections(
          analysisResult.detections,
          video.clientWidth,
          video.clientHeight,
          capW,
          capH,
          loopId,
        );
      }
    };

    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(video);
    window.addEventListener('resize', redraw);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', redraw);
    };
  }, [analysisResult, isStreaming, drawDetections]);

  // Listener für Voice-Triggered Scan (von der KI ausgelöst)
  useEffect(() => {
    const handleScanTrigger = async () => {
      console.log("[Webcam] Voice-Trigger empfangen, starte Scan...");
      // Falls Kamera aus ist -> erst anmachen
      if (!isStreaming) {
        console.log("[Webcam] Kamera ist aus, starte Stream...");
        await startCamera();
        // Warten bis Stream stabil (Aufwärmzeit)
        await new Promise(r => setTimeout(r, 800));
      }
      scanAndAnalyze();
    };
    window.addEventListener('elite-trigger-scan', handleScanTrigger);
    return () => window.removeEventListener('elite-trigger-scan', handleScanTrigger);
  }, [scanAndAnalyze, isStreaming, startCamera]);

  return (
    <motion.div 
      layout={isHUD ? true : layout}
      initial={{ opacity: 0, scale: 0.9 }} 
      animate={{ opacity: 1, scale: 1 }} 
      exit={{ opacity: 0, scale: 0.9 }}
      className={
        isHUD
          ? 'absolute inset-0 overflow-hidden bg-transparent ring-0 shadow-none'
          : getShellClass(`flex flex-col overflow-hidden transition-all ${WIDGET_PANEL_CLASS}`)
      }
    >
      {!isHUD && (
        <div className={WIDGET_HEADER_CLASS}>
          <div className="flex items-center gap-3">
            <div className="p-1 cursor-grab active:cursor-grabbing text-white/20 hover:text-primary transition-colors">
              <GripVertical className="size-3.5" />
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex size-5 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <Camera className="size-3 text-primary" />
              </div>
              <span className={WIDGET_TITLE_CLASS}>Webcam Feed</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <WidgetFullscreenButton widgetId="webcam" />
            <button 
              onClick={() => toggleExpandWidget('webcam')}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white transition-all hidden md:block"
            >
              <Maximize2 className="size-3.5 rotate-45" />
            </button>
            <button 
              onClick={() => { stopCamera(); closeWidget('webcam'); }}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      <motion.div className={`overflow-hidden transition-all ${
        isHUD
          ? 'absolute inset-0 bg-transparent'
          : isFullscreen
            ? 'relative flex-1 min-h-0 bg-black rounded-3xl ring-1 ring-primary/30'
            : 'relative bg-black aspect-video rounded-3xl ring-1 ring-primary/30'
      }`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full transition-opacity ${isStreaming ? 'opacity-100' : 'opacity-0'} ${isHUD ? 'mix-blend-lighten opacity-60' : ''} ${
            analysisResult?.detections?.length ? 'object-contain' : 'object-cover'
          }`}
          style={{ transform: 'scaleX(-1)' }}
        />

        {!isStreaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-50 pointer-events-auto px-6 text-center">
            <div className="relative group cursor-pointer" onClick={startCamera}>
              <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/40 transition-all" />
              <div className="relative size-16 rounded-2xl bg-black/40 border border-primary/30 flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-all duration-500 shadow-[0_0_30px_var(--accent-glow)]">
                <Camera className="size-6 text-primary" />
              </div>
            </div>

            {devices.length > 0 ? (
              <div className="flex flex-col gap-3 w-full max-w-[240px]">
                <select 
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/70 outline-none focus:ring-1 focus:ring-primary/50"
                >
                  {devices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Kamera ${d.deviceId.slice(0, 5)}`}</option>
                  ))}
                </select>
                <button 
                  onClick={startCamera} 
                  className="text-[10px] font-black uppercase tracking-[0.3em] text-primary hover:text-white bg-primary/20 hover:bg-primary px-4 py-2 rounded-lg transition-all"
                >
                  Kamera aktivieren
                </button>
              </div>
            ) : (
              <span className="text-[10px] text-white/40 uppercase tracking-widest">Suche Kameras...</span>
            )}

            {cameraError && (
              <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-mono max-w-[300px]">
                <AlertTriangle className="size-4 mx-auto mb-2 opacity-50" />
                {cameraError}
              </div>
            )}
          </div>
        )}

        {isStreaming && (
          <>
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
               <div className="absolute top-4 left-4 size-8 border-t-2 border-l-2 border-primary/40" />
               <div className="absolute top-4 right-4 size-8 border-t-2 border-r-2 border-primary/40" />
               <div className="absolute bottom-4 left-4 size-8 border-b-2 border-l-2 border-primary/40" />
               <div className="absolute bottom-4 right-4 size-8 border-b-2 border-r-2 border-primary/40" />
               <div className="absolute inset-0 flex items-center justify-center opacity-20">
                 <div className="size-48 border border-primary/20 rounded-full animate-pulse" />
               </div>
            </div>

            <canvas ref={overlayCanvasRef} className="absolute inset-0 pointer-events-none z-10" />

            {isAnalyzing && (
              <div className="absolute inset-0 z-20">
                <motion.div className="absolute left-0 right-0 h-[2px] bg-primary shadow-[0_0_20px_var(--accent-glow)]" animate={{ top: ['0%', '100%'] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="px-4 py-2 rounded-xl bg-black/80 ring-1 ring-primary/50 flex items-center gap-2">
                    <Loader2 className="size-4 text-primary animate-spin" />
                    <span className="text-[10px] text-primary font-bold uppercase">KI-Vision analysiert…</span>
                  </div>
                </div>
              </div>
            )}

            {analysisResult?.offline && (
              <div className="absolute bottom-2 left-2 right-2 px-3 py-2 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-amber-400" />
                <span className="text-[10px] text-amber-300">Analyzer offline</span>
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </motion.div>

      {isStreaming && !isHUD && (
        <>
          <motion.div className="p-4 border-t border-white/5 flex flex-wrap items-center gap-2 justify-between">
            <motion.div className="flex flex-wrap gap-2">
              <button
                onClick={scanAndAnalyze}
                disabled={isAnalyzing || isFaceReportLoading}
                className="px-4 py-2 rounded-xl bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest ring-1 ring-primary/30"
              >
                {isAnalyzing ? 'Scan…' : 'Scan Frame'}
              </button>
              <button
                onClick={async () => {
                  const frame = captureFrameData();
                  if (frame) {
                    const savedId = await addCapturedImage({
                      src: frame,
                      labels: ['Gesichts-Report'],
                      confidence: 0.95,
                      analysis: {
                        face_count: 1,
                        object_count: 0,
                        brightness: 50,
                      }
                    });
                    openWidget('imageGrid');
                    void fetchFaceReport(frame, savedId);
                  }
                }}
                disabled={isAnalyzing || isFaceReportLoading}
                className="px-4 py-2 rounded-xl bg-white/5 text-white/70 text-[10px] font-bold uppercase tracking-widest ring-1 ring-white/10 hover:text-white"
              >
                {isFaceReportLoading ? 'Report…' : 'Gesichts-Report'}
              </button>
            </motion.div>
            {analysisResult && (
              <motion.div className="flex flex-wrap gap-3 text-[10px] font-mono text-white/40 uppercase items-center">
                <span>{analysisResult.face_count} Faces</span>
                <span>{analysisResult.object_count} Obj</span>
                {analysisResult.vision_source === 'openai' && (
                  <span className="text-cyan-400/80">KI-Vision</span>
                )}
              </motion.div>
            )}
          </motion.div>

          <AnimatePresence>
            {(faceReport || faceReportError || isFaceReportLoading) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-4 mb-4 overflow-hidden rounded-2xl bg-[#0a0a0a] ring-1 ring-white/10"
              >
                <motion.div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">
                    Gesichtsästhetik · Elite Vision
                  </span>
                  {isFaceReportLoading && <Loader2 className="size-3.5 text-primary animate-spin" />}
                </motion.div>
                <motion.div className="max-h-[min(50vh,420px)] overflow-y-auto p-4 text-[12px] leading-relaxed text-white/85 font-light">
                  {faceReportError && (
                    <p className="text-amber-300 text-[11px] mb-2">{faceReportError}</p>
                  )}
                  {isFaceReportLoading && !faceReport && (
                    <p className="text-white/40 text-[11px]">Erstelle Editorial-Report…</p>
                  )}
                  {faceReport && (
                    <div className="whitespace-pre-wrap [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-widest [&_h3]:text-white/50 [&_h3]:mt-3">
                      {faceReport.split('\n').map((line, i) => {
                        if (line.startsWith('## ')) {
                          return (
                            <h2 key={i} className="text-sm font-semibold text-white mt-4 mb-2 border-b border-white/10 pb-1">
                              {line.replace(/^##\s*/, '')}
                            </h2>
                          );
                        }
                        if (line.startsWith('### ')) {
                          return (
                            <h3 key={i} className="text-[11px] font-bold uppercase tracking-widest text-white/50 mt-3 mb-1">
                              {line.replace(/^###\s*/, '')}
                            </h3>
                          );
                        }
                        if (line.startsWith('|')) {
                          return (
                            <p key={i} className="font-mono text-[10px] text-white/60 border-l border-white/20 pl-2 my-0.5">
                              {line}
                            </p>
                          );
                        }
                        if (line.startsWith('- ') || line.match(/^\d+\./)) {
                          return (
                            <p key={i} className="pl-3 my-1 text-white/75">
                              {line}
                            </p>
                          );
                        }
                        if (line.trim() === '') return <div key={i} className="h-2" />;
                        return (
                          <p key={i} className="my-1 text-white/80">
                            {line.replace(/\*\*(.*?)\*\*/g, '$1')}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
                <motion.div className="px-4 py-2 border-t border-white/5 text-[9px] text-white/25 text-center tracking-wide">
                  cgpttribevault.skool.com/cgpt-tribe-5064/about · Screenshot zum Kopieren
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
