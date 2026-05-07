import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { callClaude } from '../../utils/api'
import { useFormPersistence } from '../../hooks/useFormPersistence'

const CV_PARSE_SYSTEM = `You are a CV parser. Return ONLY valid JSON — no markdown:
{"name":"string","email":"string","currentRole":"string","totalYears":number,"skills":["..."],"education":"string","summary":"string","highlights":["..."],"linkedinUrl":"string or null","githubUrl":"string or null","portfolioUrl":"string or null"}`

const OUTREACH_TEMPLATES = [
  {
    id: 'initial',
    title: 'Initial LinkedIn Outreach',
    placeholders: ['CANDIDATE_NAME', 'ROLE', 'YOUR_NAME'],
    template: `Hi [CANDIDATE_NAME], I came across your profile and was impressed by your experience in [ROLE]. We're working with some exciting companies looking for talent like yours.

Would you be open to a brief conversation about opportunities that might align with your goals? Happy to share more details — completely no commitment.

Best,
[YOUR_NAME]
One Select`,
  },
  {
    id: 'followup',
    title: 'Follow Up (5 days later)',
    placeholders: ['CANDIDATE_NAME', 'ROLE', 'COMPANY', 'YOUR_NAME'],
    template: `Hi [CANDIDATE_NAME], I wanted to follow up on my earlier message.

I'm currently working on a [ROLE] opportunity with a [COMPANY] that I think could be a great fit for your background. Happy to share more details if you're interested — no commitment required.

[YOUR_NAME]`,
  },
  {
    id: 'specific',
    title: 'Role-Specific Pitch',
    placeholders: ['CANDIDATE_NAME', 'ROLE', 'THEIR_COMPANY', 'COMPANY', 'EXPERIENCE_YEARS', 'YOUR_NAME'],
    template: `Hi [CANDIDATE_NAME], I noticed your [ROLE] experience at [THEIR_COMPANY].

We have an exclusive opening at [COMPANY] that matches exactly your background — [EXPERIENCE_YEARS]+ years in [ROLE]. The role offers strong growth potential and an excellent team.

Worth a quick 15-minute chat? I can share full details then.

[YOUR_NAME], One Select`,
  },
  {
    id: 'passive',
    title: 'Passive Candidate Nurture',
    placeholders: ['CANDIDATE_NAME', 'INDUSTRY', 'YOUR_NAME'],
    template: `Hi [CANDIDATE_NAME], I know you're likely happy in your current role, and that's great!

I just wanted to introduce myself — I work with some of the best [INDUSTRY] companies in the market. If you ever consider a move or want to explore what's out there, I'd love to be your first call.

No pressure at all.

[YOUR_NAME], One Select`,
  },
  {
    id: 'post_cv',
    title: 'After CV Review',
    placeholders: ['CANDIDATE_NAME', 'SPECIFIC_SKILL', 'ROLE', 'COMPANY', 'YOUR_NAME'],
    template: `Hi [CANDIDATE_NAME], I've reviewed your CV and I'm genuinely impressed by [SPECIFIC_SKILL].

We have a [ROLE] position at [COMPANY] that would be a strong match for your background. I'd love to walk you through the opportunity.

Are you free for a 15-minute call this week?

[YOUR_NAME], One Select`,
  },
]

function addLog(setLog, msg, type = '') {
  setLog(p => [...p, { id: Date.now() + Math.random(), msg, type }])
}

