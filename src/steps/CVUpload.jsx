import { useState, useRef, useCallback } from 'react'
import { callClaude } from '../utils/api'
import { extractContent, isSupported, fileExt, ACCEPT_ATTR } from '../utils/fileExtract'

const PARSE_SYSTEM = `You are a CV/resume parser. Extract structured information from the provided content.
Return ONLY a valid JSON object — no markdown fences, no explanation — with exactly these fields:
{
  "name": "string — full name",
  "email": "string — email address or empty string",
  "currentRole": "string — most recent job title",
  "totalYears": number — total years of professional experience,
  "skills": ["array", "of", "skills"],
  "education": "string — highest qualification",
  "summary": "string — 2-3 sentence professional summary",
  "highlights": ["3-5 key career achievements or highlights"]
}`

const FORMAT_ICON = {
  pdf:  '📕',
  docx: '📝',
  txt:  '📄',
  jpg:  '🖼️',
  jpeg: '🖼️',
  png:  '🖼️',
}

const FORMAT_BADGE_CLASS = {
  pdf:  'badge-red',
  docx: 'badge-blue',
  txt:  'badge-amber',
  jpg:  'badge-green',
  jpeg: 'badge-green',
  png:  'badge-green',
}

/** Build the messages array for Claude — text or multimodal image */
function buildMessages(content) {
  if (content.kind === 'image') {
    return [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: content.mediaType, data: content.base64 },
        },
        {
          type: 'text',
          text: 'This is a photograph or scan of a CV/resume. Parse it and extract all candidate information.',
        },
      ],
    }]
  }
  return [{ role: 'user', content: `Parse this CV:\n\n${content.text}` }]
}

export default function CVUpload({ onNext }) {
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const inputRef = useRef()

  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming).filter(isSupported)
    if (!valid.length) return
    setFiles((prev) => [
      ...prev,
      ...valid
        .filter((f) => !prev.some((p) => p.file.name === f.name))
        .map((f) => ({
          id:      crypto.randomUUID(),
          file:    f,
          ext:     fileExt(f),
          status:  'pending',
          parsed:  null,
          rawText: '',
          error:   '',
        })),
    ])
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const patch = (id, updates) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))

  const parseAll = async () => {
    setRunning(true)
    const pending = files.filter((f) => f.status === 'pending')

    for (const entry of pending) {
      patch(entry.id, { status: 'parsing' })
      try {
        const content  = await extractContent(entry.file)
        const messages = buildMessages(content)
        const reply    = await callClaude(messages, PARSE_SYSTEM, 1024)
        const parsed   = JSON.parse(reply.trim())
        patch(entry.id, {
          status:  'done',
          parsed,
          rawText: content.kind === 'text' ? content.text : '',
        })
      } catch (err) {
        patch(entry.id, { status: 'error', error: err.message })
      }
    }

    setRunning(false)
  }

  const remove = (id) => setFiles((prev) => prev.filter((f) => f.id !== id))

  const doneCount    = files.filter((f) => f.status === 'done').length
  const pendingCount = files.filter((f) => f.status === 'pending').length
  const progress     = files.length ? (doneCount / files.length) * 100 : 0
  const canParse     = pendingCount > 0 && !running
  const canProceed   = doneCount > 0 && !running

  const proceed = () =>
    onNext(
      files
        .filter((f) => f.status === 'done')
        .map((f) => ({
          id:        f.id,
          fileName:  f.file.name,
          rawText:   f.rawText,
          parsed:    f.parsed,
          screening: null,
          interview: null,
        })),
    )

  return (
    <div className="step-page">
      <div className="step-header">
        <h2>CV Upload</h2>
        <p>Upload CVs in any supported format. Claude extracts structured data from each file.</p>
      </div>

      {/* ── Drop zone ── */}
      <div
        className={`drop-zone${dragging ? ' drag-over' : ''}`}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current.click()}
      >
        <div className="drop-icon">⬆</div>
        <p>Drop CV files here or <span className="link">browse files</span></p>
        <div className="format-pills">
          {['PDF', 'DOCX', 'TXT', 'JPG', 'PNG'].map((fmt) => (
            <span key={fmt} className="format-pill">{fmt}</span>
          ))}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* ── File list ── */}
      {files.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
            {running && (
              <div style={{ flex: 1 }}>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            <button
              className="btn btn-primary"
              style={{ padding: '6px 14px' }}
              disabled={!canParse}
              onClick={parseAll}
            >
              {running
                ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Parsing…</>
                : 'Parse with AI'}
            </button>
          </div>

          {files.map((f) => (
            <div key={f.id} className="file-row">
              <div className="file-info">
                <span className="file-icon">{FORMAT_ICON[f.ext] ?? '📄'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div className="file-name">{f.file.name}</div>
                    <span className={`badge ${FORMAT_BADGE_CLASS[f.ext] ?? 'badge-amber'}`}>
                      {f.ext.toUpperCase()}
                    </span>
                  </div>
                  {f.parsed && (
                    <div className="file-parsed">
                      <strong>{f.parsed.name}</strong>
                      {f.parsed.currentRole ? ` · ${f.parsed.currentRole}` : ''}
                      {f.parsed.totalYears  ? ` · ${f.parsed.totalYears}y exp` : ''}
                    </div>
                  )}
                  {f.status === 'error' && (
                    <div className="error-text">⚠ {f.error}</div>
                  )}
                </div>
              </div>
              <div className="file-status">
                {f.status === 'pending' && <span className="badge badge-amber">Pending</span>}
                {f.status === 'parsing' && <span className="spinner" />}
                {f.status === 'done'    && <span className="badge badge-green">Parsed</span>}
                {f.status === 'error'   && <span className="badge badge-red">Error</span>}
                <button
                  className="btn btn-ghost"
                  style={{ padding: '4px 8px', fontSize: 16 }}
                  onClick={() => remove(f.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="step-footer">
        <button className="btn btn-primary" disabled={!canProceed} onClick={proceed}>
          Continue to AI Screening ({doneCount} candidate{doneCount !== 1 ? 's' : ''}) →
        </button>
      </div>
    </div>
  )
}
