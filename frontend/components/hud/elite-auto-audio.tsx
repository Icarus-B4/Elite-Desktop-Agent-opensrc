'use client';

import { useEffect, useState } from 'react';
import { StartAudio, useConnectionState, useRoomContext } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { ensureRoomAudio } from '@/lib/livekit-audio';

/** Startet Agent-Audio automatisch; StartAudio-Button nur als Fallback. */
export function EliteAutoAudio() {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || !room || audioReady) return;

    let cancelled = false;
    void (async () => {
      const ok = await ensureRoomAudio(room);
      if (!cancelled && ok) {
        setAudioReady(true);
        window.dispatchEvent(new CustomEvent('elite-room-audio-ready'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectionState, room, audioReady]);

  if (audioReady) return null;

  return <StartAudio label="Audio aktivieren" />;
}
