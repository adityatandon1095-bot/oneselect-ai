// Trial = full product access with soft usage caps.
// Caps trigger a nudge banner at 80%, never a hard block.
export const TRIAL_LIMITS = {
  max_jobs:                       2,
  max_candidates_visible:         25,   // raised from 5
  can_run_ai_screening:           true,
  can_send_interview_invites:     true,
  can_view_interview_scores:      true,
  can_view_full_candidate_profile: true,
  can_download_reports:           false, // keep locked — low-value for trial
  can_use_ai_chat:                true,
  can_access_pipeline:            true,
  can_send_offer:                 true,
  can_access_hris_webhook:        false, // keep locked — enterprise feature

  // Soft usage caps (nudge at 80%, never hard-block)
  cap_ai_screenings:  15,
  cap_ai_chat_msgs:   20,
  cap_sourcing_runs:   2,
}
