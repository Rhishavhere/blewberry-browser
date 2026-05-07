import React, { useState, useEffect, useRef } from 'react'
import { X, Maximize2 } from 'lucide-react'

export const MiniApp: React.FC = () => {
  const [query, setQuery] = useState('')
  const [searchUrl, setSearchUrl] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  
  const webviewRef = useRef<Electron.WebviewTag>(null)

  // Auto-focus input on mount
  useEffect(() => {
    const input = document.getElementById('mini-search-input')
    if (input) input.focus()
  }, [])

  // Sync webview navigation with React state
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleNavigate = (e: any) => {
      setSearchUrl(e.url);
      // setQuery(e.url); // Optionally update the input bar to show the current URL
    };

    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigate);

    return () => {
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigate);
    };
  }, [isExpanded]); // re-run when webview is mounted

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    
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
        window.miniAPI.search(finalUrl) // Tells main process to expand bounds
    }
  }

  const handleClose = () => {
    if (isExpanded) {
        // Collapse the search result and clear the text
        if (window.miniAPI) window.miniAPI.collapse()
        setIsExpanded(false)
        setQuery('')
        setSearchUrl('')
    } else {
        // Close Blueberry
        if (window.miniAPI) window.miniAPI.quitApp()
    }
  }

  const handleExpandToMain = () => {
    if (window.miniAPI) {
        window.miniAPI.exitMiniMode(searchUrl)
    }
  }

  return (
    <div className="flex flex-col w-full h-screen items-center app-region-no-drag">
      
      {/* Pill Container (Dock) */}
      <form onSubmit={handleSearch} className="flex w-[350px] h-[42px] items-center justify-center bg-white dark:bg-black/60 rounded-full px-6 app-region-drag shadow-sm shrink-0">
        
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
          placeholder="Search or type URL"
          className="flex-1 bg-transparent border-none outline-none text-md text-gray-800 dark:text-gray-100 placeholder:text-gray-400 app-region-no-drag font-medium"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Actions */}
        <div className="flex items-center ml-2 gap-1 flex-shrink-0 app-region-no-drag">
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

      {/* Embedded Webview Result */}
      {isExpanded && searchUrl && (
        <div className="w-[750px] flex-1 mt-4 rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-white/10 bg-white">
          <webview 
            ref={webviewRef}
            src={searchUrl} 
            className="w-full h-[580px]"
            // @ts-ignore - React doesn't natively type webview completely
            allowpopups="true"
          />
        </div>
      )}

    </div>
  )
}
