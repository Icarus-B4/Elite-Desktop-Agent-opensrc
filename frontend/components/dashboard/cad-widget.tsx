'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl, STLLoader } from 'three-stdlib';
import { motion } from 'framer-motion';
import { Box, Download, X } from 'lucide-react';
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

function StlMesh({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url);
  geometry.computeVertexNormals();
  geometry.center();
  return (
    <mesh geometry={geometry} castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color="#06b6d4" metalness={0.35} roughness={0.45} />
    </mesh>
  );
}

function StlOrbitControls() {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const controls = new OrbitControlsImpl(camera, gl.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl]);

  useFrame(() => controlsRef.current?.update());
  return null;
}

function StlScene({ stlUrl }: { stlUrl: string }) {
  return (
    <Canvas camera={{ position: [0, 0, 80], fov: 45 }} className="h-full w-full">
      <ambientLight intensity={0.6} />
      <directionalLight position={[40, 60, 30]} intensity={1.2} />
      <Suspense fallback={null}>
        <StlMesh url={stlUrl} />
      </Suspense>
      <StlOrbitControls />
    </Canvas>
  );
}

export function CadWidget() {
  const { closeWidget, cadModel, setCadModel } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('cad');
  const [status, setStatus] = useState('Bereit für CAD-Generierung.');

  const stlPath = cadModel?.stlPath || '';
  const prompt = cadModel?.prompt || '';

  useEffect(() => {
    if (stlPath) {
      setStatus('Modell geladen.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/elite/cad/latest');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { stlPath?: string | null; prompt?: string | null };
        if (data?.stlPath && !cancelled) {
          setCadModel(data.stlPath, data.prompt || '');
          setStatus('Letztes Modell wiederhergestellt.');
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stlPath, setCadModel]);

  const stlUrl = stlPath
    ? `/api/elite/cad/stl?path=${encodeURIComponent(stlPath)}`
    : '';

  return (
    <motion.div
      key="cad"
      layout={layout}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className={getShellClass(`${WIDGET_PANEL_CLASS} min-h-[360px]`)}
    >
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          <Box className="size-4 text-cyan-400" />
          <span className={WIDGET_TITLE_CLASS}>CAD Prototype</span>
        </div>
        <div className="flex items-center gap-1">
          {stlUrl && (
            <a
              href={stlUrl}
              download
              className="p-1.5 rounded-lg hover:bg-white/10"
              title="STL herunterladen"
            >
              <Download className="size-3.5 text-white/50" />
            </a>
          )}
          <WidgetPopOutButton widgetId="cad" />
          <WidgetFullscreenButton widgetId="cad" />
          <button type="button" onClick={() => closeWidget('cad')} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="size-3.5 text-white/50" />
          </button>
        </div>
      </div>
      <div className={`${WIDGET_BODY_CLASS} flex flex-col min-h-[280px]`}>
        <div className="flex-1 min-h-[200px] bg-[#020810]">
          {stlUrl ? (
            <StlScene key={stlUrl} stlUrl={stlUrl} />
          ) : (
            <div className="flex h-full items-center justify-center text-white/35 text-xs px-4 text-center">
              Voice: „Erstelle einen Würfel 20mm“ — STL erscheint hier.
            </div>
          )}
        </div>
        <div className="p-3 border-t border-white/5 space-y-1">
          {prompt && <p className="text-[10px] text-white/50 truncate">Prompt: {prompt}</p>}
          <p className="text-[10px] text-white/40">{status}</p>
        </div>
      </div>
    </motion.div>
  );
}
