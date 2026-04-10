'use client'

import { useState } from 'react'
import { useToast } from '@/components/toast'

export default function InviteCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const url = `${window.location.origin}/join/code/${code}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast('Invite link copied — send it to parents', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Failed to copy', 'error')
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      toast('Code copied', 'success')
    } catch {}
  }

  return (
    <div className="mb-4 bg-dark-secondary border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs text-gray mb-1">Parent invite code</p>
        <button
          onClick={copyCode}
          title="Tap to copy code"
          className="font-mono font-bold text-green text-lg tracking-wider hover:opacity-80 transition-opacity"
        >
          {code}
        </button>
      </div>
      <button
        onClick={copyLink}
        className="text-xs font-bold text-green bg-green/10 border border-green/20 px-4 py-2 rounded-lg hover:bg-green/20 transition-colors shrink-0"
      >
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  )
}
