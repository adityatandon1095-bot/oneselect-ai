import { supabaseAdmin } from '../lib/supabaseAdmin'
import { callClaude } from './api'

const screeningSystem = (job) =>
  `You are an expert recruiter. Evaluate this candidate against the job.
Job: ${job.title} | ${job.years_experience}+ years | Required: ${(job.required_skills ?? []).join(', ')}
Description: ${job.description ?? ''}
Return ONLY valid JSON: {"matchScore":number,"pass":boolean,"reason":"string","rank":"top10|strong|moderate|weak"}`

// Fetches all 'available' candidates from talent_pool, scores them against a job,
// and upserts results into job_matches. Returns the number of candidates that passed.
export async function triggerTalentPoolMatch(jobId, { onProgress, onLog } = {}) {
  const { data: job } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single()
  if (!job) throw new Error('Job not found')

  const { data: candidates, error } = await supabaseAdmin
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
      const s = JSON.parse(reply.trim())
      await supabaseAdmin.from('job_matches').upsert({
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
    interview_scores: m.scores,
    _status: m.match_score != null ? 'screened' : 'parsed',
  }
}
