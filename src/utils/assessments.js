export async function generateAssessment(jobTitle, skills, callClaudeFn) {
  const system = `You are an expert technical interviewer. Generate a role-specific written assessment.
Return ONLY valid JSON — no markdown:
{"questions":[{"id":"q1","type":"written|coding|scenario","question":"...","context":"optional","wordLimit":300}]}`

  const prompt = `Generate 3-5 assessment questions for a ${jobTitle} position.
Skills required: ${(skills ?? []).join(', ')}.
Rules:
- For engineering roles: include a coding problem with sample input/output, a system design question
- For product roles: include a product brief (300 words), a prioritisation exercise
- For sales roles: include a cold email writing task, an objection handling scenario
- For all roles: include one behavioural question about a past experience
Return a realistic assessment suitable for this specific role.`

  try {
    const raw = await callClaudeFn([{ role: 'user', content: prompt }], system, 1500)
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    if (!parsed.questions?.length) throw new Error('No questions')
    return parsed
  } catch {
    return {
      questions: [
        { id: 'q1', type: 'written', question: `Describe a challenging project you worked on as a ${jobTitle}. What was your approach and what was the outcome?`, context: '', wordLimit: 300 },
        { id: 'q2', type: 'scenario', question: 'Tell me about a time you had to work under a tight deadline. How did you prioritise and what did you learn?', context: '', wordLimit: 250 },
        { id: 'q3', type: 'written', question: `What do you consider your strongest skill relevant to a ${jobTitle} role and how have you applied it?`, context: '', wordLimit: 200 },
      ],
    }
  }
}

export async function scoreAssessment(questions, answers, jobTitle, callClaudeFn) {
  const system = `You are evaluating candidate assessment answers. Score each answer 0-100 for quality, relevance, and depth.
Return ONLY valid JSON — no markdown:
{"scores":[{"id":"q1","score":75,"feedback":"brief feedback"}],"overallScore":72,"summary":"2-3 sentence overall narrative"}`

  const answersText = questions.map(q => {
    const answer = answers[q.id] ?? '(no answer provided)'
    return `Q: ${q.question}\nA: ${answer}`
  }).join('\n\n')

  const prompt = `Job role: ${jobTitle}
Evaluate these assessment answers and score each 0-100:

${answersText}

Be fair but rigorous. Consider the seniority expected for this role.`

  try {
    const raw = await callClaudeFn([{ role: 'user', content: prompt }], system, 1000)
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    return parsed
  } catch {
    return null
  }
}
