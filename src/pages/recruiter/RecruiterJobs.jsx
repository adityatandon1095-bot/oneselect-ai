import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { triggerTalentPoolMatch } from '../../utils/talentPool'
import TagInput from '../../components/TagInput'
import JDWizard from '../../components/JDWizard'
import InstantPost from '../../components/InstantPost'

const DEFAULT = { title: '', experience_years: 3, required_skills: [], preferred_skills: [], description: '', tech_weight: 60, comm_weight: 40 }

export default function RecruiterJobs() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [showInstant, setShowInstant] = useState(false)
  const [wizardPrefill, setWizardPrefill] = useState(null)
  const [form, setForm] = useState(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [poolStatus, setPoolStatus] = useState({}) // jobId → 'scanning' | 'done:N' | 'error'

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

    // Fire pool match in background
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
    // Only send columns that exist in the base jobs schema.
    // New columns (industry, location, work_mode, comp_min, comp_max) require
    // running the SQL migration first — safe to omit until then.
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

    // Re-fetch so the list gets the candidates(count) join correctly
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
            {/* error shown above, outside this block */}
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
                <div key={j.id} className="table-row clickable" onClick={() => navigate('/recruiter/candidates')}>
                  <div className="col-main">
                    <div className="col-name">{j.title}</div>
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
                    <div className="col-name">{j.title}</div>
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
