import { useStore } from '@/lib/state/store'
import { buildExport } from './build-export'
import { exportFilename, exportInputFromState } from './from-store'

/**
 * Build the dataset document and hand it to the browser as a file.
 *
 * Runs entirely client side. The store already holds everything the export
 * needs, so there is no reason to round-trip through a server just to serialize
 * state the browser is already holding. A server route (Task 23) will offer the
 * same document for pipelines that want to pull rather than be handed a file.
 */
export function downloadExport(): void {
  const doc = buildExport(exportInputFromState(useStore.getState()))
  const json = JSON.stringify(doc, null, 2)

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = exportFilename()
  document.body.appendChild(a)
  a.click()
  a.remove()

  // release the blob once the download has been handed off
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
