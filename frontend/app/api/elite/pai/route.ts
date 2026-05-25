import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Hilfsfunktion zum Bestimmen des Pfads der PAI-Dateien.
 * Unterstützt sowohl den standardmäßigen PAI-Ordner als auch den aktiven .claude/PAI-Daemon-Ordner.
 */
const getPaiPath = (fileName: string, isClaudePai = false) => {
  const home = os.homedir();
  if (isClaudePai) {
    if (fileName === 'TELOS.md' || fileName === 'IDEAL_STATE.md') {
      return path.join(home, '.claude', 'PAI', 'USER', 'TELOS', fileName);
    }
    return path.join(home, '.claude', 'PAI', 'USER', fileName);
  }
  return path.join(home, 'PAI', 'USER', fileName);
};

export async function GET() {
  try {
    // Bevorzugt aus dem aktiven .claude/PAI-Verzeichnis lesen (da dort der Daemon läuft)
    const claudeTelos = getPaiPath('TELOS.md', true);
    const claudeIdealState = getPaiPath('IDEAL_STATE.md', true);
    const claudeSoul = getPaiPath('SOUL.md', true);
    const claudeUser = getPaiPath('USER.md', true);
    const claudeAccessPolicy = getPaiPath('ACCESS_POLICY.md', true);
    const claudeHeartbeat = getPaiPath('HEARTBEAT.md', true);

    const fallbackTelos = getPaiPath('TELOS.md', false);
    const fallbackIdealState = getPaiPath('IDEAL_STATE.md', false);
    const fallbackSoul = getPaiPath('SOUL.md', false);
    const fallbackUser = getPaiPath('USER.md', false);
    const fallbackAccessPolicy = getPaiPath('ACCESS_POLICY.md', false);
    const fallbackHeartbeat = getPaiPath('HEARTBEAT.md', false);

    let telos = '';
    let idealState = '';
    let soul = '';
    let user = '';
    let accessPolicy = '';
    let heartbeat = '';

    // TELOS.md auslesen
    if (fs.existsSync(claudeTelos)) {
      telos = fs.readFileSync(claudeTelos, 'utf8');
    } else if (fs.existsSync(fallbackTelos)) {
      telos = fs.readFileSync(fallbackTelos, 'utf8');
    } else {
      telos = `# PAI TELOS\n\n## 🎯 MISSION\nDefiniere hier deine persönliche Mission und langfristige Vision...\n`;
    }

    // IDEAL_STATE.md auslesen
    if (fs.existsSync(claudeIdealState)) {
      idealState = fs.readFileSync(claudeIdealState, 'utf8');
    } else if (fs.existsSync(fallbackIdealState)) {
      idealState = fs.readFileSync(fallbackIdealState, 'utf8');
    } else {
      idealState = `# IDEAL STATE\n\n## 🌟 ERFOLGSBILD\nBeschreibe hier im Detail, wie ein idealer Tag, Erfolg und Fortschritt aussieht...\n`;
    }

    // Andere System-Dateien auslesen
    if (fs.existsSync(claudeSoul)) soul = fs.readFileSync(claudeSoul, 'utf8');
    else if (fs.existsSync(fallbackSoul)) soul = fs.readFileSync(fallbackSoul, 'utf8');

    if (fs.existsSync(claudeUser)) user = fs.readFileSync(claudeUser, 'utf8');
    else if (fs.existsSync(fallbackUser)) user = fs.readFileSync(fallbackUser, 'utf8');

    if (fs.existsSync(claudeAccessPolicy)) accessPolicy = fs.readFileSync(claudeAccessPolicy, 'utf8');
    else if (fs.existsSync(fallbackAccessPolicy)) accessPolicy = fs.readFileSync(fallbackAccessPolicy, 'utf8');

    if (fs.existsSync(claudeHeartbeat)) heartbeat = fs.readFileSync(claudeHeartbeat, 'utf8');
    else if (fs.existsSync(fallbackHeartbeat)) heartbeat = fs.readFileSync(fallbackHeartbeat, 'utf8');

    return NextResponse.json({ telos, idealState, soul, user, accessPolicy, heartbeat });
  } catch (error) {
    console.error('[PAI-API] Fehler beim Lesen der PAI-Dateien:', error);
    return NextResponse.json({ error: 'Failed to read PAI files' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { telos, idealState } = await request.json();

    // Pfade für BEIDE Speicherorte definieren
    const targets = [
      {
        telos: getPaiPath('TELOS.md', false),
        idealState: getPaiPath('IDEAL_STATE.md', false)
      },
      {
        telos: getPaiPath('TELOS.md', true),
        idealState: getPaiPath('IDEAL_STATE.md', true)
      },
      // Zusätzliche Kompatibilität: PAI/USER/TELOS/
      {
        telos: path.join(os.homedir(), 'PAI', 'USER', 'TELOS', 'TELOS.md'),
        idealState: path.join(os.homedir(), 'PAI', 'USER', 'TELOS', 'IDEAL_STATE.md')
      }
    ];

    for (const target of targets) {
      // Sicherstellen, dass das jeweilige Verzeichnis existiert
      const telosDir = path.dirname(target.telos);
      const idealStateDir = path.dirname(target.idealState);

      if (!fs.existsSync(telosDir)) {
        fs.mkdirSync(telosDir, { recursive: true });
      }
      if (!fs.existsSync(idealStateDir)) {
        fs.mkdirSync(idealStateDir, { recursive: true });
      }

      // Dateien schreiben
      if (typeof telos === 'string') {
        fs.writeFileSync(target.telos, telos, 'utf8');
        console.log(`[PAI-API] TELOS.md erfolgreich geschrieben nach: ${target.telos}`);
      }
      if (typeof idealState === 'string') {
        fs.writeFileSync(target.idealState, idealState, 'utf8');
        console.log(`[PAI-API] IDEAL_STATE.md erfolgreich geschrieben nach: ${target.idealState}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PAI-API] Fehler beim Schreiben der PAI-Dateien:', error);
    return NextResponse.json({ error: 'Failed to save PAI files' }, { status: 500 });
  }
}
