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
            <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              OffPitch
              <span style={{
                backgroundColor: '#1F4E3D',
                color: '#FAF7F2',
                padding: '2px 10px',
                borderRadius: '999px',
                fontSize: '17px',
                fontWeight: 900,
                letterSpacing: '0.5px',
              }}>OS</span>
            </h1>
            <p style={{ color: '#5C6660', fontSize: '14px', margin: '24px 0 32px' }}>
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
