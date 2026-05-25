'use client';



import { useEffect, useRef } from 'react';

import { useToast } from '@/components/dashboard/toast-provider';

import { useWidgetManager } from '@/components/dashboard/widget-manager';

import { playSystemSound } from '@/lib/audio-effects';

import { buildWelcomeBriefing } from '@/lib/welcome-briefing';



/**

 * Bei jedem HUD-Start: tageszeitabhängiges Elite-Briefing (Toast + Startup-Sound).

 * Sprachausgabe ausschließlich über LiveKit (Backend session.say / generate_reply).

 */

export function WelcomeBriefing() {

  const { showToast } = useToast();

  const { addLog } = useWidgetManager();

  const startedRef = useRef(false);



  useEffect(() => {

    if (startedRef.current) return;

    startedRef.current = true;



    const timer = window.setTimeout(async () => {

      try {

        const res = await fetch('/api/system-status', { cache: 'no-store' });

        if (!res.ok) throw new Error(`Status ${res.status}`);

        const data = await res.json();



        const briefing = buildWelcomeBriefing({

          eliteReady: data.elite_ready === true,

          effectiveLlmMode: data.effective_llm_mode,

          llmFallbackReason: data.llm_fallback_reason,

          weather: data.weather,

          cpuPercent: data.cpu_percent,

          ramPercent: data.ram_percent,

          agentStatus: data.agent_status,

          livekitStatus: data.livekit_status,

          hermesStatus: data.hermes_status,

        });



        playSystemSound('startup', 0.35);



        showToast({

          type: briefing.toastType,

          title: briefing.title,

          message: briefing.message,

          duration: 8000,

        });



        addLog({

          type: 'system',

          message: `${briefing.title} ${briefing.message}`,

        });

      } catch (err) {

        console.warn('[WelcomeBriefing]', err);

        showToast({

          type: 'info',

          title: 'Elite HUD bereit.',

          message: 'Systemstatus konnte nicht geladen werden — Verbindung prüfen.',

          duration: 6000,

        });

      }

    }, 1200);



    return () => window.clearTimeout(timer);

  }, [showToast, addLog]);



  return null;

}


