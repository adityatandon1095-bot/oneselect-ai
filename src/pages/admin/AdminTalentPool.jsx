import { useState, useEffect, useRef, useCallback } from 'react'
import mammoth from 'mammoth'
import { supabase } from '../../lib/supabase'
import { callClaude } from '../../utils/api'
import { extractContent, isSupported, fileExt, ACCEPT_ATTR } from '../../utils/fileExtract'
import { triggerTalentPoolMatch } from '../../utils/talentPool'

const CV_PARSE_SYSTEM = `You are a CV parser. Return ONLY valid JSON — no markdown:
{"name":"string","email":"string","currentRole":"string","totalYears":number,"skills":["..."],"education":"string","summary":"string","highlights":["..."]}`

const FORMAT_ICON = { pdf: '📕', docx: '📝', txt: '📄', jpg: '🖼️', jpeg: '🖼️', png: '🖼️' }
const AVAILABILITY_OPTS = ['available', 'placed', 'unavailable']
const AVAIL_BADGE = { available: 'badge-green', placed: 'badge-blue', unavailable: 'badge-amber' }

export default function AdminTalentPool() {
  const [candidates, setCandidates] = useState([])
  const [files, setFiles]           = useState([])
  const [dragging, setDragging]     = useState(false)
  const [parsing, setParsing]       = useState(false)
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [availFilter, setAvailFilter] = useState('all')
  const [jobs, setJobs]             = useState([])
  const [matchJobId, setMatchJobId] = useState('')
  const [matching, setMatching]     = useState(false)
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 })
  const [log, setLog]               = useState([])
  const [selected, setSelected]     = useState(null)
  const fileInputRef = useRef()
  const logRef       = useRef()

  useEffect(() => { load() }, [])
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [log])

  async function load() {
    const [{ data: pool }, { data: jobList }] = await Promise.all([
      supabase.from('talent_pool').select('*').order('created_at', { ascending: false }),
      supabase.from('jobs').select('id, title, profiles(company_name)').eq('status', 'active').order('created_at', { ascending: false }),
    ])
    setCandidates(pool ?? [])
    setJobs(jobList ?? [])
    setLoading(false)
  }

  const addLog = (msg, type = '') => setLog(p => [...p, { id: Date.now() + Math.random(), msg, type }])

  // ── File handling ─────────────────────────────────────────────────────────
  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming).filter(isSupported)
    if (!valid.length) return
    setFiles(p => [...p, ...valid
      .filter(f => !p.some(e => e.file.name === f.name))
      .map(f => ({ id: crypto.randomUUID(), file: f, ext: fileExt(f), status: 'pending', parsed: null, error: '' }))])
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files)
  }, [addFiles])

  function patchFile(id, updates) {
    setFiles(p => p.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  async function parseAll() {
    setParsing(true)
    for (const entry of files.filter(f => f.status === 'pending')) {
      patchFile(entry.id, { status: 'parsing' })
      addLog(`Parsing ${entry.file.name}…`, 'info')
      try {
        // For DOCX, use mammoth directly to guarantee text extraction
        let content
        if (entry.ext === 'docx') {
          const arrayBuffer = await entry.file.arrayBuffer()
          const result = await mammoth.extractRawText({ arrayBuffer })
          if (!result.value?.trim()) throw new Error('No text could be extracted from this DOCX file')
          content = { kind: 'text', text: result.value }
        } else {
          content = await extractContent(entry.file)
        }

        const msgs = content.kind === 'image'
          ? [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: content.mediaType, data: content.base64 } }, { type: 'text', text: 'Parse this CV image.' }] }]
          : [{ role: 'user', content: `Parse this CV:\n\n${content.text}` }]
        const reply = await callClaude(msgs, CV_PARSE_SYSTEM, 1024)
        // Strip markdown code fences Claude sometimes wraps around JSON
        const jsonStr = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        const parsed = JSON.parse(jsonStr)

        const { data: saved, error } = await supabase.from('talent_pool').insert({
          full_name:      parsed.name,
          email:          parsed.email ?? '',
          candidate_role: parsed.currentRole ?? '',
          total_years:    parsed.totalYears ?? 0,
          skills:         parsed.skills ?? [],
          education:      parsed.education ?? '',
          summary:        parsed.summary ?? '',
          highlights:     parsed.highlights ?? [],
          raw_text:       content.kind === 'text' ? content.text : '',
          availability:   'available',
        }).select().single()

        if (error) throw new Error(error.message)
        addLog(`✓ ${parsed.name} added to pool`, 'ok')
        patchFile(entry.id, { status: 'done', parsed })
        setCandidates(p => [saved, ...p])
      } catch (err) {
        addLog(`✗ ${entry.file.name}: ${err.message}`, 'err')
        patchFile(entry.id, { status: 'error', error: err.message })
      }
    }
    setParsing(false)
  }

  async function updateAvailability(id, availability) {
    await supabase.from('talent_pool').update({ availability }).eq('id', id)
    setCandidates(p => p.map(c => c.id === id ? { ...c, availability } : c))
    if (selected?.id === id) setSelected(s => ({ ...s, availability }))
  }

  async function runMatch() {
    if (!matchJobId) return
    setMatching(true)
    setMatchProgress({ current: 0, total: 0 })
    addLog('Starting pool match…', 'info')
    try {
      const passed = await triggerTalentPoolMatch(matchJobId, {
        onProgress: (cur, total) => setMatchProgress({ current: cur, total }),
        onLog: (msg, type) => addLog(msg, type),
      })
      addLog(`Match complete — ${passed} candidate${passed !== 1 ? 's' : ''} passed.`, 'ok')
    } catch (err) {
      addLog(`✗ Match error: ${err.message}`, 'err')
    }
    setMatching(false)
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = candidates.filter(c => {
    const okAvail  = availFilter === 'all' || c.availability === availFilter
    const q        = search.toLowerCase()
    const okSearch = !q ||
      c.full_name?.toLowerCase().includes(q) ||
      c.candidate_role?.toLowerCase().includes(q) ||
      (c.skills ?? []).some(s => s.toLowerCase().includes(q))
    return okAvail && okSearch
  })

  const pendingCount   = files.filter(f => f.status === 'pending').length
  const doneCount      = files.filter(f => f.status === 'done').length
  const parseProgress  = files.length ? (doneCount / files.length) * 100 : 0
  const running        = parsing || matching

  const availCounts = { available: 0, placed: 0, unavailable: 0 }
  candidates.forEach(c => { if (availCounts[c.availability] != null) availCounts[c.availability]++ })

  if (loading) return <div className="page"><span className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Talent Pool</h2>
          <p>{candidates.length} candidate{candidates.length !== 1 ? 's' : ''} in master pool</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ padding: '6px 14px', background: 'var(--green-d)', border: '1px solid var(--green)', borderRadius: 'var(--r)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
            {availCounts.available} available
          </div>
          <div style={{ padding: '6px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
            {availCounts.placed} placed
          </div>
        </div>
      </div>

      {/* ── 1 Upload to Pool ── */}
      <div className="section-card">
        <div className="section-card-head"><h3>1 · Upload CVs to Pool</h3></div>
        <div className="section-card-body">
          <div
            className={`drop-zone${dragging ? ' drag-over' : ''}`}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileInputRef.current.click()}
          >
            <div className="drop-icon">⬆</div>
            <p>Drop CVs or <span className="link">browse</span> to add to the master talent pool</p>
            <div className="format-pills">
              {['PDF', 'DOCX', 'TXT', 'JPG', 'PNG'].map(f => <span key={f} className="format-pill">{f}</span>)}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              style={{ display: 'none' }}
              onChange={e => { addFiles(e.target.files); e.target.value = '' }}
            />
          </div>

          {files.length > 0 && (
            <div className="file-list">
              <div className="file-list-header">
                <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
                {parsing && (
                  <div style={{ flex: 1 }}>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${parseProgress}%` }} /></div>
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  style={{ padding: '5px 12px', fontSize: 12 }}
                  disabled={!pendingCount || parsing}
                  onClick={parseAll}
                >
                  {parsing
                    ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Parsing…</>
                    : 'Parse & Add to Pool'}
                </button>
              </div>
              {files.map(f => (
                <div key={f.id} className="file-row">
                  <div className="file-info">
                    <span className="file-icon">{FORMAT_ICON[f.ext] ?? '📄'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="file-name">{f.file.name}</span>
                        <span className={`badge ${f.ext === 'pdf' ? 'badge-red' : f.ext === 'docx' ? 'badge-blue' : 'badge-amber'}`} style={{ fontSize: 9 }}>
                          {f.ext?.toUpperCase()}
                        </span>
                      </div>
                      {f.parsed && <div className="file-parsed"><strong>{f.parsed.name}</strong> · {f.parsed.currentRole}</div>}
                      {f.status === 'error' && <div className="error-text">⚠ {f.error}</div>}
                    </div>
                  </div>
                  <div className="file-status">
                    {f.status === 'pending' && <span className="badge badge-amber">Pending</span>}
                    {f.status === 'parsing' && <span className="spinner" />}
                    {f.status === 'done'    && <span className="badge badge-green">Added</span>}
                    {f.status === 'error'   && <span className="badge badge-red">Error</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 2 Pool Table ── */}
      <div className="section-card">
        <div className="section-card-head">
          <h3>2 · Candidate Pool</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search name, role, skill…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 220, padding: '5px 10px', fontSize: 12 }}
            />
            <select
              value={availFilter}
              onChange={e => setAvailFilter(e.target.value)}
              style={{ fontSize: 12, padding: '5px 10px' }}
            >
              <option value="all">All</option>
              {AVAILABILITY_OPTS.map(a => (
                <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            {candidates.length === 0
              ? 'No candidates in the pool yet. Upload CVs above.'
              : 'No candidates match this filter.'}
          </div>
        ) : (
          filtered.map(c => (
            <div key={c.id} className="table-row clickable" onClick={() => setSelected(c)}>
              <div className="col-main">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="profile-avatar" style={{ width: 34, height: 34, fontSize: 14, borderRadius: 'var(--r)', flexShrink: 0 }}>
                    {(c.full_name ?? '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="col-name">{c.full_name}</div>
                    <div className="col-sub">{c.candidate_role} · {c.total_years}y exp</div>
                  </div>
                </div>
              </div>
              <div className="col-right">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 200, justifyContent: 'flex-end' }}>
                  {(c.skills ?? []).slice(0, 3).map(s => (
                    <span key={s} style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--text-3)' }}>
                      {s}
                    </span>
                  ))}
                </div>
                <select
                  value={c.availability ?? 'available'}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updateAvailability(c.id, e.target.value)}
                  style={{ fontSize: 10, padding: '2px 6px', border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 'var(--r)', color: 'var(--text-2)' }}
                >
                  {AVAILABILITY_OPTS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <span className={`badge ${AVAIL_BADGE[c.availability ?? 'available']}`} style={{ fontSize: 9 }}>
                  {c.availability ?? 'available'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── 3 Match Pool to Job ── */}
      <div className="section-card">
        <div className="section-card-head"><h3>3 · Match Pool to Job</h3></div>
        <div className="section-card-body">
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
            Run AI screening on all available pool candidates against a job. Results appear in the recruiter's pipeline and the admin's Pipeline page.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={matchJobId} onChange={e => setMatchJobId(e.target.value)} style={{ flex: 1 }}>
              <option value="">— select active job —</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.title}{j.profiles?.company_name ? ` · ${j.profiles.company_name}` : ''}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={!matchJobId || matching}
              onClick={runMatch}
              style={{ whiteSpace: 'nowrap' }}
            >
              {matching ? (
                <>
                  <span className="spinner" style={{ width: 12, height: 12 }} />
                  {matchProgress.total > 0 ? ` ${matchProgress.current}/${matchProgress.total}` : ' Matching…'}
                </>
              ) : 'Run Match'}
            </button>
          </div>
        </div>
      </div>

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

      {/* ── Candidate Detail Modal ── */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>{selected.full_name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {selected.candidate_role} · {selected.total_years}y exp
                </p>
              </div>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                <select
                  value={selected.availability ?? 'available'}
                  onChange={e => updateAvailability(selected.id, e.target.value)}
                  style={{ fontSize: 12, padding: '5px 10px' }}
                >
                  {AVAILABILITY_OPTS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                {selected.email && (
                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{selected.email}</span>
                )}
              </div>

              {selected.summary && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 6 }}>Summary</div>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>{selected.summary}</p>
                </div>
              )}

              {(selected.skills ?? []).length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 6 }}>Skills</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selected.skills.map(s => (
                      <span key={s} style={{ fontSize: 11, padding: '3px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--text-2)' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(selected.highlights ?? []).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 6 }}>Highlights</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8 }}>
                    {selected.highlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
