# Pricing decision — 2026-05-04 brainstorm Topic 3

**Decision:** Do not change the pricing model. Lock the field-walk verbal script. Make one small edit to the public pricing page so the field promise matches the page.

## Signal that drove the call

User confirmed Jason and Eric (and prior conversations) **never asked price**. They demoed, said "interesting," and ghosted. Price is not the gate. Value/urgency/switching-cost is the gate. That collapses Topic 3 from "redesign pricing" to "don't touch the model — sharpen the script."

## What stays exactly as-is

- **Range:** $149–$499/mo, anchored on player count
- **Annual discount:** 20% → $119–$399/mo billed yearly
- **Founding offer:** First 10 clubs, 50% off forever
- **No transaction fees, no public exact number, "book 15-min call, quote on the spot"**
- **No new tier, no freemium, no per-player split-out, no SE-import bundle change**

Reason: at 0 paying customers, the model has not been falsified. Falsify it with discovery data first; then re-decide. Don't redesign in the dark.

## What changes — the field script

Replace step 3 of the in-person walk-up demo (per `project_offpitchos_outreach_plan_2026_05.md`) with:

> "We're locking in our first 10 South Florida clubs at 50% off forever. For a club your size that's roughly **$75–$150/mo, forever**. Want me to send you a demo login tonight?"

Rationale, brutal frame:
- **Scarcity is the only urgency lever a 0-customer founder has.** Lead with the founding hook, not the range.
- **Phone-bill numbers convert at fields. SaaS-contract numbers don't.** $75–$150 reads as a phone bill; $149–$499 reads as a contract.
- **Self-qualifies for South FL** — geography is finite, the offer is finite, the DOC is early. All three say "act now."
- **"Forever" beats "for life"** — sounds like a handshake instead of marketing copy.
- **CTA at a field is "demo login tonight," not "book a call."** A DOC in a parking lot won't book a call. They'll give you an email if there's a same-day deliverable.
- **Anchor narrowed to $75–$150 verbally** because mid/small clubs are who walk past you on Saturday mornings. Big clubs ($499 → $250 founding) are rare at fields; adjust verbally if one shows up.

## What changes — the public pricing page

One edit to the founding-clubs section in `app-next/app/pricing/page.tsx`:

| Field | Before | After |
|---|---|---|
| Eyebrow | "Founding clubs · First 10 only" | "South Florida clubs · First 10 only" |
| Body | "Our first 10 clubs get half-price locked in forever — in exchange for your logo on the site, honest feedback, and a short testimonial when we ship. Design partners, not beta users." | "Our first 10 South Florida clubs lock in 50% off forever — roughly $75–$250/mo for life — in exchange for your logo, honest feedback, and a short testimonial when we ship. Design partners, not beta users." |

Reason: when a DOC at a field hears the verbal pitch and types `offpitchos.com` that night, the page should reinforce — not contradict — the geographic + dollar-range promise. No fake "6 of 10 left" counter (operators sniff that out). Hero stays unchanged so non-South-FL inbound still has a clean entry point.

## What we explicitly rejected

- **Anchor lower at $199 flat (Q2 option B):** trains every prospect's mouth to say $199; leakage on big-club deals.
- **Dodge ("cheaper than what you're losing in coach turnover," Q2 option D):** DOCs are operators; reads as "doesn't know his price."
- **Fake scarcity counter on the page (Q3 option B):** at 0 paying customers, "6 of 10 left" is a lie. Costs trust if read by a sharp DOC.
- **Hero rewrite to lead with founding offer (Q3 option C):** breaks non-South-FL inbound. Founding offer is qualified to South FL only.

## When pricing IS allowed to change

Re-open Topic 3 only if discovery data over the next 4 weeks shows one of:
- Multiple DOCs ask price upfront and bounce (price IS the gate after all)
- Multiple DOCs say the founding-club discount feels insulting or insufficient
- Multiple DOCs ask for a tier we don't offer (e.g., "do you have a per-team plan for academies?")

"Multiple" = 3+ independent signals. One DOC's reaction is anecdote.

## Out of scope (do not touch)

- New tiers / freemium / pay-as-you-go
- Per-player vs. flat
- Bundling SE-import as a paid add-on
- Stripe configuration changes
- Removing the Calendly CTA in favor of self-serve checkout

## Files touched

- `app-next/app/pricing/page.tsx` — founding-clubs section copy edit (eyebrow + body)
- `docs/superpowers/specs/2026-05-04-pricing-decision.md` — this memo

## Status

Topic 3 of the 2026-05-04 brainstorm is now COMPLETE. The full brainstorm cycle (Topics 1, 2, 3) is locked. Founder enters the 4-week sales sprint with: locked outreach plan, locked feature gating, locked pricing + script.
