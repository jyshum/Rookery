'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useStore } from '@/lib/state/store'
import type { ImageAsset } from '@/lib/canvas/types'

/** Read an image's pixel size in the browser, so the server needs no image library. */
function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image'))
    }
    img.src = url
  })
}

/** Left rail: the photos in this project, and which one is being annotated. */
export function ImageRail() {
  const imageIds = useStore((s) => s.imageIds)
  const images = useStore((s) => s.images)
  const activeImageId = useStore((s) => s.activeImageId)
  const setActiveImage = useStore((s) => s.setActiveImage)
  const addImage = useStore((s) => s.addImage)
  const projectId = useStore((s) => s.projectId)
  const storageEnabled = useStore((s) => s.storageEnabled)
  const annotations = useStore((s) => s.annotations)
  const annotationIds = useStore((s) => s.annotationIds)

  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const countFor = (imageId: string) =>
    annotationIds.reduce((n, id) => (annotations[id]?.imageId === imageId ? n + 1 : n), 0)

  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return

    setError(null)

    if (!projectId || !storageEnabled) return

    setBusy(true)
    try {
      const { width, height } = await measure(file)
      const form = new FormData()
      form.append('file', file)
      form.append('projectId', projectId)
      form.append('width', String(width))
      form.append('height', String(height))

      const res = await fetch('/api/images/upload', { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status})`)

      addImage(body as ImageAsset)
      setActiveImage((body as ImageAsset).id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <aside className="flex w-[168px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-deep)]">
      <div className="border-b border-[var(--color-line)] px-3 py-3">
        <p className="eyebrow">Dataset</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {imageIds.map((id) => {
          const img = images[id]
          if (!img) return null
          const active = id === activeImageId
          const count = countFor(id)

          return (
            <button
              key={id}
              onClick={() => setActiveImage(id)}
              className={`group relative block w-full overflow-hidden rounded-md border transition ${
                active
                  ? 'border-[var(--color-accent)]'
                  : 'border-[var(--color-line)] hover:border-white/25'
              }`}
            >
              <Image
                src={img.url}
                alt={img.filename}
                width={img.width}
                height={img.height}
                unoptimized={img.source === 'UPLOADED'}
                className="aspect-[3/2] w-full object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/70 px-1.5 py-1 text-[9px] text-[var(--color-muted)]">
                <span className="truncate">{img.filename}</span>
                {count > 0 && (
                  <span className="ml-1 shrink-0 rounded-sm bg-[var(--color-primary)] px-1 text-white">
                    {count}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="border-t border-[var(--color-line)] p-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            if (!storageEnabled) return
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void upload(e.dataTransfer.files)
          }}
          disabled={busy || !storageEnabled}
          title={
            storageEnabled
              ? 'Upload an image'
              : 'Set up Supabase Storage to upload your own images'
          }
          className={`flex w-full items-center justify-center gap-1.5 rounded border border-dashed py-2 text-[10px] transition ${
            dragOver
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
          } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--color-muted)]`}
        >
          <Upload size={12} strokeWidth={1.75} />
          {busy ? 'Uploading' : 'Add image'}
        </button>

        {!storageEnabled && (
          <p className="mt-2 text-[9px] leading-snug text-[var(--color-muted)]">
            Uploads need Supabase Storage. The bundled photos work without it.
          </p>
        )}
        {error && <p className="mt-2 text-[9px] leading-snug text-[#F87171]">{error}</p>}
      </div>
    </aside>
  )
}
