'use client';

import { useEffect } from 'react';

/** Enables page scroll on Mission Control (overrides global body overflow:hidden). */
export function MissionControlHtmlClass() {
  useEffect(() => {
    document.documentElement.classList.add('elite-mission-control');
    return () => document.documentElement.classList.remove('elite-mission-control');
  }, []);
  return null;
}
