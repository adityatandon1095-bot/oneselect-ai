import { useState } from 'react'

export default function TagInput({ value = [], onChange, placeholder = 'Type and press Enter…' }) {
  const [input, setInput] = useState('')

  const commit = () => {
    const t = input.trim().replace(/,+$/, '')
    if (t && !value.includes(t)) onChange([...value, t])
    setInput('')
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
    if (e.key === 'Backspace' && !input && value.length > 0) onChange(value.slice(0, -1))
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
