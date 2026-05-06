import { useState, useEffect, useRef, useCallback } from 'react'
import mammoth from 'mammoth'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { callClaude } from '../../utils/api'
import { extractContent, isSupported, ACCEPT_ATTR } from '../../utils/fileExtract'
import TagInput from '../../components/TagInput'

const MI = { width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }

export default function CandidateProfile() {
  const { user } = useAuth()
  const fileInputRef = useRef()

  const [poolId,       setPoolId]       = useState(null)
  const [fullName,     setFullName]     = useState('')
  const [phone,        setPhone]        = useState('')
  const [currentRole,  setCurrentRole]  = useState('')
  const [totalYears,   setTotalYears]   = useState('')
  const [skills,       setSkills]       = useState([])
  const [linkedinUrl,  setLinkedinUrl]  = useState('')
  const [githubUrl,    setGithubUrl]    = useState('')
  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [summary,      setSummary]      = useState('')
  const [visibility,   setVisibility]   = useState('all')
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [cvFile,       setCvFile]       = useState(null)
  const [cvParsing,    setCvParsing]    = useState(false)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    const { data: pool } = await supabase
      .from('talent_pool')
      .select('*')
      .eq('candidate_user_id', user.id)
      .single()

    if (pool) {
      setPoolId(pool.id)
      setFullName(pool.full_name ?? '')
      setPhone(pool.phone ?? '')
      setCurrentRole(pool.candidate_role ?? '')
      setTotalYears(pool.total_years?.toString() ?? '')
      setSkills(pool.skills ?? [])
      setLinkedinUrl(pool.linkedin_url ?? '')
      setGithubUrl(pool.github_url ?? '')
      setPortfolioUrl(pool.portfolio_url ?? '')
      setSummary(pool.summary ?? '')
      setVisibility(pool.visibility ?? 'all')
    }
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!poolId) return
    setSaving(true)
    setError('')
    setSaved(false)

    const { error: saveErr } = await supabase.from('talent_pool').update({
      full_name:      fullName.trim(),
      candidate_role: currentRole.trim(),
      total_years:    parseInt(totalYears) || 0,
      skills,
      linkedin_url:   linkedinUrl.trim() || null,
      github_url:     githubUrl.trim() || null,
      portfolio_url:  portfolioUrl.trim() || null,
      summary:        summary.trim(),
      visibility,
    }).eq('id', poolId)

    if (saveErr) {
      setError(saveErr.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  async function generateSummary() {
    if (!fullName && !currentRole) return
    setGeneratingSummary(true)
    try {
      const prompt = `Write a professional 3-sentence summary for a candidate:
Name: ${fullName}
Role: ${currentRole}
Years experience: ${totalYears}
Skills: ${skills.join(', ')}
Return only the summary text, no labels or formatting.`
      const text = await callClaude([{ role: 'user', content: prompt }], 'You write concise professional summaries for job candidates.', 400)
      setSummary(text.trim())
    } catch (err) {
      setError('Summary generation failed: ' + err.message)
    }
    setGeneratingSummary(false)
  }

  const handleFileChange = useCallback((e) => {
    const f = e.target.files[0]
    if (f && isSupported(f)) setCvFile(f)
    e.target.value = ''
  }, [])

  async function refreshFromCV() {
    if (!cvFile || !poolId) return
    setCvParsing(true)
    setError('')
    try {
      let content
      if (cvFile.name.endsWith('.docx')) {
        const ab = await cvFile.arrayBuffer()
        const res = await mammoth.extractRawText({ arrayBuffer: ab })
        content = { kind: 'text', text: res.value }
      } else {
        content = await extractContent(cvFile)
      }
      const rawText = content.kind === 'text' ? content.text : ''
      const system = `You are a CV parser. Return ONLY valid JSON — no markdown:
{"name":"string","email":"string","currentRole":"string","totalYears":number,"skills":["..."],"education":"string","summary":"string","highlights":["..."],"linkedinUrl":"string or null"}`
      const msgs = content.kind === 'image'
        ? [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: content.mediaType, data: content.base64 } }, { type: 'text', text: 'Parse this CV.' }] }]
        : [{ role: 'user', content: `Parse this CV:\n\n${content.text}` }]
      const reply = await callClaude(msgs, system, 1024)
      const parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))

      if (parsed.currentRole && !currentRole) setCurrentRole(parsed.currentRole)
      if (parsed.totalYears && !totalYears)   setTotalYears(String(parsed.totalYears))
      if (parsed.skills?.length && !skills.length) setSkills(parsed.skills)
      if (parsed.summary && !summary)         setSummary(parsed.summary)
      if (parsed.linkedinUrl && !linkedinUrl) setLinkedinUrl(parsed.linkedinUrl)

      // Also update raw_text
      await supabase.from('talent_pool').update({ raw_text: rawText, highlights: parsed.highlights ?? [] }).eq('id', poolId)
      setCvFile(null)
    } catch (err) {
      setError('CV parse failed: ' + err.message)
    }
    setCvParsing(false)
  }

  if (loading) return <div className="page" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="spinner" /> Loading…</div>

  return (
    <div className="page">
      <div className="page-head">
        <div><h2>My Profile</h2><p>Keep your details up to date to improve matching</p></div>
        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Saving…</> : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}
      {saved  && <div className="error-banner" style={{ background: 'var(--green-d)', borderColor: 'var(--green)', color: 'var(--green)', marginBottom: 16 }}>✓ Profile saved successfully</div>}

      <form onSubmit={handleSave}>
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="section-card-head"><h3>Basic Information</h3></div>
          <div className="section-card-body">
            <div className="form-grid">
              <div className="field">
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Full Name</label>
                <input style={MI} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Phone</label>
                <input style={MI} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7700 900123" />
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Current Role / Title</label>
                <input style={MI} value={currentRole} onChange={e => setCurrentRole(e.target.value)} placeholder="Senior Software Engineer" />
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Years of Experience</label>
                <input style={MI} type="number" min={0} max={40} value={totalYears} onChange={e => setTotalYears(e.target.value)} placeholder="5" />
              </div>
              <div className="field span-2">
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Skills</label>
                <TagInput value={skills} onChange={setSkills} placeholder="Add a skill and press Enter…" />
              </div>
            </div>
          </div>
        </div>

        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="section-card-head"><h3>Links</h3></div>
          <div className="section-card-body">
            <div className="form-grid">
              <div className="field">
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>LinkedIn URL</label>
                <input style={MI} type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/yourname" />
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>GitHub URL</label>
                <input style={MI} type="url" value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/yourname" />
              </div>
              <div className="field span-2">
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Portfolio / Website</label>
                <input style={MI} type="url" value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)} placeholder="https://yourportfolio.com" />
              </div>
            </div>
          </div>
        </div>

        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="section-card-head">
            <h3>Professional Summary</h3>
            <button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} disabled={generatingSummary} onClick={generateSummary}>
              {generatingSummary ? <><span className="spinner" style={{ width: 10, height: 10 }} /> Generating…</> : '✦ Generate with AI'}
            </button>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <textarea
              style={{ ...MI, height: 100, resize: 'vertical', lineHeight: 1.7 }}
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="A brief summary of your experience and what you're looking for…"
            />
          </div>
        </div>

        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="section-card-head"><h3>Update CV</h3></div>
          <div style={{ padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div
              style={{ flex: 1, border: '1px dashed var(--border)', borderRadius: 8, padding: '12px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}
              onClick={() => fileInputRef.current?.click()}
            >
              {cvFile ? <span style={{ color: 'var(--text)' }}>📄 {cvFile.name}</span> : <>Drop or <span style={{ color: 'var(--accent)' }}>browse</span> — PDF, DOCX or TXT</>}
            </div>
            <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} style={{ display: 'none' }} onChange={handleFileChange} />
            <button type="button" className="btn btn-secondary" disabled={!cvFile || cvParsing} onClick={refreshFromCV}>
              {cvParsing ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Parsing…</> : '↺ Refresh Profile from CV'}
            </button>
          </div>
        </div>

        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="section-card-head"><h3>Privacy</h3></div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { value: 'all',            label: 'Visible to all clients', desc: 'Your profile can be shared with any client company we work with.' },
              { value: 'recruiter_only', label: 'Recruiter introductions only', desc: 'Only your assigned recruiter can share your profile with clients.' },
            ].map(opt => (
              <label key={opt.value} style={{ display: 'flex', gap: 12, cursor: 'pointer', alignItems: 'flex-start' }}>
                <input type="radio" name="visibility" value={opt.value} checked={visibility === opt.value} onChange={() => setVisibility(opt.value)} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </form>
    </div>
  )
}
