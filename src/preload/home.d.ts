import { ElectronAPI } from "@electron-toolkit/preload";

interface HomeAPI {
  navigateFromSearch: (url: string) => Promise<boolean>;
  toggleSidebar: () => Promise<boolean>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    homeAPI: HomeAPI;
  }
}
