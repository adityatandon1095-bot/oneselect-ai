import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

export default function CandidateProfile() {
  const { user, profile } = useAuth()
  const [poolRecord, setPoolRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  // Editable fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [availability, setAvailability] = useState('available')
  const [skills, setSkills] = useState([])
  const [skillInput, setSkillInput] = useState('')
  const [candidateRole, setCandidateRole] = useState('')
  const [totalYears, setTotalYears] = useState('')
  const [summary, setSummary] = useState('')

  useEffect(() => {
    if (user?.email) load()
  }, [user?.email])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('talent_pool')
        .select('*')
        .eq('email', user.email)
        .maybeSingle()

      if (err) throw err

      if (data) {
        setPoolRecord(data)
        setFullName(data.full_name ?? '')
        setPhone(data.phone ?? '')
        setLocation(data.location ?? '')
        setAvailability(data.availability ?? 'available')
        setSkills(data.skills ?? [])
        setCandidateRole(data.candidate_role ?? '')
        setTotalYears(data.total_years?.toString() ?? '')
        setSummary(data.summary ?? '')
      } else {
        // Seed from profile
        setFullName(profile?.full_name ?? '')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function addSkill(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const s = skillInput.trim().replace(/,+$/, '')
      if (s && !skills.includes(s)) setSkills(prev => [...prev, s])
      setSkillInput('')
    }
  }

  function removeSkill(s) {
    setSkills(prev => prev.filter(x => x !== s))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const payload = {
        email: user.email,
        full_name: fullName,
        phone,
        location,
        availability,
        skills,
        candidate_role: candidateRole,
        total_years: totalYears ? parseInt(totalYears, 10) : null,
        summary,
      }

      if (poolRecord) {
        const { error: err } = await supabase.from('talent_pool').update(payload).eq('id', poolRecord.id)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase.from('talent_pool').insert(payload).select().single()
        if (err) throw err
        setPoolRecord(data)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const mono = { fontFamily: 'var(--font-mono)' }
  const label = { fontSize: 11, ...mono, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 6, display: 'block' }
  const input = { width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-body)', boxSizing: 'border-box' }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>My Profile</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Keep your details up to date so we can match you to the best roles.
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Basic info */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Basic Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={label}>Full Name</label>
              <input style={input} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label style={label}>Email</label>
              <input style={{ ...input, opacity: 0.6, cursor: 'not-allowed' }} value={user?.email ?? ''} readOnly />
            </div>
            <div>
              <label style={label}>Phone</label>
              <input style={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label style={label}>Location</label>
              <input style={input} value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country" />
            </div>
          </div>
        </div>

        {/* Professional */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Professional Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={label}>Current / Target Role</label>
              <input style={input} value={candidateRole} onChange={e => setCandidateRole(e.target.value)} placeholder="e.g. Senior Software Engineer" />
            </div>
            <div>
              <label style={label}>Years of Experience</label>
              <input style={input} type="number" min="0" max="50" value={totalYears} onChange={e => setTotalYears(e.target.value)} placeholder="e.g. 5" />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Availability</label>
            <select style={input} value={availability} onChange={e => setAvailability(e.target.value)}>
              <option value="available">Available now</option>
              <option value="open">Open to opportunities</option>
              <option value="not_looking">Not looking</option>
            </select>
          </div>
          <div>
            <label style={label}>Professional Summary</label>
            <textarea
              style={{ ...input, resize: 'vertical', minHeight: 80 }}
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Brief overview of your background and goals..."
            />
          </div>
        </div>

        {/* Skills */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Skills</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>Type a skill and press Enter to add it.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {skills.map(s => (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', fontSize: 12, ...mono, color: 'var(--text-2)' }}>
                {s}
                <button type="button" onClick={() => removeSkill(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          <input
            style={{ ...input, maxWidth: 300 }}
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={addSkill}
            placeholder="e.g. React, Python, AWS..."
          />
        </div>

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 120 }}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
          {saved && <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ Profile saved</span>}
        </div>
      </form>
    </div>
  )
}
