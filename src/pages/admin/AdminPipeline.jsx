import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { callClaude } from '../../utils/api'
import mammoth from 'mammoth'
import { extractContent, isSupported, fileExt, ACCEPT_ATTR } from '../../utils/fileExtract'
import { triggerTalentPoolMatch, mapMatchToCandidate } from '../../utils/talentPool'
import TagInput from '../../components/TagInput'
import VideoPlayer from '../../components/VideoPlayer'

const CV_PARSE_SYSTEM = `You are a CV parser. Return ONLY valid JSON — no markdown:
{"name":"string","email":"string","currentRole":"string","totalYears":number,"skills":["..."],"education":"string","summary":"string","highlights":["..."]}`

const screeningSystem = (job) =>
  `You are an expert recruiter. Evaluate this candidate against the job.
Job: ${job.title} | ${job.experience_years}+ years | Required: ${(job.required_skills ?? []).join(', ')}
Description: ${job.description ?? ''}
Return ONLY valid JSON: {"matchScore":number,"pass":boolean,"reason":"string","rank":"top10|strong|moderate|weak"}`

const FORMAT_ICON = { pdf:'📕', docx:'📝', txt:'📄', jpg:'🖼️', jpeg:'🖼️', png:'🖼️' }
const REC_COLOR   = { 'Strong Hire': 'var(--green)', 'Hire': 'var(--accent)', 'Borderline': 'var(--amber)', 'Reject': 'var(--red)' }

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
const EMPTY_MANUAL = { full_name:'', email:'', phone:'', candidate_role:'', total_years:'', skills:'', education:'', summary:'', addToPool:false }
const appUrl = 'https://oneselect-ai-t6uo-phi.vercel.app'

