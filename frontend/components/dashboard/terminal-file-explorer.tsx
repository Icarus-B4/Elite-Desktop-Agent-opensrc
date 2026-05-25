'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
  MessageSquarePlus,
  PanelRight,
  RefreshCw,
  Search,
  Trash2,
  Pencil,
  Copy,
  FileCode2,
  Terminal,
} from 'lucide-react';
import { ELITE_FILE_DRAG_TYPE } from '@/lib/terminal-paths';
import {
  type FileEntry,
  fuzzyScore,
  getEntryColor,
  getEntryLabel,
  formatFileSize,
} from '@/lib/file-explorer-utils';
import {
  attachToChat,
  attachToEditor,
  formatFileAttachBlock,
} from '@/lib/elite-attach-events';

type Props = {
  projectRootLabel?: string;
  onClose?: () => void;
  glass?: boolean;
  onInsertToTerminal?: (relativePath: string, isDirectory: boolean) => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  entry: FileEntry;
};

async function fetchList(dirPath: string): Promise<FileEntry[]> {
  const res = await fetch(`/api/elite/files?path=${encodeURIComponent(dirPath)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Liste fehlgeschlagen');
  return data.entries as FileEntry[];
}

async function fetchSearch(q: string): Promise<FileEntry[]> {
  const res = await fetch(`/api/elite/files?action=search&q=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Suche fehlgeschlagen');
  return data.entries as FileEntry[];
}

async function readFileContent(filePath: string): Promise<string | null> {
  const res = await fetch(`/api/elite/files?action=read&path=${encodeURIComponent(filePath)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Lesen fehlgeschlagen');
  if (data.binary) return null;
  return data.content as string;
}

function CatppuccinIcon({ name, isDirectory }: { name: string; isDirectory: boolean }) {
  const color = getEntryColor(name, isDirectory);
  const label = getEntryLabel(name, isDirectory);
  return (
    <span
      className="shrink-0 flex items-center justify-center size-4 rounded text-[7px] font-black leading-none"
      style={{ color, backgroundColor: `${color}18` }}
      aria-hidden
    >
      {label.slice(0, 3)}
    </span>
  );
}

export function TerminalFileExplorer({
  projectRootLabel = 'Elite-Desktop-Agent',
  glass = false,
  onInsertToTerminal,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '.': true });
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(async (dirPath: string) => {
    setLoading((p) => ({ ...p, [dirPath]: true }));
    setError(null);
    try {
      const entries = await fetchList(dirPath);
      setChildren((p) => ({ ...p, [dirPath]: entries }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading((p) => ({ ...p, [dirPath]: false }));
    }
  }, []);

  useEffect(() => {
    void loadDir('.');
  }, [loadDir]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(() => {
      fetchSearch(search.trim())
        .then(setSearchResults)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (renamingPath) renameRef.current?.focus();
  }, [renamingPath]);

  const visibleFlat = useMemo(() => {
    if (searchResults) {
      return searchResults.map((e) => ({ entry: e, depth: 0 }));
    }
    const out: { entry: FileEntry; depth: number }[] = [];
    const walk = (dirPath: string, depth: number) => {
      const list = children[dirPath];
      if (!list) return;
      for (const entry of list) {
        out.push({ entry, depth });
        if (entry.isDirectory && expanded[entry.path]) {
          walk(entry.path, depth + 1);
        }
      }
    };
    walk('.', 0);
    return out;
  }, [children, expanded, searchResults]);

  const filteredFlat = useMemo(() => {
    const q = search.trim();
    if (!q || searchResults) return visibleFlat;
    return visibleFlat.filter(({ entry }) => {
      const s = fuzzyScore(q, entry.path) ?? fuzzyScore(q, entry.name);
      return s != null;
    });
  }, [visibleFlat, search, searchResults]);

  const toggleExpand = useCallback(
    async (entry: FileEntry) => {
      if (!entry.isDirectory) return;
      const isOpen = expanded[entry.path];
      setExpanded((p) => ({ ...p, [entry.path]: !isOpen }));
      if (!isOpen && !children[entry.path]) {
        await loadDir(entry.path);
      }
    },
    [expanded, children, loadDir],
  );

  const refreshAll = useCallback(() => {
    setChildren({});
    setExpanded({ '.': true });
    void loadDir('.');
    for (const dir of Object.keys(expanded)) {
      if (expanded[dir] && dir !== '.') void loadDir(dir);
    }
  }, [expanded, loadDir]);

  const startRename = (entry: FileEntry) => {
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
    setContextMenu(null);
  };

  const commitRename = async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }
    const parent = renamingPath.includes('/')
      ? renamingPath.slice(0, renamingPath.lastIndexOf('/'))
      : '.';
    const newPath = parent === '.' ? renameValue.trim() : `${parent}/${renameValue.trim()}`;
    try {
      await fetch('/api/elite/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', from: renamingPath, to: newPath }),
      });
      setRenamingPath(null);
      refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteEntry = async (entry: FileEntry) => {
    if (!confirm(`${entry.isDirectory ? 'Ordner' : 'Datei'} „${entry.name}" löschen?`)) return;
    setContextMenu(null);
    try {
      await fetch('/api/elite/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', path: entry.path }),
      });
      refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const attachFile = async (entry: FileEntry, target: 'editor' | 'chat' | 'both') => {
    setContextMenu(null);
    if (entry.isDirectory) {
      setError('Ordner können nicht angehängt werden — wähle eine Datei.');
      return;
    }
    try {
      const content = await readFileContent(entry.path);
      if (content == null) {
        const stub = `📎 Datei \`${entry.path}\` (Binärdatei, ${formatFileSize(entry.size) || 'unbekannte Größe'})`;
        if (target === 'editor' || target === 'both') {
          attachToEditor({ path: entry.path, content: stub, label: entry.name });
        }
        if (target === 'chat' || target === 'both') {
          attachToChat({ text: stub, paths: [entry.path] });
        }
        return;
      }
      const block = formatFileAttachBlock(entry.path, content);
      if (target === 'editor' || target === 'both') {
        attachToEditor({ path: entry.path, content: block, label: entry.name });
      }
      if (target === 'chat' || target === 'both') {
        attachToChat({ text: block, paths: [entry.path] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const copyPath = (entry: FileEntry) => {
    void navigator.clipboard.writeText(entry.path);
    setContextMenu(null);
  };

  const createItem = async (kind: 'file' | 'folder', parentPath: string) => {
    const name = kind === 'file' ? 'neu.txt' : 'Neuer Ordner';
    const newPath = parentPath === '.' ? name : `${parentPath}/${name}`;
    try {
      const res = await fetch('/api/elite/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'folder'
            ? { action: 'mkdir', path: newPath }
            : { action: 'touch', path: newPath, content: '' },
        ),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erstellen fehlgeschlagen');
      await loadDir(parentPath);
      setExpanded((p) => ({ ...p, [parentPath]: true }));
      startRename({ name, path: newPath, isDirectory: kind === 'folder' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const moveSelection = (delta: number) => {
    const paths = filteredFlat.map((f) => f.entry.path);
    if (!paths.length) return;
    const idx = selectedPath ? paths.indexOf(selectedPath) : -1;
    const next = Math.max(0, Math.min(paths.length - 1, idx + delta));
    setSelectedPath(paths[next]);
    const el = listRef.current?.querySelector(`[data-path="${paths[next].replace(/"/g, '\\"')}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDownList = (e: React.KeyboardEvent) => {
    if (renamingPath) {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitRename();
      }
      if (e.key === 'Escape') setRenamingPath(null);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'ArrowRight') {
      const entry = filteredFlat.find((f) => f.entry.path === selectedPath)?.entry;
      if (entry?.isDirectory) void toggleExpand(entry);
    } else if (e.key === 'ArrowLeft') {
      const entry = filteredFlat.find((f) => f.entry.path === selectedPath)?.entry;
      if (entry?.isDirectory && expanded[entry.path]) {
        setExpanded((p) => ({ ...p, [entry.path]: false }));
      }
    } else if (e.key === 'Enter' && selectedPath) {
      const entry = filteredFlat.find((f) => f.entry.path === selectedPath)?.entry;
      if (entry) {
        if (entry.isDirectory) void toggleExpand(entry);
        else void attachFile(entry, 'editor');
      }
    } else if (e.key === 'F2' && selectedPath) {
      const entry = filteredFlat.find((f) => f.entry.path === selectedPath)?.entry;
      if (entry) startRename(entry);
    } else if (e.key === 'Delete' && selectedPath) {
      const entry = filteredFlat.find((f) => f.entry.path === selectedPath)?.entry;
      if (entry) void deleteEntry(entry);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchRef.current?.focus();
    }
  };

  return (
    <aside
      className={`flex flex-col h-full w-[220px] shrink-0 border-r border-white/10 text-[11px] select-none ${
        glass ? 'elite-terminal-explorer-surface' : 'bg-[#11111b]/95'
      }`}
      onKeyDown={onKeyDownList}
      tabIndex={0}
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/5 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/50 truncate">
          {projectRootLabel}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Neue Datei"
            onClick={() => createItem('file', '.')}
            className="p-1 rounded text-white/35 hover:text-cyan-400 hover:bg-white/5"
          >
            <FilePlus className="size-3.5" />
          </button>
          <button
            type="button"
            title="Neuer Ordner"
            onClick={() => createItem('folder', '.')}
            className="p-1 rounded text-white/35 hover:text-cyan-400 hover:bg-white/5"
          >
            <FolderPlus className="size-3.5" />
          </button>
          <button
            type="button"
            title="Aktualisieren"
            onClick={refreshAll}
            className="p-1 rounded text-white/35 hover:text-cyan-400 hover:bg-white/5"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="px-2 py-1.5 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] ring-1 ring-white/10 px-2 py-1">
          <Search className="size-3 text-white/30 shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="flex-1 min-w-0 bg-transparent text-white/80 placeholder:text-white/25 focus:outline-none text-[10px]"
          />
        </div>
      </div>

      {error && (
        <p className="px-2 py-1 text-[9px] text-red-400/90 leading-tight">{error}</p>
      )}

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-1">
        {loading['.'] && !children['.'] ? (
          <p className="px-3 py-2 text-white/30 text-[10px]">Lade…</p>
        ) : filteredFlat.length === 0 ? (
          <p className="px-3 py-2 text-white/30 text-[10px]">Keine Treffer</p>
        ) : (
          filteredFlat.map(({ entry, depth }) => {
            const isSelected = selectedPath === entry.path;
            const isRenaming = renamingPath === entry.path;
            const isOpen = entry.isDirectory && expanded[entry.path];
            return (
              <div
                key={entry.path}
                data-path={entry.path}
                className={`flex items-center gap-1 pr-2 py-0.5 cursor-pointer group ${
                  isSelected ? 'bg-cyan-500/15 text-cyan-100' : 'text-white/70 hover:bg-white/[0.04]'
                }`}
                style={{ paddingLeft: 8 + depth * 12 }}
                onClick={() => {
                  setSelectedPath(entry.path);
                  if (entry.isDirectory) void toggleExpand(entry);
                }}
                onDoubleClick={() => {
                  if (!entry.isDirectory) void attachFile(entry, 'editor');
                }}
                draggable={!isRenaming}
                onDragStart={(e) => {
                  e.dataTransfer.setData(ELITE_FILE_DRAG_TYPE, entry.path);
                  e.dataTransfer.setData(
                    'application/x-elite-file-is-dir',
                    entry.isDirectory ? '1' : '0',
                  );
                  e.dataTransfer.setData('text/plain', entry.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelectedPath(entry.path);
                  setContextMenu({ x: e.clientX, y: e.clientY, entry });
                }}
              >
                <span className="shrink-0 w-3 flex justify-center text-white/25">
                  {entry.isDirectory ? (
                    isOpen ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )
                  ) : null}
                </span>
                <CatppuccinIcon name={entry.name} isDirectory={entry.isDirectory} />
                {isRenaming ? (
                  <input
                    ref={renameRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-black/40 border border-cyan-500/40 rounded px-1 text-[10px] text-white focus:outline-none"
                  />
                ) : (
                  <span className="truncate flex-1 font-mono text-[10px]">{entry.name}</span>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="shrink-0 px-2 py-1 text-[8px] text-white/20 border-t border-white/5 leading-relaxed">
        Ziehen → Terminal · ↑↓ · F2 · Rechtsklick
      </p>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[101] min-w-[180px] rounded-xl bg-[#1e1e2e] border border-white/10 shadow-xl py-1 text-[10px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {onInsertToTerminal && (
              <CtxBtn
                icon={Terminal}
                label="In Terminal einfügen"
                onClick={() => {
                  onInsertToTerminal(
                    contextMenu.entry.path,
                    contextMenu.entry.isDirectory,
                  );
                  setContextMenu(null);
                }}
              />
            )}
            {!contextMenu.entry.isDirectory && (
              <>
                <CtxBtn
                  icon={PanelRight}
                  label="An AI-Panel"
                  onClick={() => void attachFile(contextMenu.entry, 'editor')}
                />
                <CtxBtn
                  icon={MessageSquarePlus}
                  label="An Chat"
                  onClick={() => void attachFile(contextMenu.entry, 'chat')}
                />
                <CtxBtn
                  icon={FileCode2}
                  label="An beides"
                  onClick={() => void attachFile(contextMenu.entry, 'both')}
                />
                <div className="my-1 border-t border-white/10" />
              </>
            )}
            {onInsertToTerminal && <div className="my-1 border-t border-white/10" />}
            <CtxBtn icon={Copy} label="Pfad kopieren" onClick={() => copyPath(contextMenu.entry)} />
            <CtxBtn icon={Pencil} label="Umbenennen" onClick={() => startRename(contextMenu.entry)} />
            <CtxBtn
              icon={Trash2}
              label="Löschen"
              danger
              onClick={() => void deleteEntry(contextMenu.entry)}
            />
          </div>
        </>
      )}
    </aside>
  );
}

function CtxBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5 ${
        danger ? 'text-red-400' : 'text-white/80'
      }`}
    >
      <Icon className="size-3.5 shrink-0 opacity-70" />
      {label}
    </button>
  );
}
