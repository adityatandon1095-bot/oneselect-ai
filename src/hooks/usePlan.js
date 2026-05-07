import { useAuth } from '../lib/AuthContext'
import { TRIAL_LIMITS } from '../config/trialLimits'

export function usePlan() {
  const { profile } = useAuth()

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
