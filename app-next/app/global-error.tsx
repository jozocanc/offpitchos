'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ backgroundColor: '#0A1628', color: 'white', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.5px', marginBottom: '8px' }}>
              OffPitch<span style={{ color: '#00FF87' }}>OS</span>
            </h1>
            <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '32px' }}>
              Something went wrong. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                background: '#00FF87',
                color: '#0A1628',
                fontWeight: 700,
                padding: '12px 32px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '14px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
