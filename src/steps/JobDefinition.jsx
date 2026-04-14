import { useState } from 'react'

function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('')

  const commit = () => {
    const t = input.trim().replace(/,+$/, '')
    if (t && !value.includes(t)) onChange([...value, t])
    setInput('')
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
    if (e.key === 'Backspace' && !input && value.length > 0)
      onChange(value.slice(0, -1))
  }

  return (
    <div className="tag-input" onClick={(e) => e.currentTarget.querySelector('input').focus()}>
      {value.map((t) => (
        <span key={t} className="tag">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        placeholder={value.length === 0 ? placeholder : ''}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={commit}
      />
    </div>
  )
}

const DEFAULT = {
  title: '',
  yearsOfExperience: 3,
  requiredSkills: [],
  preferredSkills: [],
  description: '',
  technicalWeight: 60,
  communicationWeight: 40,
}

export default function JobDefinition({ onNext }) {
  const [form, setForm] = useState(DEFAULT)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const setTech = (v) => { set('technicalWeight', v); set('communicationWeight', 100 - v) }
  const setComm = (v) => { set('communicationWeight', v); set('technicalWeight', 100 - v) }

  const valid = form.title.trim() && form.requiredSkills.length > 0 && form.description.trim()

  return (
    <div className="step-page">
      <div className="step-header">
        <h2>Job Definition</h2>
        <p>Define the role. Claude will use these requirements to screen CVs and conduct interviews.</p>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>Job Title</label>
          <input
            type="text"
            value={form.title}
            placeholder="e.g. Senior Backend Engineer"
            onChange={(e) => set('title', e.target.value)}
          />
        </div>

        <div className="field">
          <label>Years of Experience Required</label>
          <input
            type="number"
            value={form.yearsOfExperience}
            min={0}
            max={30}
            onChange={(e) => set('yearsOfExperience', Math.max(0, +e.target.value))}
          />
        </div>

        <div className="field span-2">
          <label>Required Skills — press Enter or comma to add</label>
          <TagInput
            value={form.requiredSkills}
            onChange={(v) => set('requiredSkills', v)}
            placeholder="e.g. Python, PostgreSQL, REST APIs…"
          />
        </div>

        <div className="field span-2">
          <label>Preferred Skills (nice-to-have)</label>
          <TagInput
            value={form.preferredSkills}
            onChange={(v) => set('preferredSkills', v)}
            placeholder="e.g. Kubernetes, GraphQL, AWS…"
          />
        </div>

        <div className="field span-2">
          <label>Role Description</label>
          <textarea
            rows={5}
            value={form.description}
            placeholder="Describe responsibilities, team context, and expectations…"
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        <div className="field span-2">
          <label>Evaluation Weights (must total 100%)</label>
          <div className="weight-sliders">
            <div className="weight-row">
              <span>Technical</span>
              <input
                type="range" min={10} max={90}
                value={form.technicalWeight}
                onChange={(e) => setTech(+e.target.value)}
              />
              <span className="weight-val mono">{form.technicalWeight}%</span>
            </div>
            <div className="weight-row">
              <span>Communication</span>
              <input
                type="range" min={10} max={90}
                value={form.communicationWeight}
                onChange={(e) => setComm(+e.target.value)}
              />
              <span className="weight-val mono">{form.communicationWeight}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="step-footer">
        <button className="btn btn-primary" disabled={!valid} onClick={() => onNext(form)}>
          Continue to CV Upload →
        </button>
        {!valid && <span className="text-muted" style={{ fontSize: 12 }}>Fill in title, required skills, and description to proceed</span>}
      </div>
    </div>
  )
}
