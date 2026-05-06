import { supabase } from '../lib/supabase'
import { callClaude } from './api'

const screeningSystem = (job) =>
  `You are an expert recruiter. Evaluate this candidate against the job.
Job: ${job.title} | ${job.experience_years}+ years | Required: ${(job.required_skills ?? []).join(', ')}
Description: ${job.description ?? ''}
Return ONLY valid JSON: {"matchScore":number,"pass":boolean,"reason":"string","rank":"top10|strong|moderate|weak"}`

// Fetches all 'available' candidates from talent_pool, scores them against a job,
// and upserts results into job_matches. Returns the number of candidates that passed.
export async function triggerTalentPoolMatch(jobId, { onProgress, onLog, onResult } = {}) {
  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single()
  if (!job) throw new Error('Job not found')

  const { data: candidates, error } = await supabase
    .from('talent_pool')
    .select('*')
    .eq('availability', 'available')
  if (error) throw new Error(error.message)
  if (!candidates?.length) return 0

  const system = screeningSystem(job)
  let passCount = 0

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (onProgress) onProgress(i + 1, candidates.length)
    try {
      const msg = `Name: ${c.full_name}\nRole: ${c.candidate_role}\nYears: ${c.total_years}\nSkills: ${(c.skills ?? []).join(', ')}\nSummary: ${c.summary ?? ''}`
      const reply = await callClaude([{ role: 'user', content: msg }], system, 512)
      console.log(`[talentPool] raw reply for ${c.full_name}:`, JSON.stringify(reply))
      const clean = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```[\s]*$/m, '').trim()
      const s = JSON.parse(clean)
      await supabase.from('job_matches').upsert({
        talent_id: c.id,
        job_id: jobId,
        match_score: s.matchScore,
        match_pass: s.pass,
        match_reason: s.reason,
        match_rank: s.rank,
        status: 'matched',
      }, { onConflict: 'talent_id,job_id' })
      if (s.pass) passCount++
      if (onLog) onLog(`✓ ${c.full_name}: ${s.matchScore}/100 → ${s.pass ? 'PASS' : 'FAIL'}`, s.pass ? 'ok' : '')
      if (onResult) onResult({
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
      })
    } catch (err) {
      if (onLog) onLog(`✗ ${c.full_name}: ${err.message}`, 'err')
    }
  }
  return passCount
}

// Maps a job_matches row (with talent_pool joined) to the shape
// that AdminPipeline and RecruiterCandidates expect.
export function mapMatchToCandidate(m) {
  return {
    id: m.id,
    _fromPool: true,
    _matchId: m.id,
    job_id: m.job_id,
    full_name: m.talent_pool?.full_name ?? '',
    email: m.talent_pool?.email ?? '',
    candidate_role: m.talent_pool?.candidate_role ?? '',
    total_years: m.talent_pool?.total_years ?? 0,
    skills: m.talent_pool?.skills ?? [],
    summary: m.talent_pool?.summary ?? '',
    highlights: m.talent_pool?.highlights ?? [],
    availability: m.talent_pool?.availability ?? 'available',
    match_score: m.match_score,
    match_pass: m.match_pass,
    match_reason: m.match_reason,
    match_rank: m.match_rank,
    interview_transcript: m.interview_transcript,
    scores: m.scores,
    video_urls: m.video_urls,
    integrity_score: m.integrity_score,
    interview_invite_token: m.interview_invite_token,
    live_interview_token: m.live_interview_token,
    live_room_url: m.live_room_url,
    live_interview_status: m.live_interview_status,
    live_interview_notes: m.live_interview_notes,
    final_decision: m.final_decision,
    decision_notes: m.decision_notes,
    offer_status: m.offer_status,
    _status: m.match_score != null ? 'screened' : 'parsed',
  }
}
