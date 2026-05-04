# Cold-email sequence — 2026-05-04 brainstorm Topic 4

**Channel role:** Secondary (in-person walk-ups remain primary). Background volume play during weekdays of the 4-week sales sprint (2026-05-04 → 2026-06-01). Targets are the 78 clubs in `docs/outreach-targets.csv`.

## Locked spec

| Element | Decision |
|---|---|
| CTA | Reply "demo" → demo login sent same-day |
| Cadence | Two-touch: initial + day-4 bump. No third touch. |
| Subject (initial) | `FAU student building something for South FL clubs` |
| Subject (bump) | `re:` thread of the initial — same Gmail thread, no new subject |
| Body length | 5–7 content lines |
| Personalization | Light (~5 min/email), 3 tier-aware pain variants |
| Send infra | Personal Gmail (`jozo.cancar27@gmail.com`) + Gmail Templates / Raycast snippets |
| Tracking | None. No pixels, no link wrappers, no Gmass footers. |
| Volume | ~12/day weekday-only → ~250 emails over 4 weeks |
| Tier→founding price | ECNL/MLS NEXT $200–$250/mo · SFUYSA travel $100–$150/mo · Rec/small $75–$100/mo |

## Why these calls

- **CTA = reply "demo":** Calendly-first failed twice (Jason, Eric). Reply-driven mirrors the field-walk close, gives a direct human signal, lets you triage before burning a Zoom slot.
- **Two-touch only:** A third touch from a personal Gmail at 0 customers reads as automated. The breakup line is a tell.
- **"FAU student" subject:** The student tag is the most disarming credibility-without-customers hook. Geography in the subject self-qualifies. No "$" or "%" → stays out of Promotions tab. Tag expires 2026-08-07; use it now.
- **Tier-aware pain lines:** A pure template tanks reply rate; deep custom doesn't scale. Light personalization with a real-world pain sentence per tier feels custom and ships at volume.
- **Personal Gmail, not a Resend domain:** Cold mail on `offpitchos.com` would torch the transactional reputation and break parent notifications, password resets, demo-login emails. Hard no.
- **No demo video link in initial:** Save it for the bump so touch 2 has something fresh; touch 1 should pull a reply, not a YouTube view.

## Templates

### Template A — ECNL / MLS NEXT tier

Use for: Weston FC, SFFA/Boca United, Wellington Wave, Strike Force, Miami Rush Kendall, PBG Predators, Miami Futbol Academy, Team Boca, Real Madrid Foundation, large multi-team competitive programs.

**Subject:** `FAU student building something for South FL clubs`

```
Hi [first name],

FAU student building OffPitchOS for South FL youth clubs. Saw [Club] on the [ECNL / MLS NEXT] list.

For multi-team programs your size, the killer isn't Saturday — it's the admin load between Saturdays. Coach calendars, parent comms, multi-team scheduling, payments — seven tabs minimum.

We're locking in the first 10 South FL clubs at 50% off forever — for a club your size that's roughly $200–$250/mo for life.

Reply "demo" and I'll send a login today.

— Jozo
offpitchos.com
```

### Template B — SFUYSA travel / competitive tier

Use for: Plantation FC Rush, Davie United, Sunrise Surf, Wellington SC, AC Delray Rush, Rise FC, FC Prime Broward, Coral Gables, Pinecrest Premier, mid-size travel/competitive clubs.

**Subject:** `FAU student building something for South FL clubs`

```
Hi [first name],

FAU student building OffPitchOS for South FL youth clubs. Saw [Club] running in [SFUYSA / GHSL / at Pine Island].

The brutal Friday is when a U14 coach drops at 6pm and you've got 14 hours to find coverage and tell 22 parents. We built voice commands that handle the cancel + notify + sub-coverage in one shot.

We're locking in the first 10 South FL clubs at 50% off forever — for a club your size that's roughly $100–$150/mo for life.

Reply "demo" and I'll send a login today.

— Jozo
offpitchos.com
```

### Template C — Rec / small academy tier

Use for: Margate United, Lauderhill Lions, Tamarac, Coconut Creek, Goulds Park, single-site academies, Soccer 5 affiliates, small rec clubs.

