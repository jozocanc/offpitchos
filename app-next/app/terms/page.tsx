import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — OffPitchOS',
  description: 'The rules for using OffPitchOS.',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-dark text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-green hover:underline text-sm">← Back</Link>

        <h1 className="text-4xl font-black uppercase tracking-tight mt-6 mb-2">Terms of Service</h1>
        <p className="text-gray text-sm mb-10">Last updated: April 15, 2026</p>

        <div className="space-y-8 text-white/90 leading-relaxed">
          <section>
            <p className="text-lg">
              By creating an account or using OffPitchOS, you agree to these terms. Read them — they are short and written in plain English.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Who can use OffPitchOS</h2>
            <p>
              You must be at least 18 years old to create an account. Accounts for minors must be created and managed by a parent, coach, or club director. You are responsible for keeping your login credentials secure and for everything that happens under your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Your content</h2>
            <p>
              You own everything you upload — rosters, messages, photos, feedback, and club data. By uploading it, you grant us a limited license to store, display, and transmit that content solely to operate OffPitchOS on your behalf. We will never use your content for advertising or to train AI models.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Acceptable use</h2>
            <p className="mb-3">Don&rsquo;t use OffPitchOS to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Harass, bully, threaten, or harm anyone — especially minors.</li>
              <li>Upload content that is illegal, defamatory, sexually explicit, or violates another person&rsquo;s privacy.</li>
              <li>Attempt to break, reverse-engineer, or probe the security of the platform.</li>
              <li>Scrape, resell, or use our data for any purpose other than running your club.</li>
              <li>Impersonate another person or club.</li>
            </ul>
            <p className="mt-3">
              We can suspend or terminate accounts that violate these rules. Egregious violations (especially involving minors) will be reported to the appropriate authorities.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Payments</h2>
            <p>
              Camp registration payments are processed by Stripe. OffPitchOS charges a small platform fee per transaction, disclosed at checkout. Refunds for camp registrations are governed by each club&rsquo;s refund policy — contact your club director. Subscription fees (when applicable) are billed in advance and non-refundable except where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Availability and changes</h2>
            <p>
              We try hard to keep OffPitchOS running, but we do not guarantee uninterrupted service. We may add, change, or remove features. We will give reasonable notice before removing anything you depend on.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Termination</h2>
            <p>
              You can delete your account at any time from Settings. We can terminate your account for violations of these terms or prolonged inactivity. On termination, your data is deleted within 30 days per our <Link href="/privacy" className="text-green hover:underline">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Disclaimers</h2>
            <p>
              OffPitchOS is provided &ldquo;as is&rdquo; without warranties of any kind. We are not liable for indirect or consequential damages. Our total liability for any claim related to the service is capped at the amount you paid us in the prior 12 months (or $100 if the service was free).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Governing law</h2>
            <p>
              These terms are governed by the laws of the State of Florida, United States. Disputes will be resolved in the state or federal courts located in Hillsborough County, Florida.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Changes</h2>
            <p>
              If we change these terms in a material way, we will email account admins at least 14 days before the changes take effect. Continued use after that date means you accept the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Contact</h2>
            <p>
              Questions about these terms: <a href="mailto:legal@offpitchos.com" className="text-green hover:underline">legal@offpitchos.com</a>
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-gray/20 text-sm text-gray flex gap-6">
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/login" className="hover:text-white">Sign in</Link>
        </div>
      </div>
    </main>
  )
}
