import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { TRIAL_LIMITS } from '../config/trialLimits'

export function usePlan() {
  const { user, profile } = useAuth()

  const isTrial   = !profile?.plan_id || profile?.subscription_status === 'trial'
  const isExpired = isTrial && profile?.trial_ends_at && new Date(profile.trial_ends_at) < new Date()
  const isPaid    = profile?.subscription_status === 'active'

  function canAccess(feature) {
    if (isPaid) return true
    if (isExpired) return false
    return TRIAL_LIMITS[feature] === true
  }

  function trialDaysLeft() {
    if (!profile?.trial_ends_at) return null
    const ms = new Date(profile.trial_ends_at) - new Date()
    return Math.ceil(ms / 86400000)
  }

  return { isTrial, isExpired, isPaid, canAccess, trialDaysLeft }
}

// Separate hook for usage counts — call only where you need the banner.
// Queries existing tables; no new schema needed.
export function useTrialUsage() {
  const { user, profile } = useAuth()
  const [usage, setUsage] = useState({ screenings: 0, chatMsgs: 0, sourcingRuns: 0, loaded: false })

  const isTrial = !profile?.plan_id || profile?.subscription_status === 'trial'
  const isPaid  = profile?.subscription_status === 'active'

  const load = useCallback(async () => {
    if (!isTrial || isPaid || !user?.id) {
      setUsage(u => ({ ...u, loaded: true }))
      return
    }

    // Count screenings: candidates with screened_at, for jobs owned by this recruiter
    const [{ count: screenings }, { count: chatMsgs }, { count: sourcingRuns }] = await Promise.all([
      supabase
        .from('candidates')
        .select('id', { count: 'exact', head: true })
        .not('screened_at', 'is', null)
        .in('job_id',
          supabase.from('jobs').select('id').eq('recruiter_id', user.id)
        ),
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('linkedin_sourcing_log')
        .select('id', { count: 'exact', head: true })
        .eq('triggered_by', user.id),
    ])

    setUsage({
      screenings:   screenings  ?? 0,
      chatMsgs:     chatMsgs    ?? 0,
      sourcingRuns: sourcingRuns ?? 0,
      loaded: true,
    })
  }, [user?.id, isTrial, isPaid])

  useEffect(() => { load() }, [load])

  // Returns null (no banner) or { message, pct } when >= 80% of a cap
  function getNudge() {
    if (!isTrial || isPaid || !usage.loaded) return null
    const checks = [
      { used: usage.screenings,   cap: TRIAL_LIMITS.cap_ai_screenings,  label: `${usage.screenings} of ${TRIAL_LIMITS.cap_ai_screenings} AI screenings` },
      { used: usage.chatMsgs,     cap: TRIAL_LIMITS.cap_ai_chat_msgs,   label: `${usage.chatMsgs} of ${TRIAL_LIMITS.cap_ai_chat_msgs} AI chat messages` },
      { used: usage.sourcingRuns, cap: TRIAL_LIMITS.cap_sourcing_runs,  label: `${usage.sourcingRuns} of ${TRIAL_LIMITS.cap_sourcing_runs} sourcing runs` },
    ]
    // Find the highest-pct cap that's >= 80%
    let worst = null
    for (const c of checks) {
      if (c.cap <= 0) continue
      const pct = c.used / c.cap
      if (pct >= 0.8 && (!worst || pct > worst.pct)) {
        worst = { label: c.label, pct }
      }
    }
    return worst
  }

  return { usage, getNudge, reload: load }
}
