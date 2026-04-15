# OffPitchOS

The operating system for youth soccer clubs.

**Live:** [offpitchos.com](https://offpitchos.com)

---

## What it is

OffPitchOS replaces the patchwork of spreadsheets, group chats, and sticky notes that Directors of Coaching, coaches, and parents use to run a youth soccer club. One app, three role-aware views, everything in sync.

## Who it's for

- **Directors of Coaching** — run the whole club: schedule, coverage, bulk comms, gear, rosters, camps, attention inbox
- **Coaches** — attendance, inline feedback, coverage requests, player communication
- **Parents** — claim kids, RSVP, message coach, camp registration, invite codes

## Key features

- Role-based access control across every page
- DOC → coach → parent workflow loops (attention inboxes, two-path coverage, excuse flows)
- Public camp registration — shareable link, no account required, multi-kid support
- Team invite codes for fast parent onboarding
- Voice commands + Ask Ref AI assistant (context-aware: knows today, who's asking, their kids)
- Push notifications (iOS PWA confirmed end-to-end)
- WhatsApp group chat per team
- Stripe checkout for paid camps (Platform model, sole prop)

## Stack

- **Frontend:** Next.js 16, React 19, Tailwind v4, TypeScript
- **Backend:** Supabase (Postgres, Auth, RLS, Storage)
- **Payments:** Stripe
- **AI:** Anthropic Claude (Ask Ref)
- **Email:** Resend
- **Push:** web-push (VAPID)
- **Hosting:** Vercel

## Structure

```
app-next/      Next.js app (main product)
supabase/      Migrations + seed
docs/          Internal docs
index.html     Marketing landing (root)
pitch.html     Investor pitch deck
```

## For clubs interested in piloting

Reach out: [cancithebuilder.com](https://cancithebuilder.com)
