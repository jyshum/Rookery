'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, X } from 'lucide-react'
import { useStore } from '@/lib/state/store'
import { buildExport } from '@/lib/export/build-export'
import { exportFilename, exportInputFromState } from '@/lib/export/from-store'
import { downloadExport } from '@/lib/export/download'
import { highlightJson } from '@/lib/export/highlight'
import { formatExport } from '@/lib/export/format'

/**
 * Export preview.
 *
 * A downloaded file is the right deliverable for a pipeline, but a bad one for
 * a person who wants to look at what they just produced. This shows the exact
 * document on screen, ready to read or copy, without leaving the app.
 *
 * The document is built fresh each time the drawer opens, so it always reflects
 * current state rather than whatever was last downloaded.
 */
export function ExportDrawer() {
  const open = useStore((s) => s.exportOpen)
  // the panel is mounted only while open, so its transient state (the "copied"
  // flash) resets on its own rather than needing an effect to clear it
  return open ? <ExportPanel /> : null
}

function ExportPanel() {
  // subscribes to the whole store on purpose: the preview must reflect every
  // change that can alter the document, and while the drawer is open the canvas
  // is covered, so there is no hot loop to protect here
  const state = useStore()
  const setOpen = state.setExportOpen
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const codeRef = useRef<HTMLPreElement>(null)

  const json = useMemo(
    () => formatExport(buildExport(exportInputFromState(state))),
    [state],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const bytes = new Blob([json]).size
  const annotationCount = state.annotationIds.length
  const classCount = state.classIds.length

  /**
   * Copy, with a fallback that actually helps.
   *
   * The Clipboard API can be refused outright: insecure origins, embedded
   * contexts, and browsers that require a trusted gesture all reject the write.
   * Failing silently would leave someone clicking a dead button, so on refusal
   * we select the document ourselves and tell them to press the shortcut. The
   * text was always selectable; this just does the selecting for them.
   */
  async function copy() {
    try {
      await navigator.clipboard.writeText(json)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      selectAll()
      setCopyState('manual')
    }
  }

  function selectAll() {
    const node = codeRef.current
    if (!node) return
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/50" onClick={() => setOpen(false)}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[min(560px,80vw)] flex-col border-l border-[var(--color-line)] bg-[var(--color-deep)] shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Export preview</p>
            <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-text)]">
              {exportFilename()}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
            title="Close (Esc)"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex shrink-0 items-center gap-4 border-b border-[var(--color-line)] px-4 py-2 text-[10px] text-[var(--color-muted)]">
          <span>{annotationCount} annotations</span>
          <span>{classCount} classes</span>
          <span>{bytes.toLocaleString()} bytes</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#050505] p-4">
          <pre ref={codeRef} className="json-preview text-[10.5px] leading-relaxed">
            <code dangerouslySetInnerHTML={{ __html: highlightJson(json) }} />
          </pre>
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-[var(--color-line)] px-4 py-3">
          <button
            onClick={copy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded border border-[var(--color-line)] py-2 text-[11px] text-[var(--color-text)] transition hover:bg-white/5"
          >
            {copyState === 'copied' ? (
              <Check size={13} strokeWidth={2} />
            ) : (
              <Copy size={13} strokeWidth={1.75} />
            )}
            {copyState === 'copied'
              ? 'Copied'
              : copyState === 'manual'
                ? 'Selected — press Cmd/Ctrl+C'
                : 'Copy JSON'}
          </button>
          <button
            onClick={downloadExport}
            className="flex flex-1 items-center justify-center gap-1.5 rounded bg-[var(--color-accent)] py-2 text-[11px] font-medium text-black transition hover:brightness-110"
          >
            <Download size={13} strokeWidth={2} />
            Download
          </button>
        </footer>
      </aside>
    </div>
  )
}