export default function AdminPipeline({ allowedClientIds } = {}) {
  const { profile } = useAuth()
  const isClient = profile?.user_role === 'client'
  const location = useLocation()

  const [clients, setClients]         = useState([])
  const [clientId, setClientId]       = useState('')
  const [clientJobs, setClientJobs]   = useState([])
  const [jobId, setJobId]             = useState('')
  const [jobForm, setJobForm]         = useState(DEFAULT_JOB_FORM)
  const [activeJob, setActiveJob]     = useState(null)
  const [candidates, setCandidates]   = useState([])
  const [files, setFiles]             = useState([])
  const [dragging, setDragging]       = useState(false)
  const [parsing, setParsing]         = useState(false)
  const [screening, setScreening]     = useState(false)
  const [screeningDone, setScreeningDone] = useState(false)
  const [log, setLog]                 = useState([])
  const [useTalentPool, setUseTalentPool] = useState(false)
  const [poolMatchLoading, setPoolMatchLoading] = useState(false)
  const [poolMatchProgress, setPoolMatchProgress] = useState({ current: 0, total: 0 })
  const [videoPlayerTarget, setVideoPlayerTarget] = useState(null)

  // Outreach (Feature 1)
  const [outreachLog, setOutreachLog]     = useState({}) // candidateId → {sent_at, responded, id}
  const [outreachModal, setOutreachModal] = useState(null)

  // AI invite modal (unchanged)
  const [aiInviteModal, setAiInviteModal] = useState(null)

  // Schedule modal — replaces simple liveInviteModal (Feature 4)
  const [scheduleModal, setScheduleModal] = useState(null)

  // Final decision modal
  const [decisionModal, setDecisionModal] = useState(null)

  // Live call modal
  const [liveCallModal, setLiveCallModal] = useState(null)

  // Offer letter modal (Feature 5)
  const [offerModal, setOfferModal] = useState(null)

  // Delete + Add Manually
  const [deleteModal, setDeleteModal]           = useState(null)
  const [addManuallyModal, setAddManuallyModal] = useState(null)

  const running = parsing || screening || poolMatchLoading
  const fileInputRef = useRef()
  const logRef = useRef()

  useEffect(() => { loadClients() }, [])
  useEffect(() => { if (clientId) loadClientJobs(clientId) }, [clientId])
  useEffect(() => {
    if (!clients.length || clientId) return
    if (clients.length === 1) { setClientId(clients[0].id); return }
    const urlClient = new URLSearchParams(location.search).get('client')
    if (urlClient && clients.some(c => c.id === urlClient)) setClientId(urlClient)
  }, [clients, location.search])
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [log])

  async function loadClients() {
    let q = supabase.from('profiles').select('id, full_name, company_name, email').eq('user_role', 'client').order('company_name')
    if (allowedClientIds?.length) q = q.in('id', allowedClientIds)
    const { data } = await q
    setClients(data ?? [])
  }

  async function loadClientJobs(cid) {
    setJobId(''); setActiveJob(null); setCandidates([]); setFiles([])
    setScreeningDone(false)
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

    // Load outreach log for this job
    const { data: outData } = await supabase.from('outreach_log').select('id, candidate_id, sent_at, responded').eq('job_id', id)
    const map = {}
    ;(outData ?? []).forEach(r => { map[r.candidate_id] = r })
    setOutreachLog(map)
  }

  async function refreshCandidates() {
    if (!jobId || jobId === 'new') return
    await selectJob(jobId, useTalentPool)
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

  // ── Feature 1: Outreach ───────────────────────────────────────────────────
  async function openOutreachModal(candidate) {
    const companyName = clients.find(c => c.id === clientId)?.company_name ?? ''
    setOutreachModal({ candidate, email: candidate.email ?? '', emailContent: '', subject: '', generating: true, sending: false, sent: false, error: null })
    try {
      const prompt = `Write a professional, personalized recruiter outreach email to a candidate for the following:

Job: ${activeJob?.title ?? ''}
Company: ${companyName}
Candidate: ${candidate.full_name}, ${candidate.candidate_role}, ${candidate.total_years}y experience
Skills: ${(candidate.skills ?? []).join(', ')}
Summary: ${candidate.summary ?? ''}

Return the subject line first starting with "SUBJECT: ", then a blank line, then the email body (150-200 words). Be warm, specific to their background, and clear about next steps.`

      const reply = await callClaude([{ role: 'user', content: prompt }], 'You are a professional recruiter writing personalized outreach emails.', 600)
      const lines = reply.trim().split('\n')
      const subjectLine = lines.find(l => l.startsWith('SUBJECT:'))
      const subject = subjectLine ? subjectLine.replace('SUBJECT:', '').trim() : `Exciting opportunity — ${activeJob?.title ?? 'new role'}`
      const body = lines.filter(l => !l.startsWith('SUBJECT:')).join('\n').trim()
      setOutreachModal(m => ({ ...m, subject, emailContent: body, generating: false }))
    } catch (err) {
      setOutreachModal(m => ({ ...m, generating: false, error: 'AI generation failed: ' + err.message }))
    }
  }

  async function sendOutreach() {
    const { candidate, email, subject, emailContent } = outreachModal
    if (!email.trim()) return
    setOutreachModal(m => ({ ...m, sending: true, error: null }))
    try {
      const { error } = await supabase.functions.invoke('send-outreach-email', {
        body: { to_email: email.trim(), to_name: candidate.full_name, subject, body: emailContent, job_title: activeJob?.title ?? '' },
      })
      if (error) throw new Error(error.message)

      // Log to outreach_log
      const { data: logRow } = await supabase.from('outreach_log').insert({
        candidate_id: candidate.id,
        job_id: activeJob?.id,
        subject,
        email_body: emailContent,
        sent_at: new Date().toISOString(),
        responded: false,
      }).select().single()

      setOutreachLog(m => ({ ...m, [candidate.id]: logRow }))
      setOutreachModal(m => ({ ...m, sending: false, sent: true }))
      addLog(`✉ Outreach sent to ${email.trim()}`, 'ok')
    } catch (err) {
      setOutreachModal(m => ({ ...m, sending: false, error: err.message }))
    }
  }

  async function toggleResponded(candidateId) {
    const existing = outreachLog[candidateId]
    if (!existing) return
    const next = !existing.responded
    await supabase.from('outreach_log').update({ responded: next }).eq('id', existing.id)
    setOutreachLog(m => ({ ...m, [candidateId]: { ...existing, responded: next } }))
  }

  // ── AI interview invite ────────────────────────────────────────────────────
  async function sendAiInterviewInvite() {
    const { candidate, email } = aiInviteModal
    if (!email.trim()) return
    setAiInviteModal(m => ({ ...m, sending: true, error: null }))
    const companyName = clients.find(c => c.id === clientId)?.company_name ?? ''
    const { error } = await supabase.functions.invoke('send-ai-interview-invite', {
      body: { email: email.trim(), name: candidate.full_name, job_title: activeJob?.title ?? '', company_name: companyName, token: candidate.interview_invite_token },
    })
    if (error) {
      setAiInviteModal(m => ({ ...m, sending: false, error: error.message }))
    } else {
      setAiInviteModal(m => ({ ...m, sending: false, sent: true }))
      addLog(`✉ AI interview invite sent to ${email.trim()}`, 'ok')
    }
  }

  // ── Feature 4: Schedule live interview with 3 time slots ─────────────────
  async function sendScheduleInvite() {
    const { candidate, email, slots } = scheduleModal
    const filledSlots = slots.filter(s => s.trim())
    if (!email.trim() || filledSlots.length === 0) return
    setScheduleModal(m => ({ ...m, sending: true, error: null }))

    const liveToken = candidate.live_interview_token ?? crypto.randomUUID()
    const roomUrl   = candidate.live_room_url ?? `https://meet.jit.si/oneselect-${liveToken}`

    const table = candidate._fromPool ? 'job_matches' : 'candidates'
    await supabase.from(table).update({
      live_interview_token: liveToken,
      live_room_url: roomUrl,
      live_interview_status: 'scheduled',
    }).eq('id', candidate.id)

    // Create interview_schedules record
    const { data: schedRow } = await supabase.from('interview_schedules').insert({
      candidate_id: candidate.id,
      job_id: activeJob?.id,
      proposed_slots: filledSlots,
      status: 'pending',
      candidate_email: email.trim(),
      candidate_name: candidate.full_name,
      room_url: roomUrl,
    }).select().single()

    const { error } = await supabase.functions.invoke('send-schedule-invite', {
      body: {
        mode: 'propose',
        token: schedRow?.confirm_token,
        proposed_slots: filledSlots,
        job_title: activeJob?.title ?? '',
        candidate_email: email.trim(),
        candidate_name: candidate.full_name,
        room_url: roomUrl,
      },
    })

    if (error) {
      setScheduleModal(m => ({ ...m, sending: false, error: error.message }))
    } else {
      setScheduleModal(m => ({ ...m, sending: false, sent: true }))
      addLog(`📅 Schedule invite sent to ${email.trim()}`, 'ok')
      await refreshCandidates()
    }
  }

  // ── Final decision ────────────────────────────────────────────────────────
  async function saveDecision(decision) {
    const { candidate, notes } = decisionModal
    const table = candidate._fromPool ? 'job_matches' : 'candidates'
    await supabase.from(table).update({ final_decision: decision, decision_notes: notes }).eq('id', candidate.id)
    setDecisionModal(null)
    addLog(`✓ Decision saved: ${candidate.full_name} → ${decision}`, 'ok')
    await refreshCandidates()
    if (decision === 'hired') {
      openOfferModal({ ...candidate, final_decision: 'hired' })
    }
  }

  async function markLiveComplete(candidate) {
    const table = candidate._fromPool ? 'job_matches' : 'candidates'
    await supabase.from(table).update({ live_interview_status: 'completed' }).eq('id', candidate.id)
    addLog(`✓ Live interview marked complete: ${candidate.full_name}`, 'ok')
    await refreshCandidates()
  }

  async function handleDeleteCandidate() {
    const { candidate } = deleteModal
    setDeleteModal(m => ({ ...m, deleting: true }))
    const table = candidate._fromPool ? 'job_matches' : 'candidates'
    const { error } = await supabase.from(table).delete().eq('id', candidate.id)
    if (error) { addLog(`✗ Delete failed: ${error.message}`, 'err'); setDeleteModal(null); return }
    setCandidates(p => p.filter(c => c.id !== candidate.id))
    addLog(`✓ Removed ${candidate.full_name} from pipeline`, 'ok')
    setDeleteModal(null)
  }

  async function handleAddManually() {
    const f = addManuallyModal
    if (!f.full_name.trim()) return
    setAddManuallyModal(m => ({ ...m, saving: true, error: null }))
    try {
      const skillsArr = f.skills.split(',').map(s => s.trim()).filter(Boolean)
      const { data: saved, error } = await supabase.from('candidates').insert({
        job_id:         activeJob.id,
        full_name:      f.full_name.trim(),
        email:          f.email.trim(),
        phone:          f.phone.trim(),
        candidate_role: f.candidate_role.trim(),
        total_years:    parseInt(f.total_years) || 0,
        skills:         skillsArr,
        education:      f.education.trim(),
        summary:        f.summary.trim(),
        source:         'manually_added',
      }).select().single()
      if (error) throw new Error(error.message)
      if (f.addToPool) {
        await supabase.from('talent_pool').insert({
          full_name:      f.full_name.trim(),
          email:          f.email.trim(),
          candidate_role: f.candidate_role.trim(),
          total_years:    parseInt(f.total_years) || 0,
          skills:         skillsArr,
          education:      f.education.trim(),
          summary:        f.summary.trim(),
          availability:   'available',
        })
      }
      setCandidates(p => [...p, { ...saved, _status: 'parsed' }])
      addLog(`✓ ${f.full_name.trim()} added manually`, 'ok')
      setAddManuallyModal(null)
    } catch (err) {
      setAddManuallyModal(m => ({ ...m, saving: false, error: err.message }))
    }
  }

  // ── Feature 5: Offer letter ────────────────────────────────────────────────
  async function openOfferModal(candidate) {
    const companyName = clients.find(c => c.id === clientId)?.company_name ?? ''
    setOfferModal({ candidate, letterContent: '', generating: true, sending: false, sent: false, error: null })
    try {
      const prompt = `Write a professional job offer letter for:
Candidate: ${candidate.full_name}
Role: ${activeJob?.title ?? ''}
Company: ${companyName}
Decision notes: ${candidate.decision_notes ?? 'N/A'}

Write a formal but warm offer letter (350-500 words) including: congratulations opening, role description, next steps (mention signing and returning this letter), and a professional closing. Return only the letter body.`

      const letter = await callClaude([{ role: 'user', content: prompt }], 'You are writing formal employment offer letters.', 1000)
      setOfferModal(m => ({ ...m, letterContent: letter.trim(), generating: false }))
    } catch (err) {
      setOfferModal(m => ({ ...m, generating: false, error: 'AI generation failed: ' + err.message }))
    }
  }

  async function sendOfferLetter() {
    const { candidate, letterContent } = offerModal
    if (!letterContent.trim()) return
    setOfferModal(m => ({ ...m, sending: true, error: null }))
    try {
      const { error } = await supabase.functions.invoke('send-offer-letter', {
        body: {
          candidate_email: candidate.email ?? '',
          candidate_name: candidate.full_name,
          job_title: activeJob?.title ?? '',
          letter_content: letterContent,
        },
      })
      if (error) throw new Error(error.message)

      // Log to offers table
      await supabase.from('offers').insert({
        candidate_id: candidate.id,
        job_id: activeJob?.id,
        letter_content: letterContent,
        sent_at: new Date().toISOString(),
        status: 'sent',
      })

      const table = candidate._fromPool ? 'job_matches' : 'candidates'
      await supabase.from(table).update({ offer_status: 'sent' }).eq('id', candidate.id)

      setOfferModal(m => ({ ...m, sending: false, sent: true }))
      addLog(`📄 Offer letter sent to ${candidate.email}`, 'ok')
      await refreshCandidates()
    } catch (err) {
      setOfferModal(m => ({ ...m, sending: false, error: err.message }))
    }
  }

  const setForm = (k, v) => setJobForm(f => ({ ...f, [k]: v }))
  const setTech = (v) => { setForm('tech_weight', v); setForm('comm_weight', 100 - v) }

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
        patchFile(entry.id, { status: 'done', parsed })
        setCandidates(p => [...p, { ...saved, _status: 'parsed' }])
      } catch (err) {
        addLog(`✗ ${entry.file.name}: ${err.message}`, 'err')
        patchFile(entry.id, { status: 'error', error: err.message })
      }
    }
    setParsing(false)
  }

  async function runScreening() {
    if (!activeJob) return
    setScreening(true)
    const system = screeningSystem(activeJob)
    const toScreen = candidates.filter(c => c._status === 'parsed')
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
    addLog(`Screening complete. ${passedThisRun.length} passed.`, 'info')
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const passedCandidates = candidates.filter(c => c.match_pass)
  const doneCount      = files.filter(f => f.status === 'done').length
  const pendingCount   = files.filter(f => f.status === 'pending').length
  const screenedCount  = candidates.filter(c => c._status === 'screened').length
  const parseProgress  = files.length ? (doneCount / files.length) * 100 : 0
  const screenProgress = candidates.length ? (screenedCount / candidates.length) * 100 : 0
  const liveInterviewCandidates = passedCandidates.filter(c => c.scores?.overallScore != null)
  const decisionCandidates = passedCandidates.filter(c => c.live_interview_status === 'completed')
  const clientLabel = (c) => c.company_name || c.full_name || c.email

  function outreachBadge(cId) {
    const o = outreachLog[cId]
    if (!o) return null
    if (o.responded) return <span className="badge badge-green" style={{ fontSize: 9 }}>Responded</span>
    return <span className="badge badge-blue" style={{ fontSize: 9 }}>Outreach Sent</span>
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h2>Pipeline</h2><p>Run the full AI hiring pipeline for a client</p></div>
      </div>

      {/* ── 1 Job Setup ── */}
      <div className="section-card">
        <div className="section-card-head"><h3>1 · Job Setup</h3></div>
        <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grid">
            {!isClient && (
              <div className="field">
                <label>Select Client</label>
                <select value={clientId} onChange={e => setClientId(e.target.value)}>
                  <option value="">— choose client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label>Select Job</label>
              <select value={jobId} disabled={!clientId} onChange={e => selectJob(e.target.value)}>
                <option value="">— choose job —</option>
                {!isClient && <option value="new">+ Create new job</option>}
                {clientJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
          </div>

          {jobId === 'new' && !isClient && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div className="form-grid">
                <div className="field"><label>Job Title</label><input type="text" value={jobForm.title} placeholder="e.g. Senior Backend Engineer" onChange={e => setForm('title', e.target.value)} /></div>
                <div className="field"><label>Years of Experience</label><input type="number" min={0} value={jobForm.experience_years} onChange={e => setForm('experience_years', +e.target.value)} /></div>
                <div className="field span-2"><label>Required Skills</label><TagInput value={jobForm.required_skills} onChange={v => setForm('required_skills', v)} placeholder="Type and press Enter…" /></div>
                <div className="field span-2"><label>Preferred Skills</label><TagInput value={jobForm.preferred_skills} onChange={v => setForm('preferred_skills', v)} placeholder="Nice-to-have…" /></div>
                <div className="field span-2"><label>Description</label><textarea rows={4} value={jobForm.description} onChange={e => setForm('description', e.target.value)} placeholder="Role responsibilities and context…" /></div>
                <div className="field span-2">
                  <label>Evaluation Weights</label>
                  <div className="weight-sliders">
                    <div className="weight-row"><span>Technical</span><input type="range" min={10} max={90} value={jobForm.tech_weight} onChange={e => setTech(+e.target.value)} /><span className="weight-val">{jobForm.tech_weight}%</span></div>
                    <div className="weight-row"><span>Communication</span><input type="range" min={10} max={90} value={jobForm.comm_weight} onChange={e => { setForm('comm_weight', +e.target.value); setForm('tech_weight', 100 - +e.target.value) }} /><span className="weight-val">{jobForm.comm_weight}%</span></div>
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

      {/* ── 2 CV Upload — hidden for clients ── */}
      {activeJob && !isClient && (
        <div className="section-card">
          <div className="section-card-head">
            <h3>{useTalentPool ? '2 · Talent Pool' : '2 · CV Upload'}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="mono text-muted" style={{ fontSize: 11 }}>{candidates.length} candidates</span>
              {!useTalentPool && (
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setAddManuallyModal({ ...EMPTY_MANUAL, saving: false, error: null })}
                >
                  + Add Manually
                </button>
              )}
              <button
                className={`btn ${useTalentPool ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => { const next = !useTalentPool; setUseTalentPool(next); if (jobId && jobId !== 'new') selectJob(jobId, next) }}
              >
                {useTalentPool ? '◎ Pool mode' : '◎ Use Talent Pool'}
              </button>
            </div>
          </div>
          <div className="section-card-body">
            {useTalentPool ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Match all available talent pool candidates against this job using AI screening.</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="btn btn-primary" disabled={poolMatchLoading} onClick={runPoolMatch}>
                    {poolMatchLoading ? <><span className="spinner" style={{ width: 12, height: 12 }} />{poolMatchProgress.total > 0 ? ` ${poolMatchProgress.current}/${poolMatchProgress.total}` : ' Matching…'}</> : 'Run Pool Match'}
                  </button>
                  {poolMatchLoading && poolMatchProgress.total > 0 && (
                    <div style={{ flex: 1 }}><div className="progress-track"><div className="progress-fill" style={{ width: `${(poolMatchProgress.current / poolMatchProgress.total) * 100}%` }} /></div></div>
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
                          {f.status === 'pending' && <span className="badge badge-amber">Pending</span>}
                          {f.status === 'parsing' && <span className="spinner" />}
                          {f.status === 'done'    && <span className="badge badge-green">CV Parsed</span>}
                          {f.status === 'error'   && <span className="badge badge-red">Error</span>}
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

      {/* ── 3 AI Screening — hidden for clients ── */}
      {activeJob && candidates.length > 0 && !isClient && (
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
                  <div className="c-name">{c.full_name}{c.source === 'manually_added' && <span className="badge badge-blue" style={{ fontSize: 9, marginLeft: 6 }}>Manual</span>}</div>
                  <div className="c-meta">{c.candidate_role} · {c.total_years}y</div>
                  {c.match_reason && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3 }}>{c.match_reason}</div>}
                </div>
                <div className="c-score">
                  {c._status === 'screening' && <span className="spinner" />}
                  {c.match_score != null && <ScoreRing score={c.match_score} size={42} />}
                  {c.match_rank && <span className={`badge ${c.match_rank === 'top10' ? 'badge-blue' : c.match_rank === 'strong' ? 'badge-green' : c.match_rank === 'moderate' ? 'badge-amber' : 'badge-red'}`}>{c.match_rank}</span>}
                  {c.match_pass != null && <span className={`badge ${c.match_pass ? 'badge-green' : 'badge-red'}`}>{c.match_pass ? 'Pass' : 'Fail'}</span>}
                  {outreachBadge(c.id)}
                  {outreachLog[c.id]?.responded === false && (
                    <button className="btn btn-secondary" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => toggleResponded(c.id)}>Mark Responded</button>
                  )}
                  {outreachLog[c.id]?.responded && (
                    <button className="btn btn-secondary" style={{ fontSize: 9, padding: '2px 6px', color: 'var(--text-3)' }} onClick={() => toggleResponded(c.id)}>Undo</button>
                  )}
                  {!outreachLog[c.id] && (
                    <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => openOutreachModal(c)}>✉ Outreach</button>
                  )}
                  {outreachLog[c.id] && !outreachLog[c.id].responded && (
                    <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => openOutreachModal(c)}>↻ Resend</button>
                  )}
                  {!isClient && <button className="btn btn-ghost" title="Remove candidate" style={{ padding: '2px 6px', fontSize: 14, color: 'var(--red)', opacity: 0.5 }} onClick={e => { e.stopPropagation(); setDeleteModal({ candidate: c }) }}>🗑</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4 AI Video Interview ── */}
      {(screeningDone || (isClient && activeJob)) && passedCandidates.length > 0 && (
        <div className="section-card">
          <div className="section-card-head">
            <h3>4 · AI Video Interview</h3>
            <span className="mono text-muted" style={{ fontSize: 11 }}>{passedCandidates.length} passed screening</span>
          </div>
          <div className="candidate-list">
            {passedCandidates.map(c => {
              const hasVideo  = c.video_urls?.length > 0
              const hasScores = !!c.scores?.overallScore
              const rec       = c.scores?.recommendation
              return (
                <div key={c.id} className="candidate-row" style={{ cursor: 'default' }}>
                  <div className="c-info">
                    <div className="c-name">{c.full_name}{c.source === 'manually_added' && <span className="badge badge-blue" style={{ fontSize: 9, marginLeft: 6 }}>Manual</span>}</div>
                    <div className="c-meta">{c.candidate_role} · {c.total_years}y</div>
                  </div>
                  <div className="c-score" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {!hasVideo && !hasScores && (
                      <>
                        <span className="badge badge-amber">Interview Pending</span>
                        {!isClient && (
                          <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={e => { e.stopPropagation(); setAiInviteModal({ candidate: c, email: c.email ?? '', sending: false, sent: false, error: null }) }}>✉ Invite</button>
                        )}
                        {c.interview_invite_token && (
                          <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => navigator.clipboard.writeText(`${appUrl}/interview/${c.interview_invite_token}`)}>⎘ Copy Link</button>
                        )}
                      </>
                    )}
                    {hasVideo && !hasScores && (
                      <>
                        <span className="badge badge-blue">Interview Submitted</span>
                        <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setVideoPlayerTarget(c)}>▶ Watch</button>
                      </>
                    )}
                    {hasScores && (
                      <>
                        <span className="badge badge-green">Interview Completed</span>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: dimColor(c.scores.overallScore) }}>{c.scores.overallScore}/100</span>
                        {rec && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: REC_COLOR[rec] ?? 'var(--text-3)' }}>{rec}</span>}
                        {hasVideo && <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setVideoPlayerTarget(c)}>▶ Watch</button>}
                      </>
                    )}
                    {!isClient && <button className="btn btn-ghost" title="Remove candidate" style={{ padding: '2px 6px', fontSize: 14, color: 'var(--red)', opacity: 0.5 }} onClick={e => { e.stopPropagation(); setDeleteModal({ candidate: c }) }}>🗑</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 5 Live Interview ── */}
      {liveInterviewCandidates.length > 0 && (
        <div className="section-card">
          <div className="section-card-head">
            <h3>5 · Live Interview</h3>
            <span className="mono text-muted" style={{ fontSize: 11 }}>{liveInterviewCandidates.length} candidates</span>
          </div>
          <div className="candidate-list">
            {liveInterviewCandidates.map(c => {
              const liveStatus = c.live_interview_status ?? 'none'
              const scheduled  = liveStatus === 'scheduled'
              const completed  = liveStatus === 'completed'
              return (
                <div key={c.id} className="candidate-row" style={{ cursor: 'default' }}>
                  <div className="c-info">
                    <div className="c-name">{c.full_name}{c.source === 'manually_added' && <span className="badge badge-blue" style={{ fontSize: 9, marginLeft: 6 }}>Manual</span>}</div>
                    <div className="c-meta">{c.candidate_role} · {c.total_years}y</div>
                  </div>
                  <div className="c-score" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {!scheduled && !completed && (
                      <>
                        <span className="badge" style={{ color: 'var(--text-3)', background: 'var(--surface2)' }}>Not Scheduled</span>
                        <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setScheduleModal({ candidate: c, email: c.email ?? '', slots: ['', '', ''], sending: false, sent: false, error: null })}>📅 Schedule</button>
                      </>
                    )}
                    {scheduled && !completed && (
                      <>
                        <span className="badge badge-blue">Scheduled</span>
                        <button className="btn btn-primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setLiveCallModal({ candidate: c })}>🎥 Join Call</button>
                        <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => markLiveComplete(c)}>✓ Mark Done</button>
                      </>
                    )}
                    {completed && <span className="badge badge-green">Live Done</span>}
                    {!isClient && <button className="btn btn-ghost" title="Remove candidate" style={{ padding: '2px 6px', fontSize: 14, color: 'var(--red)', opacity: 0.5 }} onClick={e => { e.stopPropagation(); setDeleteModal({ candidate: c }) }}>🗑</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 6 Final Decision ── */}
      {decisionCandidates.length > 0 && (
        <div className="section-card">
          <div className="section-card-head">
            <h3>6 · Final Decision</h3>
            <span className="mono text-muted" style={{ fontSize: 11 }}>{decisionCandidates.length} candidates</span>
          </div>
          <div className="candidate-list">
            {decisionCandidates.map(c => {
              const decision = c.final_decision
              const offerSent = c.offer_status === 'sent'
              return (
                <div key={c.id} className="candidate-row" style={{ cursor: 'default' }}>
                  <div className="c-info">
                    <div className="c-name">{c.full_name}{c.source === 'manually_added' && <span className="badge badge-blue" style={{ fontSize: 9, marginLeft: 6 }}>Manual</span>}</div>
                    <div className="c-meta">{c.candidate_role} · {c.total_years}y</div>
                    {c.decision_notes && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3 }}>{c.decision_notes}</div>}
                  </div>
                  <div className="c-score" style={{ gap: 6 }}>
                    {!decision && (
                      <>
                        <span className="badge" style={{ color: 'var(--text-3)', background: 'var(--surface2)' }}>Pending Decision</span>
                        <button className="btn btn-primary" style={{ fontSize: 10, padding: '2px 8px', background: 'var(--green)' }} onClick={() => setDecisionModal({ candidate: c, notes: '' })}>Hire / Reject</button>
                      </>
                    )}
                    {decision === 'hired' && (
                      <>
                        <span className="badge badge-green" style={{ fontSize: 12 }}>✓ Hired</span>
                        {!offerSent && <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => openOfferModal(c)}>📄 Send Offer</button>}
                        {offerSent && <span className="badge badge-blue" style={{ fontSize: 10 }}>Offer Sent</span>}
                      </>
                    )}
                    {decision === 'rejected' && <span className="badge badge-red" style={{ fontSize: 12 }}>✗ Rejected</span>}
                    {decision && <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setDecisionModal({ candidate: c, notes: c.decision_notes ?? '' })}>Edit</button>}
                    {!isClient && <button className="btn btn-ghost" title="Remove candidate" style={{ padding: '2px 6px', fontSize: 14, color: 'var(--red)', opacity: 0.5 }} onClick={e => { e.stopPropagation(); setDeleteModal({ candidate: c }) }}>🗑</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Video Player ── */}
      {videoPlayerTarget && <VideoPlayer candidate={videoPlayerTarget} onClose={() => setVideoPlayerTarget(null)} />}

      {/* ── Outreach Modal (Feature 1) ── */}
      {outreachModal && (
        <div style={MO}>
          <div style={{ ...MB, width: 560 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Outreach Email</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{outreachModal.candidate.full_name} · {outreachModal.candidate.candidate_role}</div>
            </div>
            <div><label style={ML}>Recipient Email</label><input style={MI} value={outreachModal.email} onChange={e => setOutreachModal(m => ({ ...m, email: e.target.value }))} placeholder="candidate@email.com" /></div>
            <div><label style={ML}>Subject</label><input style={MI} value={outreachModal.subject ?? ''} onChange={e => setOutreachModal(m => ({ ...m, subject: e.target.value }))} placeholder="Subject line…" /></div>
            <div>
              <label style={ML}>Email Body {outreachModal.generating && <span style={{ color: 'var(--accent)' }}>· AI drafting…</span>}</label>
              <textarea style={{ ...MI, height: 200, resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.6 }}
                value={outreachModal.emailContent}
                onChange={e => setOutreachModal(m => ({ ...m, emailContent: e.target.value }))}
                placeholder="AI-drafted email will appear here…"
                disabled={outreachModal.generating}
              />
            </div>
            {outreachModal.error && <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠ {outreachModal.error}</div>}
            {outreachModal.sent && <div style={{ fontSize: 12, color: 'var(--green)' }}>✓ Outreach email sent successfully</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setOutreachModal(null)}>{outreachModal.sent ? 'Close' : 'Cancel'}</button>
              {!outreachModal.sent && <button className="btn btn-primary" disabled={outreachModal.generating || outreachModal.sending || !outreachModal.emailContent.trim()} onClick={sendOutreach}>
                {outreachModal.sending ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Sending…</> : '✉ Send Outreach'}
              </button>}
            </div>
          </div>
        </div>
      )}

      {/* ── AI Invite Modal ── */}
      {aiInviteModal && (
        <div style={MO}>
          <div style={MB}>
            <div><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Send AI Interview Invite</div><div style={{ fontSize: 13, color: 'var(--text-3)' }}>{aiInviteModal.candidate.full_name}</div></div>
            <div><label style={ML}>Email</label><input autoFocus style={MI} value={aiInviteModal.email} onChange={e => setAiInviteModal(m => ({ ...m, email: e.target.value, sent: false, error: null }))} onKeyDown={e => { if (e.key === 'Enter' && !aiInviteModal.sending && !aiInviteModal.sent) sendAiInterviewInvite() }} placeholder="candidate@email.com" disabled={aiInviteModal.sending || aiInviteModal.sent} /></div>
            {aiInviteModal.error && <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠ {aiInviteModal.error}</div>}
            {aiInviteModal.sent && <div style={{ fontSize: 12, color: 'var(--green)' }}>✓ Invite sent to {aiInviteModal.email}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setAiInviteModal(null)}>{aiInviteModal.sent ? 'Close' : 'Cancel'}</button>
              {!aiInviteModal.sent && <button className="btn btn-primary" disabled={aiInviteModal.sending || !aiInviteModal.email.trim()} onClick={sendAiInterviewInvite}>{aiInviteModal.sending ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Sending…</> : 'Send Invite'}</button>}
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Modal (Feature 4) ── */}
      {scheduleModal && (
        <div style={MO}>
          <div style={{ ...MB, width: 500 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Schedule Live Interview</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{scheduleModal.candidate.full_name} — propose 3 time slots</div>
            </div>
            <div><label style={ML}>Candidate Email</label><input style={MI} value={scheduleModal.email} onChange={e => setScheduleModal(m => ({ ...m, email: e.target.value }))} placeholder="candidate@email.com" /></div>
            {[0, 1, 2].map(i => (
              <div key={i}>
                <label style={ML}>Slot {i + 1}</label>
                <input type="datetime-local" style={MI} value={scheduleModal.slots[i]} onChange={e => {
                  const next = [...scheduleModal.slots]; next[i] = e.target.value
                  setScheduleModal(m => ({ ...m, slots: next }))
                }} />
              </div>
            ))}
            {scheduleModal.error && <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠ {scheduleModal.error}</div>}
            {scheduleModal.sent && <div style={{ fontSize: 12, color: 'var(--green)' }}>✓ Schedule invite sent — candidate can confirm a slot</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setScheduleModal(null)}>{scheduleModal.sent ? 'Close' : 'Cancel'}</button>
              {!scheduleModal.sent && <button className="btn btn-primary" disabled={scheduleModal.sending || !scheduleModal.email.trim() || !scheduleModal.slots.some(s => s)} onClick={sendScheduleInvite}>
                {scheduleModal.sending ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Sending…</> : '📅 Send Schedule'}
              </button>}
            </div>
          </div>
        </div>
      )}

      {/* ── Decision Modal ── */}
      {decisionModal && (
        <div style={MO}>
          <div style={MB}>
            <div><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Final Decision</div><div style={{ fontSize: 13, color: 'var(--text-3)' }}>{decisionModal.candidate.full_name}</div></div>
            <div><label style={ML}>Notes (optional)</label><textarea style={{ ...MI, height: 80, resize: 'vertical' }} value={decisionModal.notes} onChange={e => setDecisionModal(m => ({ ...m, notes: e.target.value }))} placeholder="Add notes about this decision…" /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDecisionModal(null)}>Cancel</button>
              <button className="btn btn-secondary" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => saveDecision('rejected')}>✗ Reject</button>
              <button className="btn btn-primary" style={{ background: 'var(--green)' }} onClick={() => saveDecision('hired')}>✓ Hire</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Offer Letter Modal (Feature 5) ── */}
      {offerModal && (
        <div style={MO}>
          <div style={{ ...MB, width: 580 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Offer Letter</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{offerModal.candidate.full_name} · {activeJob?.title}</div>
            </div>
            <div>
              <label style={ML}>Letter Content {offerModal.generating && <span style={{ color: 'var(--accent)' }}>· AI drafting…</span>}</label>
              <textarea
                style={{ ...MI, height: 280, resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.7 }}
                value={offerModal.letterContent}
                onChange={e => setOfferModal(m => ({ ...m, letterContent: e.target.value }))}
                placeholder="AI-generated offer letter will appear here…"
                disabled={offerModal.generating}
              />
            </div>
            {offerModal.error && <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠ {offerModal.error}</div>}
            {offerModal.sent && <div style={{ fontSize: 12, color: 'var(--green)' }}>✓ Offer letter sent as PDF to {offerModal.candidate.email}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setOfferModal(null)}>{offerModal.sent ? 'Close' : 'Cancel'}</button>
              {!offerModal.sent && <button className="btn btn-primary" disabled={offerModal.generating || offerModal.sending || !offerModal.letterContent.trim()} onClick={sendOfferLetter}>
                {offerModal.sending ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Sending…</> : '📄 Send as PDF'}
              </button>}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Candidate Modal ── */}
      {deleteModal && (
        <div style={MO}>
          <div style={MB}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Remove Candidate</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                Are you sure you want to remove <strong>{deleteModal.candidate.full_name}</strong> from this pipeline? This cannot be undone.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                disabled={deleteModal.deleting}
                onClick={handleDeleteCandidate}
              >
                {deleteModal.deleting ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Removing…</> : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Manually Modal ── */}
      {addManuallyModal && (
        <div style={MO}>
          <div style={{ ...MB, width: 500 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Add Candidate Manually</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={ML}>Full Name *</label><input autoFocus style={MI} value={addManuallyModal.full_name} onChange={e => setAddManuallyModal(m => ({ ...m, full_name: e.target.value }))} placeholder="Jane Smith" /></div>
              <div><label style={ML}>Email</label><input style={MI} value={addManuallyModal.email} onChange={e => setAddManuallyModal(m => ({ ...m, email: e.target.value }))} placeholder="jane@example.com" /></div>
              <div><label style={ML}>Phone (optional)</label><input style={MI} value={addManuallyModal.phone} onChange={e => setAddManuallyModal(m => ({ ...m, phone: e.target.value }))} placeholder="+91 9876543210" /></div>
              <div><label style={ML}>Current Role</label><input style={MI} value={addManuallyModal.candidate_role} onChange={e => setAddManuallyModal(m => ({ ...m, candidate_role: e.target.value }))} placeholder="Senior Engineer" /></div>
              <div><label style={ML}>Years of Experience</label><input type="number" min={0} style={MI} value={addManuallyModal.total_years} onChange={e => setAddManuallyModal(m => ({ ...m, total_years: e.target.value }))} placeholder="5" /></div>
              <div><label style={ML}>Education (optional)</label><input style={MI} value={addManuallyModal.education} onChange={e => setAddManuallyModal(m => ({ ...m, education: e.target.value }))} placeholder="B.Tech Computer Science" /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={ML}>Skills (comma separated)</label><input style={MI} value={addManuallyModal.skills} onChange={e => setAddManuallyModal(m => ({ ...m, skills: e.target.value }))} placeholder="React, Node.js, TypeScript" /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={ML}>Summary (optional)</label><textarea style={{ ...MI, height: 70, resize: 'vertical' }} value={addManuallyModal.summary} onChange={e => setAddManuallyModal(m => ({ ...m, summary: e.target.value }))} placeholder="Brief professional summary…" /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={addManuallyModal.addToPool} onChange={e => setAddManuallyModal(m => ({ ...m, addToPool: e.target.checked }))} />
              Also add to master talent pool
            </label>
            {addManuallyModal.error && <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠ {addManuallyModal.error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setAddManuallyModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!addManuallyModal.full_name.trim() || addManuallyModal.saving}
                onClick={handleAddManually}
              >
                {addManuallyModal.saving ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Saving…</> : 'Add Candidate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Live Call Modal ── */}
      {liveCallModal && (
        <div style={{ ...MO, alignItems: 'stretch', padding: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#000' }}>
            <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#B8924A', fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.1em' }}>ONE SELECT</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{liveCallModal.candidate.full_name} — Live Interview</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => { markLiveComplete(liveCallModal.candidate); setLiveCallModal(null) }}>✓ End & Mark Done</button>
                <button onClick={() => setLiveCallModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 20, padding: '4px 8px' }}>✕</button>
              </div>
            </div>
            <iframe
              src={liveCallModal.candidate.live_room_url ?? `https://meet.jit.si/oneselect-${liveCallModal.candidate.live_interview_token ?? liveCallModal.candidate.id}`}
              style={{ flex: 1, border: 'none', width: '100%' }}
              allow="camera; microphone; fullscreen; display-capture"
              title="Live Interview"
            />
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

// Modal style constants
const MO = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }
const MB = { background: 'var(--surface)', borderRadius: 12, padding: 28, width: 420, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '90vh', overflowY: 'auto' }
const ML = { fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }
const MI = { width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
