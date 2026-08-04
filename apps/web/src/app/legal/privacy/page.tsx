import type { Metadata } from 'next'
import Link from 'next/link'
import { PRIVACY_NOTICE_VERSION } from '@/lib/policies'
import {
  CHAT_MESSAGE_RETENTION_MONTHS,
  JOB_AUDIT_LOG_RETENTION_MONTHS,
} from '@/lib/retention'
import { DELETION_GRACE_DAYS } from '@/lib/account-deletion'

export const metadata: Metadata = {
  title: 'Privacy notice — BusinessOps',
}

/**
 * Written from what the code actually does, not from a template.
 *
 * The retention periods and the grace period are imported rather than typed out
 * so that changing the policy in code changes the page. A privacy notice that
 * drifts from the system it describes is a liability, not a protection.
 */
export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <Link href="/login" className="text-sm font-medium text-accent">
        ← Back to BusinessOps
      </Link>

      <h1 className="mt-6 mb-1 text-2xl font-semibold tracking-tight">Privacy notice</h1>
      <p className="mb-8 text-sm text-muted">Version {PRIVACY_NOTICE_VERSION}</p>

      <div className="flex flex-col gap-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-base font-semibold">Who we are</h2>
          <p>
            BusinessOps is built and operated by JOYTECH. This notice explains what we do with
            personal data when you use it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Who is responsible for what</h2>
          <p className="mb-2">
            When you sign up, we decide how your account details are handled, so we are the data
            controller for those.
          </p>
          <p>
            For everything you put into BusinessOps — your customers, jobs, quotes, invoices, and
            your staff&apos;s records — <strong>your business is the controller and we act on your
            instructions</strong> as a processor. If one of your staff or customers wants to know
            how their data is used, that question is properly yours to answer, and we will help you
            answer it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">What we hold</h2>
          <ul className="list-disc pl-5">
            <li>
              <strong>Your account</strong> — name, email address, job title, and your password in
              hashed form. We never see your actual password.
            </li>
            <li>
              <strong>Your business records</strong> — customers and their contact details and
              addresses, jobs, quotes, invoices, expenses, receipts and photos you upload.
            </li>
            <li>
              <strong>Staff records</strong> — pay rates, timesheets, and a log of who changed what
              on a job.
            </li>
            <li>
              <strong>Assistant conversations</strong> — what you type to the in-app assistant, and
              its replies.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Location, specifically</h2>
          <p>
            If your business turns on geofenced clock-in, your device sends its location at the
            moment a staff member clocks in or out. It is used once, on our server, to answer a
            single yes-or-no question — is this person within range of the job site — and is then
            discarded. <strong>We do not store staff location, and there is no location history to
            request, disclose or lose.</strong> Job site addresses are stored, because they are
            business information about a place rather than tracking of a person.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Where it is kept</h2>
          <p>
            All of it lives in the United Kingdom (London), and the servers that process it run
            there too.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Who else touches it</h2>
          <p className="mb-2">We use a small number of providers to run the service:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Supabase</strong> (United Kingdom) — the database, file storage and sign-in.
            </li>
            <li>
              <strong>Vercel</strong> (United Kingdom) — runs the application.
            </li>
            <li>
              <strong>Resend</strong> (United States) — sends email: quotes and invoices you send,
              team invitations, and sign-in emails.
            </li>
            <li>
              <strong>Anthropic</strong> (United States) — powers the in-app assistant. What you ask
              it, and the job or customer details it needs to answer, are sent to Anthropic. If you
              would rather that did not happen, do not use the assistant; nothing else in
              BusinessOps sends data there.
            </li>
            <li>
              <strong>Google Maps</strong> (United States) — address search and turning a job
              address into map coordinates. Requests are made by our servers, so Google does not
              receive your IP address or set cookies on you.
            </li>
          </ul>
          <p className="mt-2">
            We do not use analytics, advertising, tracking pixels or session recording anywhere in
            BusinessOps.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">How long we keep it</h2>
          <ul className="list-disc pl-5">
            <li>Assistant conversations: {CHAT_MESSAGE_RETENTION_MONTHS} months.</li>
            <li>The log of changes to a job: {JOB_AUDIT_LOG_RETENTION_MONTHS} months.</li>
            <li>
              Quotes, invoices, expenses, timesheets and payroll records: kept for as long as your
              account is open. These are financial and employment records, and tax and employment
              law in New Zealand, Australia and the UK requires businesses to keep them for several
              years — so we do not delete them on a timer.
            </li>
            <li>Everything else: kept until you close your account.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Your rights</h2>
          <p className="mb-2">
            You can ask for a copy of your data, ask us to correct it, or ask us to delete it. Two
            of those you can do yourself, immediately, without asking anyone:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Download everything</strong> — Settings → Your data gives you the whole
              account as a single file.
            </li>
            <li>
              <strong>Close your account</strong> — Settings → Close this account. Access ends
              straight away and everything is permanently erased {DELETION_GRACE_DAYS} days later.
              The delay is deliberate, so that a mistake can be undone; you can cancel at any point
              during it, and you can still download your data throughout.
            </li>
          </ul>
          <p className="mt-2">
            If you are a staff member on someone else&apos;s account, these controls belong to the
            business that invited you — speak to them first, and contact us if that does not resolve
            it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Contact</h2>
          <p>
            Email <a className="font-medium text-accent" href="mailto:hello@joytech.nz">hello@joytech.nz</a>{' '}
            with any question about this notice or your data. In the UK you also have the right to
            complain to the Information Commissioner&apos;s Office; in New Zealand, to the Office of
            the Privacy Commissioner; in Australia, to the OAIC.
          </p>
        </section>
      </div>
    </div>
  )
}
