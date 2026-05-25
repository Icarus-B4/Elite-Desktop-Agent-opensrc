'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Unlock, Camera, X } from 'lucide-react';
import { useLocalParticipant } from '@livekit/components-react';
import { useWidgetManager } from './widget-manager';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WidgetPopOutButton,
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_BODY_CLASS,
  WIDGET_TITLE_CLASS,
} from './widget-shell';

export function AuthLockWidget() {
  const { closeWidget } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('authLock');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { localParticipant } = useLocalParticipant();
  const [status, setStatus] = useState<{ authenticated?: boolean; score?: number; message?: string }>({});
  const [enrolling, setEnrolling] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [settings, setSettings] = useState<{ enabled: boolean; has_reference: boolean }>({ enabled: false, has_reference: false });
  const isVerifyingAutoRef = useRef(false);

  // Status/Einstellungen beim Laden vom Backend abfragen
  useEffect(() => {
    fetch('/api/elite/face-auth')
      .then((res) => res.json())
      .then((data) => {
        setSettings({
          enabled: !!data.enabled,
          has_reference: !!data.has_reference,
        });
        if (data.enabled && !data.has_reference) {
          setStatus({ message: 'Kein Referenzfoto vorhanden. Bitte Referenz aufnehmen.' });
        }
      })
      .catch((err) => {
        console.error('[FaceAuth] Fehler beim Laden der Einstellungen:', err);
      });
  }, []);

  useEffect(() => {
    // 1. Anderen Widgets mitteilen, dass wir die Kamera exklusiv belegen
    const activeUsers = (window as any)._activeCameraUsers || new Set();
    activeUsers.add('authLock');
    (window as any)._activeCameraUsers = activeUsers;
    
    // Laufende Webcam-Widgets zwingen zu stoppen
    window.dispatchEvent(new CustomEvent('elite-webcam-force-stop'));

    let stream: MediaStream | null = null;
    const timer = setTimeout(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        console.error('[FaceAuth] Kamera-Zugriff fehlgeschlagen:', err);
        setStatus({ message: 'Kamera nicht verfügbar.' });
      }
    }, 350); // 350ms Verzögerung zur sicheren Freigabe durch andere Widgets (Kamera-Konflikt vermeiden)

    return () => {
      clearTimeout(timer);
      // Cleanup des Streams
      stream?.getTracks().forEach((t) => t.stop());
      
      // 2. Kamera-Nutzer-Set aktualisieren und Freigabe melden
      const currentActive = (window as any)._activeCameraUsers || new Set();
      currentActive.delete('authLock');
      (window as any)._activeCameraUsers = currentActive;
    };
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  // Automatisches Scan- und Verifizierungsintervall
  useEffect(() => {
    if (!cameraReady || !settings.enabled || !settings.has_reference || status.authenticated || enrolling) {
      return;
    }

    const interval = setInterval(async () => {
      if (isVerifyingAutoRef.current) return;
      isVerifyingAutoRef.current = true;
      try {
        const frame = captureFrame();
        if (frame) {
          const res = await fetch('/api/elite/face-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify', image: frame }),
          });
          const data = await res.json();
          if (data.authenticated) {
            setStatus({
              authenticated: true,
              score: data.score,
              message: 'Identität bestätigt. Entsperre...',
            });
            if (localParticipant) {
              const payload = JSON.stringify({
                type: 'face_auth_result',
                authenticated: true,
                score: data.score,
              });
              localParticipant.publishData(new TextEncoder().encode(payload));
            }
            clearInterval(interval);
            setTimeout(() => {
              closeWidget('authLock');
            }, 1200);
          } else {
            setStatus((prev) => ({
              ...prev,
              score: data.score,
              message: 'Gesicht wird gescannt... ' + (data.message || ''),
            }));
          }
        }
      } catch (err) {
        console.error('[FaceAuth] Fehler bei automatischer Gesichtserkennung:', err);
      } finally {
        isVerifyingAutoRef.current = false;
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [cameraReady, settings, status.authenticated, enrolling, captureFrame, localParticipant, closeWidget]);

  const verify = useCallback(async () => {
    const frame = captureFrame();
    if (!frame) return;
    setStatus({ message: 'Verifiziere...' });
    const res = await fetch('/api/elite/face-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', image: frame }),
    });
    const data = await res.json();
    setStatus(data);
    if (localParticipant) {
      const payload = JSON.stringify({
        type: 'face_auth_result',
        authenticated: data.authenticated,
        score: data.score,
      });
      localParticipant.publishData(new TextEncoder().encode(payload));
    }
    if (data.authenticated) {
      setTimeout(() => {
        closeWidget('authLock');
      }, 1200);
    }
  }, [captureFrame, localParticipant, closeWidget]);

  const enroll = useCallback(async () => {
    const frame = captureFrame();
    if (!frame) return;
    setEnrolling(true);
    setStatus({ message: 'Speichere Referenz...' });
    const res = await fetch('/api/elite/face-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'enroll', image: frame }),
    });
    const data = await res.json();
    setStatus(data);
    setEnrolling(false);
    if (data.success) {
      setSettings((prev) => ({ ...prev, has_reference: true }));
      if (localParticipant) {
        const payload = JSON.stringify({ type: 'face_auth_result', authenticated: true, score: 1 });
        localParticipant.publishData(new TextEncoder().encode(payload));
      }
      setTimeout(() => {
        closeWidget('authLock');
      }, 1200);
    }
  }, [captureFrame, localParticipant, closeWidget]);

  return (
    <motion.div
      key="authLock"
      layout={layout}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className={getShellClass(`${WIDGET_PANEL_CLASS} min-h-[320px]`)}
    >
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          {status.authenticated ? <Unlock className="size-4 text-emerald-400" /> : <Lock className="size-4 text-amber-400" />}
          <span className={WIDGET_TITLE_CLASS}>Face Auth</span>
        </div>
        <div className="flex items-center gap-1">
          {(!settings.enabled || status.authenticated) && (
            <>
              <WidgetPopOutButton widgetId="authLock" />
              <WidgetFullscreenButton widgetId="authLock" />
              <button type="button" onClick={() => closeWidget('authLock')} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="size-3.5 text-white/50" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className={`${WIDGET_BODY_CLASS} p-4 flex flex-col gap-3`}>
        <div className="relative rounded-xl overflow-hidden bg-black/40 aspect-video max-h-48">
          <video ref={videoRef} className="w-full h-full object-cover mirror -scale-x-100" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Scanning Line overlay */}
          {cameraReady && settings.enabled && settings.has_reference && !status.authenticated && !enrolling && (
            <motion.div 
              className="absolute left-0 right-0 h-[2px] bg-cyan-500 shadow-[0_0_15px_#06b6d4] z-10"
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>
        <p className="text-[11px] text-white/70">{status.message || (settings.enabled ? 'Referenz vorhanden. Blicke in die Kamera zum Entsperren.' : 'Face Auth ist inaktiv. Bitte in den Einstellungen aktivieren.')}</p>
        {typeof status.score === 'number' && (
          <p className="text-[10px] font-mono text-white/45">Score: {status.score.toFixed(4)}</p>
        )}
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={verify}
            disabled={!settings.has_reference}
            className="flex-1 py-2 rounded-xl bg-cyan-500/15 text-cyan-300 text-[10px] font-bold uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none"
          >
            Verifizieren
          </button>
          <button
            type="button"
            onClick={enroll}
            disabled={enrolling}
            className="flex-1 py-2 rounded-xl bg-amber-500/15 text-amber-300 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"
          >
            <Camera className="size-3.5" />
            Referenz
          </button>
        </div>
      </div>
    </motion.div>
  );
}
