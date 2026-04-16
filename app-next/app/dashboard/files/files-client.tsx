'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import {
  uploadClubFile,
  deleteClubFile,
  getDownloadUrl,
  type ClubFile,
} from './actions'

interface Props {
  files: ClubFile[]
  role: string
}

export default function FilesClient({ files, role }: Props) {
  const isDoc = role === 'doc'
  const router = useRouter()
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files
    return files.filter(f => f.name.toLowerCase().includes(q))
  }, [files, query])

  async function handleUpload(file: File) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const result = await uploadClubFile(fd)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (result.error) {
      toast(result.error, 'error')
      return
    }
    toast('File uploaded')
    router.refresh()
  }

  function handleDelete(file: ClubFile) {
    if (!confirm(`Delete ${file.name}? This cannot be undone.`)) return
    setPendingDeleteId(file.id)
    startTransition(async () => {
      const result = await deleteClubFile(file.id)
      setPendingDeleteId(null)
      if (result.error) {
        toast(result.error, 'error')
        return
      }
      toast('File deleted')
      router.refresh()
    })
  }

  async function handleDownload(file: ClubFile) {
    const result = await getDownloadUrl(file.id)
    if (result.error || !result.url) {
      toast(result.error ?? 'Download failed', 'error')
      return
    }
    window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search files…"
            className="w-full bg-dark-secondary border border-white/5 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-gray focus:outline-none focus:border-green/50"
          />
        </div>

        {isDoc && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 bg-green text-dark font-semibold text-sm rounded-lg px-4 py-2.5 hover:bg-green/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading…' : '+ Upload'}
            </button>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasQuery={query.length > 0} isDoc={isDoc} />
      ) : (
        <ul className="space-y-2">
          {filtered.map(file => (
            <li
              key={file.id}
              className="bg-dark-secondary border border-white/5 rounded-xl p-4 flex items-center gap-4"
            >
              <FileIcon mime={file.mimeType} name={file.name} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{file.name}</p>
                <p className="text-xs text-gray mt-0.5">
                  {file.uploaderName ?? 'Someone'} · {timeAgo(file.uploadedAt)} ·{' '}
                  {formatSize(file.sizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(file)}
                  className="text-xs font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Download
                </button>
                {file.canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(file)}
                    disabled={pendingDeleteId === file.id}
                    className="text-xs font-medium text-red hover:bg-red/10 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {pendingDeleteId === file.id ? '…' : 'Delete'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function EmptyState({ hasQuery, isDoc }: { hasQuery: boolean; isDoc: boolean }) {
  if (hasQuery) {
    return (
      <div className="bg-dark-secondary border border-white/5 rounded-xl p-12 text-center">
        <p className="text-sm text-gray">No files match your search.</p>
      </div>
    )
  }
  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-12 text-center">
      <p className="text-sm text-white font-medium mb-1">No files yet</p>
      <p className="text-xs text-gray">
        {isDoc
          ? 'Upload registration forms, code of conduct, or any club document.'
          : 'Your club hasn\u2019t shared any files yet.'}
      </p>
    </div>
  )
}

function FileIcon({ mime, name }: { mime: string; name: string }) {
  const family = familyOf(mime, name)
  const colors: Record<string, string> = {
    pdf: 'bg-red/20 text-red',
    doc: 'bg-blue-500/20 text-blue-400',
    img: 'bg-emerald-500/20 text-emerald-400',
    vid: 'bg-purple-500/20 text-purple-400',
    generic: 'bg-white/10 text-gray',
  }
  const labels: Record<string, string> = {
    pdf: 'PDF',
    doc: 'DOC',
    img: 'IMG',
    vid: 'VID',
    generic: 'FILE',
  }
  return (
    <div
      className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold ${colors[family]}`}
    >
      {labels[family]}
    </div>
  )
}

function familyOf(mime: string, name: string): 'pdf' | 'doc' | 'img' | 'vid' | 'generic' {
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('image/')) return 'img'
  if (mime.startsWith('video/')) return 'vid'
  if (
    mime.includes('word') ||
    mime === 'text/plain' ||
    /\.(docx?|txt|rtf|pages)$/i.test(name)
  )
    return 'doc'
  return 'generic'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
