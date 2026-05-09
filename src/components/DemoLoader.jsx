import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const DEMO_JOB_ID  = 'd1000000-0000-0000-0000-000000000001'
const DEMO_CAND_IDS = [
  'd1000000-0000-0000-0001-000000000001',
  'd1000000-0000-0000-0001-000000000002',
  'd1000000-0000-0000-0001-000000000003',
  'd1000000-0000-0000-0001-000000000004',
  'd1000000-0000-0000-0001-000000000005',
  'd1000000-0000-0000-0001-000000000006',
  'd1000000-0000-0000-0001-000000000007',
  'd1000000-0000-0000-0001-000000000008',
]

function makeCandidates() {
  const screened = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  return [
    // ── High scorers ──────────────────────────────────────────────────────────
    {
      id: DEMO_CAND_IDS[0],
      full_name: 'Arjun Mehta', email: 'arjun.mehta@demo.hiring', phone: '',
      candidate_role: 'Senior Product Manager', total_years: 7,
      skills: ['Product Strategy', 'Agile', 'User Research', 'Data Analysis', 'OKRs', 'Figma', 'SQL'],
      education: 'MBA, IIM Bangalore', source: 'manual',
      summary: 'Senior PM with 7 years in fintech. Led product at two Series B startups. Drove 40% ARR growth through roadmap prioritisation and cross-functional alignment.',
      match_score: 88, match_pass: true, match_rank: 'top10',
      match_reason: 'Exceptional match. 7 years as PM with direct fintech background. Product Strategy, Data Analysis, and OKR experience directly relevant. Strong evidence of measurable business impact.',
      stage: 'passed', screened_at: screened, stage_entered_at: screened,
    },
    {
      id: DEMO_CAND_IDS[1],
      full_name: 'Priya Nair', email: 'priya.nair@demo.hiring', phone: '',
      candidate_role: 'Head of Product', total_years: 9,
      skills: ['Product Vision', 'Team Leadership', 'Agile', 'Roadmapping', 'Customer Discovery', 'B2B SaaS'],
      education: 'BTech, IIT Delhi', source: 'manual',
      summary: 'Head of Product at FinFlow (Series C). Scaled product org from 2 to 12 PMs. Launched payments product used by 200k SMEs across APAC.',
      match_score: 84, match_pass: true, match_rank: 'strong',
      match_reason: 'Strong match. 9 years product leadership across fintech and B2B SaaS. Clear vision-setting track record. Slightly over-experienced but well-aligned on direction.',
      stage: 'interview', screened_at: screened, stage_entered_at: screened,
    },
    // ── Mid scorers ───────────────────────────────────────────────────────────
    {
      id: DEMO_CAND_IDS[2],
      full_name: 'Rahul Sharma', email: 'rahul.sharma@demo.hiring', phone: '',
      candidate_role: 'Product Manager', total_years: 5,
      skills: ['Agile', 'User Research', 'Product Strategy', 'SQL', 'JIRA', 'Stakeholder Management'],
      education: 'BTech, BITS Pilani', source: 'manual',
      summary: 'PM at PaySafe India for 5 years managing consumer payment products. Delivered 3 major launches on time.',
      match_score: 72, match_pass: true, match_rank: 'moderate',
      match_reason: 'Good match on most dimensions. 5 years PM experience with fintech exposure. Solid delivery track record but limited evidence of data analysis depth required for this role.',
      stage: 'screening', screened_at: screened, stage_entered_at: screened,
    },
    {
      id: DEMO_CAND_IDS[3],
      full_name: 'Kavya Reddy', email: 'kavya.reddy@demo.hiring', phone: '',
      candidate_role: 'Product Lead', total_years: 4,
      skills: ['Agile', 'Roadmapping', 'Customer Interviews', 'A/B Testing', 'Product Analytics'],
      education: 'BE Computer Science, RV College of Engineering', source: 'manual',
      summary: 'Product Lead at Swiggy Growth. Ran 200+ A/B experiments. Led growth PM team of 3.',
      match_score: 65, match_pass: true, match_rank: 'moderate',
      match_reason: 'Competent PM with strong experimentation instincts. 4 years experience but no fintech background. Would need onboarding on financial regulatory context.',
      stage: 'passed', screened_at: screened, stage_entered_at: screened,
    },
    {
      id: DEMO_CAND_IDS[4],
      full_name: 'Vikram Singh', email: 'vikram.singh@demo.hiring', phone: '',
      candidate_role: 'Associate Product Manager', total_years: 3,
      skills: ['Agile', 'User Stories', 'Figma', 'JIRA', 'Stakeholder Management'],
      education: 'BBA, Delhi University', source: 'manual',
      summary: 'Associate PM at Razorpay. 3 years on checkout and payment flows. Good execution track record.',
      match_score: 58, match_pass: true, match_rank: 'moderate',
      match_reason: 'Promising early-career PM. Strong process skills but 2 years short of the requirement. No deep data analysis experience. Consider if senior pipeline is thin.',
      stage: 'uploaded', screened_at: screened, stage_entered_at: screened,
    },
    // ── Low scorers ───────────────────────────────────────────────────────────
    {
      id: DEMO_CAND_IDS[5],
      full_name: 'Anjali Gupta', email: 'anjali.gupta@demo.hiring', phone: '',
      candidate_role: 'Business Analyst', total_years: 4,
      skills: ['SQL', 'Excel', 'Requirements Gathering', 'Process Mapping', 'Stakeholder Interviews'],
      education: 'BCom, Mumbai University', source: 'manual',
      summary: 'Business Analyst at HDFC Bank. 4 years requirements and process work. Strong SQL and data skills but no product ownership experience.',
      match_score: 37, match_pass: false, match_rank: 'weak',
      match_reason: 'Business analyst background, not product management. No evidence of roadmap ownership, product vision, or Agile delivery. Wrong career track for this role.',
      stage: 'uploaded', screened_at: screened, stage_entered_at: screened,
    },
    {
      id: DEMO_CAND_IDS[6],
      full_name: 'Deepak Kumar', email: 'deepak.kumar@demo.hiring', phone: '',
      candidate_role: 'Marketing Manager', total_years: 6,
      skills: ['Digital Marketing', 'Campaign Management', 'Brand Strategy', 'SEO', 'Google Analytics'],
      education: 'PGDM Marketing, IMT Ghaziabad', source: 'manual',
      summary: 'Marketing Manager at Myntra. 6 years performance marketing and brand strategy. No product management background.',
      match_score: 31, match_pass: false, match_rank: 'weak',
      match_reason: 'Marketing background with no product management experience. Skills are not transferable to this senior PM role. Does not meet any core requirements.',
      stage: 'rejected', screened_at: screened, stage_entered_at: screened,
    },
    {
      id: DEMO_CAND_IDS[7],
      full_name: 'Meera Joshi', email: 'meera.joshi@demo.hiring', phone: '',
      candidate_role: 'Operations Manager', total_years: 5,
      skills: ['Operations', 'Process Improvement', 'Team Management', 'Vendor Management', 'Excel'],
      education: 'BBA Operations, Symbiosis Pune', source: 'manual',
      summary: 'Operations Manager at Zomato. 5 years ops and vendor management. No product or technology background.',
      match_score: 24, match_pass: false, match_rank: 'weak',
      match_reason: 'Operations profile with no product management or fintech experience. Mismatch on every primary requirement. Recommend rejection at screening.',
      stage: 'rejected', screened_at: screened, stage_entered_at: screened,
    },
  ]
}

