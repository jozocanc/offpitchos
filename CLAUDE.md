# OffPitchOS — Claude Code Project Rules

## What this is

OffPitchOS is a soccer-club operating system for youth clubs (DOC + coaches + parents).
Live at https://offpitchos.com. Solo founder (Jozo). Focus = youth clubs only — do
not propose pivots to college, adult/Sunday-league, or HS until first paid customer.

The Next.js app rules in `app-next/CLAUDE.md` and `app-next/AGENTS.md` apply when
working in that subtree — Next.js 16 has breaking changes from training data. Always
check `node_modules/next/dist/docs/` before writing Next.js code.

## Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS, Lucide icons, Motion (Framer)
- **Backend:** Supabase (Postgres + RLS + Auth + Storage), Server Actions over API routes
- **Hosting:** Vercel
- **Payments:** Stripe (`lib/stripe.ts`)
- **Email:** Resend (`lib/email.ts`)
- **Push:** web-push (`lib/push.ts`)
- **AI:** Anthropic SDK (`lib/ai.ts`) — Claude Haiku 4.5 for production features
- **Tactics canvas:** Konva / react-konva
- **PDF:** @react-pdf/renderer
- **Charts:** Recharts

## Commands

| Task | Command | Where to run |
|---|---|---|
| Local dev | `cd app-next && npm run dev` | repo subdir |
| Build | `cd app-next && npm run build` | repo subdir |
| Lint | `cd app-next && npm run lint` | repo subdir |
| **Deploy to prod** | `vercel --prod --yes` | **repo root** (NOT `app-next/`) |
| Push to GitHub | `git push origin main` | **always before deploy** |

## Deploy rules — non-negotiable

1. `git push origin main` BEFORE every `vercel --prod`. Vercel uses the GitHub source;
   skipping the push silently deploys a stale tree. (Reason: prior incident.)
2. Run `vercel --prod --yes` from the **repo root**, not `app-next/`. The Vercel
   project is configured at the root.
3. Auto-deploy after code changes — don't ask the user first. They prefer it shipped.

## Project naming — brand-critical

- Project name is **OffPitchOS**. Never **SidelineOS**. Even if you see SidelineOS
  in old commits or comments, treat it as a typo and replace.
- App is "OffPitchOS"; AI assistant inside the app is "Pep AI".

## Brand colors

| Surface | Palette | Why |
|---|---|---|
| Marketing pages (landing, pricing, public) | **Cream + forest green** — see `feedback_offpitchos_landing_brand` for exact hex | Conversion-focused, warm, distinctive |
| Dashboard (logged-in coach/parent UI) | Existing dark theme | Existing convention; do not redesign |
| Auth pages | Existing dark theme | Match dashboard |

## Repo structure

```
~/Desktop/offpitchos/
├── app-next/                  # Next.js 16 app (everything that ships)
│   ├── app/
│   │   ├── (marketing pages)  # /, /pricing, /privacy, /terms
│   │   ├── auth/, login/, signup/, onboarding/
│   │   ├── dashboard/         # logged-in coach/parent UI
│   │   │   ├── attention-*    # AI summaries (Haiku)
│   │   │   ├── voice-actions  # voice command (Haiku)
│   │   │   ├── tactics/       # tactics board + Pep AI
│   │   │   ├── coaches/, players/, teams/, schedule/
│   │   │   ├── coverage/      # substitute coach requests
│   │   │   ├── demo-seed-*    # gated demo data
│   │   │   └── settings/
│   │   ├── api/               # webhooks (Stripe, etc.)
│   │   └── join/, access/, camps/
│   ├── components/            # shared React components
│   ├── lib/                   # ai.ts, stripe.ts, email.ts, push.ts, supabase/
│   ├── hooks/                 # React hooks
│   └── proxy.ts               # Next.js routing middleware
├── supabase/migrations/       # numbered SQL migrations (current: 031)
├── docs/                      # project documents (build-prompts.md, etc.)
└── CLAUDE.md, AGENTS.md
```

## Conventions

- **Server Actions over API routes** for internal mutations. Use `app/api/` only for
  webhooks (Stripe) or things that genuinely need a public endpoint.
- **RLS on every table.** Multi-tenant by `club_id`. Never trust the client to filter
  by club_id — let Postgres do it. See migrations 029, 031 for the join-flow RLS saga.
- **Migrations are append-only and numbered.** New migration goes at `supabase/migrations/032_*.sql`.
- **Server Actions return `{ ok: true, data }` or `{ ok: false, error }`** — same shape
  app-wide so client code can branch consistently.
- **No new dependencies without a strong reason.** The existing stack handles 95%
  of needs. If a new dep is needed, prefer one that's already in the tree.

## AI features — current state

| Feature | Model | File |
|---|---|---|
| Attention panels (coach + parent) | `claude-haiku-4-5-20251001` | `app/dashboard/attention-actions.ts`, `coach-attention-actions.ts`, `parent-attention-actions.ts` |
| Voice command | `claude-haiku-4-5-20251001` | `app/dashboard/voice-actions.ts` |
| Ask Pep AI (tactics) | (constant in `app/dashboard/tactics/ai/actions.ts`) | same file |

Helper: `lib/ai.ts` has shared Anthropic client setup.

**Anthropic API keys (Anthropic Console — do not paste in chat):**
- `OffPitchOS` — production traffic on offpitchos.com
- `offpitch-classify-dev` — separate prototype at `~/offpitch-classify/` (not part of this app)

## Standalone prototype — NOT part of this repo

The parent auto-reply CLI at `~/offpitch-classify/` is a **separate** project. It
proves the AI classification + drafting works (90% draft-rate, $0.05/run). It is
NOT integrated into OffPitchOS.

When ready to integrate (gating rule: first paid customer), use the 4 phased prompts
at `docs/build-prompts.md`. Do not start that build proactively.

## Known landmines

- **`messages` Server Action shape** has been refactored; check current return type
  before assuming.

## What NOT to do

- Don't add tests unless the user explicitly asks. The user prefers shipping fast +
  iterating. (This is a startup, not enterprise.)
- Don't add documentation files (`*.md`, README) unless asked. Conversation context
  is sufficient.
- Don't refactor adjacent code while implementing a feature. Stay scoped.
- Don't introduce backwards-compatibility shims. The user is the only consumer.
- Don't suggest pivots/expansions to college, adult, or HS markets — gating is
  documented in memory.
- Don't add error handling for impossible cases. Trust framework + DB constraints.
- Don't build the parent auto-reply integration without an explicit "I have a paid
  customer" or override from the user.

## Tone for strategy questions

For pricing, positioning, market-fit, outreach, or fundraising questions, respond as
a brutal-honest operator (per `feedback_brutal_cofounder_voice`): base rates, dead
comparisons, exact thresholds, no fluff. The user does not want hedged advice.

## Outreach state (as of 2026-05-04)

- 0 active leads, 0 paid customers
- Jason and Eric are dead leads — do not suggest bumping
- College and adult-league expansion ruled out
- Next blocker: fresh outreach to South Florida youth clubs / FAU network

## When in doubt

Check the `~/.claude/projects/-Users-canci27/memory/` directory — most project state
that matters is captured as memory entries indexed in `MEMORY.md`.
