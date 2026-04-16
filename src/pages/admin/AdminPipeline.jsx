import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { callClaude } from '../../utils/api'
import mammoth from 'mammoth'
import { extractContent, isSupported, fileExt, ACCEPT_ATTR } from '../../utils/fileExtract'
import { triggerTalentPoolMatch, mapMatchToCandidate } from '../../utils/talentPool'
import TagInput from '../../components/TagInput'
import VideoInterview from '../../components/VideoInterview'
import VideoPlayer from '../../components/VideoPlayer'

// ── Prompts ──────────────────────────────────────────────────────────────────

const CV_PARSE_SYSTEM = `You are a CV parser. Return ONLY valid JSON — no markdown:
{"name":"string","email":"string","currentRole":"string","totalYears":number,"skills":["..."],"education":"string","summary":"string","highlights":["..."]}`

const screeningSystem = (job) =>
  `You are an expert recruiter. Evaluate this candidate against the job.
Job: ${job.title} | ${job.experience_years}+ years | Required: ${(job.required_skills ?? []).join(', ')}
Description: ${job.description ?? ''}
Return ONLY valid JSON: {"matchScore":number,"pass":boolean,"reason":"string","rank":"top10|strong|moderate|weak"}`

const interviewSystem = (job, c) =>
  `You are a technical interviewer for: ${job.title}.
Required skills: ${(job.required_skills ?? []).join(', ')}
Candidate: ${c.full_name}, ${c.candidate_role}, ${c.total_years}y exp, skills: ${(c.skills ?? []).join(', ')}
Highlights: ${(c.highlights ?? []).join('; ')}
Rules: Ask personalised questions from their CV. Cover ${job.tech_weight ?? 60}% technical, ${job.comm_weight ?? 40}% behavioural. After 4-5 answers end with exactly: INTERVIEW_COMPLETE`

const SCORING_SYSTEM = `You are an interview evaluator. Return ONLY valid JSON:
{"technicalAbility":number,"communication":number,"roleFit":number,"problemSolving":number,"experienceRelevance":number,"overallScore":number,"recommendation":"Strong Hire|Hire|Borderline|Reject","confidence":number,"insight":"string","strengths":["..."],"flags":["..."],"bestAnswer":"string"}`

const FORMAT_ICON = { pdf:'📕', docx:'📝', txt:'📄', jpg:'🖼️', jpeg:'🖼️', png:'🖼️' }
const INTERVIEW_COMPLETE = 'INTERVIEW_COMPLETE'
const DIMS = [
  ['technicalAbility','Technical'],['communication','Communication'],
  ['roleFit','Role Fit'],['problemSolving','Problem Solving'],['experienceRelevance','Experience'],
]

function dimColor(v) { return v >= 70 ? 'var(--green)' : v >= 50 ? 'var(--accent)' : 'var(--red)' }

function ScoreRing({ score, size = 48 }) {
  const r = size / 2 - 5, circ = 2 * Math.PI * r
  const fill = (score / 100) * circ, color = dimColor(score)
  return (
    <div className="score-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border2)" strokeWidth="4"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </svg>
      <div className="ring-inner"><span className="ring-val">{score}</span></div>
    </div>
  )
}

const DEFAULT_JOB_FORM = { title:'', experience_years:3, required_skills:[], preferred_skills:[], description:'', tech_weight:60, comm_weight:40 }

