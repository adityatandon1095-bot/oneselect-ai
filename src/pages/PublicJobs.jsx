import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { extractContent, isSupported, ACCEPT_ATTR } from '../utils/fileExtract'
import { parseExperience } from '../utils/parseExperience'
import { fmtSalary } from '../utils/currency'

const mono = { fontFamily: 'var(--font-mono)' }

function JobCard({ job, onApply }) {
  const salary = fmtSalary(job.salary_min, job.salary_max, job.salary_currency)
  return (
    <div style={{ background: 'white', border: '1px solid #E8E4DC', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontFamily: 'Georgia, serif', color: '#2D3748', marginBottom: 4 }}>{job.title}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {job.experience_years > 0 && (
              <span style={{ fontSize: 12, ...mono, color: '#9CA3AF' }}>{job.experience_years}+ yrs exp</span>
            )}
            {job.industry && (
              <span style={{ fontSize: 12, ...mono, color: '#9CA3AF' }}>· {job.industry}</span>
            )}
            {job.company_size && (
              <span style={{ fontSize: 12, ...mono, color: '#9CA3AF' }}>· {job.company_size}</span>
            )}
            {salary && (
              <span style={{ fontSize: 12, ...mono, color: '#B8924A', fontWeight: 600 }}>{salary}</span>
            )}
          </div>
          {job.required_skills?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {job.required_skills.slice(0, 6).map(s => (
                <span key={s} style={{ fontSize: 10, ...mono, padding: '2px 8px', background: '#F3F0EA', color: '#6B7280', border: '1px solid #E8E4DC' }}>{s}</span>
              ))}
              {job.required_skills.length > 6 && (
                <span style={{ fontSize: 10, ...mono, color: '#9CA3AF' }}>+{job.required_skills.length - 6} more</span>
              )}
            </div>
          )}
          {job.description && (
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 10, marginBottom: 0, lineHeight: 1.6, maxHeight: 60, overflow: 'hidden' }}>{job.description}</p>
          )}
        </div>
        <button
          onClick={() => onApply(job)}
          style={{ flexShrink: 0, padding: '8px 20px', background: '#B8924A', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, ...mono, whiteSpace: 'nowrap' }}
        >
          Apply →
        </button>
      </div>
    </div>
  )
}

