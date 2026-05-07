import { usePlan } from '../hooks/usePlan'

export default function PaidFeature({ feature, children, inline = false }) {
  const { canAccess, isExpired } = usePlan()

  if (canAccess(feature)) return children

  const message = isExpired
    ? 'Your trial has expired.'
    : 'This feature is available on paid plans.'

  if (inline) {
    return (
      <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        🔒 {message}{' '}
        <a href="mailto:hello@oneselect.co.uk" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Upgrade →</a>
      </span>
    )
  }

  return (
    <div style={{ position: 'relative', minHeight: 200 }}>
      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.4 }}>
        {children}
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(248,247,244,0.7)',
        backdropFilter: 'blur(2px)',
      }}>
        <div style={{
          background: '#F8F7F4', border: '1px solid var(--border)', padding: '28px 32px',
          textAlign: 'center', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{ fontSize: 28, lineHeight: 1 }}>🔒</div>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 17, color: 'var(--text)' }}>{message}</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.7 }}>
            Get full access to the AI hiring pipeline, interview scores, and candidate profiles.
          </p>
          <a
            href="mailto:hello@oneselect.co.uk"
            style={{ marginTop: 6, padding: '9px 24px', background: 'var(--accent)', color: '#fff', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}
          >
            Talk to us to upgrade
          </a>
        </div>
      </div>
    </div>
  )
}
