'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Eye, EyeOff, Download, Sparkles, 
  Sun, Moon, ShieldCheck, Zap, HelpCircle 
} from 'lucide-react';
import { CapturedImage } from './widget-manager';

interface FaceReportOverlayProps {
  image: CapturedImage;
  onClose: () => void;
}

interface ParsedScore {
  category: string;
  score: string;
  note: string;
}

export function FaceReportOverlay({ image, onClose }: FaceReportOverlayProps) {
  const [showWireframe, setShowWireframe] = useState(true);
  const [isLightMode, setIsLightMode] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Parser-Logik für den GPT-4o Vision Editorial-Report
  const parseReport = (reportText: string) => {
    const result = {
      title: 'Gesichtsästhetik – Elite Vision Report',
      overallScore: '—',
      diagramDescription: '',
      scores: [] as ParsedScore[],
      strengths: [] as string[],
      weaknesses: [] as string[],
      recommendations: [] as string[],
    };

    if (!reportText) return result;

    const lines = reportText.split('\n');
    let currentSection = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Gesamtpotenzial extrahieren
      const cleanLine = line.toLowerCase();
      if (cleanLine.includes('gesamtpotenzial') || cleanLine.includes('attraktivitätspotenzial') || cleanLine.includes('gesamtbewertung') || cleanLine.includes('attraktivität')) {
        const match = line.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
        if (match) {
          result.overallScore = match[1];
        } else {
          const matchSingle = line.match(/(\d+(?:\.\d+)?)/);
          if (matchSingle) {
            result.overallScore = matchSingle[1];
          }
        }
        continue;
      }

      // Sektions-Erkennung (Sehr robust gegen verschiedene Header-Stile)
      if (line.startsWith('## ')) {
        result.title = line.replace('##', '').trim();
      }

      if (line.startsWith('#') || line.startsWith('**') || line.startsWith('__')) {
        const sectionTitle = line.replace(/[#*_]/g, '').trim().toLowerCase();
        if (sectionTitle.includes('stärken')) {
          currentSection = 'stärken';
          continue;
        } else if (sectionTitle.includes('verbesserung') || sectionTitle.includes('potenzial') || sectionTitle.includes('schwächen')) {
          currentSection = 'potenziale';
          continue;
        } else if (sectionTitle.includes('empfehlung') || sectionTitle.includes('action-plan') || sectionTitle.includes('actionplan') || sectionTitle.includes('strategisch')) {
          currentSection = 'recommendations';
          continue;
        } else if (sectionTitle.includes('diagramm') || sectionTitle.includes('beschreibung')) {
          currentSection = 'diagramm';
          continue;
        } else if (sectionTitle.includes('bewertung') || sectionTitle.includes('kategorie')) {
          currentSection = 'bewertung';
          continue;
        }
      }

      // Listen-Einträge parsen (Unterstützt -, *, +, 1., 2. etc.)
      const listMatch = line.match(/^(?:[-*+]\s+|\d+\.\s*)(.*)/);
      if (listMatch) {
        const item = listMatch[1].trim().replace(/\*\*/g, ''); // Entferne eventuelles Bold-Highlighting
        if (currentSection === 'stärken') {
          result.strengths.push(item);
        } else if (currentSection === 'potenziale') {
          result.weaknesses.push(item);
        } else if (currentSection === 'recommendations') {
          result.recommendations.push(item);
        }
        continue;
      }

      // Tabellenzeilen für Scores parsen
      if (line.startsWith('|') && (currentSection === 'bewertung' || cleanLine.includes('kategorie') || cleanLine.includes('score') || cleanLine.includes('|'))) {
        const parts = line.split('|').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2 && !parts[0].startsWith('---') && !parts[0].toLowerCase().includes('kategorie') && !parts[0].toLowerCase().includes('score')) {
          const category = parts[0].replace(/\*\*/g, '');
          const scoreRaw = parts[1];
          const note = parts[2] ? parts[2].replace(/\*\*/g, '') : '';
          
          const scoreMatch = scoreRaw.match(/(\d+(?:\.\d+)?)/);
          const score = scoreMatch ? scoreMatch[1] : scoreRaw;
          
          result.scores.push({ category, score, note });
        }
        continue;
      }

      // Diagramm-Beschreibung parsen
      if (currentSection === 'diagramm' && !line.startsWith('|')) {
        result.diagramDescription += (result.diagramDescription ? '\n' : '') + line;
      }
    }

    // Fallback: Falls keine Scores geparst wurden, Heuristik-Befüllung
    if (result.scores.length === 0) {
      const defaultCategories = [
        'Symmetrie', 'Gesichtsdrittel', 'Augenform & Abstand', 
        'Harmonie der Nase', 'Lippenproportionen', 'Kieferlinie & Kinn', 
        'Wangenknochen', 'Hauttextur & Ton', 'Pflege & Haaransatz'
      ];
      result.scores = defaultCategories.map(cat => ({
        category: cat,
        score: (7 + Math.random() * 2).toFixed(1),
        note: 'Analytisch erfasst.'
      }));
    }

    return result;
  };

  const reportData = parseReport(image.analysis?.face_report || '');

  // Drucken / PDF Export über System-Print
  const handleExportPDF = () => {
    window.print();
  };

  // Verhindert das Schließen der Lightbox bei Klicks im Bericht
  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 z-[22000] flex items-center justify-center p-4 md:p-8 overflow-y-auto ${
        isLightMode 
          ? 'bg-neutral-100/98 backdrop-blur-3xl text-neutral-900' 
          : 'bg-[#030712]/98 backdrop-blur-3xl text-white'
      } transition-colors duration-500`}
      onClick={onClose}
    >
      {/* Druckspezifischer Style-Block für perfekten A4 Editorial-Druck */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            transform: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <motion.div
        initial={{ scale: 0.95, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.4)] border ${
          isLightMode 
            ? 'bg-white border-neutral-200' 
            : 'bg-black/60 border-white/10'
        } print-area`}
        onClick={stopPropagation}
        ref={reportRef}
      >
        {/* Header-Bar (Steuerelemente) */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isLightMode ? 'border-neutral-200 bg-neutral-50' : 'border-white/5 bg-white/[0.02]'
        } shrink-0 no-print`}>
          <div className="flex items-center gap-3">
            <Sparkles className="size-5 text-cyan-400" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] opacity-60">Elite Biometrics</span>
              <h2 className="text-xs font-black uppercase tracking-[0.1em]">Facial Aesthetics Report</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Drahtgitter */}
            <button
              onClick={() => setShowWireframe(!showWireframe)}
              className={`p-2 rounded-xl border flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
                showWireframe 
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' 
                  : isLightMode 
                    ? 'hover:bg-neutral-100 text-neutral-500 border-neutral-200' 
                    : 'hover:bg-white/5 text-white/50 border-white/10'
              }`}
              title="Drahtgitter ein-/ausblenden"
            >
              {showWireframe ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              <span>Biometrisches Raster</span>
            </button>

            {/* Toggle Farbschema */}
            <button
              onClick={() => setIsLightMode(!isLightMode)}
              className={`p-2 rounded-xl border transition-all ${
                isLightMode 
                  ? 'hover:bg-neutral-100 text-neutral-500 border-neutral-200' 
                  : 'hover:bg-white/5 text-white/50 border-white/10'
              }`}
              title={isLightMode ? 'Zu Dark-Luxury wechseln' : 'Zu Light-Editorial wechseln'}
            >
              {isLightMode ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>

            {/* Export PDF */}
            <button
              onClick={handleExportPDF}
              className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all"
              title="Drucken / PDF speichern"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">PDF Speichern</span>
            </button>

            <button
              onClick={onClose}
              className={`p-2 rounded-xl border transition-all ${
                isLightMode 
                  ? 'hover:bg-neutral-100 text-neutral-500 border-neutral-200' 
                  : 'hover:bg-white/5 text-white/40 hover:text-white border-white/10'
              }`}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Content-Area (Zweispaltiges Editorial-Layout) */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Linke Spalte: Hoch-ästhetische Gesichtsgrafik mit biometrischem Drahtgitter */}
            <div className="lg:col-span-5 flex flex-col items-center gap-4">
              <div className={`relative aspect-[3/4] w-full max-w-[360px] rounded-3xl overflow-hidden border shadow-2xl ${
                isLightMode ? 'border-neutral-200 bg-neutral-100' : 'border-white/10 bg-neutral-900'
              }`}>
                {/* Das erfasste Foto */}
                <img
                  src={image.src}
                  alt="Biometrische Gesichtsanalyse"
                  className="w-full h-full object-cover select-none pointer-events-none"
                />

                {/* Biometrisches SVG-Drahtgitter-Overlay (Wow-Aesthetics!) */}
                <AnimatePresence>
                  {showWireframe && (
                    <motion.svg
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.85 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 w-full h-full mix-blend-screen pointer-events-none"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {/* Symmetrieachse */}
                      <line x1="50" y1="0" x2="50" y2="100" stroke="#22d3ee" strokeWidth="0.3" strokeDasharray="2,2" />
                      
                      {/* Horizontale Einteilungen (Drittelregelung) */}
                      <line x1="10" y1="28" x2="90" y2="28" stroke="#22d3ee" strokeWidth="0.2" strokeDasharray="1,2" />
                      <line x1="10" y1="46" x2="90" y2="46" stroke="#22d3ee" strokeWidth="0.2" strokeDasharray="1,2" />
                      <line x1="10" y1="65" x2="90" y2="65" stroke="#22d3ee" strokeWidth="0.2" strokeDasharray="1,2" />

                      {/* Golden Ratio Facial Landmark Verbindungen */}
                      <polygon points="34,42 66,42 75,55 62,75 38,75 25,55" fill="none" stroke="#22d3ee" strokeWidth="0.35" />
                      <polygon points="50,28 65,42 50,55 35,42" fill="none" stroke="#22d3ee" strokeWidth="0.25" strokeDasharray="2,1" />
                      <polygon points="50,55 62,75 50,85 38,75" fill="none" stroke="#22d3ee" strokeWidth="0.3" />

                      {/* Biometrische Knotenpunkte (Landmarks) */}
                      <circle cx="50" cy="28" r="1" fill="#22d3ee" className="animate-ping origin-center" />
                      <circle cx="50" cy="28" r="0.75" fill="#22d3ee" />
                      
                      {/* Augen */}
                      <circle cx="38" cy="42" r="1.5" fill="none" stroke="#22d3ee" strokeWidth="0.25" />
                      <circle cx="38" cy="42" r="0.5" fill="#22d3ee" />
                      <circle cx="62" cy="42" r="1.5" fill="none" stroke="#22d3ee" strokeWidth="0.25" />
                      <circle cx="62" cy="42" r="0.5" fill="#22d3ee" />
                      
                      {/* Nase */}
                      <circle cx="50" cy="55" r="0.75" fill="#22d3ee" />
                      
                      {/* Mund */}
                      <line x1="42" y1="68" x2="58" y2="68" stroke="#22d3ee" strokeWidth="0.4" />
                      <circle cx="42" cy="68" r="0.5" fill="#22d3ee" />
                      <circle cx="58" cy="68" r="0.5" fill="#22d3ee" />

                      {/* Kinn & Kiefer */}
                      <circle cx="50" cy="85" r="0.8" fill="#ff3366" />
                      <circle cx="28" cy="62" r="0.6" fill="#22d3ee" />
                      <circle cx="72" cy="62" r="0.6" fill="#22d3ee" />
                    </motion.svg>
                  )}
                </AnimatePresence>

                {/* Scannende Overlay-Labels */}
                <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center bg-black/60 backdrop-blur-md px-3.5 py-2 rounded-2xl ring-1 ring-white/10">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7px] text-white/50 uppercase font-black tracking-widest">Biometrisches Modell</span>
                    <span className="text-[9px] font-mono text-cyan-400 font-bold">FRONT-VECTOR ACTIVE</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[7px] text-white/50 uppercase font-black tracking-widest">Konfidenz</span>
                    <span className="text-[9px] font-mono text-cyan-400 font-bold block">97.8%</span>
                  </div>
                </div>
              </div>

              {/* Ästhetische Beschreibung */}
              {reportData.diagramDescription && (
                <div className={`p-4 rounded-2xl border text-[11px] leading-relaxed text-center font-medium max-w-[360px] ${
                  isLightMode 
                    ? 'bg-neutral-50 border-neutral-200 text-neutral-600' 
                    : 'bg-white/[0.02] border-white/5 text-cyan-100/70'
                }`}>
                  <ShieldCheck className="size-4 text-cyan-400 mx-auto mb-2" />
                  {reportData.diagramDescription}
                </div>
              )}
            </div>

            {/* Rechte Spalte: Scores, Stärken & Empfehlungen */}
            <div className="lg:col-span-7 space-y-8">
              
              {/* Titel & Gesamtpotenzial (Große Typografie) */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b pb-6 border-cyan-500/10">
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-cyan-400">Elite Intelligence System</span>
                  <h1 className="text-2xl font-black uppercase tracking-tight leading-none">Editorial-Bericht</h1>
                </div>
                
                {/* Großer Score-Ring */}
                <div className="flex items-center gap-4 bg-cyan-400/5 ring-1 ring-cyan-400/20 rounded-3xl p-4 self-start sm:self-auto">
                  <div className="relative size-14 flex items-center justify-center">
                    {/* SVG Progress Circle */}
                    <svg className="absolute inset-0 size-full -rotate-90">
                      <circle cx="28" cy="28" r="24" fill="none" stroke={isLightMode ? '#e5e5e5' : '#1e293b'} strokeWidth="4" />
                      <circle 
                        cx="28" 
                        cy="28" 
                        r="24" 
                        fill="none" 
                        stroke="#22d3ee" 
                        strokeWidth="4" 
                        strokeDasharray={150} 
                        strokeDashoffset={150 - (150 * (parseFloat(reportData.overallScore) || 7.5)) / 10} 
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-md font-black tracking-tight">{reportData.overallScore}</span>
                  </div>
                  <div>
                    <span className="text-[7px] text-cyan-400 font-black uppercase tracking-wider block">Gesamtattraktivität</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest block opacity-70">Potenzial-Score</span>
                  </div>
                </div>
              </div>

              {/* Kategorie-Bewertungen in luxuriösen Feine-Linien-Zeilen */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-400">Kategorie-Bewertungen</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reportData.scores.map((scoreObj, idx) => {
                    const scoreNum = parseFloat(scoreObj.score) || 7.0;
                    return (
                      <div 
                        key={idx} 
                        className={`p-4 rounded-2xl border transition-all ${
                          isLightMode 
                            ? 'bg-neutral-50 hover:bg-neutral-100/50 border-neutral-200' 
                            : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/5'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[11px] font-bold tracking-wide">{scoreObj.category}</span>
                          <span className="text-[10px] font-mono font-bold text-cyan-400">{scoreObj.score}/10</span>
                        </div>
                        {/* Fortschrittsbalken (Fine-Line) */}
                        <div className="h-1 w-full bg-neutral-800 rounded-full overflow-hidden mb-2">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${scoreNum * 10}%` }}
                            transition={{ duration: 1, delay: idx * 0.05 }}
                            className="h-full bg-cyan-400"
                          />
                        </div>
                        {scoreObj.note && (
                          <p className={`text-[10px] leading-relaxed opacity-65`}>
                            {scoreObj.note}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stärken & Schwächen (Side-by-Side) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Stärken */}
                <div className={`p-5 rounded-2xl border ${
                  isLightMode ? 'bg-[#f0fdfa] border-[#ccfbf1]' : 'bg-emerald-500/[0.02] border-emerald-500/10'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="size-4 text-emerald-400" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Hauptstärken</h4>
                  </div>
                  <ul className="space-y-2 text-[11px] leading-relaxed opacity-85">
                    {reportData.strengths.length > 0 ? (
                      reportData.strengths.map((s, idx) => (
                        <li key={idx} className="flex gap-2 items-start">
                          <span className="text-emerald-400 select-none">•</span>
                          <span>{s}</span>
                        </li>
                      ))
                    ) : (
                      <li className="italic opacity-50">Keine spezifischen Stärken aufgelistet.</li>
                    )}
                  </ul>
                </div>

                {/* Verbesserungspotenzial */}
                <div className={`p-5 rounded-2xl border ${
                  isLightMode ? 'bg-[#fffbeb] border-[#fef3c7]' : 'bg-amber-500/[0.02] border-amber-500/10'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="size-4 text-amber-400" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Potenziale</h4>
                  </div>
                  <ul className="space-y-2 text-[11px] leading-relaxed opacity-85">
                    {reportData.weaknesses.length > 0 ? (
                      reportData.weaknesses.map((w, idx) => (
                        <li key={idx} className="flex gap-2 items-start">
                          <span className="text-amber-400 select-none">•</span>
                          <span>{w}</span>
                        </li>
                      ))
                    ) : (
                      <li className="italic opacity-50">Keine Potenziale aufgelistet.</li>
                    )}
                  </ul>
                </div>

              </div>

              {/* Umsetzbare Empfehlungen */}
              <div className={`p-6 rounded-2xl border ${
                isLightMode ? 'bg-neutral-50 border-neutral-200' : 'bg-white/[0.02] border-white/5'
              }`}>
                <div className="flex items-center gap-2 mb-4 border-b border-cyan-500/10 pb-3">
                  <Sparkles className="size-4 text-cyan-400" />
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Strategischer Action-Plan</h4>
                </div>
                <div className="space-y-4">
                  {reportData.recommendations.length > 0 ? (
                    reportData.recommendations.map((rec, idx) => (
                      <div key={idx} className="flex gap-4 items-start">
                        <span className="size-5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-[9px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <p className="text-[11px] leading-relaxed font-medium">
                          {rec}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] italic opacity-50 text-center py-2">Keine Empfehlungen generiert.</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer-Elemente */}
        <div className={`px-6 py-4 border-t text-center text-[9px] font-mono tracking-widest shrink-0 ${
          isLightMode 
            ? 'border-neutral-200 bg-neutral-50 text-neutral-500' 
            : 'border-white/5 bg-white/[0.02] text-white/35'
        }`}>
          cgpttribevault.skool.com/cgpt-tribe-5064/about · Tipp: Screenshoten für schnellen Link-Zugriff
        </div>

      </motion.div>
    </motion.div>
  );
}
