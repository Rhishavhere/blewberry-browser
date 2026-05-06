import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'

type AgentEventPayload =
  | { type: 'log'; message: string }
  | { type: 'step'; step: number; action: Record<string, unknown> }
  | { type: 'conclusion'; text: string }
  | { type: 'error'; message: string }
  | { type: 'finished'; reason: string }

type StepRow = { step: number; label: string; raw: string }

function formatActionLabel(action: Record<string, unknown>): string {
  const a = action.action
  if (typeof a !== 'string') return JSON.stringify(action)
  switch (a) {
    case 'see':
      return 'Request screenshot'
    case 'new_tab': {
      const u = action.url
      return typeof u === 'string' && u
        ? `New tab → ${u}`
        : 'New tab (home)'
    }
    case 'navigate':
      return typeof action.url === 'string' ? `Navigate → ${action.url}` : 'Navigate'
    case 'click_xy':
      return typeof action.x === 'number' && typeof action.y === 'number'
        ? `Click (${action.x}, ${action.y})`
        : 'Click'
    case 'type':
      return typeof action.text === 'string'
        ? `Type “${action.text.length > 40 ? `${action.text.slice(0, 40)}…` : action.text}”`
        : 'Type'
    case 'scroll':
      return typeof action.deltaY === 'number' ? `Scroll ${action.deltaY}px` : 'Scroll'
    case 'wait':
      return typeof action.ms === 'number' ? `Wait ${action.ms}ms` : 'Wait'
    case 'done':
      return typeof action.summary === 'string'
        ? `Done — ${action.summary.length > 80 ? `${action.summary.slice(0, 80)}…` : action.summary}`
        : 'Done'
    default:
      return JSON.stringify(action)
  }
}

export const AgentPanel: React.FC = () => {
  const [goal, setGoal] = useState('')
  const [running, setRunning] = useState(false)
  const [busyShot, setBusyShot] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [conclusion, setConclusion] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepRow[]>([])
  const [technicalLog, setTechnicalLog] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onEvent = (e: AgentEventPayload) => {
      const ts = new Date().toISOString().slice(11, 19)
      if (e.type === 'log') {
        setTechnicalLog((prev) => [...prev, `[${ts}] ${e.message}`])
      } else if (e.type === 'step') {
        const raw = JSON.stringify(e.action)
        const label = formatActionLabel(e.action)
        setSteps((prev) => [...prev, { step: e.step, label, raw }])
      } else if (e.type === 'conclusion') {
        setConclusion(e.text.trim())
      } else if (e.type === 'error') {
        setTechnicalLog((prev) => [...prev, `[${ts}] ERROR: ${e.message}`])
        setRunning(false)
      } else if (e.type === 'finished') {
        setTechnicalLog((prev) => [...prev, `[${ts}] stopped (${e.reason})`])
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
  }, [technicalLog])

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
    setSteps([])
    setTechnicalLog([])
    setConclusion(null)
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
        setTechnicalLog((prev) => [...prev, `Failed to start: ${err}`])
        setRunning(false)
      }
    } catch (e) {
      setTechnicalLog((prev) => [...prev, `Failed to start: ${String(e)}`])
      setRunning(false)
    }
  }

  const stop = () => {
    void window.sidebarAPI.agentStop()
    setRunning(false)
  }

  const clearPanels = () => {
    setSteps([])
    setTechnicalLog([])
    setConclusion(null)
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3 min-h-0">
      <div>
        <p className="text-sm font-medium">Agent</p>
        <p className="text-xs text-muted-foreground mt-1">
          First turn is planner-only (no screenshot unless the model chooses{' '}
          <code className="text-[0.7rem]">see</code>). Afterwards every turn uses a screenshot. You get a{' '}
          <span className="font-medium text-foreground/90">written reply</span> when the run ends.
        </p>
      </div>

      <label className="flex flex-col gap-1 flex-shrink-0">
        <span className="text-xs text-muted-foreground">Goal</span>
        <textarea
          value={goal}
          onChange={(ev) => setGoal(ev.target.value)}
          placeholder="e.g. When did Strawberry browser ship? Search and summarize."
          rows={3}
          disabled={running}
          className={cn(
            'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'resize-y min-h-[72px]'
          )}
        />
      </label>

      <div className="flex gap-2 flex-shrink-0 flex-wrap">
        <Button variant="default" onClick={() => void start()} disabled={running || !goal.trim()}>
          {running ? 'Running…' : 'Run'}
        </Button>
        <Button variant="outline" onClick={() => stop()} disabled={!running}>
          Stop
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => clearPanels()}
          disabled={steps.length === 0 && technicalLog.length === 0 && !conclusion}>
          Clear activity
        </Button>
      </div>

      <div className="flex-shrink-0 rounded-xl border border-border bg-gradient-to-b from-muted/50 to-muted/25 p-3 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Reply</p>
        {running && !conclusion ? (
          <p className="text-sm text-muted-foreground italic">Working… conclusion appears when the run finishes.</p>
        ) : conclusion ? (
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{conclusion}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Summary and takeaways show here after a successful finish or stop.</p>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-2">
        <div className="flex items-center justify-between flex-shrink-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Steps</p>
          <span className="text-[10px] text-muted-foreground">{steps.length} executed</span>
        </div>
        <div className="flex-1 min-h-[56px] overflow-y-auto rounded-lg border border-border bg-background/80 divide-y divide-border">
          {steps.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Executed actions listed here.</div>
          ) : (
            steps.map((s, i) => (
              <div key={`${s.step}-${i}`} className="px-3 py-2 flex gap-2 text-sm items-start">
                <span className="flex-shrink-0 text-[11px] font-mono tabular-nums text-muted-foreground w-14 pt-0.5">
                  #{s.step}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-foreground leading-snug">{s.label}</div>
                  <div className="text-[11px] font-mono text-muted-foreground/90 mt-0.5 truncate" title={s.raw}>
                    {s.raw}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <details className="flex-shrink-0 rounded-lg border border-dashed border-border bg-muted/20">
          <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Technical log
          </summary>
          <div
            className={cn(
              'max-h-[120px] overflow-y-auto px-3 pb-3 font-mono text-[10px] leading-relaxed text-muted-foreground',
              'border-t border-border pt-2'
            )}>
            {technicalLog.length === 0 ? (
              <span className="italic">Repair messages, clicks, stops…</span>
            ) : (
              technicalLog.map((line, i) => (
                <div key={`${i}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-words">
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </details>
      </div>

      <div className="border-t border-border pt-3 flex-shrink-0">
        <p className="text-xs text-muted-foreground mb-2">Manual screenshot probe</p>
        <Button variant="outline" size="sm" onClick={() => void capture()} disabled={busyShot}>
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
              'mt-2 max-h-[140px] w-auto max-w-full mx-auto rounded-lg border border-border shadow-sm',
              'object-contain bg-muted/20'
            )}
          />
        ) : null}
      </div>
    </div>
  )
}