export default function AdminPipeline() {
  const location = useLocation()
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [clientJobs, setClientJobs] = useState([])
  const [jobId, setJobId] = useState('') // '' | 'new' | uuid
  const [jobForm, setJobForm] = useState(DEFAULT_JOB_FORM)
  const [activeJob, setActiveJob] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [screening, setScreening] = useState(false)
  const [screeningDone, setScreeningDone] = useState(false)
  const [ivStates, setIvStates] = useState({})
  const [selectedIvId, setSelectedIvId] = useState(null)
  const [log, setLog] = useState([])
  const [useTalentPool, setUseTalentPool] = useState(false)
  const [poolMatchLoading, setPoolMatchLoading] = useState(false)
  const [poolMatchProgress, setPoolMatchProgress] = useState({ current: 0, total: 0 })
  const [videoInterviewTarget, setVideoInterviewTarget] = useState(null) // candidate object
  const [videoPlayerTarget,    setVideoPlayerTarget]    = useState(null) // candidate object
  const [inviteModal, setInviteModal] = useState(null) // { candidate, email, sending, sent, error }
  const running = parsing || screening || poolMatchLoading
  const fileInputRef = useRef()
  const logRef = useRef()
  const chatRef = useRef()

  useEffect(() => { loadClients() }, [])
  useEffect(() => { if (clientId) loadClientJobs(clientId) }, [clientId])
  // Auto-select client from ?client=uuid URL param (set by Clients/Jobs pages)
  useEffect(() => {
    if (!clients.length || clientId) return
    const urlClient = new URLSearchParams(location.search).get('client')
    if (urlClient && clients.some(c => c.id === urlClient)) setClientId(urlClient)
  }, [clients, location.search])
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [log])
  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight) }, [ivStates])

  async function loadClients() {
    const { data } = await supabase.from('profiles').select('id, full_name, company_name, email').eq('user_role', 'recruiter').order('company_name')
    setClients(data ?? [])
  }

  async function loadClientJobs(cid) {
    setJobId(''); setActiveJob(null); setCandidates([]); setFiles([])
    setScreeningDone(false); setIvStates({})
    const { data } = await supabase.from('jobs').select('*').eq('recruiter_id', cid).order('created_at', { ascending: false })
    setClientJobs(data ?? [])
  }

  async function selectJob(id, poolMode = useTalentPool) {
    setJobId(id)
    if (id === 'new') { setActiveJob(null); setCandidates([]); return }
    const job = clientJobs.find(j => j.id === id)
    setActiveJob(job)

    let loaded
    if (poolMode) {
      const { data } = await supabase
        .from('job_matches')
        .select('*, talent_pool(*)')
        .eq('job_id', id)
        .order('match_score', { ascending: false, nullsFirst: false })
      loaded = (data ?? []).map(mapMatchToCandidate)
    } else {
      const { data } = await supabase.from('candidates').select('*').eq('job_id', id).order('match_score', { ascending: false })
      loaded = (data ?? []).map(c => ({ ...c, _status: c.match_score != null ? 'screened' : 'parsed' }))
    }

    setCandidates(loaded)
    setScreeningDone(loaded.some(c => c.match_score != null))
    setIvStates(Object.fromEntries(loaded.filter(c => c.match_pass).map(c => [c.id, {
      messages: c.interview_transcript ?? [], input: '', loading: false,
      complete: (c.interview_transcript ?? []).length > 0, scoring: false,
      scores: c.interview_scores ?? null,
    }])))
    if (loaded.filter(c => c.match_pass).length > 0) setSelectedIvId(loaded.find(c => c.match_pass)?.id ?? null)
  }

  async function runPoolMatch() {
    if (!activeJob) return
    setPoolMatchLoading(true)
    setPoolMatchProgress({ current: 0, total: 0 })
    addLog('Matching talent pool against job…', 'info')
    try {
      const passed = await triggerTalentPoolMatch(activeJob.id, {
        onProgress: (cur, total) => setPoolMatchProgress({ current: cur, total }),
        onLog: addLog,
      })
      addLog(`Match complete — ${passed} candidate${passed !== 1 ? 's' : ''} passed.`, 'ok')
      await selectJob(activeJob.id, true)
    } catch (err) {
      addLog(`✗ Match error: ${err.message}`, 'err')
    }
    setPoolMatchLoading(false)
  }

  const addLog = (msg, type = '') => setLog(p => [...p, { id: Date.now() + Math.random(), msg, type }])

  async function sendInvite() {
    const { candidate, email } = inviteModal
    if (!email.trim()) return
    setInviteModal(m => ({ ...m, sending: true, error: null }))
    const companyName = clients.find(c => c.id === clientId)?.company_name ?? ''
    const { error } = await supabase.functions.invoke('invite-candidate', {
      body: { email: email.trim(), name: candidate.full_name, job_title: activeJob?.title ?? '', company_name: companyName },
    })
    if (error) {
      setInviteModal(m => ({ ...m, sending: false, error: error.message }))
    } else {
      setInviteModal(m => ({ ...m, sending: false, sent: true }))
      addLog(`✉ Invite sent to ${email.trim()}`, 'ok')
    }
  }

  const setForm = (k, v) => setJobForm(f => ({ ...f, [k]: v }))
  const setTech = (v) => { setForm('tech_weight', v); setForm('comm_weight', 100 - v) }

  // ── Save new job ──────────────────────────────────────────────────────────
  async function saveJob() {
    addLog(`Creating job: ${jobForm.title}…`, 'info')
    const { data, error } = await supabase.from('jobs').insert({
      recruiter_id: clientId,
      title: jobForm.title,
      experience_years: jobForm.experience_years,
      required_skills: jobForm.required_skills,
      preferred_skills: jobForm.preferred_skills,
      description: jobForm.description,
      tech_weight: jobForm.tech_weight,
      comm_weight: jobForm.comm_weight,
      status: 'active',
    }).select().single()
    if (error) { addLog(`Error: ${error.message}`, 'err'); return }
    addLog(`✓ Job saved (${data.id})`, 'ok')
    setActiveJob(data)
    setClientJobs(p => [data, ...p])
    setJobId(data.id)
  }

  // ── CV upload ─────────────────────────────────────────────────────────────
  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming).filter(isSupported)
    if (!valid.length) return
    setFiles(p => [...p, ...valid.filter(f => !p.some(e => e.file.name === f.name))
      .map(f => ({ id: crypto.randomUUID(), file: f, ext: fileExt(f), status: 'pending', parsed: null, error: '' }))])
  }, [])

  const onDrop = useCallback((e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }, [addFiles])

  function patchFile(id, updates) { setFiles(p => p.map(f => f.id === id ? { ...f, ...updates } : f)) }

  async function parseAll() {
    if (!activeJob) return
    setParsing(true)
    for (const entry of files.filter(f => f.status === 'pending')) {
      patchFile(entry.id, { status: 'parsing' })
      addLog(`Parsing ${entry.file.name}…`, 'info')
      try {
        let content
        if (entry.ext === 'docx') {
          const arrayBuffer = await entry.file.arrayBuffer()
          const result = await mammoth.extractRawText({ arrayBuffer })
          if (!result.value?.trim()) throw new Error('No text extracted from DOCX')
          content = { kind: 'text', text: result.value }
        } else {
          content = await extractContent(entry.file)
        }
        const msgs = content.kind === 'image'
          ? [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: content.mediaType, data: content.base64 } }, { type: 'text', text: 'Parse this CV image.' }] }]
          : [{ role: 'user', content: `Parse this CV:\n\n${content.text}` }]
        const reply = await callClaude(msgs, CV_PARSE_SYSTEM, 1024)
        const parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))

        const { data: saved, error } = await supabase.from('candidates').insert({
          job_id: activeJob.id,
          full_name: parsed.name,
          email: parsed.email ?? '',
          candidate_role: parsed.currentRole ?? '',
          total_years: parsed.totalYears ?? 0,
          skills: parsed.skills ?? [],
          education: parsed.education ?? '',
          summary: parsed.summary ?? '',
          highlights: parsed.highlights ?? [],
          raw_text: content.kind === 'text' ? content.text : '',
        }).select().single()

        if (error) throw new Error(error.message)
        addLog(`✓ Saved ${parsed.name}`, 'ok')

        // Auto-invite candidate to the portal
        if (parsed.email) {
          const companyName = clients.find(c => c.id === clientId)?.company_name ?? ''
          supabase.functions.invoke('invite-candidate', {
            body: { email: parsed.email, name: parsed.name, job_title: activeJob.title, company_name: companyName },
          }).then(({ error: inviteErr }) => {
            if (inviteErr) addLog(`⚠ Invite email failed for ${parsed.name}: ${inviteErr.message}`, 'err')
            else addLog(`✉ Invite sent to ${parsed.email}`, 'ok')
          })
        }

        patchFile(entry.id, { status: 'done', parsed })
        setCandidates(p => [...p, { ...saved, _status: 'parsed' }])
      } catch (err) {
        addLog(`✗ ${entry.file.name}: ${err.message}`, 'err')
        patchFile(entry.id, { status: 'error', error: err.message })
      }
    }
    setParsing(false)
  }

  // ── Screening ─────────────────────────────────────────────────────────────
  async function runScreening() {
    if (!activeJob) return
    setScreening(true)
    const system = screeningSystem(activeJob)
    const toScreen = candidates.filter(c => c._status === 'parsed')
    // Accumulate locally — don't rely on stale candidates closure at the end
    const passedThisRun = []
    for (const c of toScreen) {
      setCandidates(p => p.map(x => x.id === c.id ? { ...x, _status: 'screening' } : x))
      addLog(`Screening ${c.full_name}…`, 'info')
      try {
        const msg = `Name: ${c.full_name}\nRole: ${c.candidate_role}\nYears: ${c.total_years}\nSkills: ${(c.skills ?? []).join(', ')}\nSummary: ${c.summary}`
        const reply = await callClaude([{ role: 'user', content: msg }], system, 512)
        const s = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
        await supabase.from('candidates').update({ match_score: s.matchScore, match_pass: s.pass, match_reason: s.reason, match_rank: s.rank }).eq('id', c.id)
        setCandidates(p => p.map(x => x.id === c.id ? { ...x, _status: 'screened', match_score: s.matchScore, match_pass: s.pass, match_reason: s.reason, match_rank: s.rank } : x))
        if (s.pass) passedThisRun.push(c)
        addLog(`✓ ${c.full_name}: ${s.matchScore}/100 → ${s.pass ? 'PASS' : 'FAIL'}`, s.pass ? 'ok' : '')
      } catch (err) {
        addLog(`✗ ${c.full_name}: ${err.message}`, 'err')
        setCandidates(p => p.map(x => x.id === c.id ? { ...x, _status: 'screened', match_score: 0, match_pass: false } : x))
      }
    }
    setScreening(false)
    setScreeningDone(true)
    setIvStates(Object.fromEntries(passedThisRun.map(c => [c.id, { messages: [], input: '', loading: false, complete: false, scoring: false, scores: null }])))
    if (passedThisRun.length > 0) setSelectedIvId(passedThisRun[0].id)
    addLog(`Screening complete. ${passedThisRun.length} passed.`, 'info')
  }

  // ── Interviews ────────────────────────────────────────────────────────────
  function patchIv(id, updates) { setIvStates(p => ({ ...p, [id]: { ...p[id], ...updates } })) }

  async function startInterview(candidate) {
    patchIv(candidate.id, { loading: true })
    addLog(`Starting interview: ${candidate.full_name}…`, 'info')
    try {
      const sys = interviewSystem(activeJob, candidate)
      const reply = await callClaude([{ role: 'user', content: 'Please begin the interview.' }], sys, 1024)
      const msgs = [{ role: 'assistant', content: reply }]
      const done = reply.includes(INTERVIEW_COMPLETE)
      patchIv(candidate.id, { messages: msgs, loading: false, complete: done })
      if (done) scoreInterview(candidate, msgs)
    } catch (err) {
      addLog(`✗ Interview error: ${err.message}`, 'err')
      patchIv(candidate.id, { loading: false })
    }
  }

  async function sendMessage(candidate, text) {
    if (!text.trim()) return
    const cur = ivStates[candidate.id]
    const msgs = [...cur.messages, { role: 'user', content: text }]
    patchIv(candidate.id, { messages: msgs, input: '', loading: true })
    try {
      const sys = interviewSystem(activeJob, candidate)
      const reply = await callClaude(msgs, sys, 1024)
      const all = [...msgs, { role: 'assistant', content: reply }]
      const done = reply.includes(INTERVIEW_COMPLETE)
      patchIv(candidate.id, { messages: all, loading: false, complete: done })
      if (done) scoreInterview(candidate, all)
    } catch (err) {
      addLog(`✗ ${err.message}`, 'err')
      patchIv(candidate.id, { loading: false })
    }
  }

  async function scoreInterview(candidate, messages) {
    patchIv(candidate.id, { scoring: true })
    addLog(`Scoring ${candidate.full_name}'s interview…`, 'info')
    const transcript = messages.map(m => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content.replace(INTERVIEW_COMPLETE,'').trim()}`).join('\n\n')
    try {
      const reply = await callClaude([{ role: 'user', content: `Score this interview:\n\n${transcript}` }], SCORING_SYSTEM, 2048)
      const scores = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
      if (candidate._fromPool) {
        await supabase.from('job_matches').update({ interview_transcript: messages, scores }).eq('id', candidate._matchId)
      } else {
        await supabase.from('candidates').update({ interview_transcript: messages, interview_scores: scores }).eq('id', candidate.id)
      }
      patchIv(candidate.id, { scoring: false, scores })
      addLog(`✓ ${candidate.full_name} scored: ${scores.overallScore}/100 — ${scores.recommendation}`, 'ok')
    } catch (err) {
      addLog(`✗ Scoring error: ${err.message}`, 'err')
      patchIv(candidate.id, { scoring: false })
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const passedCandidates = candidates.filter(c => c.match_pass)
  const selectedIv = passedCandidates.find(c => c.id === selectedIvId)
  const selIvState = selectedIvId ? ivStates[selectedIvId] : null
  const doneCount  = files.filter(f => f.status === 'done').length
  const pendingCount = files.filter(f => f.status === 'pending').length
  const screenedCount = candidates.filter(c => c._status === 'screened').length
  const parseProgress = files.length ? (doneCount / files.length) * 100 : 0
  const screenProgress = candidates.length ? (screenedCount / candidates.length) * 100 : 0

  const clientLabel = (c) => c.company_name || c.full_name || c.email

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-head">
        <div><h2>Pipeline</h2><p>Run the full AI hiring pipeline for a client</p></div>
      </div>

      {/* ── 1 Setup ── */}
      <div className="section-card">
        <div className="section-card-head"><h3>1 · Job Setup</h3></div>
        <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grid">
            <div className="field">
              <label>Select Client</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}>
                <option value="">— choose client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Select Job</label>
              <select value={jobId} disabled={!clientId} onChange={e => selectJob(e.target.value)}>
                <option value="">— choose job —</option>
                <option value="new">+ Create new job</option>
                {clientJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
          </div>

          {jobId === 'new' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div className="form-grid">
                <div className="field">
                  <label>Job Title</label>
                  <input type="text" value={jobForm.title} placeholder="e.g. Senior Backend Engineer" onChange={e => setForm('title', e.target.value)} />
                </div>
                <div className="field">
                  <label>Years of Experience</label>
                  <input type="number" min={0} value={jobForm.experience_years} onChange={e => setForm('experience_years', +e.target.value)} />
                </div>
                <div className="field span-2">
                  <label>Required Skills</label>
                  <TagInput value={jobForm.required_skills} onChange={v => setForm('required_skills', v)} placeholder="Type and press Enter…" />
                </div>
                <div className="field span-2">
                  <label>Preferred Skills</label>
                  <TagInput value={jobForm.preferred_skills} onChange={v => setForm('preferred_skills', v)} placeholder="Nice-to-have…" />
                </div>
                <div className="field span-2">
                  <label>Description</label>
                  <textarea rows={4} value={jobForm.description} onChange={e => setForm('description', e.target.value)} placeholder="Role responsibilities and context…" />
                </div>
                <div className="field span-2">
                  <label>Evaluation Weights</label>
                  <div className="weight-sliders">
                    <div className="weight-row">
                      <span>Technical</span>
                      <input type="range" min={10} max={90} value={jobForm.tech_weight} onChange={e => setTech(+e.target.value)} />
                      <span className="weight-val">{jobForm.tech_weight}%</span>
                    </div>
                    <div className="weight-row">
                      <span>Communication</span>
                      <input type="range" min={10} max={90} value={jobForm.comm_weight} onChange={e => { setForm('comm_weight', +e.target.value); setForm('tech_weight', 100 - +e.target.value) }} />
                      <span className="weight-val">{jobForm.comm_weight}%</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" disabled={!jobForm.title.trim() || !clientId} onClick={saveJob}>Save Job</button>
              </div>
            </div>
          )}

          {activeJob && (
            <div style={{ padding: '10px 14px', background: 'var(--green-d)', borderLeft: '2px solid var(--green)', fontSize: 13, color: 'var(--green)' }}>
              ✓ Active job: <strong>{activeJob.title}</strong>
            </div>
          )}
        </div>
      </div>

      {/* ── 2 Candidates ── */}
      {activeJob && (
        <div className="section-card">
          <div className="section-card-head">
            <h3>{useTalentPool ? '2 · Talent Pool' : '2 · CV Upload'}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="mono text-muted" style={{ fontSize: 11 }}>{candidates.length} candidates</span>
              <button
                className={`btn ${useTalentPool ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => {
                  const next = !useTalentPool
                  setUseTalentPool(next)
                  if (jobId && jobId !== 'new') selectJob(jobId, next)
                }}
              >
                {useTalentPool ? '◎ Pool mode' : '◎ Use Talent Pool'}
              </button>
            </div>
          </div>
          <div className="section-card-body">
            {useTalentPool ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                  Match all available talent pool candidates against this job using AI screening.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    className="btn btn-primary"
                    disabled={poolMatchLoading}
                    onClick={runPoolMatch}
                  >
                    {poolMatchLoading ? (
                      <>
                        <span className="spinner" style={{ width: 12, height: 12 }} />
                        {poolMatchProgress.total > 0
                          ? ` ${poolMatchProgress.current}/${poolMatchProgress.total}`
                          : ' Matching…'}
                      </>
                    ) : 'Run Pool Match'}
                  </button>
                  {poolMatchLoading && poolMatchProgress.total > 0 && (
                    <div style={{ flex: 1 }}>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${(poolMatchProgress.current / poolMatchProgress.total) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`drop-zone${dragging ? ' drag-over' : ''}`}
                  onDrop={onDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileInputRef.current.click()}
                >
                  <div className="drop-icon">⬆</div>
                  <p>Drop CVs or <span className="link">browse</span></p>
                  <div className="format-pills">{['PDF','DOCX','TXT','JPG','PNG'].map(f => <span key={f} className="format-pill">{f}</span>)}</div>
                  <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
                </div>

                {files.length > 0 && (
                  <div className="file-list">
                    <div className="file-list-header">
                      <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
                      {parsing && <div style={{ flex: 1 }}><div className="progress-track"><div className="progress-fill" style={{ width: `${parseProgress}%` }} /></div></div>}
                      <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} disabled={!pendingCount || parsing || !activeJob} onClick={parseAll}>
                        {parsing ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Parsing…</> : 'Parse with AI'}
                      </button>
                    </div>
                    {files.map(f => (
                      <div key={f.id} className="file-row">
                        <div className="file-info">
                          <span className="file-icon">{FORMAT_ICON[f.ext] ?? '📄'}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span className="file-name">{f.file.name}</span>
                              <span className={`badge ${f.ext === 'pdf' ? 'badge-red' : f.ext === 'docx' ? 'badge-blue' : 'badge-amber'}`} style={{ fontSize: 9 }}>{f.ext?.toUpperCase()}</span>
                            </div>
                            {f.parsed && <div className="file-parsed"><strong>{f.parsed.name}</strong> · {f.parsed.currentRole}</div>}
                            {f.status === 'error' && <div className="error-text">⚠ {f.error}</div>}
                          </div>
                        </div>
                        <div className="file-status">
                          {f.status === 'pending'  && <span className="badge badge-amber">Pending</span>}
                          {f.status === 'parsing'  && <span className="spinner" />}
                          {f.status === 'done'     && <span className="badge badge-green">Parsed</span>}
                          {f.status === 'error'    && <span className="badge badge-red">Error</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 3 Screening ── */}
      {activeJob && candidates.length > 0 && (
        <div className="section-card">
          <div className="section-card-head">
            <h3>3 · AI Screening</h3>
            {screening && <div style={{ flex: 1, margin: '0 16px' }}><div className="progress-track"><div className="progress-fill" style={{ width: `${screenProgress}%` }} /></div></div>}
            {!screeningDone && <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} disabled={screening || candidates.length === 0} onClick={runScreening}>Run Screening</button>}
          </div>
          <div className="candidate-list">
            {[...candidates].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1)).map((c, i) => (
              <div key={c.id} className={`candidate-row${c.match_pass === false ? ' dimmed' : ''}`} style={{ cursor: 'default' }}>
                <div className="c-rank">#{i + 1}</div>
                <div className="c-info">
                  <div className="c-name">{c.full_name}</div>
                  <div className="c-meta">{c.candidate_role} · {c.total_years}y</div>
                  {c.match_reason && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3 }}>{c.match_reason}</div>}
                </div>
                <div className="c-score">
                  {c._status === 'screening' && <span className="spinner" />}
                  {c.match_score != null && <ScoreRing score={c.match_score} size={42} />}
                  {c.match_rank && <span className={`badge ${c.match_rank === 'top10' ? 'badge-blue' : c.match_rank === 'strong' ? 'badge-green' : c.match_rank === 'moderate' ? 'badge-amber' : 'badge-red'}`}>{c.match_rank}</span>}
                  {c.match_pass != null && <span className={`badge ${c.match_pass ? 'badge-green' : 'badge-red'}`}>{c.match_pass ? 'Pass' : 'Fail'}</span>}
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 10, padding: '2px 8px' }}
                    onClick={e => { e.stopPropagation(); setInviteModal({ candidate: c, email: c.email ?? '', sending: false, sent: false, error: null }) }}
                  >✉ Invite</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4 Interviews ── */}
      {screeningDone && passedCandidates.length > 0 && (
        <div className="section-card">
          <div className="section-card-head"><h3>4 · AI Interviews</h3><span className="mono text-muted" style={{ fontSize: 11 }}>{passedCandidates.length} candidates passed</span></div>
          <div className="section-card-body" style={{ padding: 0 }}>
            <div className="interview-panel">
              {/* sidebar */}
              <div className="iv-sidebar">
                <div className="iv-sidebar-head">Passed Candidates</div>
                {passedCandidates.map(c => {
                  const s = ivStates[c.id]
                  const hasVideo = c.video_urls?.length > 0
                  return (
                    <div key={c.id} className={`candidate-row${c.id === selectedIvId ? ' active' : ''}`} onClick={() => setSelectedIvId(c.id)}>
                      <div className="c-info">
                        <div className="c-name" style={{ fontSize: 12 }}>{c.full_name}</div>
                        <div className="c-meta">{c.candidate_role}</div>
                        {/* Video interview actions */}
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }} onClick={e => e.stopPropagation()}>
                          {hasVideo ? (
                            <>
                              <span className="badge badge-green" style={{ fontSize: 8 }}>
                                Video · {c.integrity_score ?? 100}%
                              </span>
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: 9, padding: '2px 6px' }}
                                onClick={() => setVideoPlayerTarget(c)}
                              >▶ Watch</button>
                            </>
                          ) : (
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: 9, padding: '2px 6px', color: 'var(--accent)' }}
                              onClick={() => setVideoInterviewTarget(c)}
                            >📹 Video Interview</button>
                          )}
                        </div>
                      </div>
                      <div>
                        {!s?.messages?.length && <span className="badge badge-amber" style={{ fontSize: 9 }}>Ready</span>}
                        {s?.messages?.length > 0 && !s?.complete && <span className="badge badge-blue" style={{ fontSize: 9 }}>Active</span>}
                        {s?.complete && !s?.scores && <span className="badge badge-amber" style={{ fontSize: 9 }}>Scoring</span>}
                        {s?.scores && <span className="badge badge-green" style={{ fontSize: 9 }}>Done·{s.scores.overallScore}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* chat */}
              <div className="iv-chat">
                {selectedIv && selIvState ? (
                  <>
                    <div className="iv-chat-head">
                      <div><h4>{selectedIv.full_name}</h4><p>{selectedIv.candidate_role}</p></div>
                      {selIvState.scores && <span className="badge badge-green">{selIvState.scores.overallScore} · {selIvState.scores.recommendation}</span>}
                    </div>
                    <div className="iv-chat-body" ref={chatRef}>
                      {selIvState.messages.length === 0 && !selIvState.loading && (
                        <div className="iv-chat-empty">
                          <p>Ready to interview <strong style={{ color: 'var(--text)' }}>{selectedIv.full_name}</strong></p>
                          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => startInterview(selectedIv)}>Start Interview</button>
                        </div>
                      )}
                      {selIvState.messages.map((msg, i) => (
                        <div key={i} className={`bubble ${msg.role}`}>
                          <div className="bubble-who">{msg.role === 'assistant' ? 'Interviewer' : 'Candidate'}</div>
                          <div className="bubble-body">{msg.content.replace(INTERVIEW_COMPLETE,'').trim()}</div>
                        </div>
                      ))}
                      {selIvState.loading && (
                        <div className="bubble assistant">
                          <div className="bubble-who">Interviewer</div>
                          <div className="bubble-body"><div className="typing-dots"><span/><span/><span/></div></div>
                        </div>
                      )}
                      {selIvState.scoring && <div className="scoring-banner"><span className="spinner" style={{ width: 12, height: 12 }} /> Scoring interview…</div>}
                      {selIvState.scores && (
                        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 4 }}>
                          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 12 }}>Scores</div>
                          {DIMS.map(([key, label]) => (
                            <div key={key} className="score-dim">
                              <span className="dim-label">{label}</span>
                              <div className="dim-track"><div className="dim-fill" style={{ width: `${selIvState.scores[key]}%`, background: dimColor(selIvState.scores[key]) }} /></div>
                              <span className="dim-val">{selIvState.scores[key]}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {!selIvState.complete && selIvState.messages.length > 0 && (
                      <div className="iv-chat-input">
                        <input
                          placeholder="Type candidate's answer…"
                          value={selIvState.input}
                          disabled={selIvState.loading}
                          onChange={e => patchIv(selectedIvId, { input: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(selectedIv, selIvState.input) } }}
                        />
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} disabled={selIvState.loading || !selIvState.input.trim()} onClick={() => sendMessage(selectedIv, selIvState.input)}>Send</button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="iv-chat-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: 'var(--text-3)' }}>Select a candidate to begin</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Video Interview modal ── */}
      {videoInterviewTarget && activeJob && (
        <VideoInterview
          job={activeJob}
          candidate={videoInterviewTarget}
          matchId={videoInterviewTarget.id}
          isFromPool={videoInterviewTarget._fromPool ?? false}
          onClose={() => setVideoInterviewTarget(null)}
          onComplete={(result) => {
            setCandidates(prev => prev.map(c =>
              c.id === videoInterviewTarget.id
                ? { ...c, video_urls: result.video_urls, integrity_score: result.integrity_score, integrity_flags: result.integrity_flags }
                : c
            ))
            setVideoInterviewTarget(null)
          }}
        />
      )}

      {/* ── Video Player modal ── */}
      {videoPlayerTarget && (
        <VideoPlayer
          candidate={videoPlayerTarget}
          onClose={() => setVideoPlayerTarget(null)}
        />
      )}

      {/* ── Invite modal ── */}
      {inviteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 28, width: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Invite to Candidate Portal</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{inviteModal.candidate.full_name}</div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Email</label>
              <input
                autoFocus
                style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
                value={inviteModal.email}
                onChange={e => setInviteModal(m => ({ ...m, email: e.target.value, sent: false, error: null }))}
                onKeyDown={e => { if (e.key === 'Enter' && !inviteModal.sending && !inviteModal.sent) sendInvite() }}
                placeholder="candidate@email.com"
                disabled={inviteModal.sending || inviteModal.sent}
              />
            </div>
            {inviteModal.error && (
              <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠ {inviteModal.error}</div>
            )}
            {inviteModal.sent && (
              <div style={{ fontSize: 12, color: 'var(--green)' }}>✓ Invite sent to {inviteModal.email}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setInviteModal(null)}>
                {inviteModal.sent ? 'Close' : 'Cancel'}
              </button>
              {!inviteModal.sent && (
                <button className="btn btn-primary" disabled={inviteModal.sending || !inviteModal.email.trim()} onClick={sendInvite}>
                  {inviteModal.sending ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Sending…</> : 'Send Invite'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Log ── */}
      {log.length > 0 && (
        <div className="pipeline-log-wrap">
          <div className="pipeline-log-head">
            <span className="spinner" style={{ width: 8, height: 8, opacity: running ? 1 : 0 }} />
            Progress Log
          </div>
          <div className="pipeline-log" ref={logRef}>
            {log.map(l => <div key={l.id} className={`log-line${l.type ? ' ' + l.type : ''}`}>{l.msg}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}