function ApplyModal({ job, onClose }) {
  const [step, setStep] = useState('form') // form | parsing | done | error
  const [form, setForm] = useState({ name: '', email: '', phone: '', linkedin_url: '', github_url: '' })
  const [cvFile, setCvFile] = useState(null)
  const [cvText, setCvText] = useState('')
  const [useText, setUseText] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const fileRef = useRef()

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleFile(file) {
    if (!file || !isSupported(file.name)) return
    setCvFile(file)
    setUseText(false)
  }

  async function submit() {
    if (!form.name.trim() || !form.email.trim()) return
    if (!cvFile && !cvText.trim()) return

    setStep('parsing')
    setErrMsg('')
    try {
      let content
      if (cvFile) {
        content = await extractContent(cvFile)
      } else {
        content = { kind: 'text', text: cvText }
      }

      const rawText = content.kind === 'text' ? content.text : ''

      const { error } = await supabase.from('candidates').insert({
        job_id:       job.id,
        full_name:    form.name.trim(),
        email:        form.email.trim(),
        phone:        form.phone.trim() || '',
        raw_text:     rawText,
        linkedin_url: form.linkedin_url.trim() || null,
        github_url:   form.github_url.trim() || null,
        source:       'applied',
      })

      if (error) throw new Error(error.message)

      // Fire-and-forget confirmation email
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-candidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ type: 'application_received', candidateEmail: form.email.trim(), candidateName: form.name.trim(), jobTitle: job.title }),
      }).catch(() => {})

      setStep('done')
    } catch (err) {
      setErrMsg(err.message)
      setStep('error')
    }
  }

  const MI = { width: '100%', padding: '9px 12px', border: '1px solid #E8E4DC', background: 'white', color: '#2D3748', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  const ML = { fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9CA3AF', display: 'block', marginBottom: 5 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget && step !== 'parsing') onClose() }}>
      <div style={{ background: '#F8F7F4', width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', border: '1px solid #E8E4DC' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
          <div>
            <div style={{ fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9CA3AF', marginBottom: 3 }}>Apply for</div>
            <div style={{ fontSize: 17, fontFamily: 'Georgia, serif', color: '#2D3748' }}>{job.title}</div>
          </div>
          {step !== 'parsing' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9CA3AF', lineHeight: 1 }}>✕</button>
          )}
        </div>

        <div style={{ padding: 24 }}>
          {step === 'parsing' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <span className="spinner" style={{ width: 28, height: 28 }} />
              </div>
              <div style={{ fontSize: 13, ...mono, color: '#9CA3AF' }}>Parsing your application…</div>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 22, color: '#22c55e' }}>✓</div>
              <div style={{ fontSize: 18, fontFamily: 'Georgia, serif', color: '#2D3748', marginBottom: 8 }}>Application submitted</div>
              <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.7, marginBottom: 6 }}>Thank you, {form.name}. A confirmation has been sent to <strong>{form.email}</strong>.</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.8, marginBottom: 24, textAlign: 'left', background: '#F3F0EA', padding: '14px 16px', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, color: '#6B7280', marginBottom: 6, fontSize: 11, ...mono, textTransform: 'uppercase', letterSpacing: '0.08em' }}>What happens next</div>
                <div>1. CV screened within 24 hours</div>
                <div>2. If shortlisted — video interview link sent</div>
                <div>3. Recruiter decision within 3–5 business days</div>
              </div>
              <button onClick={onClose} style={{ padding: '10px 28px', background: '#B8924A', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, ...mono }}>Close</button>
            </div>
          )}

          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 13, color: '#EF4444', marginBottom: 20 }}>Something went wrong: {errMsg}</div>
              <button onClick={() => setStep('form')} style={{ padding: '8px 20px', background: 'none', border: '1px solid #E8E4DC', cursor: 'pointer', fontSize: 13, ...mono }}>Try again</button>
            </div>
          )}

          {step === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={ML}>Full Name *</label>
                  <input autoFocus style={MI} value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Jane Smith" />
                </div>
                <div>
                  <label style={ML}>Email *</label>
                  <input type="email" style={MI} value={form.email} onChange={e => setF('email', e.target.value)} placeholder="jane@example.com" />
                </div>
                <div>
                  <label style={ML}>Phone (optional)</label>
                  <input style={MI} value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="+1 555 000 0000" />
                </div>
                <div>
                  <label style={ML}>LinkedIn (optional)</label>
                  <input style={MI} value={form.linkedin_url} onChange={e => setF('linkedin_url', e.target.value)} placeholder="linkedin.com/in/…" />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={ML}>GitHub (optional)</label>
                  <input style={MI} value={form.github_url} onChange={e => setF('github_url', e.target.value)} placeholder="github.com/…" />
                </div>
              </div>

              <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: 14 }}>
                <div style={{ fontSize: 11, ...mono, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9CA3AF', marginBottom: 10 }}>CV / Resume *</div>
                <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
                  <button onClick={() => setUseText(false)}
                    style={{ flex: 1, padding: '7px 0', border: '1px solid #E8E4DC', borderRight: 'none', cursor: 'pointer', fontSize: 11, ...mono, background: !useText ? '#F3F0EA' : 'white', color: !useText ? '#B8924A' : '#9CA3AF' }}>
                    Upload File
                  </button>
                  <button onClick={() => setUseText(true)}
                    style={{ flex: 1, padding: '7px 0', border: '1px solid #E8E4DC', cursor: 'pointer', fontSize: 11, ...mono, background: useText ? '#F3F0EA' : 'white', color: useText ? '#B8924A' : '#9CA3AF' }}>
                    Paste Text
                  </button>
                </div>

                {!useText && (
                  <div
                    onClick={() => fileRef.current.click()}
                    style={{ border: '2px dashed #E8E4DC', padding: '24px', textAlign: 'center', cursor: 'pointer', background: cvFile ? '#F3F0EA' : 'white' }}
                  >
                    <input ref={fileRef} type="file" accept={ACCEPT_ATTR} style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                    {cvFile
                      ? <div style={{ fontSize: 13, color: '#2D3748' }}>📄 {cvFile.name}</div>
                      : <>
                          <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 4 }}>Drop or click to upload</div>
                          <div style={{ fontSize: 11, ...mono, color: '#C4BAA8' }}>PDF · DOCX · TXT · JPG · PNG</div>
                        </>
                    }
                  </div>
                )}

                {useText && (
                  <textarea
                    rows={8}
                    value={cvText}
                    onChange={e => setCvText(e.target.value)}
                    placeholder="Paste your CV or resume text here…"
                    style={{ ...MI, height: 180, resize: 'vertical', lineHeight: 1.6 }}
                  />
                )}
              </div>

              {(!form.name.trim() || !form.email.trim()) && (
                <div style={{ fontSize: 11, color: '#9CA3AF', ...mono }}>* Name and email are required</div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button onClick={onClose} style={{ padding: '9px 20px', background: 'none', border: '1px solid #E8E4DC', cursor: 'pointer', fontSize: 13, ...mono }}>Cancel</button>
                <button
                  onClick={submit}
                  disabled={!form.name.trim() || !form.email.trim() || (!cvFile && !cvText.trim())}
                  style={{ padding: '9px 24px', background: '#B8924A', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, ...mono, opacity: (!form.name.trim() || !form.email.trim() || (!cvFile && !cvText.trim())) ? 0.5 : 1 }}
                >
                  Submit Application
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const EXP_FILTERS = [
  { key: 'all',    label: 'Any level',    min: null, max: null },
  { key: 'entry',  label: 'Entry (0–2y)', min: 0,    max: 2 },
  { key: 'mid',    label: 'Mid (3–5y)',   min: 3,    max: 5 },
  { key: 'senior', label: 'Senior (5+y)', min: 5,    max: null },
]

export default function PublicJobs() {
  const [jobs,    setJobs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [applyJob, setApplyJob] = useState(null)
  const [search,  setSearch]  = useState('')
  const [expFilter, setExpFilter] = useState('all')

  useEffect(() => {
    supabase.from('jobs')
      .select('id, title, experience_years, required_skills, preferred_skills, description, salary_min, salary_max, salary_currency, industry, company_size')
      .eq('status', 'active').order('created_at', { ascending: false })
      .then(({ data }) => { setJobs(data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const expCfg = EXP_FILTERS.find(f => f.key === expFilter)
  const filtered = jobs.filter(j => {
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(j.title + ' ' + (j.required_skills ?? []).join(' ') + ' ' + (j.description ?? '') + ' ' + (j.industry ?? '')).toLowerCase().includes(q)) return false
    }
    if (expCfg.min !== null && (j.experience_years ?? 0) < expCfg.min) return false
    if (expCfg.max !== null && (j.experience_years ?? 0) > expCfg.max) return false
    return true
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F4', fontFamily: 'var(--font-body, sans-serif)' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #E8E4DC', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#2D3748', letterSpacing: '0.02em' }}>One Select · Open Roles</div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{filtered.length} of {jobs.length} position{jobs.length !== 1 ? 's' : ''}</div>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px' }}>
        {/* Search + filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search roles, skills, industry…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '10px 16px', border: '1px solid #E8E4DC', background: 'white', fontSize: 13, color: '#2D3748', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 0 }}>
            {EXP_FILTERS.map((f, i) => (
              <button key={f.key} onClick={() => setExpFilter(f.key)}
                style={{ padding: '10px 14px', border: '1px solid #E8E4DC', borderLeft: i > 0 ? 'none' : '1px solid #E8E4DC', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap', background: expFilter === f.key ? '#B8924A' : 'white', color: expFilter === f.key ? 'white' : '#6B7280' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ display: 'inline-block', width: 28, height: 28, border: '2px solid #E8E4DC', borderTopColor: '#B8924A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
            {search ? 'No roles match your search.' : 'No open positions right now. Check back soon.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(job => (
            <JobCard key={job.id} job={job} onApply={setApplyJob} />
          ))}
        </div>
      </div>

      {applyJob && <ApplyModal job={applyJob} onClose={() => setApplyJob(null)} />}
    </div>
  )
}
