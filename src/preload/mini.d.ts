import { ElectronAPI } from "@electron-toolkit/preload";

interface MiniAPI {
  enterMiniMode: () => Promise<boolean>;
  exitMiniMode: (url?: string) => Promise<boolean>;
  quitApp: () => Promise<boolean>;
  search: () => Promise<boolean>;
  collapse: () => Promise<boolean>;
  expandFull: () => Promise<boolean>;
  startHeadlessAgent: (goal: string) => Promise<boolean>;
  stopHeadlessAgent: () => Promise<boolean>;
  onAgentEvent: (callback: (event: any) => void) => () => void;
  getHomePreloadPath: () => string;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    miniAPI: MiniAPI;
  }
}
