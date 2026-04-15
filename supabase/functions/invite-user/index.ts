import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, company_name, contact_name } = await req.json()

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''

    const admin = createClient(supabaseUrl, serviceKey)

    // Generate temp password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let tempPassword = 'OS-'
    for (let i = 0; i < 4; i++) tempPassword += chars[Math.floor(Math.random() * chars.length)]
    tempPassword += '-'
    for (let i = 0; i < 4; i++) tempPassword += chars[Math.floor(Math.random() * chars.length)]

    // Create user with admin API - no email confirmation needed
    const { data: userData, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { company_name, contact_name }
      })

    if (createError) throw new Error('Create user failed: ' + createError.message)

    const userId = userData.user.id

    // Insert profile
    const { error: profileError } = await admin
      .from('profiles')
      .insert({
        id: userId,
        user_role: 'recruiter',
        company_name,
        email,
        full_name: contact_name,
        first_login: true
      })

    if (profileError) throw new Error('Profile failed: ' + profileError.message)

    // Send welcome email via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + resendKey
      },
      body: JSON.stringify({
        from: 'One Select <noreply@oneselect.ai>',
        to: [email],
        subject: 'Welcome to One Select — Your Portal is Ready',
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
            <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
              <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
              <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Strategic Talent Solutions</p>
            </div>
            <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
              <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:22px;margin:0 0 16px;">Welcome, ${contact_name}</h2>
              <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">
                Your AI-powered hiring portal has been set up for <strong style="color:#2D3748;">${company_name}</strong>.
                Log in to define your open roles and our team will handle the rest.
              </p>
              <div style="background:#F8F7F4;border:1px solid #E8E4DC;border-left:4px solid #B8924A;padding:24px;margin:24px 0;">
                <p style="margin:0 0 16px;color:#6B7280;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-family:monospace;">Your Login Details</p>
                <table style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:8px 0;color:#6B7280;font-size:14px;width:120px;">Portal</td>
                    <td style="padding:8px 0;"><a href="https://oneselect-ai-t6uo-phi.vercel.app" style="color:#B8924A;">oneselect-ai-t6uo-phi.vercel.app</a></td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#6B7280;font-size:14px;">Email</td>
                    <td style="padding:8px 0;color:#2D3748;font-size:14px;">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#6B7280;font-size:14px;">Password</td>
                    <td style="padding:8px 0;">
                      <span style="font-family:monospace;font-size:22px;color:#B8924A;font-weight:bold;letter-spacing:0.15em;">${tempPassword}</span>
                    </td>
                  </tr>
                </table>
              </div>
              <div style="text-align:center;margin:32px 0;">
                <a href="https://oneselect-ai-t6uo-phi.vercel.app" style="background:#B8924A;color:white;padding:14px 40px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;">ACCESS YOUR PORTAL →</a>
              </div>
              <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:24px;border-top:1px solid #E8E4DC;">
                For security, you will be prompted to set a new password on your first login.
              </p>
            </div>
            <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
          </div>
        `
      })
    })

    const emailResult = await emailRes.json()
    console.log('Email result:', emailResult)

    // Send admin notification
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + resendKey
      },
      body: JSON.stringify({
        from: 'One Select <noreply@oneselect.ai>',
        to: ['aditya.tandon1095@gmail.com'],
        subject: 'New client invited — ' + company_name,
        html: '<p>You have successfully invited <strong>' + contact_name + '</strong> from <strong>' + company_name + '</strong> (' + email + ') to One Select.</p>'
      })
    })

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        emailSent: emailRes.ok,
        tempPassword
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
