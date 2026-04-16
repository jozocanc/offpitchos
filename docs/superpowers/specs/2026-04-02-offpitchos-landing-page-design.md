# OffPitchOS Landing Page — Design Spec

## Overview

A single-page waitlist landing site for **OffPitchOS**, an AI-driven club operating system for soccer. The page targets Directors of Coaching (DOCs) at youth soccer clubs. The goal is to sell the vision and capture early interest via email signups.

- **Tech stack:** Vanilla HTML / CSS / JS
- **Hosting:** Own repo, deployed to its own domain (offpitchos.com)
- **Style:** Bold, sporty, dark + electric green

## Color Palette

| Token            | Value     | Usage                          |
|------------------|-----------|--------------------------------|
| Primary dark     | `#0A1628` | Page background                |
| Electric green   | `#00FF87` | Accents, CTAs, highlights      |
| Secondary dark   | `#12203A` | Card backgrounds, sections     |
| White            | `#FFFFFF` | Primary text                   |
| Light gray       | `#94A3B8` | Secondary/body text            |

## Typography

- **Headlines:** Inter (Google Fonts), bold, uppercase, tight letter-spacing
- **Body:** Inter, regular weight, normal case
- **Sizes:** Responsive — large hero headline scaling down for mobile

## Page Structure

The page is a single HTML file (`index.html`) with seven sections, top to bottom.

### Section 1: Hero

- **Headline:** Bold, large, uppercase. Example: "THE OPERATING SYSTEM FOR YOUR SOCCER CLUB"
- **Subheadline:** One sentence. Example: "Built for Directors of Coaching to run their entire club in one place."
- **Email capture:** Input field + CTA button ("Join the Waitlist")
- **Background:** Subtle animated grid or pitch-line pattern using CSS (no heavy JS libraries)
- **Layout:** Centered, vertically stacked

### Section 2: Problem Statement

Three pain-point cards displayed in a horizontal row (stacks vertically on mobile):

1. "Drowning in parent emails"
2. "Juggling 5 different apps"
3. "Coach coverage chaos"

Each card has:
- An icon (SVG or emoji placeholder)
- A short headline
- One sentence of supporting text

Cards use `#12203A` background with subtle border or glow on hover.

### Section 3: Feature Highlights

Six feature blocks displayed in a 2x3 or 3x2 grid (responsive):

1. **AI Communication Hub** — Emails, messages, and chats centralized. Common questions answered automatically. Urgent issues highlighted.
2. **Automated Scheduling** — Practices, games, cancellations, and changes pushed instantly to coaches, players, and parents with built-in maps.
3. **Coach Coverage System** — Coaches mark unavailability. System finds qualified replacements automatically. DOC has full visibility.
4. **Player Development Profiles** — Positions, performance data, highlights, and voice-to-text coach feedback stored per player.
5. **Camp & Revenue Tracking** — Active, upcoming, and completed camps with registration counts and revenue tracking over time.
6. **Parent & Player Portal** — Clean, simple access to schedules, chat, travel info, camps, and attendance confirmation via push notification.

Each block has:
- An icon
- A bold title
- 1-2 sentence description
- `#12203A` card background

### Section 4: How It Works

Three-step horizontal flow (stacks vertically on mobile):

1. **Set up your club** — Add teams, coaches, players, and schedules
2. **System runs in the background** — AI handles communication, coverage, and notifications
3. **You focus on coaching** — Less admin, more development

Steps connected by a visual line or arrow. Each step has a number, title, and one-line description.

### Section 5: Who It's For

Three tiers displayed visually (cards or columns):

1. **Director of Coaching** — Full control. Centralized dashboard, voice-enabled commands, complete club visibility.
2. **Coaches** — Team-level access. Schedules, player profiles, attendance, availability management.
3. **Parents & Players** — Simple experience. Schedules, chat, attendance confirmation, camp info, travel recommendations.

Visual hierarchy should emphasize DOC as the top tier (largest or most prominent card).

### Section 6: Final CTA

- **Headline:** Example: "Be the first to run your club smarter"
- **Email capture:** Same input + button pattern as hero
- **Supporting text:** Example: "Join the waitlist. Early access coming soon."

### Section 7: Footer

- OffPitchOS logo/wordmark
- Copyright line
- Placeholder social media icon links (no actual links needed yet)
- Minimal — one row

## Interactions & Effects

- **Smooth scroll:** CSS `scroll-behavior: smooth` with optional nav anchor links
- **Card hover:** Subtle lift (`translateY(-4px)`) and/or green glow (`box-shadow`) on feature and problem cards
- **CTA button:** Electric green background, dark text, glow effect on hover (`box-shadow: 0 0 20px rgba(0,255,135,0.4)`)
- **Hero background:** CSS-only animated grid pattern or subtle pitch lines (keyframe animation, no JS dependency)
- **Scroll fade-in:** Sections fade in on scroll using `IntersectionObserver` (vanilla JS)

## Email Capture

- Both hero and final CTA forms share the same submission handler
- For MVP/waitlist phase: form submits to Formspree (free tier, no backend needed)
- Input validation: basic email format check in JS before submit
- Success state: inline confirmation message replacing the form
- Error state: inline "Something went wrong, try again" message on network failure
- Loading state: button text changes to "Submitting..." while request is in flight

## Accessibility

- All interactive elements (inputs, buttons) have visible focus states (green outline)
- Form inputs have associated `<label>` elements (visually hidden if needed)
- CTA buttons use sufficient contrast (dark text on `#00FF87` passes WCAG AA)
- Semantic HTML: `<header>`, `<main>`, `<section>`, `<footer>`
- Images/icons include `alt` text or `aria-label`

## Responsive Behavior

- **Container max-width:** 1200px, centered
- **Desktop:** Full-width section backgrounds, content constrained to max-width
- **Tablet:** 2-column grids collapse where needed
- **Mobile:** Single column, stacked layout, adjusted font sizes
- **Breakpoints:** 768px (tablet), 480px (mobile)

## Files

```
offpitchos/
  index.html        — single page, all sections
  css/
    style.css       — all styles
  js/
    main.js         — scroll animations, form handling
  assets/
    (icons/images as needed)
```

## Out of Scope

- No backend or database
- No authentication or dashboards
- No actual product functionality
- No pricing section (product doesn't exist yet)
- No blog or multi-page navigation
