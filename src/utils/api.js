import { supabase } from '../lib/supabase'

// All Claude calls are proxied through a Supabase edge function so the API
// key is never exposed in the browser bundle.
export async function callClaude(messages, systemPrompt, maxTokens = 1000) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/call-claude`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ messages, systemPrompt, maxTokens }),
    }
  )

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `API error ${res.status}`)
  return data.text
}

export async function runAutomatedInterview(candidate, jobDef) {
  const systemPrompt = `You are simulating a job interview.
You will play both the interviewer and the candidate.
The candidate's background: ${candidate.summary}
Their experience: ${(candidate.highlights ?? []).join(', ')}
Their skills: ${(candidate.skills ?? []).join(', ')}

Generate a realistic 5-question interview where:
- You ask a question as the interviewer
- You answer it as the candidate would based on their CV
- Make answers specific to their actual experience

Return ONLY valid JSON:
{
  "transcript": [
    {"role": "interviewer", "content": "question text"},
    {"role": "candidate", "content": "answer based on their CV"}
  ],
  "scores": {
    "technicalAbility": 0,
    "communication": 0,
    "roleFit": 0,
    "problemSolving": 0,
    "experienceRelevance": 0,
    "overallScore": 0,
    "recommendation": "Strong Hire|Hire|Borderline|Reject",
    "confidence": "High|Medium|Low",
    "insight": "3-4 sentence narrative",
    "strengths": ["strength 1", "strength 2"],
    "flags": [],
    "bestAnswer": "quote the strongest simulated answer"
  }
}`

  const result = await callClaude([{
    role: 'user',
    content: `Job: ${jobDef.title}, ${jobDef.experience_years}+ years.
Required: ${(jobDef.required_skills ?? []).join(', ')}.
Candidate: ${candidate.full_name}, ${candidate.candidate_role}.
CV Summary: ${candidate.summary}
Highlights: ${(candidate.highlights ?? []).join('; ')}
Skills: ${(candidate.skills ?? []).join(', ')}`
  }], systemPrompt, 3000)

  const parsed = JSON.parse(result.replace(/```json|```/g, '').trim())
  return parsed
}
