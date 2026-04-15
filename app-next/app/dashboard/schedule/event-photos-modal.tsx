'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
import {
  getEventPhotos,
  uploadEventPhoto,
  deleteEventPhoto,
  type EventPhoto,
} from './photo-actions'

interface Props {
  eventId: string
  eventTitle: string
  onClose: () => void
}

export default function EventPhotosModal({ eventId, eventTitle, onClose }: Props) {
  const [photos, setPhotos] = useState<EventPhoto[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const data = await getEventPhotos(eventId)
    setPhotos(data)
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploading(true)

    for (const file of Array.from(files)) {
      try {
        const compressed = await compressImage(file)
        const fd = new FormData()
        fd.append('eventId', eventId)
        fd.append('file', compressed, compressed.name)
        const result = await uploadEventPhoto(fd)
        if (result.error) {
          setUploadError(result.error)
          break
        }
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'Upload failed')
        break
      }
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    await load()
  }

  function handleDelete(photoId: string) {
    if (!confirm('Delete this photo?')) return
    startTransition(async () => {
      const result = await deleteEventPhoto(photoId)
      if (result.error) {
        alert(result.error)
        return
      }
      await load()
      setLightboxIdx(null)
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark border border-white/10 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <h2 className="font-bold text-white">{eventTitle}</h2>
            <p className="text-xs text-gray mt-0.5">
              {photos === null ? 'Loading…' : `${photos.length} photo${photos.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray hover:text-white text-2xl leading-none"
            aria-label="Close"
          >×</button>
        </header>

        <div className="p-5 border-b border-white/5">
          <label className="inline-flex items-center gap-2 bg-green text-dark font-bold px-4 py-2 rounded-lg cursor-pointer hover:shadow-[0_0_20px_rgba(0,255,135,0.4)] transition disabled:opacity-50">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={e => handleFiles(e.target.files)}
            />
            {uploading ? 'Uploading…' : '+ Add photos'}
          </label>
          {uploadError && (
            <p className="text-red text-sm mt-3">{uploadError}</p>
          )}
          <p className="text-gray text-xs mt-3">
            Up to 5MB per photo. JPG, PNG, or WebP.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {photos === null ? (
            <div className="text-gray text-sm">Loading…</div>
          ) : photos.length === 0 ? (
            <div className="text-center text-gray text-sm py-12">
              No photos yet. Be the first to add one.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setLightboxIdx(i)}
                  className="relative aspect-square rounded-lg overflow-hidden bg-dark-secondary border border-white/5 hover:border-green/40 transition-colors group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.caption ?? ''}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {p.uploaderName && (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] text-white/90 text-left opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.uploaderName}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxIdx !== null && photos && photos[lightboxIdx] && (
        <Lightbox
          photo={photos[lightboxIdx]}
          onClose={() => setLightboxIdx(null)}
          onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : undefined}
          onNext={lightboxIdx < photos.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : undefined}
          onDelete={() => handleDelete(photos[lightboxIdx].id)}
        />
      )}
    </div>
  )
}

function Lightbox({
  photo,
  onClose,
  onPrev,
  onNext,
  onDelete,
}: {
  photo: EventPhoto
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  onDelete: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && onPrev) onPrev()
      if (e.key === 'ArrowRight' && onNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  return (
    <div
      className="fixed inset-0 bg-black z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none"
        aria-label="Close"
      >×</button>

      {onPrev && (
        <button
          onClick={e => { e.stopPropagation(); onPrev() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-4xl"
          aria-label="Previous"
        >‹</button>
      )}

      {onNext && (
        <button
          onClick={e => { e.stopPropagation(); onNext() }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-4xl"
          aria-label="Next"
        >›</button>
      )}

      <div
        className="max-w-full max-h-full flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption ?? ''}
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />
        <div className="mt-3 flex items-center justify-between gap-4 w-full max-w-2xl">
          <div className="text-white/70 text-sm">
            {photo.uploaderName && <span>{photo.uploaderName}</span>}
            {photo.caption && <span className="italic"> · {photo.caption}</span>}
          </div>
          {photo.canDelete && (
            <button
              onClick={onDelete}
              className="text-red hover:text-red/80 text-sm font-semibold"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Client-side image compression — downscales to max 2000px on the long
// edge and re-encodes as JPEG at 85% quality. A 4MB iPhone shot lands
// around 400-800KB, well under the 5MB server limit.
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  const bitmap = await createImageBitmap(file)
  const maxEdge = 2000
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  )
  if (!blob) return file

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}
