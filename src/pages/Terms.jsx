export default function Terms() {
  const S = { fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, color: 'var(--text)', marginBottom: 12 }
  const P = { marginBottom: 10 }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-body)', color: 'var(--text)', padding: '60px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 48 }}>
          <img src="/oneselect-logo.png" alt="One Select" style={{ width: 160, height: 'auto', objectFit: 'contain', marginBottom: 32, display: 'block' }} />
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 32, margin: '0 0 8px' }}>Terms of Service</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>Last updated: May 2026</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, fontSize: 15, lineHeight: 1.8, color: 'var(--text-2)' }}>

          <section>
            <h2 style={S}>1. About these terms</h2>
            <p style={P}>These Terms of Service ("Terms") govern your access to and use of the One Select platform ("Platform"), operated by One Select ("we", "us", or "our"). By creating an account or using the Platform, you agree to be bound by these Terms. If you do not agree, do not use the Platform.</p>
            <p style={P}>We may update these Terms from time to time. Continued use after any change constitutes acceptance of the revised Terms.</p>
          </section>

          <section>
            <h2 style={S}>2. Use of the platform</h2>
            <p style={P}>You may use the Platform only for lawful purposes and in accordance with these Terms. You agree not to:</p>
            <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Submit false, misleading, or fraudulent information about yourself or candidates.</li>
              <li>Attempt to circumvent any security, authentication, or access control mechanism.</li>
              <li>Use automated tools to scrape, copy, or extract data from the Platform without our written consent.</li>
              <li>Use the Platform to discriminate against candidates on the basis of any protected characteristic under applicable law.</li>
              <li>Share your login credentials with any other person or entity.</li>
            </ul>
            <p style={{ marginTop: 10 }}>We reserve the right to suspend or terminate accounts that violate these Terms without notice.</p>
          </section>

          <section>
            <h2 style={S}>3. Data handling and privacy</h2>
            <p style={P}>By using the Platform, you agree to our <a href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Privacy Policy</a>, which forms part of these Terms. Client companies ("Clients") are responsible for ensuring they have a lawful basis to process candidate personal data and that candidates have been informed of how their data will be used.</p>
            <p style={P}>Clients must not upload sensitive personal data (including caste, religion, disability, or biometric data) unless required for a legitimate, lawful hiring purpose and appropriate disclosures have been made to the candidate.</p>
            <p style={P}>Candidate CV data is retained for a maximum of 12 months after the last activity, after which it is automatically anonymised. Candidates may request deletion of their data at any time by contacting <a href="mailto:privacy@oneselect.co.uk" style={{ color: 'var(--accent)', textDecoration: 'none' }}>privacy@oneselect.co.uk</a>.</p>
          </section>

          <section>
            <h2 style={S}>4. AI-generated assessments</h2>
            <p style={P}>The Platform uses artificial intelligence to assist in screening CVs and evaluating interview responses. AI-generated scores, recommendations, and assessments are <strong>decision-support tools only</strong> — they are not legally binding hiring decisions.</p>
            <p style={P}>Clients remain solely responsible for all final employment decisions. We do not guarantee the accuracy, completeness, or fitness for purpose of any AI-generated output. Clients must not rely on AI assessments as the sole basis for a hiring or rejection decision, particularly in jurisdictions where automated decision-making carries specific legal obligations.</p>
            <p style={P}>Candidates have the right to request a human review of any AI-generated assessment that materially affects them. Such requests should be directed to the relevant Client or to us at <a href="mailto:privacy@oneselect.co.uk" style={{ color: 'var(--accent)', textDecoration: 'none' }}>privacy@oneselect.co.uk</a>.</p>
          </section>

          <section>
            <h2 style={S}>5. Subscriptions and cancellation</h2>
            <p style={P}>Access to certain features requires an active paid subscription. Subscription fees are charged in advance on a monthly basis and are non-refundable except where required by applicable law.</p>
            <p style={P}>You may cancel your subscription at any time by contacting your account manager or emailing <a href="mailto:billing@oneselect.co.uk" style={{ color: 'var(--accent)', textDecoration: 'none' }}>billing@oneselect.co.uk</a>. Cancellation takes effect at the end of the current billing period. Access to the Platform will continue until that date.</p>
            <p style={P}>We reserve the right to change pricing with 30 days' written notice. Continued use after a price change constitutes acceptance of the new pricing.</p>
          </section>

          <section>
            <h2 style={S}>6. Intellectual property</h2>
            <p style={P}>The Platform, including its design, code, branding, and AI models, is owned by One Select and protected by applicable intellectual property laws. Nothing in these Terms grants you any licence to our intellectual property except the limited right to use the Platform as described herein.</p>
            <p style={P}>You retain ownership of any data you upload to the Platform. By uploading data, you grant us a limited licence to process it solely for the purpose of providing the service.</p>
          </section>

          <section>
            <h2 style={S}>7. Limitation of liability</h2>
            <p style={P}>To the fullest extent permitted by law, One Select shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or in connection with your use of the Platform, including but not limited to loss of profits, data, or goodwill.</p>
            <p style={P}>Our total aggregate liability to you for any claim arising under these Terms shall not exceed the total fees paid by you to us in the 12 months preceding the claim.</p>
          </section>

          <section>
            <h2 style={S}>8. Governing law and disputes</h2>
            <p style={P}>These Terms are governed by and construed in accordance with the laws of <strong>England and Wales</strong>. Any dispute arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts of England and Wales.</p>
            <p style={P}>For clients based in India, we will endeavour to resolve disputes amicably. If a dispute cannot be resolved informally within 30 days, it shall be referred to arbitration in accordance with the Arbitration and Conciliation Act, 1996 (India), unless both parties agree otherwise in writing.</p>
          </section>

          <section>
            <h2 style={S}>9. Contact</h2>
            <p>For questions about these Terms, please contact us at <a href="mailto:legal@oneselect.co.uk" style={{ color: 'var(--accent)', textDecoration: 'none' }}>legal@oneselect.co.uk</a>.</p>
          </section>
        </div>

        <div style={{ marginTop: 60, paddingTop: 24, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 20 }}>
          <a href="/privacy" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Privacy Policy</a>
          <span>© 2026 One Select. All rights reserved.</span>
        </div>
      </div>
    </div>
  )
}
