'use client'

import { useState } from 'react'

export default function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-center gap-3 bg-dark rounded-xl px-4 py-3 border border-white/5">
      <span className="text-gray text-sm truncate flex-1 font-mono">{url}</span>
      <button
        onClick={handleCopy}
        className={`shrink-0 text-xs font-bold transition-all ${
          copied ? 'text-green scale-105' : 'text-gray hover:text-green'
        }`}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}
