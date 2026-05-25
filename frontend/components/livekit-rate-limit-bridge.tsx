'use client';

import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import {
  installLiveKitFetchRateLimitGuard,
  LIVEKIT_RATE_LIMIT_EVENT,
} from '@/lib/livekit-connect-guard';

type Props = {
  onRateLimited: () => void;
};

/**
 * Disconnects the LiveKit room as soon as a 429 is observed on Cloud edge URLs,
 * before the SDK can iterate through every region.
 */
export function LiveKitRateLimitBridge({ onRateLimited }: Props) {
  const room = useRoomContext();

  useEffect(() => {
    installLiveKitFetchRateLimitGuard();
  }, []);

  useEffect(() => {
    const handleRateLimit = () => {
      void room.disconnect(true);
      onRateLimited();
    };
    window.addEventListener(LIVEKIT_RATE_LIMIT_EVENT, handleRateLimit);
    return () =>
      window.removeEventListener(LIVEKIT_RATE_LIMIT_EVENT, handleRateLimit);
  }, [room, onRateLimited]);

  return null;
}
