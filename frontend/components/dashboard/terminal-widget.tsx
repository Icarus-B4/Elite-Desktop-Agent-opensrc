'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWidgetManager } from './widget-manager';
import { 
  X, Plus, Terminal as TermIcon, Columns, Rows,
  ChevronDown, RefreshCw, AlertCircle, PanelLeftClose, PanelLeft,
} from 'lucide-react';
import { TerminalFileExplorer } from './terminal-file-explorer';
import { buildTerminalInsert, ELITE_FILE_DRAG_TYPE, toWslPath } from '@/lib/terminal-paths';
import { GridBackground } from '@/components/grid-background';

type ShellOption = {
  id: string;
  name: string;
  shell?: string;
  distro?: string;
  hermes?: boolean;
};

// Shell-Optionen
const SHELL_OPTIONS: ShellOption[] = [
  { id: 'powershell', name: 'PowerShell' },
  { id: 'cmd', name: 'CMD' },
  { id: 'wsl-hermes', name: 'Hermes (WSL)', shell: 'wsl', hermes: true },
  { id: 'wsl-ubuntu', name: 'WSL (Ubuntu)', shell: 'wsl', distro: 'Ubuntu' },
  { id: 'wsl-debian', name: 'WSL (Debian)', shell: 'wsl', distro: 'Debian' },
];

function buildHermesLaunchCommand(projectPath: string): string {
  const dir = projectPath ? toWslPath(projectPath) : '.';
  return `cd '${dir.replace(/'/g, "'\\''")}' && export PATH="$HOME/.local/bin:$HOME/.hermes/node/bin:$PATH" && exec hermes`;
}

interface Panel {
  id: string;
  shell: string;
  distro?: string;
  hermes?: boolean;
  cols: number;
  rows: number;
}

interface Tab {
  id: string;
  name: string;
  active: boolean;
  panels: Panel[];
  layout: 'single' | 'horizontal' | 'vertical'; // Split-Layout-Typ
}

