export {};

declare global {
  interface Window {
    elite?: {
      executeCommand?: (command: string) => void | Promise<void>;
      sendChatMessage?: (text: string) => void | Promise<void>;
    };
    eliteAPI?: {
      restartServices?: () => void;
      reloadHud?: () => void;
      hideToTray?: () => void;
      showWindow?: () => void;
      quitApp?: () => void;
      getRuntimeStatus?: () => Promise<{
        backend: boolean;
        hermes: boolean;
        hermesDashboard: boolean;
        missionControl: boolean;
        frontend: boolean;
        pulse: boolean;
        pulseManagerScript: string;
        paiHome: string;
        hermesGatewayUrl?: string;
        hermesDashboardUrl?: string;
      }>;
      restartPaiPulse?: () => Promise<{ ok: boolean }>;
      openWidgetWindow?: (
        widgetId: string,
        bounds?: { x?: number; y?: number; width?: number; height?: number },
      ) => Promise<{ ok: boolean; error?: string }>;
      closeWidgetWindow?: (widgetId: string) => Promise<{ ok: boolean }>;
      moveWidgetWindow?: (widgetId: string, dx: number, dy: number) => Promise<{ ok: boolean; error?: string }>;
      resizeWidgetWindow?: (w: number, h: number) => Promise<{ ok: boolean }>;
      onWidgetWindowClosed?: (callback: (widgetId: string) => void) => () => void;
    };
  }
}
