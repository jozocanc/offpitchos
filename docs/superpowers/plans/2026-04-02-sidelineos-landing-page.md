# SidelineOS Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page waitlist landing site for SidelineOS with bold sporty styling, seven content sections, and email capture via Formspree.

**Architecture:** Single `index.html` page with external `css/style.css` and `js/main.js`. No build tools, no frameworks. CSS custom properties for theming. Formspree for email capture.

**Tech Stack:** Vanilla HTML, CSS (custom properties, grid, flexbox, keyframes), vanilla JS (IntersectionObserver, fetch API), Google Fonts (Inter), Formspree.

**Spec:** `docs/superpowers/specs/2026-04-02-sidelineos-landing-page-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `index.html` | All seven sections, semantic HTML structure, Google Fonts link, form markup |
| `css/style.css` | All styling: custom properties, layout, responsive breakpoints, animations, hover effects |
| `js/main.js` | Scroll fade-in (IntersectionObserver), form submission handler (fetch to Formspree), loading/success/error states |

---

## Task 1: Project scaffolding and HTML skeleton

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/main.js`

**Note:** The git repo is already initialized at `/Users/canci27/Desktop/sidelineos/`. All file paths are relative to that root.

- [ ] **Step 1: Create index.html with full semantic structure**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SidelineOS — The Operating System for Your Soccer Club</title>
    <meta name="description" content="AI-driven club operating system built for Directors of Coaching. Automate scheduling, communication, coach coverage, and player development.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <header class="hero" id="hero">
        <div class="hero__bg"></div>
        <div class="container">
            <h1 class="hero__title">THE OPERATING SYSTEM FOR YOUR SOCCER CLUB</h1>
            <p class="hero__subtitle">Built for Directors of Coaching to run their entire club in one place.</p>
            <form class="waitlist-form" id="hero-form">
                <label for="hero-email" class="sr-only">Email address</label>
                <input type="email" id="hero-email" name="email" placeholder="Enter your email" required>
                <button type="submit" class="btn btn--primary">Join the Waitlist</button>
            </form>
            <p class="form-message" id="hero-message" hidden></p>
        </div>
    </header>

    <main>
        <section class="problems" id="problems">
            <div class="container">
                <div class="problems__grid">
                    <div class="card card--problem">
                        <div class="card__icon">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        </div>
                        <h3 class="card__title">Drowning in Parent Emails</h3>
                        <p class="card__text">Hours spent answering the same questions about schedules, locations, and logistics every single week.</p>
                    </div>
                    <div class="card card--problem">
                        <div class="card__icon">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                        </div>
                        <h3 class="card__title">Juggling 5 Different Apps</h3>
                        <p class="card__text">TeamSnap for scheduling, GroupMe for chat, email for parents, spreadsheets for everything else.</p>
                    </div>
                    <div class="card card--problem">
                        <div class="card__icon">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                        <h3 class="card__title">Coach Coverage Chaos</h3>
                        <p class="card__text">A coach cancels last minute and you are scrambling to find a replacement through texts and calls.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="features" id="features">
            <div class="container">
                <h2 class="section-title">Everything Your Club Needs</h2>
                <div class="features__grid">
                    <div class="card card--feature">
                        <div class="card__icon">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </div>
                        <h3 class="card__title">AI Communication Hub</h3>
                        <p class="card__text">Emails, messages, and chats centralized. Common questions answered automatically. Urgent issues highlighted.</p>
                    </div>
                    <div class="card card--feature">
                        <div class="card__icon">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <h3 class="card__title">Automated Scheduling</h3>
                        <p class="card__text">Practices, games, cancellations, and changes pushed instantly to coaches, players, and parents with built-in maps.</p>
                    </div>
                    <div class="card card--feature">
                        <div class="card__icon">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
                        </div>
                        <h3 class="card__title">Coach Coverage System</h3>
                        <p class="card__text">Coaches mark unavailability. System finds qualified replacements automatically. DOC has full visibility.</p>
                    </div>
                    <div class="card card--feature">
                        <div class="card__icon">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                        <h3 class="card__title">Player Development Profiles</h3>
                        <p class="card__text">Positions, performance data, highlights, and voice-to-text coach feedback stored per player.</p>
                    </div>
                    <div class="card card--feature">
                        <div class="card__icon">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </div>
                        <h3 class="card__title">Camp & Revenue Tracking</h3>
                        <p class="card__text">Active, upcoming, and completed camps with registration counts and revenue tracking over time.</p>
                    </div>
                    <div class="card card--feature">
                        <div class="card__icon">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                        <h3 class="card__title">Parent & Player Portal</h3>
                        <p class="card__text">Clean, simple access to schedules, chat, travel info, camps, and attendance confirmation via push notification.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="how-it-works" id="how-it-works">
            <div class="container">
                <h2 class="section-title">How It Works</h2>
                <div class="steps">
                    <div class="step">
                        <div class="step__number">1</div>
                        <h3 class="step__title">Set Up Your Club</h3>
                        <p class="step__text">Add teams, coaches, players, and schedules.</p>
                    </div>
                    <div class="step__connector" aria-hidden="true"></div>
                    <div class="step">
                        <div class="step__number">2</div>
                        <h3 class="step__title">System Runs in the Background</h3>
                        <p class="step__text">AI handles communication, coverage, and notifications.</p>
                    </div>
                    <div class="step__connector" aria-hidden="true"></div>
                    <div class="step">
                        <div class="step__number">3</div>
                        <h3 class="step__title">You Focus on Coaching</h3>
                        <p class="step__text">Less admin, more development.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="tiers" id="who-its-for">
            <div class="container">
                <h2 class="section-title">Who It's For</h2>
                <div class="tiers__grid">
                    <div class="card card--tier card--tier-doc">
                        <h3 class="card__title">Director of Coaching</h3>
                        <p class="card__text">Full control. Centralized dashboard, voice-enabled commands, complete club visibility.</p>
                    </div>
                    <div class="card card--tier">
                        <h3 class="card__title">Coaches</h3>
                        <p class="card__text">Team-level access. Schedules, player profiles, attendance, availability management.</p>
                    </div>
                    <div class="card card--tier">
                        <h3 class="card__title">Parents & Players</h3>
                        <p class="card__text">Simple experience. Schedules, chat, attendance confirmation, camp info, travel recommendations.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="final-cta" id="waitlist">
            <div class="container">
                <h2 class="section-title">Be the First to Run Your Club Smarter</h2>
                <p class="final-cta__subtitle">Join the waitlist. Early access coming soon.</p>
                <form class="waitlist-form" id="footer-form">
                    <label for="footer-email" class="sr-only">Email address</label>
                    <input type="email" id="footer-email" name="email" placeholder="Enter your email" required>
                    <button type="submit" class="btn btn--primary">Join the Waitlist</button>
                </form>
                <p class="form-message" id="footer-message" hidden></p>
            </div>
        </section>
    </main>

    <footer class="site-footer">
        <div class="container">
            <div class="site-footer__inner">
                <p class="site-footer__logo">SidelineOS</p>
                <div class="site-footer__social" aria-label="Social media links">
                    <a href="#" aria-label="Twitter"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
                    <a href="#" aria-label="Instagram"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>
                </div>
                <p class="site-footer__copy">&copy; 2026 SidelineOS. All rights reserved.</p>
            </div>
        </div>
    </footer>

    <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create empty css/style.css**