// ── LinkedIn Tab ──────────────────────────────────────────────────────────────
function LinkedInTab() {
  const { values: form, updateField, clearForm } = useFormPersistence('sourcing_linkedin', { profileText: '', profileUrl: '' })
  const [parsing, setParsing] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState('')

  async function parseProfile() {
    if (!form.profileText.trim()) return
    setParsing(true)
    setError('')
    setResult(null)
    try {
      const reply = await callClaude([{ role: 'user', content: `Parse this LinkedIn profile text into a structured candidate profile:\n\n${form.profileText}` }], CV_PARSE_SYSTEM, 1024)
      const parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
      const { data: saved, error: insertErr } = await supabase.from('talent_pool').insert({
        full_name:      parsed.name ?? 'Unknown',
        email:          parsed.email ?? '',
        candidate_role: parsed.currentRole ?? '',
        total_years:    parsed.totalYears ?? 0,
        skills:         parsed.skills ?? [],
        education:      parsed.education ?? '',
        summary:        parsed.summary ?? '',
        highlights:     parsed.highlights ?? [],
        availability:   'available',
        source:         'linkedin',
        linkedin_url:   form.profileUrl.trim() || parsed.linkedinUrl || null,
        github_url:     parsed.githubUrl || null,
        portfolio_url:  parsed.portfolioUrl || null,
      }).select().single()
      if (insertErr) throw new Error(insertErr.message)
      setResult(saved)
      clearForm()
    } catch (err) {
      setError(err.message)
    }
    setParsing(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '14px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>How to source from LinkedIn</strong>
        <ol style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--text-2)' }}>
          <li>Go to the candidate's LinkedIn profile in your browser</li>
          <li>Select all text on the page (Ctrl+A / Cmd+A)</li>
          <li>Copy (Ctrl+C / Cmd+C)</li>
          <li>Paste the full text below — Claude will extract the structured profile</li>
        </ol>
      </div>

      {result && (
        <div style={{ padding: '12px 14px', background: 'var(--green-d)', border: '1px solid var(--green)', borderRadius: 8, fontSize: 13, color: 'var(--green)' }}>
          ✓ <strong>{result.full_name}</strong> ({result.candidate_role}) added to talent pool
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}

      <div className="field">
        <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>LinkedIn Profile URL (for reference)</label>
        <input style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
          value={form.profileUrl} onChange={e => updateField('profileUrl', e.target.value)} placeholder="https://linkedin.com/in/candidate-name" />
      </div>
      <div className="field">
        <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Paste LinkedIn Profile Text</label>
        <textarea
          style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', minHeight: 200, fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
          value={form.profileText}
          onChange={e => updateField('profileText', e.target.value)}
          placeholder="Paste the full LinkedIn profile text here…"
        />
      </div>
      <button className="btn btn-primary" disabled={!form.profileText.trim() || parsing} onClick={parseProfile}>
        {parsing ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Parsing & Saving…</> : '◈ Parse & Add to Pool'}
      </button>
    </div>
  )
}

// ── Job Boards Tab ─────────────────────────────────────────────────────────────
function JobBoardsTab() {
  const [bulkMode, setBulkMode] = useState(false)
  const [cvText,   setCvText]   = useState('')
  const [parsing,  setParsing]  = useState(false)
  const [results,  setResults]  = useState([])
  const [log,      setLog]      = useState([])
  const [error,    setError]    = useState('')

  async function parseSingle() {
    if (!cvText.trim()) return
    setParsing(true)
    setError('')
    try {
      const reply = await callClaude([{ role: 'user', content: `Parse this CV:\n\n${cvText}` }], CV_PARSE_SYSTEM, 1024)
      const parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
      const { data: saved, error: insertErr } = await supabase.from('talent_pool').insert({
        full_name:      parsed.name ?? 'Unknown',
        email:          parsed.email ?? '',
        candidate_role: parsed.currentRole ?? '',
        total_years:    parsed.totalYears ?? 0,
        skills:         parsed.skills ?? [],
        education:      parsed.education ?? '',
        summary:        parsed.summary ?? '',
        highlights:     parsed.highlights ?? [],
        availability:   'available',
        source:         'job_board',
        linkedin_url:   parsed.linkedinUrl || null,
      }).select().single()
      if (insertErr) throw new Error(insertErr.message)
      setResults([saved])
      setCvText('')
    } catch (err) {
      setError(err.message)
    }
    setParsing(false)
  }

  async function parseBulk() {
    const sections = cvText.split(/\n---\n|^---$/m).map(s => s.trim()).filter(Boolean)
    if (!sections.length) return
    setParsing(true)
    setLog([])
    setResults([])
    setError('')
    const newResults = []
    for (let i = 0; i < sections.length; i++) {
      addLog(setLog, `[${i + 1}/${sections.length}] Parsing CV…`, 'info')
      try {
        const reply = await callClaude([{ role: 'user', content: `Parse this CV:\n\n${sections[i]}` }], CV_PARSE_SYSTEM, 1024)
        const parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
        const { data: saved, error: insertErr } = await supabase.from('talent_pool').insert({
          full_name:      parsed.name ?? 'Unknown',
          email:          parsed.email ?? '',
          candidate_role: parsed.currentRole ?? '',
          total_years:    parsed.totalYears ?? 0,
          skills:         parsed.skills ?? [],
          education:      parsed.education ?? '',
          summary:        parsed.summary ?? '',
          highlights:     parsed.highlights ?? [],
          availability:   'available',
          source:         'job_board',
          linkedin_url:   parsed.linkedinUrl || null,
        }).select().single()
        if (insertErr) throw new Error(insertErr.message)
        newResults.push({ ...saved, _ok: true })
        addLog(setLog, `✓ ${parsed.name ?? 'Unknown'} — ${parsed.currentRole ?? ''}`, 'ok')
      } catch (err) {
        newResults.push({ full_name: `CV ${i + 1}`, _ok: false, _err: err.message })
        addLog(setLog, `✗ CV ${i + 1}: ${err.message}`, 'err')
      }
    }
    setResults(newResults)
    setCvText('')
    setParsing(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '14px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>How to source from job boards</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--text-2)' }}>
          <li>Open a candidate profile on Indeed, Reed, Totaljobs, or CV Library</li>
          <li>Copy the CV text and paste below</li>
          <li>Bulk mode: separate multiple CVs with <code style={{ background: 'var(--surface2)', padding: '1px 4px' }}>---</code> on its own line</li>
        </ul>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className={`btn ${!bulkMode ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setBulkMode(false)}>Single CV</button>
        <button className={`btn ${bulkMode ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setBulkMode(true)}>Bulk Mode</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {results.map((r, i) => (
            <div key={i} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, background: r._ok ? 'var(--green-d)' : 'rgba(220,53,69,0.08)', color: r._ok ? 'var(--green)' : 'var(--red)' }}>
              {r._ok ? `✓ ${r.full_name} (${r.candidate_role ?? '—'}) added to pool` : `✗ ${r.full_name}: ${r._err}`}
            </div>
          ))}
        </div>
      )}

      <textarea
        style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', minHeight: bulkMode ? 280 : 200, fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
        value={cvText}
        onChange={e => setCvText(e.target.value)}
        placeholder={bulkMode ? 'Paste CV 1 here\n\n---\n\nPaste CV 2 here\n\n---\n\nPaste CV 3 here' : 'Paste CV text here…'}
      />

      {log.length > 0 && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', maxHeight: 160, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {log.map(l => <div key={l.id} style={{ color: l.type === 'ok' ? 'var(--green)' : l.type === 'err' ? 'var(--red)' : 'var(--text-3)', marginBottom: 2 }}>{l.msg}</div>)}
        </div>
      )}

      <button className="btn btn-primary" disabled={!cvText.trim() || parsing} onClick={bulkMode ? parseBulk : parseSingle}>
        {parsing ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Parsing…</> : bulkMode ? `Parse All CVs` : '◈ Add to Pool'}
      </button>
    </div>
  )
}

