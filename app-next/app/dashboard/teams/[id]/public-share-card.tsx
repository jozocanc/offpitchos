'use client'

import { useState, useTransition } from 'react'
import { setTeamPublicShare, rotateTeamPublicShareToken } from './actions'
import { useToast } from '@/components/toast'

interface Props {
  teamId: string
  initialEnabled: boolean
  initialToken: string | null
  baseUrl: string
}

export default function PublicShareCard({ teamId, initialEnabled, initialToken, baseUrl }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [token, setToken] = useState(initialToken)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const shareUrl = token ? `${baseUrl}/share/${token}` : null

  function toggle() {
    const next = !enabled
    startTransition(async () => {
      try {
        await setTeamPublicShare(teamId, next)
        setEnabled(next)
        if (next && !token) {
          // Server-side mint — UI updates on the next render via
          // revalidatePath, but we synthesize a placeholder to give the
          // DOC something to copy in the same click.
          setToken('refreshing')
          // Trigger a soft refresh to pick up the new token from props
          // on the next render.
          window.location.reload()
          return
        }
        toast(next ? 'Public link enabled' : 'Public link disabled', 'success')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to update sharing'
        toast(msg, 'error')
      }
    })
  }

  function rotate() {
    if (!confirm('Rotate the share link? Anyone using the old link will lose access immediately.')) return
    startTransition(async () => {
      try {
        await rotateTeamPublicShareToken(teamId)
        toast('Share link rotated', 'success')
        window.location.reload()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to rotate'
        toast(msg, 'error')
      }
    })
  }

  function copy() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5 mt-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            Public Team Page
            {enabled && (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                LIVE
              </span>
            )}
          </h2>
          <p className="text-gray text-sm mt-1">
            A no-login page showing this team&apos;s upcoming schedule + roster. Share on socials or with prospective families.
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={isPending}
          className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
            enabled
              ? 'bg-white/5 border border-white/10 text-gray hover:text-white'
              : 'bg-green text-dark hover:opacity-90'
          } disabled:opacity-50`}
        >
          {isPending ? '...' : enabled ? 'Turn Off' : 'Turn On'}
        </button>
      </div>

      {enabled && shareUrl && (
        <>
          <div className="bg-dark rounded-xl border border-white/5 p-3 flex items-center gap-2 mt-4">
            <code className="flex-1 text-xs text-gray truncate">{shareUrl}</code>
            <button
              onClick={copy}
              className="text-xs font-bold bg-green/10 hover:bg-green/20 text-green border border-green/20 rounded-full px-3 py-1 transition-colors shrink-0"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-full px-3 py-1 transition-colors shrink-0"
            >
              Open ↗
            </a>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray">
              Public page shows roster (names + jersey + position only) and a 30-day schedule. No phone numbers, no parent emails.
            </p>
            <button
              onClick={rotate}
              disabled={isPending}
              className="text-xs font-medium text-yellow-500 hover:text-yellow-400 transition-colors shrink-0 ml-3"
            >
              Rotate link
            </button>
          </div>
        </>
      )}
    </section>
  )
}
