import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — OffPitchOS',
  description: 'How OffPitchOS collects, stores, and protects your club data.',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-dark text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-green hover:underline text-sm">← Back</Link>

        <h1 className="text-4xl font-black uppercase tracking-tight mt-6 mb-2">Privacy Policy</h1>
        <p className="text-gray text-sm mb-10">Last updated: April 15, 2026</p>

        <div className="space-y-8 text-white/90 leading-relaxed">
          <section>
            <p className="text-lg">
              OffPitchOS is built for youth soccer clubs, which means a lot of the people in our system are minors and their families. We take that seriously. This policy explains exactly what we collect, why, where it lives, and what we will never do with it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">The short version</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>We <strong>will never sell</strong> your data or your players&rsquo; data. Not to advertisers, not to data brokers, not to anyone.</li>
              <li>We <strong>do not use</strong> club or player data to train AI models.</li>
              <li>We only collect what the app needs to do its job.</li>
              <li>You own your data. You can export or delete it at any time.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">What we collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account info:</strong> name, email, role (DOC, coach, parent, player), and password hash.</li>
              <li><strong>Club data:</strong> teams, rosters, schedules, attendance, feedback notes, gear sizes, camp registrations.</li>
              <li><strong>Communications:</strong> messages, announcements, and notification preferences.</li>
              <li><strong>Payment data:</strong> processed by Stripe. We never see or store card numbers — only a transaction ID and status.</li>
              <li><strong>Device data:</strong> IP address and browser type for security; push notification tokens when you opt in.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Where it lives</h2>
            <p>
              Data is stored on Supabase (Postgres) in US-based data centers. All connections are encrypted with TLS. Passwords are hashed with bcrypt. Database backups are encrypted at rest.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Who we share it with</h2>
            <p className="mb-3">Only these service providers, and only what they need to do their job:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Supabase</strong> — database hosting and authentication.</li>
              <li><strong>Vercel</strong> — web hosting.</li>
              <li><strong>Stripe</strong> — payment processing for camp registrations.</li>
              <li><strong>Resend</strong> — transactional email delivery.</li>
              <li><strong>Anthropic (Claude)</strong> — AI features (triage, voice commands, Ask). Anthropic does not retain or train on your data per their API terms.</li>
              <li><strong>Google OAuth</strong> — optional sign-in.</li>
            </ul>
            <p className="mt-3">
              We will disclose data to law enforcement only when legally required and will notify you unless prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Children&rsquo;s privacy (COPPA)</h2>
            <p>
              OffPitchOS is designed for use by clubs whose players may be under 13. We do not create accounts directly for children under 13. Player profiles are created and managed by verified parents, coaches, or club directors. We collect only the information the club needs to run operations — name, age group, attendance, gear size, and feedback notes. Parents can review, export, or request deletion of their child&rsquo;s data at any time by emailing us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Your rights</h2>
            <p className="mb-3">You can at any time:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Export your data in a readable format.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request full deletion of your account and associated data within 30 days.</li>
              <li>Opt out of non-essential notifications in Settings.</li>
            </ul>
            <p className="mt-3">
              If you are in the EU, UK, or California, you have additional rights under GDPR / CCPA — including the right to know, the right to delete, and the right to non-discrimination. Email us to exercise any of these rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Data retention</h2>
            <p>
              We keep data for as long as your account is active. When you delete your account, personal data is removed within 30 days, except where we are legally required to retain it (e.g., payment records for tax purposes).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Cookies</h2>
            <p>
              We use a single essential session cookie for authentication. No third-party advertising or tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Changes to this policy</h2>
            <p>
              If we make material changes, we will notify account admins by email at least 14 days before the changes take effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Contact</h2>
            <p>
              Questions, data requests, or concerns: <a href="mailto:privacy@offpitchos.com" className="text-green hover:underline">privacy@offpitchos.com</a>
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-gray/20 text-sm text-gray flex gap-6">
          <Link href="/terms" className="hover:text-white">Terms of Service</Link>
          <Link href="/login" className="hover:text-white">Sign in</Link>
        </div>
      </div>
    </main>
  )
}
