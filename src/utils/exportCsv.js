function esc(v) {
  const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(esc).join(','),
    ...rows.map(r => headers.map(h => esc(r[h])).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function candidateRows(candidates, jobTitle = '') {
  return candidates.map(c => ({
    name:              c.full_name ?? '',
    email:             c.email ?? '',
    phone:             c.phone ?? '',
    role:              c.candidate_role ?? '',
    years_experience:  c.total_years ?? '',
    skills:            c.skills ?? [],
    match_score:       c.match_score ?? '',
    screening_passed:  c.match_pass == null ? '' : c.match_pass ? 'Yes' : 'No',
    screening_reason:  c.match_reason ?? '',
    overall_score:     c.scores?.overallScore ?? '',
    recommendation:    c.scores?.recommendation ?? '',
    technical:         c.scores?.dimensions?.technicalAbility ?? '',
    communication:     c.scores?.dimensions?.communication ?? '',
    role_fit:          c.scores?.dimensions?.roleFit ?? '',
    problem_solving:   c.scores?.dimensions?.problemSolving ?? '',
    experience_relevance: c.scores?.dimensions?.experienceRelevance ?? '',
    assessment_score:  c.assessment_score ?? '',
    final_decision:    c.final_decision ?? '',
    job_title:         jobTitle,
  }))
}
