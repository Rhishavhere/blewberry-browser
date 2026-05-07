import React, { useState, useEffect, useRef } from 'react'
import { X, Maximize2, Sparkle} from 'lucide-react'
import { ReportApp } from '../../report/src/ReportApp'

export const MiniApp: React.FC = () => {
  const [query, setQuery] = useState('')
  const [searchUrl, setSearchUrl] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Agent States
  const [isAgentMode, setIsAgentMode] = useState(false)
  const [agentLogs, setAgentLogs] = useState<string[]>([])
  const [agentPhase, setAgentPhase] = useState<'idle' | 'working' | 'done'>('idle')
  const [agentConclusion, setAgentConclusion] = useState('')
  const [agentReportUrl, setAgentReportUrl] = useState('')
  const [reportError, setReportError] = useState('')
  const [showFullReport, setShowFullReport] = useState(false)

  const webviewRef = useRef<Electron.WebviewTag>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-focus input on mount
  useEffect(() => {
    const input = document.getElementById('mini-search-input')
    if (input) input.focus()
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [agentLogs])

  // Agent Event Listener
  useEffect(() => {
    if (!window.miniAPI) return;
    const cleanup = window.miniAPI.onAgentEvent((event: any) => {
      if (event.type === 'log') {
        setAgentLogs(prev => [...prev, event.message]);
      } else if (event.type === 'step') {
        setAgentLogs(prev => [...prev, `[Action] ${event.action.action}`]);
      } else if (event.type === 'conclusion') {
        setAgentConclusion(event.text);
      } else if (event.type === 'report') {
        setAgentReportUrl(event.url);
      } else if (event.type === 'report_error') {
        setAgentLogs(prev => [...prev, `[Report Error] ${event.message}`]);
        setReportError(event.message);
      } else if (event.type === 'error') {
        setAgentLogs(prev => [...prev, `[Error] ${event.message}`]);
        setReportError(event.message);
        setAgentPhase('done');
      } else if (event.type === 'finished') {
        setAgentPhase('done');
      }
    });
    return cleanup;
  }, []);

  // Sync webview navigation with React state (only in normal search mode)
  useEffect(() => {
    if (isAgentMode && showFullReport) return; // Don't sync URL in report mode
    const webview = webviewRef.current;
    if (!webview) return;

    const handleNavigate = (e: any) => {
      setSearchUrl(e.url);
    };

    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigate);

    return () => {
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigate);
    };
  }, [isExpanded, isAgentMode, showFullReport]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    
    if (isAgentMode) {
      setAgentLogs([])
      setAgentPhase('working')
      setAgentConclusion('')
      setAgentReportUrl('')
      setReportError('')
      setShowFullReport(false)
      setIsExpanded(true)
      if (window.miniAPI) {
          window.miniAPI.startHeadlessAgent(query.trim())
      }
      return;
    }
    
    let finalUrl = query.trim()
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
            finalUrl = `https://${finalUrl}`
        } else {
            finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`
        }
    }
    
    setSearchUrl(finalUrl)
    setIsExpanded(true)
    if (window.miniAPI) {
        window.miniAPI.search()
    }
  }

  const handleClose = () => {
    if (isExpanded) {
        if (window.miniAPI) window.miniAPI.collapse()
        setIsExpanded(false)
        setQuery('')
        setSearchUrl('')
        setAgentReportUrl('')
        setReportError('')
        setAgentPhase('idle')
        setShowFullReport(false)
    } else {
        if (window.miniAPI) window.miniAPI.quitApp()
    }
  }

  const handleExpandToMain = () => {
    if (window.miniAPI) {
        window.miniAPI.exitMiniMode(isAgentMode && showFullReport ? agentReportUrl : searchUrl)
    }
  }

  const handleOpenReport = () => {
    setShowFullReport(true)
    if (window.miniAPI) window.miniAPI.expandFull()
  }

  return (
    <div className="flex flex-col w-full h-screen items-center app-region-no-drag">
      
      {/* Pill Container (Dock) */}
      <form onSubmit={handleSearch} className="flex w-[400px] h-[48px] items-center justify-center bg-white dark:bg-black/60 rounded-full px-6 app-region-drag">
        
        {/* Blueberry Logo */}
        <div className="flex items-center justify-center mr-3 w-5 h-5 flex-shrink-0 opacity-80">
          <img src="/icon.svg" alt="Logo" className="w-full h-full object-contain pointer-events-none" onError={(e) => {
              (e.target as HTMLImageElement).src = '/icon.png';
          }} />
        </div>

        {/* Input */}
        <input
          id="mini-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isAgentMode ? "Research a topic..." : "Search"}
          className="flex-1 bg-transparent border-none outline-none text-md text-gray-800 dark:text-gray-100 placeholder:text-gray-400 app-region-no-drag font-medium"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Actions */}
        <div className="flex items-center ml-2 gap-1 flex-shrink-0 app-region-no-drag">
          <button 
              type="button"
              onClick={() => setIsAgentMode(!isAgentMode)}
              title="Toggle Agent Mode"
              className={`w-7 h-7 rounded-full transition-colors focus:outline-none flex items-center justify-center ${isAgentMode ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
              <Sparkle className="w-4 h-4" />
          </button>
          <button 
              type="button"
              onClick={handleExpandToMain}
              title="Return to Main Window"
              className="w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors focus:outline-none flex items-center justify-center"
          >
              <Maximize2 className="w-4 h-4" />
          </button>
          <button 
              type="button"
              onClick={handleClose}
              title={isExpanded ? "Close Result" : "Close Mini Mode"}
              className="w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors focus:outline-none flex items-center justify-center"
          >
              <X className="w-4 h-4" />
          </button>
        </div>

      </form>

      {/* Embedded Webview Result (Normal Search) */}
      {isExpanded && !isAgentMode && (
        <div className="w-[750px] flex-1 mt-4 rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-white/10 bg-white">
          <webview 
            ref={webviewRef}
            src={searchUrl} 
            className="w-full h-full"
            // @ts-ignore
            allowpopups="true"
          />
        </div>
      )}

      {/* Agent Full Report React View */}
      {isExpanded && isAgentMode && showFullReport && (
        <div className="w-[750px] flex-1 mt-4 rounded-xl overflow-y-auto shadow-2xl border border-gray-200 dark:border-white/10 bg-white relative report-scroll-container">
          <ReportApp 
            reportId={(() => {
              try { return new URLSearchParams(agentReportUrl.split('?')[1]).get('id') || ''; }
              catch { return ''; }
            })()} 
            isEmbedded={true} 
          />
        </div>
      )}

      {/* Agent Low Expanded View (Working or Conclusion) */}
      {isExpanded && isAgentMode && !showFullReport && (
        <div className="w-[500px] min-h-[140px] max-h-[280px] mt-4 bg-white dark:bg-black/80 rounded-2xl shadow-xl border border-gray-200 dark:border-white/10 flex flex-col overflow-hidden p-4">
          {agentPhase === 'working' ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Sparkle className="w-5 h-5 text-blue-500 animate-pulse" />
                <span className="font-semibold text-gray-800 dark:text-gray-200">Agent is researching...</span>
              </div>
              <div className="flex-1 overflow-y-auto text-xs text-gray-500 dark:text-gray-400 font-mono flex flex-col gap-1 pr-2">
                {agentLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </>
          ) : (
            <div className="flex flex-col h-full justify-between">
              <div className="flex items-center gap-2 mb-2">
                <Sparkle className="w-5 h-5 text-green-500" />
                <span className="font-semibold text-gray-800 dark:text-gray-200">Task Complete</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                {agentConclusion || "The agent finished the research task."}
              </p>
              <div className="flex justify-end mt-2">
                {agentReportUrl ? (
                  <button 
                    onClick={handleOpenReport}
                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Open Full Report
                  </button>
                ) : reportError ? (
                  <span className="text-sm text-red-500 line-clamp-2 max-w-[300px]" title={reportError}>{reportError}</span>
                ) : (
                  <span className="text-sm text-gray-400">No report generated.</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
