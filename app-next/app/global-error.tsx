'use client'

export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ backgroundColor: '#FAF7F2', color: '#0F1510', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '24px', letterSpacing: '-0.5px', marginBottom: '24px' }}>
              <svg width="32" height="37" viewBox="0 0 120 140" aria-hidden="true">
                <path d="M60 4 L112 20 L112 68 C112 104 88 126 60 136 C32 126 8 104 8 68 L8 20 Z" fill="#1F4E3D"/>
                <text x="60" y="88" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="52" fill="#FAF7F2" letterSpacing="-2">OP</text>
              </svg>
              <span>OffPitchOS</span>
            </div>
            <p style={{ color: '#5C6660', fontSize: '14px', marginBottom: '32px' }}>
              Something went wrong. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                background: '#1F4E3D',
                color: '#FAF7F2',
                fontWeight: 600,
                padding: '12px 32px',
                borderRadius: '999px',
                border: 'none',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
