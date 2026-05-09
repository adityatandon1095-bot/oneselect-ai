import { FROM_EMAIL } from "../_shared/email.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const APP_URL = 'https://oneselect-ai-t6uo-phi.vercel.app'

async function sendEmail(resendKey: string, payload: Record<string, unknown>, fnName: string, recipient: string) {
  const call = () => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
    body: JSON.stringify(payload),
  })
  try {
    const res = await call()
    if (res.ok) return { ok: true, data: await res.json() }
    await new Promise(r => setTimeout(r, 1000))
    const retry = await call()
    if (retry.ok) return { ok: true, data: await retry.json() }
    console.error(`[${fnName}] email failed after retry for ${recipient}`)
    return { ok: false, data: await retry.json().catch(() => null) }
  } catch {
    await new Promise(r => setTimeout(r, 1000))
    try {
      const retry = await call()
      if (retry.ok) return { ok: true, data: await retry.json() }
      console.error(`[${fnName}] email retry threw for ${recipient}`)
      return { ok: false, data: null }
    } catch (e) {
      console.error(`[${fnName}] email both attempts threw for ${recipient}:`, e)
      return { ok: false, data: null }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const apikey = req.headers.get('apikey') ||
    req.headers.get('Authorization')?.replace('Bearer ', '')

  if (!apikey) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { email, company_name, contact_name, role = 'client', stakeholder_of = null } = await req.json()

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''

    const admin = createClient(supabaseUrl, serviceKey)

    // Internal random password — never sent to the user; they authenticate via magic link.
    const internalPassword = crypto.randomUUID() + crypto.randomUUID()

    // Try to create the auth user.
    // role is embedded in user_metadata so Login.jsx can self-correct the profile
    // even if a future DB write fails or the profile has a stale role.
    let userId: string
    let isReInvite = false
    const { data: userData, error: createError } = await admin.auth.admin.createUser({
      email,
      password: internalPassword,
      email_confirm: true,
      user_metadata: { company_name, contact_name, role },
    })

    if (createError) {
      // If user already exists in auth (re-invite), find them and update their profile
      const isAlreadyExists =
        createError.message.toLowerCase().includes('already been registered') ||
        createError.message.toLowerCase().includes('already exists') ||
        createError.message.toLowerCase().includes('user already registered')

      if (!isAlreadyExists) {
        throw new Error('Create user failed: ' + createError.message)
      }

      // Find the existing auth user by email
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const existing = list?.users?.find((u: { email?: string }) =>
        u.email?.toLowerCase() === email.toLowerCase()
      )
      if (!existing) throw new Error('User already exists but could not be found: ' + createError.message)

      await admin.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
        user_metadata: { company_name, contact_name, role },
      })

      // Upsert their profile (re-activates them with fresh first_login flag)
      const { error: upsertError } = await admin.from('profiles').upsert({
        id: existing.id,
        user_role: role,
        company_name,
        email,
        full_name: contact_name,
        first_login: true,
        ...(stakeholder_of ? { stakeholder_of } : {}),
      }, { onConflict: 'id' })

      if (upsertError) throw new Error('Profile upsert failed: ' + upsertError.message)
      userId = existing.id
      isReInvite = true

    } else {
      userId = userData.user.id

      const { error: profileError } = await admin.from('profiles').insert({
        id: userId,
        user_role: role,
        company_name,
        email,
        full_name: contact_name,
        first_login: true,
        ...(stakeholder_of ? { stakeholder_of } : {}),
      })

      if (profileError) throw new Error('Profile failed: ' + profileError.message)
    }

    // Generate a one-time magic link so the user never handles a plaintext password.
    // New users get an 'invite' link; re-invites get a 'magiclink'.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: isReInvite ? 'magiclink' : 'invite',
      email,
      options: { redirectTo: APP_URL + '/login' },
    })
    if (linkError) throw new Error('Failed to generate invite link: ' + linkError.message)
    const magicLink = linkData.properties?.action_link ?? `${APP_URL}/login`

    // ── Email body differs by role ──────────────────────────────────────────
    const isRecruiter = role === 'recruiter'
    const subject = isRecruiter
      ? 'Welcome to One Select — Recruiter Access'
      : 'Welcome to One Select — Your Portal is Ready'

    const portalLabel = isRecruiter ? 'Recruiter Portal' : 'Client Portal'
    const bodyIntro = isRecruiter
      ? `You've been added as a recruiter on One Select. Click the button below to access your portal — no password needed.`
      : `Your AI-powered hiring portal has been set up for <strong style="color:#2D3748;">${company_name}</strong>. Click the button below to log in and get started.`

    const emailHtml = `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
        <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
          <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
          <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Strategic Talent Solutions</p>
        </div>
        <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
          <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:22px;margin:0 0 16px;">Welcome, ${contact_name}</h2>
          <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">${bodyIntro}</p>
          <div style="background:#F8F7F4;border:1px solid #E8E4DC;border-left:4px solid #B8924A;padding:16px 24px;margin:24px 0;">
            <p style="margin:0 0 8px;color:#6B7280;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-family:monospace;">Your account</p>
            <p style="margin:0;color:#2D3748;font-size:14px;">${email} &mdash; ${portalLabel}</p>
          </div>
          <div style="text-align:center;margin:32px 0;">
            <a href="${magicLink}" style="background:#B8924A;color:white;padding:14px 40px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;">ACCESS YOUR PORTAL →</a>
          </div>
          <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:24px;border-top:1px solid #E8E4DC;">
            This link is valid for 24 hours and can only be used once. After logging in, you can set a permanent password from your account settings.
          </p>
        </div>
        <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
      </div>
    `

    const { ok: emailSent } = await sendEmail(resendKey, { from: FROM_EMAIL, to: [email], subject, html: emailHtml }, 'invite-user', email)

    // Admin notification — only fires if ADMIN_NOTIFICATION_EMAIL is configured
    const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? ''
    if (adminEmail) {
      await sendEmail(resendKey, {
        from: FROM_EMAIL,
        to: [adminEmail],
        subject: `New ${role} invited — ${company_name || contact_name}`,
        html: `<p>You have successfully invited <strong>${contact_name}</strong> (${email}) as a <strong>${role}</strong>${company_name ? ` for ${company_name}` : ''}.</p>`,
      }, 'invite-user-admin', adminEmail)
    }

    return new Response(
      JSON.stringify({ success: true, userId, emailSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
