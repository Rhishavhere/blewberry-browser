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
  saveReportAs: (
    id: string,
  ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  openGmailDraft: (
    subject: string,
    body: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    homeAPI: HomeAPI;
    reportAPI: ReportAPI;
  }
}
