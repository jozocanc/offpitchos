# OffPitchOS Plan A: Project Scaffold + Database

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Next.js 14 project with Supabase, Tailwind CSS (branded), and the complete database schema with RLS policies.

**Architecture:** Next.js 14 App Router project in `app-next/` directory (separate from the static landing page in the repo root). Supabase provides Postgres database and auth. Tailwind CSS configured with OffPitchOS brand tokens. Database schema includes clubs, teams, profiles, team_members, and invites tables with row-level security.

**Tech Stack:** Next.js 14, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Tailwind CSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-02-offpitchos-auth-setup-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `app-next/package.json` | Dependencies and scripts |
| `app-next/tsconfig.json` | TypeScript config |
| `app-next/tailwind.config.ts` | Tailwind with OffPitchOS brand tokens |
| `app-next/app/globals.css` | Tailwind directives + base styles |
| `app-next/app/layout.tsx` | Root layout with Inter font |
| `app-next/app/page.tsx` | Root page (temporary "it works" page) |
| `app-next/lib/supabase/client.ts` | Browser-side Supabase client |
| `app-next/lib/supabase/server.ts` | Server-side Supabase client |
| `app-next/lib/constants.ts` | Role definitions, age groups |
| `app-next/.env.local.example` | Environment variable template |
| `supabase/migrations/001_initial_schema.sql` | All tables, constraints, triggers, RLS policies |

---

## Task 1: Initialize Next.js project with TypeScript

**Files:**
- Create: `app-next/` (entire Next.js scaffold)

- [ ] **Step 1: Create Next.js project**

Run from `/Users/canci27/Desktop/offpitchos/`:

```bash
npx create-next-app@latest app-next --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```

When prompted, accept defaults. This creates the full Next.js scaffold.

- [ ] **Step 2: Verify it runs**

```bash
cd app-next && npm run dev
```

Open `http://localhost:3000` — should see the default Next.js page.
Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos
git add app-next/
git commit -m "feat: initialize Next.js 14 project with TypeScript and Tailwind"
```

---

## Task 2: Configure Tailwind with OffPitchOS brand tokens

**Files:**
- Modify: `app-next/tailwind.config.ts`
- Modify: `app-next/app/globals.css`

- [ ] **Step 1: Update tailwind.config.ts with brand tokens**

Replace `app-next/tailwind.config.ts` with:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          DEFAULT: "#0A1628",
          secondary: "#12203A",
        },
        green: {
          DEFAULT: "#00FF87",
          glow: "rgba(0, 255, 135, 0.4)",
        },
        gray: {
          DEFAULT: "#94A3B8",
        },
        red: {
          DEFAULT: "#FF6B6B",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Update globals.css with base styles**

Replace `app-next/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-dark text-white font-sans antialiased;
  }
}
```

- [ ] **Step 3: Update root layout with Inter font**

Replace `app-next/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OffPitchOS",
  description: "AI-driven club operating system for soccer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Create a test page to verify branding**

Replace `app-next/app/page.tsx` with:

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-black uppercase tracking-tight mb-4">
          Sideline<span className="text-green">OS</span>
        </h1>
        <p className="text-gray text-lg">App scaffold ready</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verify in browser**

```bash
cd app-next && npm run dev
```

Open `http://localhost:3000`. Expected: dark navy background, "OffPitchOS" in white with "OS" in electric green, "App scaffold ready" in gray. Stop server.

- [ ] **Step 6: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos
git add app-next/
git commit -m "feat: configure Tailwind with OffPitchOS brand tokens and base styles"
```

---

## Task 3: Install Supabase dependencies and create client helpers

**Files:**
- Modify: `app-next/package.json` (via npm install)
- Create: `app-next/lib/supabase/client.ts`
- Create: `app-next/lib/supabase/server.ts`
- Create: `app-next/.env.local.example`

- [ ] **Step 1: Install Supabase packages**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Create .env.local.example**

Create `app-next/.env.local.example`:

```
# Supabase (public - safe for client-side)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Supabase (secret - server-side only, never expose to client)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

- [ ] **Step 3: Create browser Supabase client**

Create `app-next/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Create server Supabase client**

Create `app-next/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 5: Create constants file**

Create `app-next/lib/constants.ts`:

```ts
export const ROLES = {
  DOC: "doc",
  COACH: "coach",
  PARENT: "parent",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const AGE_GROUPS = [
  "U8", "U9", "U10", "U11", "U12", "U13",
  "U14", "U15", "U16", "U17", "U18", "U19",
] as const;

export type AgeGroup = (typeof AGE_GROUPS)[number];
```

- [ ] **Step 6: Add .env.local to .gitignore**

Append to `app-next/.gitignore`:

```
.env.local
```

