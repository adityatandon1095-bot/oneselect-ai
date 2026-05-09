# Email Deliverability Setup

All transactional emails are sent from `noreply@oneselect.co.uk` via [Resend](https://resend.com).
Before going live, the following DNS records **must** be configured on `oneselect.co.uk`.
Without them, emails will land in spam or be silently rejected by major providers.

---

## Pre-launch DNS checklist

### 1. SPF record

**What it is:** SPF (Sender Policy Framework) declares which mail servers are authorised to send email on behalf of your domain. Receiving servers check this to detect forged "From" addresses.

**Why it matters:** Without SPF, any server can claim to send from `@oneselect.co.uk`. Gmail, Outlook, and Yahoo will flag or reject such messages.

**Record to add:**

| Type | Host | Value |
|------|------|-------|
| `TXT` | `@` (or `oneselect.co.uk`) | `v=spf1 include:amazonses.com ~all` |

> Resend uses Amazon SES infrastructure. The `include:amazonses.com` authorises their sending IPs. The `~all` means "soft fail" everything else (preferred over `-all` for now to avoid accidental blocks during transition).

---

### 2. DKIM record

**What it is:** DKIM (DomainKeys Identified Mail) adds a cryptographic signature to outgoing emails. The receiving server fetches your public key from DNS and verifies the signature — proving the email wasn't tampered with in transit and genuinely originated from an authorised sender.

**Why it matters:** DKIM is required for deliverability to major providers. Gmail in particular uses DKIM as a strong trust signal. Without it, emails are far more likely to be marked as spam.

**How to get the value:**

1. Log in to [resend.com/domains](https://resend.com/domains)
2. Add `oneselect.co.uk` as a sending domain (if not already added)
3. Resend will display the exact DKIM `TXT` record for your domain — copy the **name** and **value** from there

**Record to add (format — actual value comes from Resend dashboard):**

| Type | Host | Value |
|------|------|-------|
| `TXT` | `resend._domainkey` | `v=DKIM1; k=rsa; p=<your_public_key_from_resend>` |

---

### 3. DMARC policy

**What it is:** DMARC (Domain-based Message Authentication, Reporting & Conformance) tells receiving servers what to do when SPF or DKIM checks fail, and where to send aggregate reports so you can monitor deliverability issues.

**Why it matters:** Without DMARC, even with SPF and DKIM in place, phishing emails that spoof your domain can slip through. A DMARC policy also signals to email providers that you take email security seriously — improving your sender reputation over time.

**Recommended starting record (monitoring mode):**

| Type | Host | Value |
|------|------|-------|
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc-reports@oneselect.co.uk` |

> Start with `p=none` (monitoring only — no emails are rejected). After reviewing a few weeks of reports at `dmarc-reports@oneselect.co.uk`, tighten to `p=quarantine` and eventually `p=reject`.

---

## Verification

After adding all three records, wait up to 48 hours for DNS propagation, then:

1. In the Resend dashboard → **Domains** → verify the domain shows ✓ for SPF and DKIM.
2. Send a test email and check its headers (`Authentication-Results`) in Gmail to confirm `spf=pass`, `dkim=pass`, and `dmarc=pass`.
3. Use [mail-tester.com](https://www.mail-tester.com) for a full deliverability score — aim for 9/10 or higher before launch.

---

## Environment variables (edge functions)

All edge functions read `RESEND_API_KEY` from Supabase secrets. Set this in the Supabase dashboard:

```
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set APP_URL=https://oneselect.ai
```

The sending address (`noreply@oneselect.co.uk`) is hardcoded in each edge function. If the domain changes, update all `from:` fields and the DNS records above accordingly.
