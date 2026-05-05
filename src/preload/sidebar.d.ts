import { ElectronAPI } from "@electron-toolkit/preload";

interface ChatRequest {
  message: string;
  messageId: string;
  context?: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface SidebarAPI {
  sendChatMessage: (
    request: ChatRequest | Pick<ChatRequest, "message" | "messageId">
  ) => Promise<void>;
  clearChat: () => Promise<boolean>;
  getMessages: () => Promise<unknown[]>;

  onChatResponse: (callback: (data: ChatResponse) => void) => void;
  removeChatResponseListener: () => void;

  onMessagesUpdated: (callback: (messages: unknown[]) => void) => void;
  removeMessagesUpdatedListener: () => void;

  // Page content access
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;

  getActiveTabInfo: () => Promise<TabInfo | null>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}

