import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? current + ' ' + word : word
    if (test.length > maxChars) {
      if (current) lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

async function buildPdf(letterText: string, candidateName: string, jobTitle: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const { width, height } = page.getSize()

  const fontReg  = await doc.embedFont(StandardFonts.TimesRoman)
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const gold = rgb(0.722, 0.573, 0.29)
  const dark = rgb(0.176, 0.216, 0.282)
  const grey = rgb(0.42, 0.447, 0.502)

  let y = height - 60

  // Header
  page.drawText('ONE SELECT', { x: 56, y, size: 22, font: fontBold, color: gold })
  y -= 18
  page.drawText('STRATEGIC TALENT SOLUTIONS', { x: 56, y, size: 9, font: fontReg, color: grey })
  y -= 24
  page.drawLine({ start: { x: 56, y }, end: { x: width - 56, y }, thickness: 0.5, color: gold })
  y -= 32

  // Title
  const title = `OFFER LETTER — ${jobTitle.toUpperCase()}`
  page.drawText(title, { x: 56, y, size: 13, font: fontBold, color: dark })
  y -= 10
  page.drawText(`Prepared for: ${candidateName}`, { x: 56, y, size: 10, font: fontReg, color: grey })
  y -= 28

  // Body text
  const paragraphs = letterText.split('\n').filter(p => p.trim())
  for (const para of paragraphs) {
    const lines = wrapText(para.trim(), 82)
    for (const line of lines) {
      if (y < 80) {
        const newPage = doc.addPage([595, 842])
        y = newPage.getSize().height - 60
      }
      page.drawText(line, { x: 56, y, size: 11, font: fontReg, color: dark, lineHeight: 16 })
      y -= 16
    }
    y -= 10
  }

  // Footer
  y = 50
  page.drawLine({ start: { x: 56, y }, end: { x: width - 56, y }, thickness: 0.5, color: gold })
  y -= 14
  page.drawText('One Select · Strategic Talent Solutions · noreply@oneselect.ai', {
    x: 56, y, size: 8, font: fontReg, color: grey,
  })

  return doc.save()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { candidate_email, candidate_name, job_title, letter_content } = await req.json()
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''

    const pdfBytes = await buildPdf(letter_content, candidate_name, job_title)
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes))

    const paragraphs = (letter_content as string)
      .split('\n')
      .filter(p => p.trim())
      .map(p => `<p style="color:#6B7280;line-height:1.9;font-size:15px;margin:0 0 18px;">${p.trim()}</p>`)
      .join('')

    const html = `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
        <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
          <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
          <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Offer Letter</p>
        </div>
        <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
          <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:18px;margin:0 0 8px;">Offer Letter — ${job_title}</h2>
          <p style="color:#9CA3AF;font-size:11px;font-family:monospace;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 28px;padding-bottom:20px;border-bottom:1px solid #E8E4DC;">Prepared for ${candidate_name}</p>
          ${paragraphs}
          <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:24px;border-top:1px solid #E8E4DC;">
            A PDF copy of this letter is attached to this email for your records.
          </p>
        </div>
        <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
      </div>
    `

    const { ok: emailSent } = await sendEmail(resendKey, {
      from: 'One Select <noreply@oneselect.ai>',
      to: [candidate_email],
      subject: `Offer Letter — ${job_title}`,
      html,
      attachments: [{ filename: `offer-letter-${job_title.toLowerCase().replace(/\s+/g, '-')}.pdf`, content: pdfBase64 }],
    }, 'send-offer-letter', candidate_email)
    return new Response(JSON.stringify({ success: emailSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-offer-letter error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
