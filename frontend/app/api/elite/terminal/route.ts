import { NextResponse } from 'next/server';
import path from 'path';

export async function GET() {
  try {
    // process.cwd() ist "...\frontend"
    // Das Hauptverzeichnis des Projekts ist eine Ebene höher
    const projectPath = path.resolve(process.cwd(), '..');
    
    return NextResponse.json({ 
      success: true, 
      projectPath 
    });
  } catch (error: any) {
    console.error('[Terminal API] Fehler bei Pfadermittlung:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

export async function POST() {
  // Optionale Schnittstelle für Statusprüfungen oder Backend-Interaktionen
  return NextResponse.json({ success: true });
}
