import { useState } from 'react'
import { callClaude } from '../utils/api'
import TagInput from './TagInput'

// ── Constants ─────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'BFSI', 'Telecom', 'Pharma', 'Manufacturing',
  'System Integrator', 'IT Services', 'Healthcare',
  'Retail', 'E-commerce', 'Other',
]
const WORK_MODES = ['WFO', 'WFH', 'Hybrid']

// Steps used for the progress bar in AI mode
const AI_STEPS = ['Brief', 'Clarify', 'Industry', 'Location', 'Experience', 'Compensation', 'Review']

// Map step name → 0-based index in AI_STEPS (for progress bar)
const AI_STEP_IDX = {
  brief: 0, clarify: 1, industry: 2, location: 3,
  experience: 4, compensation: 5, review: 6, assign: 7,
}

// ── AI prompts ────────────────────────────────────────────────────────────────

function clarifySystemPrompt(brief) {
  return `You are an expert technical recruiter. A hiring manager described a role as:
"${brief}"

Ask 3–4 focused follow-up questions to clarify the technical requirements before writing the JD. Cover:
- Specific frameworks, libraries, or flavors of the technology mentioned (e.g. Spring Boot vs Spring MVC, React vs Next.js)
- Database or data-storage preferences (RDBMS, NoSQL, specific systems)
- API / integration requirements (REST, GraphQL, microservices, third-party APIs)
- Any domain-specific knowledge, product vs. services context, or team size

Format as a numbered list. Be concise and specific to what was mentioned. Do not repeat the brief back.`
}

const JD_GEN_SYSTEM = `You are an expert technical recruiter writing a professional job description.
Based on the provided role details, generate a complete, well-structured JD.
Return ONLY valid JSON (no markdown fences, no explanation):
{
  "title": "precise job title",
  "description": "full JD in plain text with these sections separated by blank lines: About the Role | Key Responsibilities | Required Qualifications | Preferred Qualifications | What We Offer",
  "required_skills": ["skill1", "skill2"],
  "preferred_skills": ["skill1", "skill2"]
}`

function compSystemPrompt({ brief, industry, location, expYears }) {
  return `You are a compensation benchmarking expert. Recommend a competitive salary range.
Role: ${brief}
Industry: ${industry}
Location: ${location}
Experience: ${expYears} years

Provide a 1–2 sentence recommendation with a specific range (e.g. ₹18–26 LPA for India roles, $90k–$120k for US). Be precise.`
}

