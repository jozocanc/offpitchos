# Demo mode

> **⚠️ Not visually distinct at a glance.** Names and addresses are
> intentionally realistic so the seeded club feels populated, not
> staged. Demo rows are identifiable on careful inspection only —
> `@example.test` emails, `raw_user_meta_data.is_demo = true` on
> `auth.users`, pointer rows in `demo_seeds`, and the yellow "Demo
> data loaded" banner on the dashboard. **Do not leave seed data on
> an account you'll share with a real DOC** — they will read the
> roster as their own club.

OffPitchOS ships with an optional one-click seed for a realistic-looking
populated club. It exists so a cold DOC walking through the product
doesn't land on an empty dashboard with no parents to notify and no
schedule to see.

## What gets created

Click **Load demo data** on the DOC dashboard and you get:

- 1 venue — West Field (with a real Miami address)
- 12 players on the wizard-created team (U14 roster, diverse names)
- 3 fake parents (each with 4 linked kids)
- 2 fake coaches
- 3 upcoming events (two practices + one game, within the next week)

Every seeded row lands in the caller's own `club_id` so RLS still
protects it. Fake accounts use `@example.test` emails and have
`raw_user_meta_data.is_demo = true` on `auth.users` so they can be
filtered out of analytics later.

## Enabling it

The seed UI is gated by an env var:

```
NEXT_PUBLIC_ALLOW_DEMO_SEED=true
```

When unset or `false` (the default), the button does not render and
the server actions refuse to run. Set it only in environments where
you actively want the demo path — local dev or a sales preview.

## Clearing it

Click **Clear demo data** in the banner that appears after seeding.
The `demo_seeds` table tracks every inserted row; clear deletes the
tracked rows (plus cascades from `auth.users` → profiles,
team_members, and players) and drops the tracking entries themselves.

You can also seed and clear repeatedly — the "empty-enough" guard
requires zero real players, zero events, and zero non-DOC team
members before seeding runs, so the state machine stays deterministic.

## Email suppression

`lib/email.ts` defines `isDemoRecipient(email)` which returns true for
any `@example.test` address. Every 1:1 and bulk email path
short-circuits for demo recipients before hitting Resend — so seeding
never fills the Resend logs with bounces and never costs real email
credits.

## How it works end-to-end

1. `seedDemoData()` verifies the caller is a DOC in their own club.
2. A locally-scoped service-role client (instantiated inside the
   action, not a module-level singleton) handles `auth.users`,
   `profiles`, and `demo_seeds` inserts — everything else goes through
   the caller's client so RLS writes are enforced.
3. Each row inserted writes a pointer into `demo_seeds(row_table,
   row_id)`. If seeding fails partway through, `clearDemoData()` can
   still reverse it.
4. `clearDemoData()` groups tracked rows by table, deletes in an
   FK-safe order, and drops the tracking rows last.

## Do not use in production

If a real DOC ever sees seeded fake parents and coaches in their
dashboard, the trust is gone. Keep `NEXT_PUBLIC_ALLOW_DEMO_SEED`
off in production deployments that real users can access.
