import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'

type AgentEventPayload =
  | { type: 'log'; message: string }
  | { type: 'step'; step: number; action: unknown }
  | { type: 'error'; message: string }
  | { type: 'finished'; reason: string }

export const AgentPanel: React.FC = () => {
  const [goal, setGoal] = useState('')
  const [running, setRunning] = useState(false)
  const [busyShot, setBusyShot] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [logLines, setLogLines] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onEvent = (e: AgentEventPayload) => {
      const ts = new Date().toISOString().slice(11, 19)
      if (e.type === 'log') {
        setLogLines((prev) => [...prev, `[${ts}] ${e.message}`])
      } else if (e.type === 'step') {
        setLogLines((prev) => [...prev, `[${ts}] step ${e.step} → ${JSON.stringify(e.action)}`])
      } else if (e.type === 'error') {
        setLogLines((prev) => [...prev, `[${ts}] ERROR: ${e.message}`])
        setRunning(false)
      } else if (e.type === 'finished') {
        setLogLines((prev) => [...prev, `[${ts}] finished: ${e.reason}`])
        setRunning(false)
      }
    }

    window.sidebarAPI.onAgentEvent(onEvent)
    return () => {
      window.sidebarAPI.removeAgentEventListener()
    }
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logLines])

  const capture = async () => {
    setBusyShot(true)
    setPreview(null)
    setNote('')
    try {
      const res = await window.sidebarAPI.captureAgentActiveTabScreenshot()
      if (res.ok) {
        setPreview(res.dataUrl)
        setNote(`${res.title}\n${res.url}`)
      } else {
        setNote(res.error)
      }
    } catch (e) {
      setNote(String(e))
    } finally {
      setBusyShot(false)
    }
  }

  const start = async () => {
    const g = goal.trim()
    if (!g || running) return
    setLogLines([])
    setRunning(true)
    try {
      const res = await window.sidebarAPI.agentStart(g)
      if (!('ok' in res) || !res.ok) {
        const err =
          typeof res === 'object' &&
          res &&
          'error' in res &&
          typeof (res as { error?: string }).error === 'string'
            ? (res as { error: string }).error
            : String(res)
        setLogLines((prev) => [...prev, `Failed to start: ${err}`])
        setRunning(false)
      }
    } catch (e) {
      setLogLines((prev) => [...prev, `Failed to start: ${String(e)}`])
      setRunning(false)
    }
  }

  const stop = () => {
    void window.sidebarAPI.agentStop()
    setRunning(false)
  }

  const clearLog = () => setLogLines([])

  return (
    <div className="flex flex-col h-full p-4 gap-3 min-h-0">
      <div>
        <p className="text-sm font-medium">Agent · vision loop</p>
        <p className="text-xs text-muted-foreground mt-1">
          Each step after the first screenshot: capture → model chooses one action. First planner call is
          text-only (optional <code className="text-[0.7rem]">see</code>, <code className="text-[0.7rem]">new_tab</code>,{' '}
          <code className="text-[0.7rem]">navigate</code>). Clicks use{' '}
          <code className="text-[0.7rem]">webContents.sendInputEvent</code>.
        </p>
      </div>

      <label className="flex flex-col gap-1 flex-shrink-0">
        <span className="text-xs text-muted-foreground">Goal</span>
        <textarea
          value={goal}
          onChange={(ev) => setGoal(ev.target.value)}
          placeholder="e.g. Open example.com and search for blueberry"
          rows={3}
          disabled={running}
          className={cn(
            'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'resize-y min-h-[72px]'
          )}
        />
      </label>

      <div className="flex gap-2 flex-shrink-0">
        <Button variant="default" onClick={() => void start()} disabled={running || !goal.trim()}>
          {running ? 'Running…' : 'Run'}
        </Button>
        <Button variant="outline" onClick={() => stop()} disabled={!running}>
          Stop
        </Button>
        <Button variant="ghost" size="sm" onClick={() => clearLog()} disabled={logLines.length === 0}>
          Clear log
        </Button>
      </div>

      <div
        className={cn(
          'flex-1 min-h-[120px] overflow-y-auto rounded-lg border border-border bg-muted/30 p-2',
          'font-mono text-[11px] leading-relaxed text-muted-foreground'
        )}
      >
        {logLines.length === 0 ? (
          <p className="text-xs text-muted-foreground/80">Logs appear here.</p>
        ) : (
          logLines.map((line, i) => (
            <div key={`${i}-${line.slice(0, 40)}`} className="whitespace-pre-wrap break-words">
              {line}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>

      <div className="border-t border-border pt-3 flex-shrink-0">
        <p className="text-xs text-muted-foreground mb-2">Manual screenshot (same path as the loop)</p>
        <Button variant="outline" onClick={() => void capture()} disabled={busyShot}>
          {busyShot ? 'Capturing…' : 'Capture active tab'}
        </Button>
        {note ? (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap border border-border rounded-lg p-2 bg-muted/40 mt-2">
            {note}
          </p>
        ) : null}
        {preview ? (
          <img
            src={preview}
            alt="Active tab capture"
            className={cn(
              'mt-2 max-h-[180px] w-auto max-w-full mx-auto rounded-lg border border-border shadow-sm',
              'object-contain bg-muted/20'
            )}
          />
        ) : null}
      </div>
    </div>
  )
}