**Subject:** `FAU student building something for South FL clubs`

```
Hi [first name],

FAU student building OffPitchOS for South FL youth clubs. Saw [Club] in [Margate / Lauderhill / Coconut Creek].

For smaller clubs the chaos is the manual stuff: scheduling 8–12 teams in a spreadsheet, chasing parent payments by text, answering the same 20 questions every week. We collapsed all of that into one app.

We're locking in the first 10 South FL clubs at 50% off forever — for a club your size that's roughly $75–$100/mo for life.

Reply "demo" and I'll send a login today.

— Jozo
offpitchos.com
```

### Template D — Day-4 bump (one template, all tiers)

Send as a reply on the same Gmail thread (preserves the original subject line as `re:`).

```
Hi [first name],

Wasn't sure that one hit your inbox. 90-second demo if you've got it in you: https://youtu.be/ZylUkBkgqIs

Same offer for the first 10 South FL clubs — 50% off forever. Reply "demo" if you want a login.

— Jozo
```

## Send playbook

### One-time setup (~15 min)
1. **Load templates into Gmail:** Settings → See all settings → Advanced → Templates → Enable. Compose → ⋮ → Templates → "Save draft as template" — save Template A, B, C, D as four canned responses.
2. **Pick a tier per club in the CSV.** Add a `tier` column locally if useful (A/B/C). Skip clubs where you can't identify a DOC name (those need website re-research before sending).
3. **Block the morning sending slot:** 8:30–9:30am Mon–Fri on calendar. ~12 emails in 60 min.

### Daily rhythm (~36 min/day)

1. **Open the CSV.** Pick the next 12 clubs that have a `doc_email` AND a `doc_name`.
2. **Per email** (~3 min):
   - New compose → insert Template A/B/C based on tier.
   - Replace `[first name]` with the DOC's first name.
   - Replace `[Club]` with the club's display name.
   - Replace the bracketed personalization detail with the right one for that club (county, league, or venue — pull from `notes` column or the venues file).
   - Verify the price range matches the tier.
   - Send.
3. **Log the send** in the CSV by appending `· emailed YYYY-MM-DD` to the `notes` column.
4. **Day-4 bump:** at the end of each daily session, scan for sends from 4 weekdays ago. For any without a reply, click into the original thread → Reply → insert Template D → send.

### What counts as a reply (and what to do)

| Reply type | Action |
|---|---|
| "demo" / "yes" / "send the login" | Send Supabase demo-account login email same-day. Add to follow-up list for D+2 check-in: "did you log in?" |
| "interested but need to talk" / "can we hop on a call?" | Send Calendly link. **This is the only path to Calendly.** |
| "we're not the right fit" / "no thanks" | Reply once: "Got it — appreciate the candor. If anything changes after the season, you have my email." Do not bump again. |
| "we already use [SportsEngine / TeamSnap / GotSport]" | Use Reply Template 2 (SE-import objection). The CSV import was shipped 2026-05-04 — this is no longer vapor. |
| Out-of-office / auto-reply | Note the OOO end date in `notes`. Re-send fresh (not a bump) 3 days after they're back. |
| No reply after bump (day 4) | Mark `cold` in `notes`. Do not send again this sprint. Re-evaluate at week 4. |

### When to escalate to Calendly

ONLY when the prospect explicitly asks for a call OR replies but doesn't want a login. Do not push Calendly to "demo" replies — send the login first, then a D+2 message: "Did you get a chance to poke around? Happy to walk you through it on a 15-min call — [Calendly]."

### Reply templates (load into Gmail Templates)

Save each as a canned response — Settings → See all settings → Advanced → Templates → "Save draft as template." Reply within the original thread (no new subject). All four match the brutal-cofounder voice — terse, no fluff, no "Hope you're well."

#### Reply Template 1 — "demo" / "yes" / "send the login"

```
Hey [first name],

Sending your login now.

Sign up here: https://offpitchos.com/access
Access code: [generate one + paste here]

Demo data is preloaded — voice commands, schedule, parent comms, tactics board, all of it. Takes 5 minutes to poke around.

I'll check in Wednesday to see if it lands.

— Jozo
```