- [ ] **Step 7: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos
git add app-next/
git commit -m "feat: add Supabase client helpers and constants"
```

---

## Task 4: Create database migration with full schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create migrations directory**

```bash
mkdir -p /Users/canci27/Desktop/offpitchos/supabase/migrations
```

- [ ] **Step 2: Write the migration SQL**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- OffPitchOS Initial Schema
-- Tables: clubs, teams, profiles, team_members, invites
-- Includes: constraints, triggers, RLS policies

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  age_group text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES clubs(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('doc', 'coach', 'parent')),
  display_name text NOT NULL DEFAULT '',
  onboarding_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('coach', 'parent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, profile_id)
);

CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  email text,
  role text NOT NULL CHECK (role IN ('coach', 'parent')),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_teams_club_id ON teams(club_id);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_club_id ON profiles(club_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_profile_id ON team_members(profile_id);
CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_club_id ON invites(club_id);
CREATE INDEX idx_invites_email ON invites(email);

-- ============================================
-- TRIGGERS: auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW-LEVEL SECURITY
-- ============================================

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- --- CLUBS ---

-- DOC can read/write their own club
CREATE POLICY clubs_doc_all ON clubs
  FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Coaches and parents can read their club
CREATE POLICY clubs_members_read ON clubs
  FOR SELECT
  USING (
    id IN (SELECT club_id FROM profiles WHERE user_id = auth.uid())
  );

-- --- TEAMS ---

-- DOC can CRUD teams in their club
CREATE POLICY teams_doc_all ON teams
  FOR ALL
  USING (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  )
  WITH CHECK (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  );

-- Coaches/parents can read teams they belong to
CREATE POLICY teams_members_read ON teams
  FOR SELECT
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  );

-- --- PROFILES ---

-- Users can read their own profile
CREATE POLICY profiles_own_read ON profiles
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own profile
CREATE POLICY profiles_own_update ON profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can insert their own profile (signup/onboarding)
CREATE POLICY profiles_own_insert ON profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- DOC can read all profiles in their club
CREATE POLICY profiles_doc_read ON profiles
  FOR SELECT
  USING (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  );

-- --- TEAM_MEMBERS ---

-- DOC can CRUD team members in their club
CREATE POLICY team_members_doc_all ON team_members
  FOR ALL
  USING (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN clubs c ON t.club_id = c.id
      WHERE c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN clubs c ON t.club_id = c.id
      WHERE c.created_by = auth.uid()
    )
  );

-- Coaches/parents can read their own team memberships
CREATE POLICY team_members_own_read ON team_members
  FOR SELECT
  USING (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- --- INVITES ---

-- DOC can CRUD invites for their club
CREATE POLICY invites_doc_all ON invites
  FOR ALL
  USING (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  )
  WITH CHECK (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  );

-- Note: Invite lookup by token is handled via a server-side RPC function
-- to prevent enumeration of all pending invites. No public SELECT policy
-- is needed on this table. The server uses the service role key to look up
-- invites by token directly.

-- RPC function for secure token lookup
CREATE OR REPLACE FUNCTION get_invite_by_token(invite_token uuid)
RETURNS TABLE (
  id uuid,
  club_id uuid,
  team_id uuid,
  email text,
  role text,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, club_id, team_id, email, role, status, expires_at
  FROM invites
  WHERE token = invite_token
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;
$$;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos
git add supabase/
git commit -m "feat: add database migration with full schema, indexes, triggers, and RLS policies"
```

---

## Task 5: Set up Supabase project and apply migration

**Files:**
- Create: `app-next/.env.local` (from template, with real values)

- [ ] **Step 1: Create Supabase project**

Go to [supabase.com/dashboard](https://supabase.com/dashboard):
1. Click "New Project"
2. Name: "offpitchos"
3. Set a database password (save it somewhere safe)
4. Region: choose closest to you
5. Click "Create project"
6. Wait for it to provision

- [ ] **Step 2: Get Supabase credentials**

In the Supabase dashboard, go to Settings → API:
- Copy the **Project URL** (e.g., `https://xxxxx.supabase.co`)
- Copy the **anon public** key

- [ ] **Step 3: Create .env.local with real values**

Create `app-next/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace with your actual values from Step 2.

- [ ] **Step 4: Apply the migration**

In the Supabase dashboard, go to SQL Editor:
1. Click "New query"
2. Copy and paste the entire contents of `supabase/migrations/001_initial_schema.sql`
3. Click "Run"
4. Verify: go to Table Editor — should see 5 tables: `clubs`, `teams`, `profiles`, `team_members`, `invites`

- [ ] **Step 5: Enable Google OAuth in Supabase**

In Supabase dashboard → Authentication → Providers:
1. Enable Google
2. You'll need a Google OAuth client ID and secret from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
3. Create OAuth 2.0 Client ID → Web application
4. Authorized redirect URI: `https://your-project-id.supabase.co/auth/v1/callback`
5. Copy Client ID and Client Secret into Supabase Google provider settings
6. Save

**Note:** This step can be done later if you want to test with email/password first. Google OAuth is not required for the scaffold to work.

- [ ] **Step 6: Verify the app connects to Supabase**

Update `app-next/app/page.tsx` temporarily to test the connection:

```tsx
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clubs").select("count");

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-black uppercase tracking-tight mb-4">
          Sideline<span className="text-green">OS</span>
        </h1>
        <p className="text-gray text-lg">
          {error ? `DB Error: ${error.message}` : "Connected to Supabase ✓"}
        </p>
      </div>
    </main>
  );
}
```

```bash
cd app-next && npm run dev
```

Open `http://localhost:3000`. Expected: "Connected to Supabase ✓" in gray text. If you see a DB error, check your `.env.local` values.

- [ ] **Step 7: Revert page.tsx to simple version**

Replace back to the simple version (no DB query on homepage):

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-black uppercase tracking-tight mb-4">
          Sideline<span className="text-green">OS</span>
        </h1>
        <p className="text-gray text-lg">App scaffold ready</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos
git add app-next/.env.local.example app-next/app/page.tsx
git commit -m "feat: verify Supabase connection and finalize scaffold"
```

**Note:** Do NOT commit `.env.local` — it contains secrets. Only `.env.local.example` is committed.

---

## Summary

After completing all 5 tasks, you will have:
- A working Next.js 14 project at `app-next/`
- Tailwind CSS configured with OffPitchOS brand colors
- Supabase client helpers (browser + server)
- Complete database schema with 5 tables, indexes, triggers, and RLS
- A running app connected to Supabase

**Next plan:** Plan B — Auth + Middleware (login/signup pages, Google OAuth, route protection)