const PARSE_SYSTEM = `Extract structured data from this job description.
Return ONLY valid JSON (no markdown fences):
{
  "title": "job title",
  "description": "full JD text",
  "required_skills": ["skill"],
  "preferred_skills": ["skill"],
  "experience_years": number,
  "industry": "industry if mentioned, else empty string",
  "location": "city/location if mentioned, else empty string",
  "work_mode": "WFO or WFH or Hybrid if mentioned, else empty string"
}`

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```[\s]*$/m, '').trim()
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JDWizard({ onClose, onSave, showAssign = false, recruiters = [] }) {
  // ── Navigation state ──────────────────────────────────────────────────────
  const [step, setStep]     = useState('mode')   // mode|paste|brief|clarify|industry|location|experience|compensation|review|assign
  const [jdMode, setJdMode] = useState(null)      // 'ai' | 'paste'  — remembered for back-nav

  // ── Form values ───────────────────────────────────────────────────────────
  const [brief,         setBrief]         = useState('')
  const [pastedJD,      setPastedJD]      = useState('')
  const [clarifyQ,      setClarifyQ]      = useState('')  // AI's follow-up question
  const [clarifyA,      setClarifyA]      = useState('')  // user's answer
  const [industry,      setIndustry]      = useState('')
  const [location,      setLocation]      = useState('')
  const [workMode,      setWorkMode]      = useState('')
  const [expYears,      setExpYears]      = useState(3)
  const [compMode,      setCompMode]      = useState('ai') // 'ai' | 'manual'
  const [compMin,       setCompMin]       = useState('')
  const [compMax,       setCompMax]       = useState('')
  const [compRec,       setCompRec]       = useState('')
  const [compRecLoaded, setCompRecLoaded] = useState(false)

  // ── Generated output ──────────────────────────────────────────────────────
  const [title,          setTitle]          = useState('')
  const [description,    setDescription]    = useState('')
  const [requiredSkills, setRequiredSkills] = useState([])
  const [preferredSkills,setPreferredSkills]= useState([])

  // ── Assignment ────────────────────────────────────────────────────────────
  const [assignedTo, setAssignedTo] = useState('')

  // ── UI state ──────────────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [copied,    setCopied]    = useState(false)

  // ── AI: brief → clarify question ─────────────────────────────────────────
  async function handleBriefNext() {
    if (!brief.trim()) return
    setLoading(true); setError('')
    try {
      const reply = await callClaude(
        [{ role: 'user', content: brief }],
        clarifySystemPrompt(brief),
        500,
      )
      setClarifyQ(reply.trim())
      setStep('clarify')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  // ── Clarify answer → industry ─────────────────────────────────────────────
  function handleClarifyNext() {
    setStep('industry')
  }

  // ── Industry select → location ────────────────────────────────────────────
  function handleIndustrySelect(ind) {
    setIndustry(ind)
    setStep('location')
  }

  // ── Location → experience ─────────────────────────────────────────────────
  function handleLocationNext() {
    if (!location.trim() || !workMode) return
    setStep('experience')
  }

  // ── Experience → compensation (+ auto-load AI comp rec) ──────────────────
  async function handleExperienceNext() {
    setStep('compensation')
    if (compMode === 'ai' && !compRecLoaded) {
      loadCompRec()
    }
  }

  async function loadCompRec() {
    setCompRecLoaded(true)
    setLoading(true)
    try {
      const reply = await callClaude(
        [{ role: 'user', content: 'Provide compensation recommendation.' }],
        compSystemPrompt({ brief, industry, location, expYears }),
        180,
      )
      setCompRec(reply.trim())
    } catch { setCompRec('Could not load recommendation at this time.') }
    setLoading(false)
  }

  // ── Compensation → generate JD → review ───────────────────────────────────
  async function handleGenerateJD() {
    setLoading(true); setError('')
    const ctx = [
      `Role: ${brief}`,
      clarifyA ? `Technical Details: ${clarifyA}` : '',
      `Industry: ${industry}`,
      `Location: ${location} (${workMode})`,
      `Experience: ${expYears}+ years`,
      compMode === 'manual' && compMin ? `Compensation: ${compMin}–${compMax} LPA` : '',
    ].filter(Boolean).join('\n')

    try {
      const reply = await callClaude([{ role: 'user', content: ctx }], JD_GEN_SYSTEM, 2000)
      const parsed = JSON.parse(stripFences(reply))
      setTitle(parsed.title ?? brief)
      setDescription(parsed.description ?? '')
      setRequiredSkills(parsed.required_skills ?? [])
      setPreferredSkills(parsed.preferred_skills ?? [])
      setStep('review')
    } catch (e) { setError('Failed to generate JD: ' + e.message) }
    setLoading(false)
  }

  // ── Paste JD → parse → review ─────────────────────────────────────────────
  async function handlePasteNext() {
    if (!pastedJD.trim()) return
    setLoading(true); setError('')
    try {
      const reply = await callClaude([{ role: 'user', content: pastedJD }], PARSE_SYSTEM, 1000)
      const parsed = JSON.parse(stripFences(reply))
      setTitle(parsed.title ?? '')
      setDescription(parsed.description ?? pastedJD)
      setRequiredSkills(parsed.required_skills ?? [])
      setPreferredSkills(parsed.preferred_skills ?? [])
      if (parsed.experience_years) setExpYears(parsed.experience_years)
      if (parsed.industry)         setIndustry(parsed.industry)
      if (parsed.location)         setLocation(parsed.location)
      if (parsed.work_mode)        setWorkMode(parsed.work_mode)
      setStep('review')
    } catch (e) { setError('Failed to parse JD: ' + e.message) }
    setLoading(false)
  }

  // ── Review → assign or save ───────────────────────────────────────────────
  function handleReviewNext() {
    if (showAssign) { setStep('assign') } else { doSave() }
  }

  function doSave() {
    onSave({
      title,
      description,
      required_skills:  requiredSkills,
      preferred_skills: preferredSkills,
      experience_years: expYears,
      industry:         industry || null,
      location:         location || null,
      work_mode:        workMode || null,
      comp_min:         compMode === 'manual' && compMin ? parseInt(compMin, 10) : null,
      comp_max:         compMode === 'manual' && compMax ? parseInt(compMax, 10) : null,
      tech_weight:      60,
      comm_weight:      40,
      assigned_to:      assignedTo || null,
    })
  }

  // ── Copy JD text ──────────────────────────────────────────────────────────
  function handleCopy() {
    navigator.clipboard.writeText(description).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Shared style objects ──────────────────────────────────────────────────
  const S = {
    field:   { marginBottom: 16 },
    label:   { display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 6 },
    input:   { width: '100%', boxSizing: 'border-box' },
    row:     { display: 'flex', gap: 8, marginTop: 20 },
    aiBox:   { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' },
    aiLabel: { display: 'block', fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 8 },
    sub:     { fontSize: 13, color: 'var(--text-2)', marginTop: 0, marginBottom: 20 },
  }

  // ── Progress bar (only for AI flow steps) ────────────────────────────────
  const showProgress = !['mode', 'paste'].includes(step) && jdMode === 'ai'
  const progressSteps = showAssign ? [...AI_STEPS, 'Assign'] : AI_STEPS
  const progressIdx   = step === 'assign' ? progressSteps.length - 1 : (AI_STEP_IDX[step] ?? 0)

  // ── Step title ────────────────────────────────────────────────────────────
  const STEP_TITLE = {
    mode:         'Create Job Description',
    paste:        'Paste Job Description',
    brief:        'Describe the Role',
    clarify:      'Technical Details',
    industry:     'Select Industry',
    location:     'Location & Work Mode',
    experience:   'Experience Required',
    compensation: 'Compensation',
    review:       'Review & Edit JD',
    assign:       'Assign Recruiter',
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 660, maxHeight: '92vh', overflow: 'auto', padding: 32, boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 20, color: 'var(--text)' }}>
            {STEP_TITLE[step]}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-3)', lineHeight: 1, padding: '2px 6px' }}>✕</button>
        </div>

        {/* Progress bar */}
        {showProgress && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 28 }}>
            {progressSteps.map((s, i) => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= progressIdx ? 'var(--accent)' : 'var(--border2)', transition: 'background 0.3s' }} />
            ))}
          </div>
        )}

        {/* Error banner */}
        {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ── MODE ── */}
        {step === 'mode' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button
              onClick={() => { setJdMode('paste'); setStep('paste') }}
              style={{ padding: '28px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ fontSize: 26, marginBottom: 10 }}>📋</div>
              <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>Paste Existing JD</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>Paste or type your job description and let AI structure it into required fields.</div>
            </button>
            <button
              onClick={() => { setJdMode('ai'); setStep('brief') }}
              style={{ padding: '28px 20px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--bg)', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ fontSize: 26, marginBottom: 10 }}>✨</div>
              <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>Build with AI</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>Start with a brief description and AI will guide you through crafting a complete JD.</div>
            </button>
          </div>
        )}

        {/* ── PASTE ── */}
        {step === 'paste' && (
          <div>
            <p style={S.sub}>Paste your job description below. AI will parse and extract the title, skills, and key details.</p>
            <textarea value={pastedJD} onChange={e => setPastedJD(e.target.value)} placeholder="Paste full job description here…" rows={12} style={S.input} />
            <div style={S.row}>
              <button className="btn btn-secondary" onClick={() => setStep('mode')}>← Back</button>
              <button className="btn btn-primary" onClick={handlePasteNext} disabled={loading || !pastedJD.trim()}>
                {loading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Parsing…</> : 'Parse & Structure →'}
              </button>
            </div>
          </div>
        )}

        {/* ── BRIEF ── */}
        {step === 'brief' && (
          <div>
            <p style={S.sub}>Briefly describe the role. Don't worry about details — AI will ask follow-up questions to clarify the requirements.</p>
            <div style={S.field}>
              <label style={S.label}>Role Description</label>
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder='e.g. "Java developer with 5 years of experience" or "Senior React engineer for a fintech product"'
                rows={4}
                style={S.input}
                autoFocus
              />
            </div>
            <div style={S.row}>
              <button className="btn btn-secondary" onClick={() => setStep('mode')}>← Back</button>
              <button className="btn btn-primary" onClick={handleBriefNext} disabled={loading || !brief.trim()}>
                {loading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Thinking…</> : 'Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* ── CLARIFY ── */}
        {step === 'clarify' && (
          <div>
            <div style={{ ...S.aiBox, marginBottom: 20 }}>
              <span style={S.aiLabel}>AI — Follow-up Questions</span>
              {clarifyQ}
            </div>
            <div style={S.field}>
              <label style={S.label}>Your Answers</label>
              <textarea
                value={clarifyA}
                onChange={e => setClarifyA(e.target.value)}
                placeholder="Answer the questions above to help AI generate an accurate job description…"
                rows={6}
                style={S.input}
                autoFocus
              />
            </div>
            <div style={S.row}>
              <button className="btn btn-secondary" onClick={() => setStep('brief')}>← Back</button>
              <button className="btn btn-primary" onClick={handleClarifyNext}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── INDUSTRY ── */}
        {step === 'industry' && (
          <div>
            <p style={S.sub}>Which industry does this role cater to? This helps AI tailor the JD with relevant domain context.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
              {INDUSTRIES.map(ind => (
                <button
                  key={ind}
                  onClick={() => handleIndustrySelect(ind)}
                  className={`btn ${industry === ind ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '11px 8px', fontSize: 12, textAlign: 'center' }}
                >
                  {ind}
                </button>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={() => setStep('clarify')}>← Back</button>
          </div>
        )}

        {/* ── LOCATION ── */}
        {step === 'location' && (
          <div>
            <div style={S.field}>
              <label style={S.label}>City / Location</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Bengaluru, Mumbai, Delhi NCR, Remote"
                style={S.input}
                autoFocus
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>Work Mode</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {WORK_MODES.map(m => (
                  <button
                    key={m}
                    onClick={() => setWorkMode(m)}
                    className={`btn ${workMode === m ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '11px', fontSize: 13 }}
                  >
                    {m === 'WFO' ? '🏢 WFO' : m === 'WFH' ? '🏠 WFH' : '🔄 Hybrid'}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.row}>
              <button className="btn btn-secondary" onClick={() => setStep('industry')}>← Back</button>
              <button className="btn btn-primary" onClick={handleLocationNext} disabled={!location.trim() || !workMode}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── EXPERIENCE ── */}
        {step === 'experience' && (
          <div>
            <p style={S.sub}>How many years of experience are required?</p>
            <div style={S.field}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
                <input type="range" min={0} max={20} value={expYears} onChange={e => setExpYears(+e.target.value)} style={{ flex: 1 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--accent)', minWidth: 64, textAlign: 'center' }}>
                  {expYears}<span style={{ fontSize: 13, fontWeight: 400 }}>&nbsp;yrs</span>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 5, 7, 10, 12, 15].map(y => (
                  <button
                    key={y}
                    className={`btn ${expYears === y ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '5px 14px', fontSize: 12 }}
                    onClick={() => setExpYears(y)}
                  >{y}+</button>
                ))}
              </div>
            </div>
            <div style={S.row}>
              <button className="btn btn-secondary" onClick={() => setStep('location')}>← Back</button>
              <button className="btn btn-primary" onClick={handleExperienceNext}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── COMPENSATION ── */}
        {step === 'compensation' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[
                { id: 'ai',     label: '✨ AI Recommendation' },
                { id: 'manual', label: '✏️  Set Manually' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  className={`btn ${compMode === id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '10px' }}
                  onClick={() => {
                    setCompMode(id)
                    if (id === 'ai' && !compRecLoaded) loadCompRec()
                  }}
                >{label}</button>
              ))}
            </div>

            {compMode === 'ai' && (
              <div style={{ ...S.aiBox, marginBottom: 20 }}>
                <span style={S.aiLabel}>Market Recommendation</span>
                {loading
                  ? <span className="spinner" style={{ width: 14, height: 14 }} />
                  : (compRec || 'Loading recommendation…')}
              </div>
            )}

            {compMode === 'manual' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={S.field}>
                  <label style={S.label}>Min (LPA / K USD)</label>
                  <input type="number" value={compMin} onChange={e => setCompMin(e.target.value)} placeholder="e.g. 15" style={S.input} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Max (LPA / K USD)</label>
                  <input type="number" value={compMax} onChange={e => setCompMax(e.target.value)} placeholder="e.g. 25" style={S.input} />
                </div>
              </div>
            )}

            <div style={S.row}>
              <button className="btn btn-secondary" onClick={() => setStep('experience')}>← Back</button>
              <button className="btn btn-primary" onClick={handleGenerateJD} disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Generating JD…</> : 'Generate Job Description →'}
              </button>
            </div>
          </div>
        )}

        {/* ── REVIEW ── */}
        {step === 'review' && (
          <div>
            <div style={S.field}>
              <label style={S.label}>Job Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} style={S.input} />
            </div>

            {/* Meta badges */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {industry  && <span className="badge badge-blue">{industry}</span>}
              {workMode  && <span className="badge badge-amber">{workMode}</span>}
              {location  && <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }}>📍 {location}</span>}
              {expYears  && <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }}>{expYears}+ yrs</span>}
              {compMode === 'manual' && compMin && <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }}>₹{compMin}–{compMax} LPA</span>}
            </div>

            <div style={S.field}>
              <label style={S.label}>Required Skills</label>
              <TagInput value={requiredSkills} onChange={setRequiredSkills} placeholder="Add skill…" />
            </div>
            <div style={S.field}>
              <label style={S.label}>Preferred Skills</label>
              <TagInput value={preferredSkills} onChange={setPreferredSkills} placeholder="Add skill…" />
            </div>

            <div style={S.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...S.label, marginBottom: 0 }}>Job Description</label>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 10, padding: '3px 10px' }}
                  onClick={handleCopy}
                >{copied ? '✓ Copied!' : 'Copy JD'}</button>
              </div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={14}
                style={{ ...S.input, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.65, resize: 'vertical' }}
              />
            </div>

            <div style={S.row}>
              <button className="btn btn-secondary" onClick={() => setStep(jdMode === 'paste' ? 'paste' : 'compensation')}>← Back</button>
              <button className="btn btn-primary" onClick={handleReviewNext} disabled={!title.trim()}>
                {showAssign ? 'Continue to Assign →' : 'Create Job Posting →'}
              </button>
            </div>
          </div>
        )}

        {/* ── ASSIGN ── */}
        {step === 'assign' && (
          <div>
            <p style={S.sub}>
              Assign this requisition to a recruiter. They will see it on their dashboard and can immediately begin sourcing candidates.
            </p>

            {recruiters.length === 0 ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
                No recruiters found. Invite recruiter accounts first from the Clients page.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {recruiters.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setAssignedTo(r.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      border: `1px solid ${assignedTo === r.id ? 'var(--accent)' : 'var(--border)'}`,
                      background: assignedTo === r.id ? 'rgba(99,102,241,0.06)' : 'var(--bg)',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>
                        {r.contact_name || r.company_name || r.email}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{r.email}</div>
                    </div>
                    {assignedTo === r.id && <span style={{ color: 'var(--accent)', fontSize: 18 }}>✓</span>}
                  </button>
                ))}
              </div>
            )}

            <div style={S.row}>
              <button className="btn btn-secondary" onClick={() => setStep('review')}>← Back</button>
              <button
                className="btn btn-primary"
                onClick={doSave}
                disabled={recruiters.length > 0 && !assignedTo}
              >
                {recruiters.length === 0 ? 'Create Without Assignment' : 'Assign & Create Job →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