// ── Outreach Templates Tab ─────────────────────────────────────────────────────
function TemplatesTab() {
  const { values, updateField } = useFormPersistence('outreach_template', {})
  const [copied, setCopied] = useState(null)

  function fillTemplate(template, ph, v) {
    let filled = template
    for (const p of ph) {
      const val = (v[p] ?? '').trim() || `[${p}]`
      filled = filled.replaceAll(`[${p}]`, val)
    }
    return filled
  }

  async function copy(tmpl) {
    const filled = fillTemplate(tmpl.template, tmpl.placeholders, values[tmpl.id] ?? {})
    await navigator.clipboard.writeText(filled)
    setCopied(tmpl.id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {OUTREACH_TEMPLATES.map(tmpl => {
        const v = values[tmpl.id] ?? {}
        const setV = (k, val) => updateField(tmpl.id, { ...(values[tmpl.id] ?? {}), [k]: val })
        const filled = fillTemplate(tmpl.template, tmpl.placeholders, v)

        return (
          <div key={tmpl.id} className="section-card" style={{ marginBottom: 0 }}>
            <div className="section-card-head">
              <h3 style={{ fontSize: 14 }}>{tmpl.title}</h3>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => copy(tmpl)}
              >
                {copied === tmpl.id ? '✓ Copied!' : '⎘ Copy'}
              </button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Placeholder inputs */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tmpl.placeholders.map(ph => (
                  <input
                    key={ph}
                    style={{ flex: '1 1 140px', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-body)' }}
                    value={v[ph] ?? ''}
                    onChange={e => setV(ph, e.target.value)}
                    placeholder={ph.replace(/_/g, ' ')}
                  />
                ))}
              </div>
              {/* Live preview */}
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
                {filled}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AdminSourcing() {
  const [tab, setTab] = useState('linkedin')

  const TABS = [
    { key: 'linkedin',   label: 'LinkedIn' },
    { key: 'jobboards',  label: 'Job Boards' },
    { key: 'templates',  label: 'Outreach Templates' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div><h2>Sourcing</h2><p>Add candidates from LinkedIn, job boards, and outreach</p></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="section-card">
        <div className="section-card-body" style={{ padding: 24 }}>
          {tab === 'linkedin'  && <LinkedInTab />}
          {tab === 'jobboards' && <JobBoardsTab />}
          {tab === 'templates' && <TemplatesTab />}
        </div>
      </div>
    </div>
  )
}
