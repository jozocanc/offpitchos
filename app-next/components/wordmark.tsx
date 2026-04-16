interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  shieldOnly?: boolean
  className?: string
}

const sizes: Record<NonNullable<WordmarkProps['size']>, { shield: number; text: string; gap: string }> = {
  sm: { shield: 18, text: 'text-sm', gap: 'gap-1.5' },
  md: { shield: 22, text: 'text-lg', gap: 'gap-2' },
  lg: { shield: 30, text: 'text-2xl', gap: 'gap-2.5' },
  xl: { shield: 44, text: 'text-3xl', gap: 'gap-3' },
}

function Shield({ size }: { size: number }) {
  const h = Math.round(size * (140 / 120))
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 120 140"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M60 4 L112 20 L112 68 C112 104 88 126 60 136 C32 126 8 104 8 68 L8 20 Z"
        fill="#1F4E3D"
      />
      <text
        x="60"
        y="88"
        textAnchor="middle"
        fontFamily="-apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif"
        fontWeight="800"
        fontSize="52"
        fill="#FAF7F2"
        letterSpacing="-2"
      >
        OP
      </text>
    </svg>
  )
}

export default function Wordmark({ size = 'md', shieldOnly = false, className = '' }: WordmarkProps) {
  const s = sizes[size]
  if (shieldOnly) {
    return (
      <span className={className} aria-label="OffPitchOS">
        <Shield size={s.shield} />
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center font-bold tracking-tight ${s.text} ${s.gap} ${className}`}
      aria-label="OffPitchOS"
    >
      <Shield size={s.shield} />
      <span>OffPitchOS</span>
    </span>
  )
}
