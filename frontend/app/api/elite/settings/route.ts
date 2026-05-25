import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { loadEliteEnvFiles } from '@/lib/elite-env';

const execPromise = util.promisify(exec);

/**
 * Hilfsfunktion für MSIX-kompatible Pfade (AppData statt Program Files)
 */
const getWritablePath = (relPath: string) => {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (!base) {
    // Fallback für Entwicklungsumgebung
    return path.join(process.cwd(), '..', relPath);
  }
  return path.join(base, 'EliteDesktopAgent', relPath);
};

/**
 * Versucht den lokalen LiveKit Docker-Container vollautomatisch zu starten
 */
async function localLivekitReachable(): Promise<boolean> {
  try {
    const resp = await fetch('http://127.0.0.1:7880', { signal: AbortSignal.timeout(2000) });
    return resp.status > 0;
  } catch {
    return false;
  }
}

async function startLocalLivekit() {
  console.log('[LiveKit-Autostart] Starte lokalen LiveKit-Server-Check...');
  try {
    const { stdout: running } = await execPromise(
      'docker ps --filter "name=livekit-server" --filter "status=running" --format "{{.Names}}"',
    );
    if (running.includes('livekit-server') && (await localLivekitReachable())) {
      return { status: 'running', message: 'LiveKit läuft bereits auf Port 7880.' };
    }

    const { stdout: psAllOut } = await execPromise(
      'docker ps -a --filter "name=livekit-server" --format "{{.Names}}"',
    );

    if (psAllOut.includes('livekit-server')) {
      console.log('[LiveKit-Autostart] Starte vorhandenen Container…');
      await execPromise('docker start livekit-server');
      if (await localLivekitReachable()) {
        return { status: 'started', message: 'LiveKit-Container gestartet (Port 7880).' };
      }
      console.log('[LiveKit-Autostart] Container antwortet nicht – neu erstellen…');
      await execPromise('docker rm -f livekit-server');
    }

    console.log('[LiveKit-Autostart] Erstelle livekit-server Container…');
    await execPromise(
      'docker run -d --name livekit-server -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev --bind 0.0.0.0',
    );
    return { status: 'created', message: 'Docker-Container livekit-server erstellt & gestartet (Port 7880).' };
  } catch (error: any) {
    const errorMsg = error.message || '';
    console.error('[LiveKit-Autostart] Fehler bei Docker-Operation:', errorMsg);

    // 3. Wenn Docker nicht läuft oder nicht gestartet ist
    if (errorMsg.includes('error during connect') || errorMsg.includes('docker: command not found') || errorMsg.includes('not recognized')) {
      console.log('[LiveKit-Autostart] Docker-Dienst läuft nicht. Versuche Docker Desktop zu starten...');
      const dockerPaths = [
        'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Docker', 'Docker Desktop.exe'),
      ];
      const dockerDesktopPath = dockerPaths.find((p) => fs.existsSync(p));
      if (dockerDesktopPath) {
        exec(`powershell -NoProfile -Command "Start-Process '${dockerDesktopPath.replace(/'/g, "''")}'"`);
        for (let i = 0; i < 36; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            await execPromise('docker info', { timeout: 8000 });
            await execPromise(
              'docker run -d --name livekit-server -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev --bind 0.0.0.0',
            );
            return { status: 'created', message: 'Docker & LiveKit nach Autostart bereit.' };
          } catch {
            /* weiter warten */
          }
        }
        return {
          status: 'launching_docker',
          error: 'Docker Desktop wurde gestartet, ist aber noch nicht bereit. Bitte 1–2 Min. warten und erneut versuchen.',
        };
      }
      return { 
        status: 'no_docker', 
        error: 'Docker Desktop ist nicht gestartet oder nicht installiert. Bitte starte Docker manuell!' 
      };
    }

    return { status: 'error', error: 'Fehler beim Starten von Docker. Bitte stelle sicher, dass Docker Desktop aktiv ist.' };
  }
}

export async function GET() {
  try {
    const configPath = getWritablePath('backend/config.json');
    
    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ hudAesthetics: 0 });
    }

    const fileContents = fs.readFileSync(configPath, 'utf8');
    const data = JSON.parse(fileContents);

    let ollamaReachable = false;
    try {
      const base = String(data.ollamaBaseUrl || 'http://127.0.0.1:11434/v1').replace(/\/v1\/?$/, '');
      const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
      ollamaReachable = r.ok;
    } catch {
      ollamaReachable = false;
    }

    const fileEnv = loadEliteEnvFiles();
    const hasOpenAiKey = Boolean(
      (process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY || '').trim(),
    );

    return NextResponse.json({ ...data, ollamaReachable, hasOpenAiKey });
  } catch (error) {
    console.error('Error reading settings:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const newSettings = await request.json();
    const configPath = getWritablePath('backend/config.json');

    // Sicherstellen, dass Verzeichnis existiert
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let currentSettings = {};
    if (fs.existsSync(configPath)) {
      currentSettings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    const updatedSettings = { ...currentSettings, ...newSettings };
    fs.writeFileSync(configPath, JSON.stringify(updatedSettings, null, 2));

    // Wenn auf lokalen Server gewechselt wird, automatisch versuchen diesen im Hintergrund zu starten
    let dockerStatus = null;
    if (newSettings.livekitMode === 'local') {
      dockerStatus = await startLocalLivekit();
    }

    return NextResponse.json({ success: true, settings: updatedSettings, dockerStatus });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
