---
name: spotify_control
description: Musik abspielen und steuern. Nutze diesen Skill bei 'spiele Musik', 'play music', Songwünschen, Pause/Skip oder Playlist-Suche.
---

# Spotify & Musik-Steuerung Skill

Dieser Skill ermöglicht Elite eine präzise Steuerung der Medienwiedergabe.

## Workflows

### 0. Allgemeiner Musikwunsch (ohne Titel)
Wenn der Nutzer nur sagt "spiele Musik", "play music", "Musik an", "leg was auf":
1. Rufe **sofort** `play_random_music()` auf – kein scan_music_library nötig.
2. Keine verbale Bestätigung. Bei Fehler: einmal `youtube_search_ui(query="music mix")` als Fallback.

### 1. Suche und Abspielen eines Songs
Wenn der Nutzer nach einem Song fragt (z.B. "Spiel Bohemian Rhapsody"):
1. Führe `scan_music_library(search_query="Songname")` aus.
2. Analysiere das Ergebnis:
   - Wenn genau ein Song gefunden wurde: Nutze `play_local_song(song_path="Pfad")`.
   - Wenn mehrere gefunden wurden: Liste sie kurz auf und frage nach der Auswahl.
   - Wenn nichts gefunden wurde: Versuche die System-Medientasten via `media_control(action="playpause")` (vorausgesetzt Spotify ist offen).

### 2. Lautstärke-Optimierung (HINWEIS)
- Elite darf die Lautstärke NIEMALS eigenständig ändern.
- Nur auf expliziten Befehl: Nutze `media_control(action="vol_up")` oder `vol_down`.

### 3. Navigation
- "Nächstes Lied" -> `media_control(action="next")`
- "Pause/Stop" -> `media_control(action="playpause")`

## Tipps
- **Stumme Ausführung:** Bestätige Musikbefehle **NIEMALS** verbal. Führe sie einfach aus. Das HUD zeigt den Status an.
- **Kein Feedback:** Sätze wie "Starte die Wiedergabe für Sie, Chef" sind untersagt.
- **Fehlerbehandlung:** Sprich nur, wenn ein Befehl fehlschlägt (z.B. "Chef, der Song konnte nicht gefunden werden.").
