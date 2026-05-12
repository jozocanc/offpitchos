# Parent Auto-Reply Engine — Build Prompts

Phased prompts to build the parent auto-reply engine into OffPitchOS. Standalone prototype already validated at `~/offpitch-classify/` (run 2026-05-04 — 90% auto-draftable, all sensitive emails correctly flagged, $0.05 per 30-email run).

**Gating rule: do NOT start building until OffPitchOS has its first paid customer.** Building before then = guessing what customers want.

Send these prompts to Claude Code one at a time, in order. Each is self-contained.

---

## Prompt 1 — KICKOFF (planning only, no code)

```
Build the parent auto-reply engine into OffPitchOS. The standalone prototype
at ~/offpitch-classify/ already proves the AI classification works at 90%
draft-rate with claude-sonnet-4-6. Now I want to integrate it as a real
feature inside OffPitchOS at offpitchos.com.

Phased approach — don't do it all at once. Confirm the plan first, then we'll
do Phase 1 only.

Context to pull in:
- OffPitchOS code lives at ~/Desktop/offpitchos, Next.js app under app-next/,
  Supabase backend, Vercel hosted
- Existing Claude API usage at app-next/app/dashboard/{attention-actions.ts,
  voice-actions.ts, tactics/ai/actions.ts} — same patterns
- The classifier prompt + schema is at ~/offpitch-classify/src/classify.ts —
  port the logic, swap mock context for real Supabase queries
- User-facing brand: cream + forest green (per
  feedback_offpitchos_landing_brand); auth/dashboard area uses the existing
  dark theme

Three phases:
1. Gmail OAuth + email ingestion — coaches connect their Gmail, system pulls
   new mail into Supabase
2. Dashboard inbox + AI drafts — /dashboard/inbox page with classify + draft
   side-by-side, Send/Edit/Skip buttons
3. Send-as-coach — replies go out from the coach's Gmail address via Gmail
   API, threaded correctly

Use the brainstorming skill first to confirm scope and surface anything I'm
missing. Then write a plan for Phase 1 only. Don't touch code until I approve
the plan.
```

---

## Prompt 2 — PHASE 1 (Gmail OAuth + ingestion)

```
Execute Phase 1 of the parent auto-reply engine: Gmail OAuth + email
ingestion.

What to build:
1. Google Cloud OAuth app config (I'll do the Console setup; you tell me what
   scopes + redirect URIs to enter)
2. New "Connect Gmail" button in /dashboard/settings — opens Google OAuth
   consent flow
3. New Supabase table gmail_connections (coach_id, gmail_address,
   access_token, refresh_token, expires_at, scope)
4. New Supabase table inbox_emails (id, coach_id, gmail_message_id UNIQUE,
   gmail_thread_id, from_address, subject, body, received_at, status)
5. Vercel cron job that polls every 5 min for new mail per connected coach
6. Token refresh handler when access tokens expire
7. RLS so Club A can never read Club B's emails

Don't classify or draft yet — just get raw emails landing in inbox_emails
reliably. Phase 2 adds the AI layer on top.

Use TDD where it makes sense (token refresh logic, RLS policies). Push to git
before deploy per project rules. Then deploy and test with my own Gmail.
```

---

## Prompt 3 — PHASE 2 (dashboard panel + AI drafts)

```
Execute Phase 2: Dashboard inbox panel + AI drafts.

What to build:
1. New page /dashboard/inbox listing all inbox_emails for the coach where
   status = pending
2. For each email, call the classifier (port ~/offpitch-classify/src/classify.ts
   to a Server Action). Replace the mock context with real Supabase queries:
   schedule, roster, payment status, announcements, fields, uniform rules
3. Display: parent email on left, AI draft on right, with Send / Edit / Skip
   buttons
4. Separate "Flagged" tab for sensitive emails (no draft, just the email +
   escalation reason)
5. Real-time updates via Supabase subscriptions when new mail arrives
6. Coach can edit the draft in a textarea before sending
7. Loading states + error handling (Claude rate-limited, classification
   failed, etc.)

Don't actually send replies yet — `Send` button just marks status = sent for
now. Phase 3 wires the actual Gmail send.

Test with the existing data on offpitchos.com — pull real schedule/roster
from my dashboard.
```

---

## Prompt 4 — PHASE 3 (send-as-coach)

```
Execute Phase 3: Send-as-coach via Gmail API.

What to build:
1. When coach clicks Send, call Gmail API users.messages.send using their
   OAuth token
2. Set In-Reply-To and References headers so the reply lands in the same
   Gmail thread the parent sees
3. From address = coach's connected Gmail (not noreply@offpitchos.com)
4. Update inbox_emails.status to sent + store sent_gmail_message_id
5. If Gmail returns an error, surface it in the UI with retry option
6. Add a "Sent" tab so the coach can see what went out today
7. DOC dashboard metric: "Hours saved this week" — count of sent drafts ×
   estimated 4 minutes per email

Test end-to-end: parent emails my Gmail → shows up in OffPitchOS inbox → I
click Send → reply lands in parent's inbox AS me, in the same thread.
```

---

## Prototype validation results (2026-05-04)

- 30 sample emails classified in 51.8s with claude-sonnet-4-6
- 27/30 auto-draftable (90%), 3/3 sensitive correctly flagged (playing time,
  injury, bullying)
- Avg confidence 0.92
- Cost: $0.05 per run (~$0.005 per email after cache warming)
- At full scale: ~$40/yr per club, ~$800/yr for 20 clubs

Drafts judged shippable on first run — most could be sent as-is. The Jen
Wallace payment lookup case (model used real payment-status data, didn't
hallucinate, redirected to treasurer + flagged late fee) was the strongest
proof the model uses context correctly.

## Project state at end of session 2026-05-04

- Prototype: working, tested, validated
- Anthropic balance: ~$7.79 (was $7.89 before test run)
- API key for prototype: `offpitch-classify-dev` in Anthropic Console
- Outreach pipeline: 0 active leads, 0 paid customers
- Jason and Eric: dead leads, do not bump
- Decision: do not build the integration until first paid customer
