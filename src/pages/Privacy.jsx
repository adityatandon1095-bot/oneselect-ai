export default function Privacy() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-body)', color: 'var(--text)', padding: '60px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 48 }}>
          <img src="/oneselect-logo.png" alt="One Select" style={{ width: 160, height: 'auto', objectFit: 'contain', marginBottom: 32, display: 'block' }} />
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 32, margin: '0 0 8px' }}>Privacy Policy</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>Last updated: May 2026</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, fontSize: 15, lineHeight: 1.8, color: 'var(--text-2)' }}>
          <section>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>Who we are</h2>
            <p>One Select is a recruitment technology platform operated from India. We help organisations find and evaluate candidates using AI-assisted tools. This policy explains how we collect, use, and protect personal data in compliance with the <strong>Digital Personal Data Protection Act, 2023 (DPDPA)</strong> and applicable international data protection laws.</p>
          </section>

          <section>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>Data we collect</h2>
            <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><strong>Candidates:</strong> Name, email, phone number, CV/resume content, employment history, skills, LinkedIn profile, and interview responses.</li>
              <li><strong>Client companies:</strong> Company name, contact details, billing information, and job specifications.</li>
              <li><strong>Usage data:</strong> Login timestamps and feature usage, collected for platform security and improvement.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>How we use your data</h2>
            <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Matching candidates to relevant job roles using AI-assisted screening.</li>
              <li>Conducting automated and live video interviews.</li>
              <li>Generating anonymised compliance and bias audit reports for client companies.</li>
              <li>Sending transactional emails about your application status.</li>
            </ul>
            <p style={{ marginTop: 12 }}><strong>Lawful basis:</strong> Processing is based on your explicit consent (given at registration) and the legitimate interests of our client companies in evaluating candidates for open roles.</p>
          </section>

          <section>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>AI-assisted decisions</h2>
            <p>Our platform uses AI to score and rank candidates. These scores are <strong>never final</strong> — a human recruiter reviews all AI-generated assessments before any hiring decision is made. You may request an explanation of any AI-generated score by contacting us at the address below.</p>
          </section>

          <section>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>Data sharing</h2>
            <p>Your personal data is shared only with:</p>
            <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>The client company recruiting for the specific role you applied to.</li>
              <li>Our infrastructure providers: Supabase (database and authentication), Anthropic (AI processing), and Resend (email delivery).</li>
            </ul>
            <p style={{ marginTop: 12 }}>We do not sell your data. We do not share it for advertising purposes.</p>
          </section>

          <section>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>Your rights</h2>
            <p>Under the DPDPA and applicable law, you have the right to:</p>
            <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><strong>Access</strong> the personal data we hold about you.</li>
              <li><strong>Correct</strong> inaccurate data via your candidate profile.</li>
              <li><strong>Delete</strong> your data — we will remove your profile and CV from our systems within 30 days of a verified request.</li>
              <li><strong>Withdraw consent</strong> at any time, which will result in removal from the talent pool.</li>
              <li><strong>Grievance redressal</strong> as provided under the DPDPA.</li>
            </ul>
            <p style={{ marginTop: 12 }}>To exercise any of these rights, email <a href="mailto:privacy@oneselect.ai" style={{ color: 'var(--accent)' }}>privacy@oneselect.ai</a>.</p>
          </section>

          <section>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>Data retention</h2>
            <p>Candidate profiles are retained for up to 24 months of inactivity, after which they are permanently deleted unless you request earlier deletion. Client data is retained for the duration of the engagement plus 12 months.</p>
          </section>

          <section>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>Security</h2>
            <p>All data is encrypted in transit (TLS) and at rest. Access is controlled by role-based permissions. We conduct regular security reviews of our platform.</p>
          </section>

          <section>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>Contact</h2>
            <p>For privacy questions, data requests, or complaints:</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginTop: 8 }}>
              One Select<br />
              <a href="mailto:privacy@oneselect.ai" style={{ color: 'var(--accent)' }}>privacy@oneselect.ai</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