Create `css/style.css` with a comment header:

```css
/* SidelineOS Landing Page Styles */
```

- [ ] **Step 3: Create empty js/main.js**

Create `js/main.js` with a comment header:

```js
// SidelineOS Landing Page Scripts
```

- [ ] **Step 4: Open index.html in browser and verify structure renders**

Run: `open index.html` (on macOS)
Expected: Unstyled but complete HTML content visible — all seven sections with correct text.

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css js/main.js
git commit -m "feat: add HTML skeleton with all seven sections"
```

---

## Task 2: CSS custom properties and base styles

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add CSS reset, custom properties, and base styles**

```css
/* SidelineOS Landing Page Styles */

/* === Reset & Base === */
*, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --color-dark: #0A1628;
    --color-dark-secondary: #12203A;
    --color-green: #00FF87;
    --color-white: #FFFFFF;
    --color-gray: #94A3B8;
    --color-green-glow: rgba(0, 255, 135, 0.4);

    --font-family: 'Inter', sans-serif;

    --container-max: 1200px;
    --section-padding: 100px 0;
    --section-padding-mobile: 60px 0;
}

html {
    scroll-behavior: smooth;
}

body {
    font-family: var(--font-family);
    background-color: var(--color-dark);
    color: var(--color-white);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
}

.container {
    max-width: var(--container-max);
    margin: 0 auto;
    padding: 0 24px;
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.section-title {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    text-align: center;
    margin-bottom: 60px;
}

/* === Buttons === */
.btn {
    font-family: var(--font-family);
    font-weight: 700;
    font-size: 1rem;
    border: none;
    cursor: pointer;
    transition: all 0.3s ease;
}

.btn--primary {
    background-color: var(--color-green);
    color: var(--color-dark);
    padding: 14px 32px;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.btn--primary:hover {
    box-shadow: 0 0 20px var(--color-green-glow);
    transform: translateY(-2px);
}

.btn--primary:focus-visible {
    outline: 2px solid var(--color-green);
    outline-offset: 3px;
}

/* === Waitlist Form === */
.waitlist-form {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
}

.waitlist-form input[type="email"] {
    font-family: var(--font-family);
    font-size: 1rem;
    padding: 14px 20px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 6px;
    background: var(--color-dark-secondary);
    color: var(--color-white);
    width: 320px;
    max-width: 100%;
}

.waitlist-form input[type="email"]::placeholder {
    color: var(--color-gray);
}

.waitlist-form input[type="email"]:focus-visible {
    outline: 2px solid var(--color-green);
    outline-offset: 1px;
}

.form-message {
    text-align: center;
    margin-top: 12px;
    font-size: 0.9rem;
}

.form-message--success {
    color: var(--color-green);
}

.form-message--error {
    color: #FF6B6B;
}
```

- [ ] **Step 2: Verify in browser**

Run: `open index.html`
Expected: Dark background, white Inter text, styled email input and green CTA button visible in hero and final CTA sections.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: add CSS custom properties, reset, base styles, form and button styles"
```

---

## Task 3: Hero section styling with animated background

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add hero styles and animated grid background**

Append to `css/style.css`:

```css
/* === Hero === */
.hero {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 120px 0 100px;
    overflow: hidden;
}

.hero__bg {
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(0, 255, 135, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 135, 0.05) 1px, transparent 1px);
    background-size: 60px 60px;
    animation: gridMove 20s linear infinite;
    z-index: 0;
}

@keyframes gridMove {
    0% { transform: translate(0, 0); }
    100% { transform: translate(60px, 60px); }
}

.hero .container {
    position: relative;
    z-index: 1;
}

.hero__title {
    font-size: clamp(2.5rem, 7vw, 5rem);
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: -0.02em;
    text-transform: uppercase;
    margin-bottom: 20px;
}

.hero__subtitle {
    font-size: clamp(1rem, 2vw, 1.25rem);
    color: var(--color-gray);
    margin-bottom: 40px;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
}
```

- [ ] **Step 2: Verify in browser**

Run: `open index.html`
Expected: Full-viewport hero with large bold headline, gray subtitle, email form centered, subtle green grid animating slowly in background.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: add hero section styling with animated grid background"
```

---

## Task 4: Problem statement and feature cards styling

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add problems section and card styles**

Append to `css/style.css`:

```css
/* === Problems === */
.problems {
    padding: var(--section-padding);
}

.problems__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
}

/* === Cards (shared) === */
.card {
    background: var(--color-dark-secondary);
    border-radius: 12px;
    padding: 32px;
    border: 1px solid rgba(148, 163, 184, 0.1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 30px rgba(0, 255, 135, 0.1);
}

.card__icon {
    color: var(--color-green);
    margin-bottom: 16px;
}

.card__title {
    font-size: 1.25rem;
    font-weight: 700;
    margin-bottom: 8px;
}

.card__text {
    color: var(--color-gray);
    font-size: 0.95rem;
    line-height: 1.6;
}

/* === Features === */
.features {
    padding: var(--section-padding);
    background: var(--color-dark-secondary);
}

.features__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
}

.card--feature {
    background: var(--color-dark);
}
```

- [ ] **Step 2: Verify in browser**

Run: `open index.html`
Expected: Three problem cards in a row with icons, hover lift effect. Six feature cards in a 3x2 grid on dark background.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: add problem statement and feature card grid styles"
```

---

## Task 5: How It Works and Who It's For styles

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add How It Works and tiers styles**

Append to `css/style.css`:

```css
/* === How It Works === */
.how-it-works {
    padding: var(--section-padding);
}

.steps {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
}

.step {
    text-align: center;
    flex: 1;
    max-width: 280px;
    padding: 0 20px;
}

.step__number {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--color-green);
    color: var(--color-dark);
    font-weight: 900;
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
}

.step__title {
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 8px;
}

.step__text {
    color: var(--color-gray);
    font-size: 0.9rem;
}

.step__connector {
    width: 60px;
    height: 2px;
    background: linear-gradient(90deg, var(--color-green), transparent);
    flex-shrink: 0;
}

/* === Tiers / Who It's For === */
.tiers {
    padding: var(--section-padding);
    background: var(--color-dark-secondary);
}

.tiers__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    align-items: start;
}

.card--tier {
    background: var(--color-dark);
    text-align: center;
    padding: 40px 32px;
}

.card--tier-doc {
    border: 2px solid var(--color-green);
    position: relative;
    transform: scale(1.05);
}

.card--tier-doc::before {
    content: 'COMMAND CENTER';
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-green);
    color: var(--color-dark);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    padding: 4px 14px;
    border-radius: 20px;
}
```

- [ ] **Step 2: Verify in browser**

Run: `open index.html`
Expected: How It Works shows 3 numbered circles with connector lines. Who It's For shows 3 tier cards with DOC card larger and green-bordered with "COMMAND CENTER" badge.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: add how-it-works and tiers section styles"
```

---

## Task 6: Final CTA and Footer styles

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add Final CTA and footer styles**

Append to `css/style.css`:

```css
/* === Final CTA === */
.final-cta {
    padding: var(--section-padding);
    text-align: center;
}

.final-cta__subtitle {
    color: var(--color-gray);
    font-size: 1.1rem;
    margin-bottom: 32px;
}

/* === Footer === */
.site-footer {
    padding: 40px 0;
    border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.site-footer__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
}

.site-footer__logo {
    font-weight: 800;
    font-size: 1.1rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.site-footer__social {
    display: flex;
    gap: 16px;
}

.site-footer__social a {
    color: var(--color-gray);
    transition: color 0.3s ease;
}

.site-footer__social a:hover {
    color: var(--color-green);
}

.site-footer__social a:focus-visible {
    outline: 2px solid var(--color-green);
    outline-offset: 3px;
    border-radius: 2px;
}

.site-footer__copy {
    color: var(--color-gray);
    font-size: 0.8rem;
}
```

- [ ] **Step 2: Verify in browser**

Run: `open index.html`
Expected: Final CTA has centered headline, subtitle, and form. Footer has logo, social icons, copyright in one row.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: add final CTA and footer styles"
```

---

## Task 7: Responsive styles

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add responsive breakpoints**

Append to `css/style.css`:

```css
/* === Responsive === */

/* Tablet */
@media (max-width: 768px) {
    :root {
        --section-padding: 70px 0;
    }

    .problems__grid,
    .features__grid,
    .tiers__grid {
        grid-template-columns: repeat(2, 1fr);
    }

    .steps {
        flex-direction: column;
        gap: 24px;
    }

    .step__connector {
        width: 2px;
        height: 40px;
        background: linear-gradient(180deg, var(--color-green), transparent);
    }

    .card--tier-doc {
        transform: scale(1);
    }

    .site-footer__inner {
        flex-direction: column;
        text-align: center;
    }
}

/* Mobile */
@media (max-width: 480px) {
    :root {
        --section-padding: 50px 0;
    }

    .problems__grid,
    .features__grid,
    .tiers__grid {
        grid-template-columns: 1fr;
    }

    .waitlist-form {
        flex-direction: column;
        align-items: center;
    }

    .waitlist-form input[type="email"] {
        width: 100%;
    }

    .waitlist-form .btn {
        width: 100%;
    }
}
```

- [ ] **Step 2: Verify responsive behavior**

Open browser dev tools, test at 768px and 480px widths.
Expected: Cards stack to 2-col at tablet, 1-col at mobile. Steps stack vertically. Form goes full-width on mobile.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: add responsive breakpoints for tablet and mobile"
```

---

## Task 8: JavaScript — scroll fade-in and form handling

**Files:**
- Modify: `js/main.js`
- Modify: `css/style.css`

- [ ] **Step 1: Add fade-in CSS classes to style.css**

Append to `css/style.css`:

```css
/* === Scroll Fade-In (paired with JS IntersectionObserver) === */
.fade-in {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s ease, transform 0.6s ease;
}

.fade-in.visible {
    opacity: 1;
    transform: translateY(0);
}
```

- [ ] **Step 2: Add IntersectionObserver for scroll fade-in**

Write `js/main.js`:

```js
// SidelineOS Landing Page Scripts

// === Scroll Fade-In ===
document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll(
        '.problems, .features, .how-it-works, .tiers, .final-cta'
    );

    sections.forEach(section => section.classList.add('fade-in'));

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 }
    );

    sections.forEach(section => observer.observe(section));
});
```

- [ ] **Step 3: Verify in browser**

Scroll down the page.
Expected: Each section fades in smoothly when scrolled into view.

- [ ] **Step 4: Add form submission handler with email validation**

Append to `js/main.js`:

```js
// === Waitlist Form Handling ===
// IMPORTANT: Replace YOUR_FORM_ID with your actual Formspree form ID.
// Create one at https://formspree.io (free tier works).
const FORMSPREE_URL = 'https://formspree.io/f/YOUR_FORM_ID';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function handleFormSubmit(form, messageEl) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = form.querySelector('input[type="email"]');
        const submitBtn = form.querySelector('button[type="submit"]');
        const email = emailInput.value.trim();

        if (!email || !EMAIL_REGEX.test(email)) {
            messageEl.hidden = false;
            messageEl.textContent = 'Please enter a valid email address.';
            messageEl.className = 'form-message form-message--error';
            return;
        }

        // Loading state
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;
        messageEl.hidden = true;

        try {
            const response = await fetch(FORMSPREE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ email }),
            });

            if (response.ok) {
                form.hidden = true;
                messageEl.hidden = false;
                messageEl.textContent = "You're on the list! We'll be in touch soon.";
                messageEl.className = 'form-message form-message--success';
            } else {
                throw new Error('Submit failed');
            }
        } catch {
            messageEl.hidden = false;
            messageEl.textContent = 'Something went wrong. Please try again.';
            messageEl.className = 'form-message form-message--error';
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

const heroForm = document.getElementById('hero-form');
const heroMessage = document.getElementById('hero-message');
const footerForm = document.getElementById('footer-form');
const footerMessage = document.getElementById('footer-message');

if (heroForm) handleFormSubmit(heroForm, heroMessage);
if (footerForm) handleFormSubmit(footerForm, footerMessage);
```

- [ ] **Step 5: Verify form behavior**

Test in browser: submit email in hero form.
Expected: Button changes to "Submitting...", then (since Formspree ID is placeholder) shows error message "Something went wrong. Please try again." Button re-enables. Also test with invalid email like "notanemail" — should show "Please enter a valid email address."

- [ ] **Step 6: Commit**

```bash
git add js/main.js css/style.css
git commit -m "feat: add scroll fade-in animations and waitlist form handler with validation"
```

---

## Task 9: Final verification and cleanup

**Files:**
- Review: `index.html`, `css/style.css`, `js/main.js`

- [ ] **Step 1: Full page walkthrough**

Open `index.html` in browser. Verify all seven sections render correctly:
1. Hero: headline, subtitle, form, animated grid background
2. Problems: 3 cards with icons, hover effects
3. Features: 6 cards in grid, hover effects
4. How It Works: 3 steps with connectors
5. Who It's For: 3 tier cards, DOC card prominent
6. Final CTA: headline, subtitle, form
7. Footer: logo, social icons, copyright

- [ ] **Step 2: Test responsive**

Resize browser or use dev tools: 768px and 480px. Verify grids stack correctly, form goes full-width on mobile.

- [ ] **Step 3: Test interactions**

- Hover cards: lift + glow
- Hover CTA button: glow
- Scroll: sections fade in
- Tab through: visible focus outlines on inputs, buttons, links
- Open browser console (Cmd+Option+J): verify zero JS errors on page load and scroll

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final landing page verification complete"
```

**Note:** Replace `YOUR_FORM_ID` in `js/main.js` with a real Formspree form ID when ready to collect emails. Create one at https://formspree.io.
