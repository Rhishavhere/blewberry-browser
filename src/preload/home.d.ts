import { ElectronAPI } from "@electron-toolkit/preload";

interface HomeAPI {
  navigateFromSearch: (url: string) => Promise<boolean>;
  openSidebarWithAgent: (request: {
    message: string;
    messageId: string;
  }) => Promise<boolean>;
  toggleSidebar: () => Promise<boolean>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    homeAPI: HomeAPI;
  }
}
