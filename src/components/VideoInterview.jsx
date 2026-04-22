import { useState, useEffect, useRef, useCallback } from 'react'
import { callClaude } from '../utils/api'
import { supabase } from '../lib/supabase'

// ── Stage constants ───────────────────────────────────────────────────────────
const S = {
  SETUP:      'setup',
  LOADING:    'loading',
  READY:      'ready',
  COUNTDOWN:  'countdown',
  RECORDING:  'recording',
  BETWEEN:    'between',
  UPLOADING:  'uploading',
  DONE:       'done',
  ERROR:      'error',
}

// ── Integrity penalties ───────────────────────────────────────────────────────
const PENALTY = { tab_switch: 15, window_blur: 5, right_click: 3, screenshot: 10, copy: 3 }

// ── Best supported mime type ──────────────────────────────────────────────────
function bestMime() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  return types.find(t => { try { return MediaRecorder.isTypeSupported(t) } catch { return false } }) || 'video/webm'
}

// ── Generate questions via Claude ─────────────────────────────────────────────
async function generateQuestions(job) {
  const sys = `Generate exactly 5 video interview questions for a ${job.title} role.
Required skills: ${(job.required_skills || []).join(', ')}
Experience: ${job.experience_years || 0}+ years

Return ONLY a valid JSON array (no markdown):
[{"q":"question text","type":"technical|behavioral","seconds":90}]

Rules: 3 technical (120 seconds each), 2 behavioral (90 seconds each). Be specific and role-relevant.`

  const reply = await callClaude([{ role: 'user', content: 'Generate.' }], sys, 700)
  const clean = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```[\s]*$/m, '').trim()
  return JSON.parse(clean)
}

// ── Upload one blob to Supabase Storage ───────────────────────────────────────
async function uploadBlob(blob, matchId, idx) {
  const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm'
  const path = `${matchId}/q${idx}_${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('video-interviews')
    .upload(path, blob, { contentType: blob.type || 'video/webm', upsert: true })
  if (error) throw new Error(error.message)
  const { data: { publicUrl } } = supabase.storage.from('video-interviews').getPublicUrl(path)
  return publicUrl
}

// ── Timer ring SVG ────────────────────────────────────────────────────────────
function TimerRing({ seconds, total, size = 64 }) {
  const r = size / 2 - 5
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? seconds / total : 1
  const fill = pct * circ
  const color = pct > 0.5 ? 'var(--green)' : pct > 0.2 ? 'var(--amber)' : 'var(--red)'
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: size * 0.28, fontWeight: 700, color }}>
        {seconds}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function VideoInterview({ job, candidate, matchId, isFromPool, onClose, onComplete, onSave }) {
  const [stage,          setStage]          = useState(S.SETUP)
  const [questions,      setQuestions]      = useState([])
  const [currentQ,       setCurrentQ]       = useState(0)
  const [timeLeft,       setTimeLeft]       = useState(0)
  const [countdown,      setCountdown]      = useState(3)
  const [uploadProgress, setUploadProgress] = useState([])  // 'pending'|'uploading'|'done'|'error'
  const [warning,        setWarning]        = useState('')
  const [error,          setError]          = useState('')
  const [camOk,          setCamOk]          = useState(false)

  // Refs — values needed in callbacks without causing re-renders
  const videoRef      = useRef(null)   // <video> element for camera preview
  const streamRef     = useRef(null)   // MediaStream
  const recorderRef   = useRef(null)   // MediaRecorder
  const chunksRef     = useRef([])     // chunks for current question
  const blobsRef      = useRef([])     // final blobs per question
  const violationsRef = useRef([])     // anti-cheating events
  const currentQRef   = useRef(0)      // mirrors currentQ for callbacks
  const stageRef      = useRef(S.SETUP)
  const timerRef      = useRef(null)
  const warnTimerRef  = useRef(null)

  // Keep refs in sync
  useEffect(() => { currentQRef.current = currentQ }, [currentQ])
  useEffect(() => { stageRef.current = stage }, [stage])

  // ── Camera setup ──────────────────────────────────────────────────────────
  async function initCamera() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
      }
      setCamOk(true)
      // Generate questions while camera loads
      setStage(S.LOADING)
      const qs = await generateQuestions(job)
      setQuestions(qs)
      setUploadProgress(qs.map(() => 'pending'))
      setStage(S.READY)
    } catch (e) {
      setError(e.name === 'NotAllowedError'
        ? 'Camera and microphone access is required for the video interview. Please allow access and try again.'
        : 'Could not start camera: ' + e.message)
    }
  }

  // Attach stream to video element on mount / when stream ready
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.muted = true
    }
  })

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      clearTimeout(warnTimerRef.current)
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ── Anti-cheating monitors ────────────────────────────────────────────────
  const flag = useCallback((type, label) => {
    if (stageRef.current !== S.RECORDING && stageRef.current !== S.BETWEEN) return
    violationsRef.current.push({ type, label, q: currentQRef.current, time: new Date().toISOString() })
    setWarning(label)
    clearTimeout(warnTimerRef.current)
    warnTimerRef.current = setTimeout(() => setWarning(''), 3500)
  }, [])

  useEffect(() => {
    const onVis  = () => { if (document.hidden)    flag('tab_switch',  '⚠ Tab switch detected') }
    const onBlur = () => {                          flag('window_blur', '⚠ Window focus lost') }
    const onCtx  = (e) => {e.preventDefault();     flag('right_click', '⚠ Right-click blocked') }
    const onKey  = (e) => {
      if (e.key === 'PrintScreen')                  flag('screenshot',  '⚠ Screenshot attempt detected')
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') flag('copy',      '⚠ Copy attempt blocked')
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    document.addEventListener('contextmenu', onCtx)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('contextmenu', onCtx)
      document.removeEventListener('keydown', onKey)
    }
  }, [flag])

  // ── Timer countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== S.RECORDING) return
    if (timeLeft <= 0) { handleStopAnswer(); return }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [stage, timeLeft])

  // ── Countdown 3-2-1 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== S.COUNTDOWN) return
    if (countdown <= 0) { beginRecording(); return }
    timerRef.current = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [stage, countdown])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function startCountdown() {
    setCountdown(3)
    setStage(S.COUNTDOWN)
  }

  function beginRecording() {
    if (!streamRef.current) return
    const mime = bestMime()
    const mr = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : {})
    chunksRef.current = []
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(500)
    recorderRef.current = mr
    setTimeLeft(questions[currentQRef.current]?.seconds ?? 120)
    setStage(S.RECORDING)
  }

  async function handleStopAnswer() {
    clearTimeout(timerRef.current)
    setStage(S.BETWEEN)

    // Finalize recording
    await new Promise(resolve => {
      const mr = recorderRef.current
      if (!mr || mr.state === 'inactive') { resolve(); return }
      mr.onstop = resolve
      mr.stop()
    })
    const mime = recorderRef.current?.mimeType || 'video/webm'
    blobsRef.current[currentQRef.current] = new Blob(chunksRef.current, { type: mime })

    const nextQ = currentQRef.current + 1
    if (nextQ < questions.length) {
      // Pause 3 seconds then move to next question countdown
      timerRef.current = setTimeout(() => {
        setCurrentQ(nextQ)
        setCountdown(3)
        setStage(S.COUNTDOWN)
      }, 3000)
    } else {
      // All done — upload
      timerRef.current = setTimeout(() => startUpload(), 1500)
    }
  }

  async function startUpload() {
    setStage(S.UPLOADING)
    const urls = []
    const prog = questions.map(() => 'pending')
    setUploadProgress([...prog])

    for (let i = 0; i < questions.length; i++) {
      prog[i] = 'uploading'
      setUploadProgress([...prog])
      try {
        const url = await uploadBlob(blobsRef.current[i], matchId, i)
        urls.push({ q: questions[i].q, url })
        prog[i] = 'done'
      } catch {
        urls.push({ q: questions[i].q, url: null })
        prog[i] = 'error'
      }
      setUploadProgress([...prog])
    }

    // Calculate integrity score
    const deductions = violationsRef.current.reduce((s, v) => s + (PENALTY[v.type] || 5), 0)
    const integrityScore = Math.max(0, 100 - deductions)

    // Save to DB
    const update = { video_urls: urls, integrity_score: integrityScore, integrity_flags: violationsRef.current }
    if (onSave) {
      await onSave(update)
    } else {
      const table = isFromPool ? 'job_matches' : 'candidates'
      await supabase.from(table).update(update).eq('id', matchId)
    }

    setStage(S.DONE)
    onComplete({ video_urls: urls, integrity_score: integrityScore, integrity_flags: violationsRef.current })
  }

  // ── Shared dark overlay styles ────────────────────────────────────────────
  const overlay = {
    position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 2000,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontFamily: 'var(--font-body)',
  }
  const mono = { fontFamily: 'var(--font-mono)' }

  const integrityScore = Math.max(0, 100 - violationsRef.current.reduce((s, v) => s + (PENALTY[v.type] || 5), 0))

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (stage === S.SETUP) return (
    <div style={overlay}>
      <button onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); onClose() }}
        style={{ position: 'absolute', top: 24, right: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 22 }}>✕</button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, maxWidth: 860, width: '100%', padding: '0 40px' }}>
        {/* Camera preview */}
        <div style={{ aspectRatio: '4/3', background: '#111', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
          <video ref={videoRef} autoPlay playsInline muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: camOk ? 'block' : 'none' }} />
          {!camOk && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', gap: 10 }}>
              <div style={{ fontSize: 40 }}>📷</div>
              <div style={{ fontSize: 13 }}>Camera preview</div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, ...mono, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Video Interview</div>
            <h2 style={{ fontSize: 22, fontWeight: 300, margin: '0 0 6px', fontFamily: 'var(--font-head)' }}>{job.title}</h2>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{candidate.full_name} · {candidate.candidate_role}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['5 questions', 'Mix of technical and behavioral'],
              ['90–120 seconds', 'Per question — timer visible'],
              ['Recorded & monitored', 'Tab switches and focus loss are flagged'],
              ['One take', 'No pausing or re-recording'],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(99,102,241,0.8)', marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'rgba(239,68,68,0.1)', padding: '10px 14px', borderRadius: 8, lineHeight: 1.5 }}>{error}</div>}
          <button
            onClick={initCamera}
            style={{ padding: '13px 24px', borderRadius: 8, background: 'rgba(99,102,241,1)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
          >Allow Camera & Start →</button>
        </div>
      </div>
    </div>
  )

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (stage === S.LOADING) return (
    <div style={overlay}>
      <span className="spinner" style={{ width: 40, height: 40, borderColor: 'rgba(255,255,255,0.15)', borderTopColor: 'rgba(99,102,241,0.9)', borderWidth: 3 }} />
      <div style={{ marginTop: 20, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Preparing your interview…</div>
    </div>
  )

  // ── READY ─────────────────────────────────────────────────────────────────
  if (stage === S.READY) return (
    <div style={overlay}>
      {/* Small camera PiP */}
      <div style={{ position: 'absolute', top: 24, right: 24, width: 140, height: 100, borderRadius: 10, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
      </div>
      <button onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); onClose() }}
        style={{ position: 'absolute', top: 24, left: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 22 }}>✕</button>

      <div style={{ maxWidth: 520, textAlign: 'center', padding: '0 32px' }}>
        <div style={{ fontSize: 11, ...mono, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>Ready to begin</div>
        <h2 style={{ fontSize: 24, fontWeight: 300, fontFamily: 'var(--font-head)', margin: '0 0 10px' }}>You have {questions.length} questions</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 32, lineHeight: 1.7 }}>
          Answer each question naturally and concisely. Stay in this window throughout. The recording starts after a 3-second countdown per question.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32, textAlign: 'left' }}>
          {questions.map((q, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
              <span style={{ ...mono, fontSize: 11, color: 'rgba(99,102,241,0.7)', minWidth: 18 }}>Q{i+1}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{q.q}</span>
              <span style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.25)', flexShrink: 0, marginTop: 2 }}>{q.seconds}s</span>
            </div>
          ))}
        </div>
        <button onClick={startCountdown}
          style={{ padding: '14px 40px', borderRadius: 8, background: 'rgba(99,102,241,1)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 500 }}>
          Begin Interview →
        </button>
      </div>
    </div>
  )

  // ── COUNTDOWN ─────────────────────────────────────────────────────────────
  if (stage === S.COUNTDOWN) return (
    <div style={overlay}>
      <div style={{ position: 'absolute', top: 24, right: 24, width: 140, height: 100, borderRadius: 10, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, ...mono, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>
          Question {currentQ + 1} of {questions.length}
        </div>
        <div style={{ fontSize: 120, fontWeight: 700, color: countdown <= 1 ? 'var(--red)' : '#fff', lineHeight: 1, marginBottom: 16, transition: 'color 0.3s' }}>
          {countdown > 0 ? countdown : '●'}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Recording starts…</div>
      </div>
    </div>
  )

  // ── RECORDING ─────────────────────────────────────────────────────────────
  if (stage === S.RECORDING) {
    const q = questions[currentQ]
    const totalSecs = q?.seconds ?? 120
    return (
      <div style={{ ...overlay, justifyContent: 'flex-end' }}>
        {/* Full-screen camera */}
        <video ref={videoRef} autoPlay playsInline muted
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        {/* Dark gradient at bottom */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.1) 40%, transparent 60%)' }} />

        {/* Top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
            <span style={{ ...mono, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>REC · Q{currentQ + 1}/{questions.length}</span>
          </div>
          <TimerRing seconds={timeLeft} total={totalSecs} size={60} />
        </div>

        {/* Violation warning */}
        {warning && (
          <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', background: 'rgba(239,68,68,0.95)', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 10, whiteSpace: 'nowrap' }}>
            {warning}
          </div>
        )}

        {/* Question overlay */}
        <div style={{ position: 'relative', width: '100%', padding: '0 32px 32px', zIndex: 1 }}>
          <div style={{ fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>
            {q?.type === 'technical' ? 'Technical Question' : 'Behavioral Question'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 400, color: '#fff', lineHeight: 1.5, marginBottom: 20, maxWidth: 700 }}>
            {q?.q}
          </div>
          <button
            onClick={handleStopAnswer}
            style={{ padding: '10px 24px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 13, backdropFilter: 'blur(8px)' }}
          >Done answering →</button>
        </div>
      </div>
    )
  }

  // ── BETWEEN ───────────────────────────────────────────────────────────────
  if (stage === S.BETWEEN) {
    const isLast = currentQ >= questions.length - 1
    return (
      <div style={overlay}>
        <div style={{ position: 'absolute', top: 24, right: 24, width: 140, height: 100, borderRadius: 10, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, fontSize: 22, margin: '0 0 8px' }}>Answer saved</h3>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            {isLast ? 'Processing your final answer…' : `Question ${currentQ + 2} of ${questions.length} coming up…`}
          </div>
        </div>
      </div>
    )
  }

  // ── UPLOADING ─────────────────────────────────────────────────────────────
  if (stage === S.UPLOADING) return (
    <div style={overlay}>
      <div style={{ maxWidth: 400, width: '100%', padding: '0 32px' }}>
        <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, fontSize: 22, margin: '0 0 6px', textAlign: 'center' }}>Submitting your interview</h3>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 32 }}>Uploading your video answers…</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {questions.map((q, i) => {
            const st = uploadProgress[i]
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${st === 'done' ? 'var(--green)' : st === 'error' ? 'var(--red)' : 'rgba(255,255,255,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {st === 'done'      && <span style={{ color: 'var(--green)', fontSize: 14 }}>✓</span>}
                  {st === 'error'     && <span style={{ color: 'var(--red)', fontSize: 12 }}>✗</span>}
                  {st === 'uploading' && <span className="spinner" style={{ width: 12, height: 12, borderColor: 'rgba(255,255,255,0.15)', borderTopColor: '#fff', borderWidth: 2 }} />}
                  {st === 'pending'   && <span style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{i+1}</span>}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: st === 'done' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)', lineHeight: 1.3 }}>
                    {q.q.slice(0, 60)}{q.q.length > 60 ? '…' : ''}
                  </div>
                  <div style={{ fontSize: 10, ...mono, color: st === 'done' ? 'var(--green)' : st === 'error' ? 'var(--red)' : st === 'uploading' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)' }}>
                    {st === 'done' ? 'uploaded' : st === 'error' ? 'failed' : st === 'uploading' ? 'uploading…' : 'waiting'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  // ── DONE ─────────────────────────────────────────────────────────────────
  if (stage === S.DONE) {
    const scoreColor = integrityScore >= 80 ? 'var(--green)' : integrityScore >= 50 ? 'var(--amber)' : 'var(--red)'
    const scoreLabel = integrityScore >= 80 ? 'High Integrity' : integrityScore >= 50 ? 'Some Concerns' : 'Flagged'
    return (
      <div style={overlay}>
        <div style={{ maxWidth: 480, width: '100%', padding: '0 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎬</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, fontSize: 26, margin: '0 0 8px' }}>Interview Complete</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 32 }}>All answers have been recorded and uploaded.</p>

          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
            <div style={{ fontSize: 11, ...mono, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>Integrity Report</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: scoreColor, marginBottom: 4 }}>{integrityScore}</div>
            <div style={{ fontSize: 13, color: scoreColor, marginBottom: 16 }}>{scoreLabel}</div>
            {violationsRef.current.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
                {violationsRef.current.map((v, i) => (
                  <div key={i} style={{ fontSize: 11, ...mono, color: 'rgba(239,68,68,0.75)', padding: '4px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    {v.label} — Q{v.q + 1}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No violations detected</div>
            )}
          </div>

          <button onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); onClose() }}
            style={{ padding: '13px 32px', borderRadius: 8, background: 'rgba(99,102,241,1)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14 }}>
            Close Interview
          </button>
        </div>
      </div>
    )
  }

  return null
}
