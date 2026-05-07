import { ElectronAPI } from "@electron-toolkit/preload";

interface HomeAPI {
  navigateFromSearch: (url: string) => Promise<boolean>;
  openSidebarWithAgent: (request: {
    message: string;
    messageId: string;
  }) => Promise<boolean>;
  toggleSidebar: () => Promise<boolean>;
}

interface SavedReportPayload {
  id: string;
  title: string;
  markdown: string;
  createdAt: string;
}

interface ReportAPI {
  loadReport: (id: string) => Promise<SavedReportPayload | null>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    homeAPI: HomeAPI;
    reportAPI: ReportAPI;
  }
}