**Mechanism (locked 2026-05-04): access-code path.** Each "demo" reply gets a fresh access code → prospect signs up themselves → onboarding wizard runs → optionally drops in a CSV via step 3 to populate their own demo data. They own their account from minute one. Do NOT share a single demo-DOC login across prospects — confuses everybody and fake-data is less convincing than their own.

After sending: set a Wed/Thu reminder ("did [name] log in? if no reply, send 'how'd it go?'"). Add to a follow-up list (CSV notes column: `· demo-sent YYYY-MM-DD`).

#### Reply Template 2 — "we use SportsEngine / TeamSnap / GotSport" (post-2026-05-04: real, not vapor)

```
Hey [first name],

Yeah — the migration is usually the dealbreaker. We just shipped a CSV import that does it in ~10 minutes. You drop your [SportsEngine] roster export, OffPitchOS auto-creates teams + players + parent accounts, then parents get an email to set their password and they're in.

15-min Zoom and I'll walk you through the migration with your actual data:
[Calendly link]

— Jozo
```

Swap `[SportsEngine]` for `TeamSnap` / `GotSport` / etc. at send time. The roster-import column-mapper handles all of them — same flow either way. Spec for the import: `docs/superpowers/specs/2026-05-04-roster-import-design.md`.

#### Reply Template 3 — "let's hop on a call" / "interested but need to talk"

```
Hey [first name],

Yeah, let's do it:
[Calendly link]

Pick a 15-min slot that works.

— Jozo
```

This is the ONLY path to Calendly per the spec. Don't push it on "demo" replies — those get a login first.

#### Reply Template 4 — "not a fit" / "no thanks"

```
Hey [first name],

Got it — appreciate the candor. If anything changes after the season, you have my email.

— Jozo
```

Reply once. Mark `cold` in CSV notes column. Do not bump again this sprint.

#### Reply setup checklist (do once before the first reply lands)

- [ ] Have the access-code generator ready (locked path per Template 1) so you don't fumble at reply-time
- [ ] Confirm Calendly link → paste it into Templates 2 and 3 to lock them
- [ ] Replace or delete `[first name]` placeholder per send (Gmail Templates won't auto-fill)

## Things explicitly NOT in the sequence

(Listed so future-Jozo doesn't add them on a productive-feeling Tuesday.)

- No third touch.
- No "Hope you're well" / weather chitchat.
- No "Looking forward to your reply" close.
- No tracking pixels or link wrappers.
- No "P.S." flourishes.
- No CC'ing anyone.
- No fake social proof ("47 clubs already using us"). Zero customers = zero claims.
- No demo video link in the initial email — it goes in the bump only.
- No `jozo@offpitchos.com` sending. Cold mail goes from `jozo.cancar27@gmail.com`.
- No Apollo / Lemlist / Smartlead. No warm-up domain.
- No mass-merge tools. One-by-one only.

## Re-open Topic 4 only if

After the 4-week sprint, if any of these signals show up, redesign:

- **Open rate < 30%** (you'd need a Gmail filter test or asking a few DOCs directly): subject line is broken.
- **Reply rate < 1%** across 200+ sends: body or list is broken (likely list — sparse-DOC-info clubs are not real targets).
- **High reply rate but zero "demo" yes-replies**: the founding-club math isn't compelling enough; revisit pricing's 3-signal threshold (per `2026-05-04-pricing-decision.md`).
- **3+ DOCs say "I get FAU students cold-emailing me all the time"**: the student tag has been mined to death; switch hook.

Anecdotal "this email worked great" or "this one didn't get a reply" is NOT a redesign signal. Sample size of 1 is noise.

## Files touched

- `docs/superpowers/specs/2026-05-04-cold-email-sequence.md` — this memo
- `docs/outreach-targets.csv` — will be enriched in-place by the running scraper subagent (DOC contacts) and by daily `· emailed YYYY-MM-DD` notes during the sprint

## Status

Topic 4 of the 2026-05-04 brainstorm is COMPLETE. Sequence locked. Templates ready to load into Gmail Templates. Daily rhythm defined.
