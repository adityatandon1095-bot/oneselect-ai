import { supabase } from '../lib/supabase'
import { callClaude } from './api'

const screeningSystem = (job) =>
  `You are an expert recruiter. Evaluate this candidate against the job.
The CV may be in any language. Translate internally before scoring. Always return your JSON response in English regardless of CV language.
Job: ${job.title} | ${job.experience_years}+ years | Required: ${(job.required_skills ?? []).join(', ')}
Description: ${job.description ?? ''}
Return ONLY valid JSON: {"matchScore":number,"pass":boolean,"reason":"string","rank":"top10|strong|moderate|weak"}`

// ── Module-level singleton — survives component unmounts ──────────────────────
let _running   = false
let _jobId     = null
let _jobTitle  = ''
let _progress  = { current: 0, total: 0 }
let _log       = []
let _results   = []
let _done      = false
let _passCount = 0
const _subs    = new Set()

function _snap() {
  return {
    running:   _running,
    jobId:     _jobId,
    jobTitle:  _jobTitle,
    progress:  { ..._progress },
    log:       [..._log],
    results:   [..._results],
    done:      _done,
    passCount: _passCount,
  }
}

function _notify() {
  const s = _snap()
  _subs.forEach(fn => fn(s))
}

export function subscribePoolMatch(fn) {
  _subs.add(fn)
  fn(_snap())
  return () => _subs.delete(fn)
}

export function isPoolMatchRunning() { return _running }

export async function startPoolMatch(jobId) {
  if (_running) return
  _running   = true
  _jobId     = jobId
  _jobTitle  = ''
  _progress  = { current: 0, total: 0 }
  _log       = [{ id: Date.now(), msg: 'Starting pool match…', type: 'info' }]
  _results   = []
  _done      = false
  _passCount = 0
  _notify()

  try {
    const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single()
    if (!job) throw new Error('Job not found')
    _jobTitle = job.title

    const { data: candidates, error } = await supabase
      .from('talent_pool').select('*').eq('availability', 'available')
    if (error) throw new Error(error.message)
    if (!candidates?.length) {
      _log = [..._log, { id: Date.now(), msg: 'No available candidates in talent pool.', type: 'info' }]
      _done = true
      _notify()
      return
    }

    _progress = { current: 0, total: candidates.length }
    _notify()

    const system = screeningSystem(job)

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]
      _progress = { current: i + 1, total: candidates.length }
      try {
        const msg = `Name: ${c.full_name}\nRole: ${c.candidate_role}\nYears: ${c.total_years}\nSkills: ${(c.skills ?? []).join(', ')}\nSummary: ${c.summary ?? ''}`
        const reply = await callClaude([{ role: 'user', content: msg }], system, 512)
        const clean = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```[\s]*$/m, '').trim()
        const s = JSON.parse(clean)
        await supabase.from('job_matches').upsert({
          talent_id:   c.id,
          job_id:      jobId,
          match_score: s.matchScore,
          match_pass:  s.pass,
          match_reason: s.reason,
          match_rank:  s.rank,
          status:      'matched',
        }, { onConflict: 'talent_id,job_id' })
        if (s.pass) _passCount++
        _log = [..._log, {
          id:   Date.now() + Math.random(),
          msg:  `✓ ${c.full_name}: ${s.matchScore}/100 → ${s.pass ? 'PASS' : 'FAIL'}`,
          type: s.pass ? 'ok' : '',
        }]
        _results = [..._results, {
          talent_id:      c.id,
          name:           c.full_name,
          email:          c.email,
          candidate_role: c.candidate_role,
          total_years:    c.total_years,
          skills:         c.skills,
          summary:        c.summary,
          highlights:     c.highlights,
          raw_text:       c.raw_text,
          score: s.matchScore, pass: s.pass, reason: s.reason, rank: s.rank,
        }]
      } catch (err) {
        _log = [..._log, { id: Date.now() + Math.random(), msg: `✗ ${c.full_name}: ${err.message}`, type: 'err' }]
      }
      _notify()
    }

    _log = [..._log, {
      id:   Date.now(),
      msg:  `Match complete — ${_passCount} candidate${_passCount !== 1 ? 's' : ''} passed.`,
      type: 'ok',
    }]
    _done = true
  } catch (err) {
    _log = [..._log, { id: Date.now(), msg: `✗ Match error: ${err.message}`, type: 'err' }]
  } finally {
    _running = false
    _notify()
  }
}