export default function DemoLoader() {
  const { user } = useAuth()
  const [status, setStatus]   = useState('idle') // idle | loading | done | clearing | error
  const [msg, setMsg]         = useState('')
  const [hasDemo, setHasDemo] = useState(null)   // null = unchecked

  async function checkDemo() {
    const { data } = await supabase.from('jobs').select('id').eq('id', DEMO_JOB_ID).maybeSingle()
    setHasDemo(!!data)
    return !!data
  }

  async function loadDemo() {
    setStatus('loading')
    setMsg('')
    try {
      const now = new Date().toISOString()

      const { error: jobErr } = await supabase.from('jobs').upsert({
        id: DEMO_JOB_ID,
        recruiter_id: user.id,
        title: 'Senior Product Manager — FinTech',
        description: 'We are looking for an experienced Senior PM to own our core FinTech product suite. You will define the roadmap, work closely with engineering and design, and drive adoption across 50,000+ SME customers. Requires strong analytical skills, fintech domain experience, and the ability to influence cross-functional stakeholders at all levels.',
        experience_years: 5,
        required_skills: ['Product Strategy', 'Agile', 'User Research', 'Data Analysis', 'Stakeholder Management'],
        preferred_skills: ['Fintech', 'SQL', 'Figma', 'A/B Testing', 'OKRs'],
        status: 'active',
        tech_weight: 40,
        comm_weight: 60,
        created_at: now,
        updated_at: now,
      }, { onConflict: 'id' })

      if (jobErr) throw new Error(`Job: ${jobErr.message}`)

      const { error: candErr } = await supabase.from('candidates').upsert(
        makeCandidates().map(c => ({ ...c, job_id: DEMO_JOB_ID })),
        { onConflict: 'id' }
      )
      if (candErr) throw new Error(`Candidates: ${candErr.message}`)

      setHasDemo(true)
      setStatus('done')
      setMsg('Demo data loaded. Go to Pipeline → select this client → pick "Senior Product Manager — FinTech" to see the board.')
    } catch (err) {
      setStatus('error')
      setMsg(err.message)
    }
  }

  async function clearDemo() {
    setStatus('clearing')
    setMsg('')
    try {
      await supabase.from('candidates').delete().in('id', DEMO_CAND_IDS)
      await supabase.from('jobs').delete().eq('id', DEMO_JOB_ID)
      setHasDemo(false)
      setStatus('idle')
      setMsg('Demo data cleared.')
    } catch (err) {
      setStatus('error')
      setMsg(err.message)
    }
  }

  if (hasDemo === null) {
    checkDemo()
  }

  const busy = status === 'loading' || status === 'clearing'

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
            Demo Dataset — Senior PM / FinTech
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Seeds 1 job and 8 candidates at varied stages and scores (2 high 80+, 3 mid 58–72, 3 low &lt;40).
            Use this before a demo to show a realistic pipeline board with screened candidates.
          </div>
          {hasDemo && (
            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: 'rgba(34,197,94,0.08)', border: '1px solid var(--green)', borderRadius: 'var(--r)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
              ● Demo data loaded
            </div>
          )}
          {msg && (
            <div style={{ marginTop: 8, fontSize: 12, color: status === 'error' ? 'var(--red)' : 'var(--text-2)', lineHeight: 1.5 }}>
              {msg}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingTop: 2 }}>
          {!hasDemo ? (
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '5px 14px' }}
              disabled={busy || hasDemo === null}
              onClick={loadDemo}
            >
              {status === 'loading'
                ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Loading…</>
                : 'Load Demo Data'}
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '5px 14px', color: 'var(--red)' }}
              disabled={busy}
              onClick={clearDemo}
            >
              {status === 'clearing'
                ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Clearing…</>
                : 'Clear Demo Data'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
