import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { triggerTalentPoolMatch } from '../../utils/talentPool'
import TagInput from '../../components/TagInput'
import JDWizard from '../../components/JDWizard'
import InstantPost from '../../components/InstantPost'

const DEFAULT = { title: '', experience_years: 3, required_skills: [], preferred_skills: [], description: '', tech_weight: 60, comm_weight: 40 }
const REC_COLOR = { 'Strong Hire': 'var(--green)', 'Hire': 'var(--accent)', 'Borderline': 'var(--amber)', 'Reject': 'var(--red)' }
const mono = { fontFamily: 'var(--font-mono)' }

function dimColor(v) { return v >= 70 ? 'var(--green)' : v >= 50 ? 'var(--accent)' : 'var(--red)' }

function getStage(c) {
  if (c.final_decision === 'hired' || c.offer_status === 'sent') return 'Hired'
  if (c.scores?.overallScore != null) return 'Interview Done'
  if (c.match_pass === true) return 'Interview Pending'
  if (c.match_pass === false) return 'Screened Out'
  return 'Applied'
}

function PipelineFunnel({ candidates, activeStage, onStageClick }) {
  const stages = [
    { key: 'all',              label: 'Total',            color: 'var(--accent)',  count: candidates.length },
    { key: 'Interview Pending',label: 'Interview Pending',color: 'var(--amber)',   count: candidates.filter(c => getStage(c) === 'Interview Pending').length },
    { key: 'Interview Done',   label: 'Interview Done',   color: 'var(--accent)',  count: candidates.filter(c => getStage(c) === 'Interview Done').length },
    { key: 'Screened Out',     label: 'Screened Out',     color: 'var(--red)',     count: candidates.filter(c => getStage(c) === 'Screened Out').length },
    { key: 'Hired',            label: 'Hired',            color: 'var(--green)',   count: candidates.filter(c => getStage(c) === 'Hired').length },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}>
      {stages.map(s => (
        <div
          key={s.key}
          onClick={() => onStageClick(s.key)}
          style={{
            padding: '14px 12px', background: 'var(--surface)', border: `1px solid ${activeStage === s.key ? s.color : 'var(--border)'}`,
            borderTop: `3px solid ${s.color}`, cursor: 'pointer', textAlign: 'center',
            boxShadow: activeStage === s.key ? `0 0 0 1px ${s.color}` : 'none',
          }}
        >
          <div style={{ fontSize: 26, fontFamily: 'var(--font-head)', fontWeight: 300, color: s.color, lineHeight: 1 }}>{s.count}</div>
          <div style={{ fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginTop: 4 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

function JobDetail({ job, onBack }) {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    supabase.from('candidates').select('*').eq('job_id', job.id)
      .order('match_score', { ascending: false, nullsFirst: false })
      .then(({ data }) => { setCandidates(data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [job.id])

  const filtered = stageFilter === 'all' ? candidates : candidates.filter(c => getStage(c) === stageFilter)
  const selected = candidates.find(c => c.id === selectedId)

  if (selected) {
    const s = selected.scores ?? {}
    const rec = s.recommendation
    return (
      <div className="page">
        <button className="btn btn-secondary" style={{ marginBottom: 20 }} onClick={() => setSelectedId(null)}>← Back to pipeline</button>
        <div className="profile-hero">
          <div className="profile-avatar">{(selected.full_name ?? '?')[0].toUpperCase()}</div>
          <div className="profile-id" style={{ flex: 1 }}>
            <h3>{selected.full_name}</h3>
            <p>{selected.candidate_role}{selected.total_years ? ` · ${selected.total_years}y exp` : ''}</p>
            {selected.match_score != null && (
              <div style={{ marginTop: 8 }}>
                <span className={`badge ${selected.match_pass ? 'badge-green' : 'badge-red'}`}>Screen {selected.match_score}/100</span>
              </div>
            )}
          </div>
          {s.overallScore != null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: dimColor(s.overallScore), lineHeight: 1 }}>{s.overallScore}</div>
              {rec && <div style={{ fontSize: 11, ...mono, textTransform: 'uppercase', color: REC_COLOR[rec] ?? 'var(--text-3)' }}>{rec}</div>}
            </div>
          )}
        </div>
        {selected.match_reason && (
          <div style={{ margin: '16px 0', padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `2px solid ${selected.match_pass ? 'var(--green)' : 'var(--red)'}`, fontSize: 13, color: 'var(--text-2)' }}>
            <div style={{ fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 4 }}>Screening verdict</div>
            {selected.match_reason}
          </div>
        )}
        {s.overallScore != null && (
          <div className="section-card">
            <div className="section-card-head"><h3>Interview Assessment</h3></div>
            <div className="section-card-body">
              {[['technicalAbility','Technical'],['communication','Communication'],['roleFit','Role Fit'],['problemSolving','Problem Solving'],['experienceRelevance','Experience']].map(([key, label]) => (
                <div key={key} className="score-dim" style={{ marginBottom: 10 }}>
                  <span className="dim-label">{label}</span>
                  <div className="dim-track"><div className="dim-fill" style={{ width: `${s[key] ?? 0}%`, background: dimColor(s[key] ?? 0) }} /></div>
                  <span className="dim-val">{s[key] ?? '—'}</span>
                </div>
              ))}
              {s.insight && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, fontStyle: 'italic' }}>{s.insight}</p>}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" onClick={onBack}>← My Jobs</button>
          <div>
            <h2 style={{ margin: 0 }}>{job.title}</h2>
            <p style={{ margin: 0 }}>{job.experience_years}+ yrs{job.required_skills?.length ? ` · ${job.required_skills.slice(0, 4).join(', ')}` : ''}</p>
          </div>
        </div>
        <span className={`badge ${job.status === 'active' ? 'badge-green' : 'badge-amber'}`}>{job.status}</span>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div> : (
        <>
          <PipelineFunnel candidates={candidates} activeStage={stageFilter} onStageClick={setStageFilter} />

          <div className="section-card">
            <div className="section-card-head">
              <h3>{stageFilter === 'all' ? 'All Candidates' : stageFilter}</h3>
              <span className="badge">{filtered.length}</span>
            </div>
            {filtered.length === 0 ? (
              <div className="empty-state">No candidates in this stage yet</div>
            ) : filtered.map(c => {
              const s = c.scores ?? {}
              const stage = getStage(c)
              const stageColor = { 'Hired': 'badge-green', 'Interview Done': 'badge-green', 'Interview Pending': 'badge-amber', 'Screened Out': 'badge-red', 'Applied': '' }
              return (
                <div key={c.id} className="table-row clickable" onClick={() => setSelectedId(c.id)}>
                  <div className="col-main">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="profile-avatar" style={{ width: 32, height: 32, fontSize: 13, borderRadius: 'var(--r)', flexShrink: 0 }}>
                        {(c.full_name ?? '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="col-name">{c.full_name}</div>
                        <div className="col-sub">{c.candidate_role}{c.total_years ? ` · ${c.total_years}y` : ''}</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-right">
                    {c.match_score != null && (
                      <span style={{ fontSize: 11, ...mono, color: 'var(--text-3)' }}>Screen {c.match_score}</span>
                    )}
                    {s.overallScore != null && (
                      <span style={{ fontSize: 13, fontWeight: 700, ...mono, color: dimColor(s.overallScore) }}>{s.overallScore}</span>
                    )}
                    {s.recommendation && (
                      <span style={{ fontSize: 11, fontWeight: 600, ...mono, color: REC_COLOR[s.recommendation] ?? 'var(--text-3)' }}>{s.recommendation}</span>
                    )}
                    <span className={`badge ${stageColor[stage] ?? ''}`} style={{ fontSize: 10 }}>{stage}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function ClientJobs() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [showInstant, setShowInstant] = useState(false)
  const [wizardPrefill, setWizardPrefill] = useState(null)
  const [form, setForm] = useState(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [poolStatus, setPoolStatus] = useState({})
  const [selectedJob, setSelectedJob] = useState(null)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    const { data } = await supabase.from('jobs').select('*, candidates(count)').eq('recruiter_id', user.id).order('created_at', { ascending: false })
    setJobs(data ?? [])
    setLoading(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setTech = (v) => { set('tech_weight', v); set('comm_weight', 100 - v) }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { data, error: err } = await supabase.from('jobs').insert({
      recruiter_id: user.id,
      title: form.title,
      experience_years: form.experience_years,
      required_skills: form.required_skills,
      preferred_skills: form.preferred_skills,
      description: form.description,
      tech_weight: form.tech_weight,
      comm_weight: form.comm_weight,
      status: 'active',
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setJobs(p => [data, ...p])
    setShowForm(false)
    setForm(DEFAULT)

    setPoolStatus(p => ({ ...p, [data.id]: 'scanning' }))
    triggerTalentPoolMatch(data.id)
      .then(passed => setPoolStatus(p => ({ ...p, [data.id]: `done:${passed}` })))
      .catch(() => setPoolStatus(p => ({ ...p, [data.id]: 'error' })))
  }

  async function handleInstantSave(jobData) {
    setShowInstant(false)
    setError('')
    const { data, error: err } = await supabase.from('jobs').insert({
      recruiter_id:    user.id,
      status:          'active',
      title:           jobData.title,
      description:     jobData.description,
      required_skills: jobData.required_skills,
      preferred_skills:jobData.preferred_skills,
      experience_years:jobData.experience_years,
      tech_weight:     jobData.tech_weight,
      comm_weight:     jobData.comm_weight,
    }).select().single()
    if (err) { setError(err.message); return }
    await load()
    setPoolStatus(p => ({ ...p, [data.id]: 'scanning' }))
    triggerTalentPoolMatch(data.id)
      .then(passed => setPoolStatus(p => ({ ...p, [data.id]: `done:${passed}` })))
      .catch(() => setPoolStatus(p => ({ ...p, [data.id]: 'error' })))
  }

  async function handleWizardSave(jobData) {
    setShowWizard(false)
    setError('')
    const { data, error: err } = await supabase.from('jobs').insert({
      recruiter_id: user.id,
      status: 'active',
      title:            jobData.title,
      description:      jobData.description,
      required_skills:  jobData.required_skills,
      preferred_skills: jobData.preferred_skills,
      experience_years: jobData.experience_years,
      tech_weight:      jobData.tech_weight,
      comm_weight:      jobData.comm_weight,
    }).select().single()
    if (err) { setError(err.message); return }

    await load()

    setPoolStatus(p => ({ ...p, [data.id]: 'scanning' }))
    triggerTalentPoolMatch(data.id)
      .then(passed => setPoolStatus(p => ({ ...p, [data.id]: `done:${passed}` })))
      .catch(() => setPoolStatus(p => ({ ...p, [data.id]: 'error' })))
  }

  async function toggleStatus(job, e) {
    e.stopPropagation()
    const newStatus = job.status === 'active' ? 'closed' : 'active'
    await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id)
    setJobs(p => p.map(j => j.id === job.id ? { ...j, status: newStatus } : j))
  }

  const activeJobs = jobs.filter(j => j.status === 'active')
  const closedJobs = jobs.filter(j => j.status !== 'active')

  if (loading) return <div className="page"><span className="spinner" /></div>

  if (selectedJob) return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>My Jobs</h2>
          <p>{activeJobs.length} active · {closedJobs.length} closed</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => { setShowForm(!showForm); setError('') }}>
            {showForm ? 'Cancel' : '+ Quick Add'}
          </button>
          <button className="btn btn-secondary" onClick={() => { setShowWizard(true); setShowForm(false) }}>
            Step-by-step
          </button>
          <button className="btn btn-primary" onClick={() => { setShowInstant(true); setShowForm(false) }}>
            ✨ Post a Job
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="section-card-head"><h3>New Job Posting</h3></div>
          <div className="section-card-body">
            <form onSubmit={handleCreate}>
              <div className="form-grid">
                <div className="field">
                  <label>Job Title</label>
                  <input type="text" required value={form.title} placeholder="e.g. Senior Backend Engineer" onChange={e => set('title', e.target.value)} />
                </div>
                <div className="field">
                  <label>Years of Experience</label>
                  <input type="number" min={0} value={form.experience_years} onChange={e => set('experience_years', +e.target.value)} />
                </div>
                <div className="field span-2">
                  <label>Required Skills</label>
                  <TagInput value={form.required_skills} onChange={v => set('required_skills', v)} placeholder="Type and press Enter…" />
                </div>
                <div className="field span-2">
                  <label>Preferred Skills</label>
                  <TagInput value={form.preferred_skills} onChange={v => set('preferred_skills', v)} placeholder="Nice-to-have…" />
                </div>
                <div className="field span-2">
                  <label>Description</label>
                  <textarea rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Role responsibilities and context…" />
                </div>
                <div className="field span-2">
                  <label>Evaluation Weights</label>
                  <div className="weight-sliders">
                    <div className="weight-row">
                      <span>Technical</span>
                      <input type="range" min={10} max={90} value={form.tech_weight} onChange={e => setTech(+e.target.value)} />
                      <span className="weight-val">{form.tech_weight}%</span>
                    </div>
                    <div className="weight-row">
                      <span>Communication</span>
                      <input type="range" min={10} max={90} value={form.comm_weight} onChange={e => { set('comm_weight', +e.target.value); set('tech_weight', 100 - +e.target.value) }} />
                      <span className="weight-val">{form.comm_weight}%</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: 20 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : 'Create Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="section-card">
          <div className="empty-state">
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>◫</div>
            <div style={{ fontSize: 16, fontFamily: 'var(--font-head)', fontWeight: 400, color: 'var(--text-2)', marginBottom: 8 }}>No job postings yet</div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>Create your first job to start the hiring pipeline.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(true)}>+ Quick Add</button>
              <button className="btn btn-primary" onClick={() => setShowInstant(true)}>✨ Post a Job</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {activeJobs.length > 0 && (
            <div className="section-card" style={{ marginBottom: 16 }}>
              <div className="section-card-head"><h3>Active</h3><span className="badge badge-green">{activeJobs.length}</span></div>
              {activeJobs.map(j => (
                <div key={j.id} className="table-row clickable" onClick={() => setSelectedJob(j)}>
                  <div className="col-main">
                    <div className="col-name">
                      {j.job_code && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '1px 6px', marginRight: 7, letterSpacing: '0.04em' }}>{j.job_code}</span>}
                      {j.title}
                    </div>
                    <div className="col-sub">
                      {j.experience_years}+ yrs
                      {j.required_skills?.length ? ` · ${j.required_skills.slice(0, 3).join(', ')}${j.required_skills.length > 3 ? '…' : ''}` : ''}
                    </div>
                  </div>
                  <div className="col-right">
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {j.candidates?.[0]?.count ?? 0} candidate{j.candidates?.[0]?.count !== 1 ? 's' : ''}
                    </span>
                    {poolStatus[j.id] === 'scanning' && (
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="spinner" style={{ width: 9, height: 9 }} /> scanning pool…
                      </span>
                    )}
                    {poolStatus[j.id]?.startsWith('done:') && (
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                        ✓ {poolStatus[j.id].split(':')[1]} pool match{poolStatus[j.id].split(':')[1] !== '1' ? 'es' : ''}
                      </span>
                    )}
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {new Date(j.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '4px 10px' }}
                      onClick={e => toggleStatus(j, e)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {closedJobs.length > 0 && (
            <div className="section-card">
              <div className="section-card-head"><h3>Closed</h3><span className="badge badge-amber">{closedJobs.length}</span></div>
              {closedJobs.map(j => (
                <div key={j.id} className="table-row" style={{ opacity: 0.6 }}>
                  <div className="col-main">
                    <div className="col-name">
                      {j.job_code && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '1px 6px', marginRight: 7, letterSpacing: '0.04em' }}>{j.job_code}</span>}
                      {j.title}
                    </div>
                    <div className="col-sub">{j.experience_years}+ yrs</div>
                  </div>
                  <div className="col-right">
                    <span className="badge badge-amber">closed</span>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '4px 10px' }}
                      onClick={e => toggleStatus(j, e)}
                    >
                      Reopen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showInstant && (
        <InstantPost
          onClose={() => setShowInstant(false)}
          onSave={handleInstantSave}
          onCustomize={(prefill) => {
            setWizardPrefill(prefill)
            setShowInstant(false)
            setShowWizard(true)
          }}
        />
      )}

      {showWizard && (
        <JDWizard
          onClose={() => { setShowWizard(false); setWizardPrefill(null) }}
          onSave={handleWizardSave}
          showAssign={false}
          prefill={wizardPrefill}
        />
      )}
    </div>
  )
}