export function TerminalWidget() {
  const { closeWidget } = useWidgetManager();
  const [isPopout, setIsPopout] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: 'tab-1',
      name: 'PowerShell',
      active: true,
      panels: [{ id: 'panel-1', shell: 'powershell', cols: 80, rows: 24 }],
      layout: 'single',
    }
  ]);
  const [showShellDropdown, setShowShellDropdown] = useState(false);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const [shellMenuPos, setShellMenuPos] = useState({ top: 0, left: 0 });
  const [projectPath, setProjectPath] = useState<string>('');
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const terminalWritersRef = useRef<Map<string, (text: string) => void>>(new Map());
  const [dropTargetPanelId, setDropTargetPanelId] = useState<string | null>(null);

  // Erst nach Mount: localStorage + Pop-out (verhindert Hydration-Mismatch mit Explorer-SVGs)
  useEffect(() => {
    setIsPopout(window.location.pathname.includes('/widget/'));
    setExplorerOpen(localStorage.getItem('elite-terminal-explorer-open') !== 'false');
    setHydrated(true);
  }, []);

  // Projektpfad vom Next.js Backend laden
  useEffect(() => {
    fetch('/api/elite/terminal')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.projectPath) {
          setProjectPath(data.projectPath);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem('elite-terminal-explorer-open', explorerOpen ? 'true' : 'false');
  }, [explorerOpen]);

  const activeTab = tabs.find(t => t.active) || tabs[0];

  const registerTerminalWriter = useCallback((panelId: string, write: ((text: string) => void) | null) => {
    if (write) terminalWritersRef.current.set(panelId, write);
    else terminalWritersRef.current.delete(panelId);
  }, []);

  const insertPathIntoTerminal = useCallback(
    (relativePath: string, isDirectory: boolean, panelId?: string) => {
      const targetId = panelId ?? activeTab.panels[0]?.id;
      const panel = activeTab.panels.find((p) => p.id === targetId) ?? activeTab.panels[0];
      const writer = targetId ? terminalWritersRef.current.get(targetId) : undefined;
      if (!panel || !writer || !projectPath) return;
      const text = buildTerminalInsert(
        projectPath,
        relativePath,
        isDirectory,
        panel.shell,
        panel.distro,
        panel.hermes,
      );
      writer(text);
    },
    [activeTab, projectPath],
  );

  const projectLabel = projectPath
    ? projectPath.split(/[/\\]/).filter(Boolean).pop() || 'Projekt'
    : 'Elite-Desktop-Agent';

  const handleAddTab = (
    shellType: string,
    distroName?: string,
    name?: string,
    hermes?: boolean,
  ) => {
    setShowShellDropdown(false);
    const id = `tab-${Date.now()}`;
    const panelId = `panel-${Date.now()}`;

    setTabs((prev) => {
      const deactivated = prev.map((t) => ({ ...t, active: false }));
      return [
        ...deactivated,
        {
          id,
          name:
            name ||
            (hermes
              ? 'Hermes'
              : distroName
                ? `WSL (${distroName})`
                : shellType === 'powershell'
                  ? 'PowerShell'
                  : 'CMD'),
          active: true,
          panels: [
            {
              id: panelId,
              shell: shellType,
              distro: distroName,
              hermes,
              cols: 80,
              rows: 24,
            },
          ],
          layout: 'single',
        },
      ];
    });
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // Behalte mindestens einen Tab

    setTabs(prev => {
      const index = prev.findIndex(t => t.id === tabId);
      const filtered = prev.filter(t => t.id !== tabId);
      
      // Falls der geschlossene Tab aktiv war, setze einen anderen aktiv
      if (prev[index].active) {
        const nextActiveIndex = index === 0 ? 0 : index - 1;
        filtered[nextActiveIndex].active = true;
      }
      return filtered;
    });
  };

  const handleSwitchTab = (tabId: string) => {
    setTabs(prev => prev.map(t => ({
      ...t,
      active: t.id === tabId
    })));
  };

  const handleSplit = (direction: 'horizontal' | 'vertical') => {
    if (!activeTab || activeTab.panels.length >= 4) return; // Max 4 Panels

    const newPanelId = `panel-${Date.now()}`;
    const basePanel = activeTab.panels[0];

    setTabs(prev => prev.map(t => {
      if (t.id !== activeTab.id) return t;
      return {
        ...t,
        layout: direction,
        panels: [
          ...t.panels,
          {
            id: newPanelId,
            shell: basePanel.shell,
            distro: basePanel.distro,
            hermes: basePanel.hermes,
            cols: 80,
            rows: 24,
          }
        ]
      };
    }));
  };

  const glass = isPopout;

  if (!hydrated) {
    return (
      <div
        className={`relative flex flex-col w-full overflow-hidden ${
          glass ? 'h-full flex-1 rounded-[32px]' : 'h-[500px] rounded-2xl'
        } ${glass ? 'elite-hud-window-surface' : ''}`}
        aria-hidden
      >
        {glass && <GridBackground />}
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col w-full overflow-hidden text-white font-sans ${
        glass
          ? 'elite-terminal-glass elite-hud-window-surface h-full flex-1 rounded-[32px] isolation-isolate'
          : 'h-[500px] rounded-2xl bg-[#000d1a]/95 border border-cyan-500/20 shadow-[0_0_30px_rgba(0,242,255,0.15)]'
      }`}
    >
      {glass && <GridBackground />}
      <div className={`flex flex-col flex-1 min-h-0 w-full ${glass ? 'relative z-10' : ''}`}>
      {/* Header / Tabs — z-20 damit xterm-Layer nicht durchscheint */}
      <div
        className={`relative z-20 shrink-0 flex items-center justify-between px-4 py-2 select-none ${
          glass ? 'hud-widget-header border-b border-white/5' : 'bg-black/60 border-b border-white/5'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-[78%]">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => handleSwitchTab(tab.id)}
                className={`group flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                  tab.active
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    : 'bg-transparent text-white/40 border-transparent hover:text-white/70 hover:bg-white/5'
                }`}
              >
                <TermIcon size={12} className={tab.active ? 'text-cyan-400' : 'text-white/35'} />
                <span>{tab.name}</span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded transition-all"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Plus außerhalb des Scroll-Bereichs (verhindert weißen Scroll-Gutter) */}
          <div className="relative shrink-0">
            <button
              ref={plusButtonRef}
              type="button"
              onClick={() => {
                const rect = plusButtonRef.current?.getBoundingClientRect();
                if (rect) {
                  setShellMenuPos({ top: rect.bottom + 6, left: rect.left });
                }
                setShowShellDropdown((v) => !v);
              }}
              title="Neuer Tab (PowerShell, WSL, Hermes…)"
              className="flex items-center justify-center size-7 rounded-lg border border-white/10 text-white/40 hover:text-cyan-400 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/40"
            >
              <Plus size={14} />
            </button>

            {showShellDropdown && (
              <>
                <div
                  className="fixed inset-0 z-[200]"
                  onClick={() => setShowShellDropdown(false)}
                />
                <div
                  className="fixed z-[201] w-48 rounded-xl bg-[#0a0f18]/95 backdrop-blur-xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.85)] py-1.5"
                  style={{ top: shellMenuPos.top, left: shellMenuPos.left }}
                >
                  {SHELL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        handleAddTab(
                          opt.shell || opt.id,
                          opt.distro,
                          opt.name,
                          opt.hermes,
                        )
                      }
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors uppercase tracking-wider ${
                        opt.hermes
                          ? 'text-violet-300 hover:text-violet-200 hover:bg-violet-500/15'
                          : 'text-white/70 hover:text-cyan-400 hover:bg-cyan-500/10'
                      }`}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Layout-Steuerung & Close */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExplorerOpen((v) => !v)}
            title={explorerOpen ? 'Explorer ausblenden' : 'Explorer einblenden'}
            className={`flex items-center justify-center size-7 rounded-lg transition-all ${
              explorerOpen
                ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/25'
                : 'text-white/40 hover:text-cyan-400 hover:bg-white/5'
            }`}
          >
            {explorerOpen ? <PanelLeftClose size={13} /> : <PanelLeft size={13} />}
          </button>
          {activeTab.panels.length < 4 && (
            <>
              <button
                onClick={() => handleSplit('horizontal')}
                title="Horizontal teilen"
                className="flex items-center justify-center size-7 rounded-lg text-white/40 hover:text-cyan-400 hover:bg-white/5 transition-all"
              >
                <Columns size={13} />
              </button>
              <button
                onClick={() => handleSplit('vertical')}
                title="Vertikal teilen"
                className="flex items-center justify-center size-7 rounded-lg text-white/40 hover:text-cyan-400 hover:bg-white/5 transition-all"
              >
                <Rows size={13} />
              </button>
            </>
          )}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            onClick={() => closeWidget('terminal')}
            className="flex items-center justify-center size-7 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Explorer + Terminal Panels */}
      <div className={`relative z-0 flex-1 min-h-0 flex ${glass ? 'bg-transparent' : 'bg-[#000d1a]/95'}`}>
        {explorerOpen && (
          <TerminalFileExplorer
            projectRootLabel={projectLabel}
            glass={glass}
            onInsertToTerminal={insertPathIntoTerminal}
          />
        )}
        <div className="flex-1 min-w-0 min-h-0 relative p-1.5">
          <div className={`w-full h-full grid gap-1.5 ${
            activeTab.layout === 'single' ? 'grid-cols-1 grid-rows-1' :
            activeTab.layout === 'horizontal' ? 'grid-cols-2 grid-rows-1' :
            'grid-cols-1 grid-rows-2'
          }`}>
            {activeTab.panels.map((panel) => (
                <XtermPanel
                  key={panel.id}
                  panel={panel}
                  projectPath={projectPath}
                  isPopout={glass}
                  isDropTarget={dropTargetPanelId === panel.id}
                  onRegisterWriter={registerTerminalWriter}
                  onDragHover={setDropTargetPanelId}
                  onPathDrop={(rel, isDir) => insertPathIntoTerminal(rel, isDir, panel.id)}
                  onClosePanel={
                    activeTab.panels.length > 1
                      ? () => {
                          setTabs((prev) =>
                            prev.map((t) => {
                              if (t.id !== activeTab.id) return t;
                              const nextPanels = t.panels.filter((p) => p.id !== panel.id);
                              return {
                                ...t,
                                layout: nextPanels.length === 1 ? 'single' : t.layout,
                                panels: nextPanels,
                              };
                            }),
                          );
                        }
                      : undefined
                  }
                />
              ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

interface XtermPanelProps {
  panel: Panel;
  projectPath: string;
  isPopout: boolean;
  isDropTarget?: boolean;
  onRegisterWriter: (panelId: string, write: ((text: string) => void) | null) => void;
  onDragHover: (panelId: string | null) => void;
  onPathDrop: (relativePath: string, isDirectory: boolean) => void;
  onClosePanel?: () => void;
}

function XtermPanel({
  panel,
  projectPath,
  isPopout,
  isDropTarget,
  onRegisterWriter,
  onDragHover,
  onPathDrop,
  onClosePanel,
}: XtermPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    let active = true;
    let term: any = null;
    let ws: WebSocket | null = null;
    let fitAddon: any = null;

    const initTerminal = async () => {
      // xterm.js dynamisch importieren (nur auf Client)
      const { Terminal } = await import('@xterm/xterm');
      const { WebglAddon } = await import('@xterm/addon-webgl');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { SearchAddon } = await import('@xterm/addon-search');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');

      if (!active || !containerRef.current) return;

      const termBg = isPopout ? 'rgba(0, 11, 26, 0)' : '#000d1a';

      // Terminal konfigurieren mit Neon-Cyan HUD Theme
      term = new Terminal({
        cols: panel.cols,
        rows: panel.rows,
        cursorBlink: true,
        cursorStyle: 'underline',
        fontSize: 12,
        fontFamily: 'Consolas, "Fira Code", Monaco, monospace',
        allowTransparency: isPopout,
        theme: {
          background: termBg,
          foreground: '#ffffff',
          cursor: '#00f2ff',
          cursorAccent: isPopout ? '#000b1a' : '#000d1a',
          selectionBackground: 'rgba(0, 242, 255, 0.3)',
          black: '#000000',
          red: '#ff5555',
          green: '#50fa7b',
          yellow: '#f1fa8c',
          blue: '#bd93f9',
          magenta: '#ff79c6',
          cyan: '#8be9fd',
          white: '#bfbfbf',
          brightBlack: '#4d4d4d',
          brightRed: '#ff6e67',
          brightGreen: '#5af78e',
          brightYellow: '#f4f99d',
          brightBlue: '#caa9fa',
          brightMagenta: '#ff92d0',
          brightCyan: '#9aedfe',
          brightWhite: '#e6e6e6',
        },
        allowProposedApi: true
      });

      terminalRef.current = term;

      // Addons laden
      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new SearchAddon());
      term.loadAddon(new WebLinksAddon());

      // Terminal rendern
      term.open(containerRef.current);
      fitAddon.fit();

      // WebGL blockiert echte Transparenz — im Pop-out Canvas-Renderer nutzen
      if (!isPopout) {
        try {
          const webgl = new WebglAddon();
          term.loadAddon(webgl);
          console.log('[PTY Client] WebGL Renderer geladen');
        } catch (err) {
          console.warn('[PTY Client] WebGL Renderer nicht unterstützt, nutze Fallback', err);
        }
      }

      // WebSocket-Verbindung zum Rust PTY-Server aufbauen
      ws = new WebSocket('ws://127.0.0.1:8643');
      wsRef.current = ws;

      const writeToPty = (text: string) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(text);
        }
      };

      ws.onopen = () => {
        if (!active) return;
        setConnecting(false);
        setError(null);
        onRegisterWriter(panel.id, writeToPty);

        // Spawn Befehl senden
        const spawnMsg: Record<string, unknown> = {
          action: 'spawn',
          shell: panel.distro ? 'wsl' : panel.shell,
          distro: panel.distro,
          cwd: projectPath || '.',
          cols: term.cols,
          rows: term.rows,
        };
        if (panel.hermes) {
          spawnMsg.command = buildHermesLaunchCommand(projectPath);
        }
        ws?.send(JSON.stringify(spawnMsg));
      };

      ws.onmessage = (event) => {
        if (!active) return;
        term.write(event.data);
      };

      ws.onerror = () => {
        if (!active) return;
        setError('Keine Verbindung zum PTY-Server. Ist der Server aktiv?');
        setConnecting(false);
      };

      ws.onclose = () => {
        if (!active) return;
        setConnecting(false);
        onRegisterWriter(panel.id, null);
        term.write('\r\n\x1b[31m[PTY SERVER] Verbindung geschlossen\x1b[0m\r\n');
      };

      // Tastatur-Eingaben an WebSocket senden
      term.onData((data: string) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Resize-Event bei Änderungen
      const resizeObserver = new ResizeObserver(() => {
        if (!active) return;
        try {
          fitAddon.fit();
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              action: 'resize',
              cols: term.cols,
              rows: term.rows
            }));
          }
        } catch (e) {}
      });

      resizeObserver.observe(containerRef.current);
    };

    initTerminal();

    return () => {
      active = false;
      onRegisterWriter(panel.id, null);
      if (ws) {
        ws.close();
      }
      if (term) {
        term.dispose();
      }
    };
  }, [panel, projectPath, isPopout, onRegisterWriter]);

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(ELITE_FILE_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    onDragHover(panel.id);
  };

  const handleDrop = (e: React.DragEvent) => {
    const rel = e.dataTransfer.getData(ELITE_FILE_DRAG_TYPE);
    if (!rel) return;
    e.preventDefault();
    onDragHover(null);
    const isDir = e.dataTransfer.getData('application/x-elite-file-is-dir') === '1';
    onPathDrop(rel, isDir);
    containerRef.current?.focus();
  };

  return (
    <div
      className={`relative flex-1 min-w-0 min-h-0 border rounded-xl overflow-hidden group ${
        isPopout
          ? 'elite-terminal-panel bg-transparent border-white/10'
          : 'bg-[#000d1a] border-white/5'
      } ${isDropTarget ? 'ring-2 ring-cyan-400/50 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={() => onDragHover(null)}
      onDrop={handleDrop}
    >
      {/* Terminal Container */}
      <div
        ref={containerRef}
        className={`w-full h-full p-2 xterm-fit-container ${isPopout ? 'elite-terminal-glass' : ''}`}
      />

      {isDropTarget && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-cyan-500/10 border-2 border-dashed border-cyan-400/40 rounded-xl">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/90">
            Pfad einfügen
          </span>
        </div>
      )}

      {/* Verbindungs-Zustände */}
      {connecting && (
        <div
          className={`absolute inset-0 flex items-center justify-center z-10 ${
            isPopout ? 'bg-[#000b1a]/80 backdrop-blur-xl' : 'bg-[#000d1a]/90'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-400 animate-pulse">
            <RefreshCw className="size-4 animate-spin" />
            <span>Verbinde mit PTY...</span>
          </div>
        </div>
      )}

      {error && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center z-10 px-4 text-center ${
            isPopout ? 'bg-[#000b1a]/90 backdrop-blur-xl' : 'bg-[#000d1a]/95'
          }`}
        >
          <AlertCircle className="size-8 text-red-500 mb-2" />
          <p className="text-xs font-bold uppercase tracking-wider text-red-400">{error}</p>
          <p className="text-[10px] text-white/40 mt-1 max-w-xs">
            Starte den Server neu oder überprüfe die Logs.
          </p>
        </div>
      )}

      {/* Close Panel Button */}
      {onClosePanel && (
        <button
          onClick={onClosePanel}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center justify-center size-6 rounded-lg bg-black/60 border border-white/10 text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all z-20"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
