import { useTrialUsage } from '../hooks/usePlan'

// Soft-cap nudge banner. Shows only when >= 80% of a trial cap is used.
// Never blocks — just surfaces the upgrade prompt inline.
export default function TrialNudgeBanner() {
  const { getNudge } = useTrialUsage()
  const nudge = getNudge()
  if (!nudge) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '9px 16px',
      background: '#FFFBEB',
      border: '1px solid #F59E0B',
      borderRadius: 2,
      marginBottom: 16,
      fontSize: 12,
      color: '#92400E',
    }}>
      <span>
        You've used <strong>{nudge.label}</strong> on your trial.
        {nudge.pct >= 1 ? " You've hit the limit — " : ' Running low — '}
        upgrade to get unlimited access.
      </span>
      <a
        href="mailto:hello@oneselect.co.uk?subject=Upgrade enquiry"
        style={{
          flexShrink: 0,
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          color: '#B8924A',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        UPGRADE →
      </a>
    </div>
  )
}
