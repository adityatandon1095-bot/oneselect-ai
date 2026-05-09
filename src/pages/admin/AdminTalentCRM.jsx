import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS  =  7 * 24 * 60 * 60 * 1000

function daysSince(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function segment(c) {
  const lastContacted = c.last_contacted_at ? new Date(c.last_contacted_at).getTime() : null
  if (c.match_density >= 3) return 'hot'
  if (!lastContacted || Date.now() - lastContacted > THIRTY_DAYS_MS) return 'needs'
  if (Date.now() - lastContacted <= SEVEN_DAYS_MS) return 'active'
  return 'needs'
}

const SEGMENTS = [
  { key: 'hot',    label: 'Hot Matches',     color: '#B8924A', bg: '#FFF8ED', desc: 'match density ≥ 3' },
  { key: 'needs',  label: 'Needs Contact',   color: '#DC2626', bg: '#FEF2F2', desc: 'not contacted in 30+ days' },
  { key: 'active', label: 'Recently Active', color: '#16A34A', bg: '#F0FDF4', desc: 'contacted in last 7 days' },
]

export default function AdminTalentCRM() {
  const [all, setAll]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [marking, setMarking]   = useState(null)
  const [toast, setToast]       = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('talent_pool')
      .select('id, full_name, email, candidate_role, skills, availability, match_density, last_contacted_at, last_matched_at, reengagement_sent_at, created_at')
      .eq('availability', 'available')
      .order('match_density', { ascending: false })
    setAll(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markContacted(candidate) {
    setMarking(candidate.id)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('talent_pool')
      .update({ last_contacted_at: now })
      .eq('id', candidate.id)
    if (!error) {
      setAll(prev => prev.map(c => c.id === candidate.id ? { ...c, last_contacted_at: now } : c))
      showToast(`Marked ${candidate.full_name ?? 'candidate'} as contacted`)
    }
    setMarking(null)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const q = search.toLowerCase().trim()
  const filtered = q
    ? all.filter(c =>
        (c.full_name ?? '').toLowerCase().includes(q) ||
        (c.candidate_role ?? '').toLowerCase().includes(q) ||
        (c.skills ?? []).some(s => s.toLowerCase().includes(q))
      )
    : all

  const bySegment = { hot: [], needs: [], active: [] }
  for (const c of filtered) bySegment[segment(c)].push(c)

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia,serif', fontWeight: 400, fontSize: 26, color: 'var(--text)', margin: 0 }}>
            Talent CRM
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            {all.length} available candidates — segmented by engagement
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Search name, role, skill…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 240 }}
          />
          <Link to="../talent-pool" style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'monospace', letterSpacing: '0.06em', textDecoration: 'none' }}>
            FULL TALENT POOL →
          </Link>
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        {SEGMENTS.map(seg => (
          <div key={seg.key} style={{ padding: '10px 18px', background: seg.bg, border: `1px solid ${seg.color}22`, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 600, color: seg.color }}>{bySegment[seg.key].length}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: seg.color, letterSpacing: '0.05em' }}>{seg.label.toUpperCase()}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{seg.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : all.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 14 }}>
          No available candidates in the talent pool.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, alignItems: 'start' }}>
          {SEGMENTS.map(seg => (
            <div key={seg.key}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${seg.color}` }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, display: 'inline-block' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: seg.color, letterSpacing: '0.08em', fontFamily: 'monospace' }}>
                  {seg.label.toUpperCase()}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2, padding: '1px 7px' }}>
                  {bySegment[seg.key].length}
                </span>
              </div>

              {/* Cards */}
              {bySegment[seg.key].length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>No candidates here</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {bySegment[seg.key].map(c => (
                    <CandidateCard
                      key={c.id}
                      candidate={c}
                      accentColor={seg.color}
                      onMarkContacted={markContacted}
                      marking={marking}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28,
          background: '#2D3748', color: '#fff',
          padding: '10px 18px', borderRadius: 2,
          fontSize: 13, fontFamily: 'monospace',
          letterSpacing: '0.04em', zIndex: 9999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function CandidateCard({ candidate: c, accentColor, onMarkContacted, marking }) {
  const daysAvailable = c.created_at ? daysSince(c.created_at) : null
  const daysContacted = c.last_contacted_at ? daysSince(c.last_contacted_at) : null
  const isMarking     = marking === c.id
  const skills        = (c.skills ?? []).slice(0, 4)

  return (
    <div style={{
      background: 'white',
      border: '1px solid var(--border)',
      borderRadius: 2,
      padding: '14px 16px',
    }}>
      {/* Name + density badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', lineHeight: 1.3 }}>
          {c.full_name ?? '—'}
        </div>
        {c.match_density > 0 && (
          <span style={{
            background: accentColor,
            color: '#fff',
            fontSize: 10,
            fontFamily: 'monospace',
            padding: '2px 7px',
            borderRadius: 2,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            marginLeft: 8,
            flexShrink: 0,
          }}>
            {c.match_density} match{c.match_density !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {/* Role */}
      {c.candidate_role && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{c.candidate_role}</div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {skills.map(s => (
            <span key={s} style={{
              fontSize: 10,
              padding: '2px 7px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
            }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        {daysAvailable != null && (
          <span title="Days in talent pool">
            ◌ {daysAvailable}d available
          </span>
        )}
        {daysContacted != null ? (
          <span title="Last contacted">
            ◷ {daysContacted}d since contact
          </span>
        ) : (
          <span style={{ color: '#DC2626' }}>◷ never contacted</span>
        )}
        {c.last_matched_at && (
          <span title="Last matched">
            ◈ matched {daysSince(c.last_matched_at)}d ago
          </span>
        )}
      </div>

      {/* Actions */}
      <button
        className="btn btn-secondary"
        style={{ fontSize: 11, padding: '5px 12px', width: '100%' }}
        onClick={() => onMarkContacted(c)}
        disabled={isMarking}
      >
        {isMarking ? 'Saving…' : '✓ Mark as Contacted'}
      </button>
    </div>
  )
}
