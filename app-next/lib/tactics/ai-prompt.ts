/**
 * AI prompt construction for Tactics Board drill generation.
 * System prompt + few-shot examples are marked for prompt caching so they
 * only cost creation tokens on the first call; subsequent calls read from
 * Anthropic's ephemeral cache at ~10% of the creation price.
 */

export const SYSTEM_PROMPT_TEXT = `You are a professional soccer coach designing training drills as structured diagrams.

## Coordinate System

- x axis = 0 … length_m, runs goal-to-goal (0 = own goal end, length_m = opponent goal end).
- y axis = 0 … width_m, runs across sidelines (0 = left touchline, width_m = right touchline).
- All coordinates are in metres, field-relative.
- Standard field dimensions: small-sided / rondo area ≈ 20×15 m; half-field ≈ 68×52.5 m; full field = 68×105 m.
- Penalty area at each end: 16.5 m deep × 40.3 m wide, centred on width (y = (width_m - 40.3)/2 … y = (width_m + 40.3)/2).
- Goal area (6-yard box): 5.5 m deep × 18.3 m wide, centred on width.
- Center spot: x = length_m/2, y = width_m/2.
- Center circle radius: 9.15 m.

## Object Schema (TypeScript types — single source of truth)

type BoardObject =
  | { id: string; type: 'player'; x: number; y: number; role: 'red'|'blue'|'neutral'|'outside'|'gk'|'coach'; number?: number; position?: string }
  | { id: string; type: 'cone';   x: number; y: number; color: 'orange'|'yellow'|'red'|'blue'|'white' }
  | { id: string; type: 'ball';   x: number; y: number }
  | { id: string; type: 'goal';   x: number; y: number; variant: 'mini-h'|'mini-v'|'full'; rotation?: number }
  | { id: string; type: 'arrow';  points: number[]; style: 'pass'|'run'|'free'; thickness?: number }
  | { id: string; type: 'zone';   x: number; y: number; width: number; height: number; color: string; opacity: number; label?: string }
  | { id: string; type: 'zone-line'; points: [number, number, number, number]; color: string }

type Field = {
  width_m: number; length_m: number; units: 'm'|'yd';
  orientation: 'horizontal'|'vertical'; half_field: boolean; style: 'schematic'|'realistic';
}

type DrillDoc = { field: Field; objects: BoardObject[] }

IDs can be short strings like "p1", "c1", "a1" — the server regenerates them.

## Color Conventions

- Attacking team players: role "red"
- Defending team players: role "blue"
- Neutrals / floaters (rondos, possession): role "neutral" (gray)
- Outside / wall / bounce players on perimeter: role "outside" (darker gray)
- Goalkeepers: role "gk" (yellow)
- Coach figure: role "coach" (black)
- Arrows: style "pass" = red solid line (ball movement), style "run" = blue dashed line (player movement), style "free" = yellow (generic direction / play direction)
- Zones: use hex colors #3b82f6 (blue), #ef4444 (red), #fde047 (yellow), #22c55e (green); opacity 0.2–0.3

## Drill Design Conventions

- Rondos: tight circle or square of outer players, 1–2 defenders inside; ball circulates on perimeter. Use a zone to mark the area.
- Rondo with outside (bounce) players: outer players on edges of rectangle, 2 defenders inside, neutral/outside players on sides outside the main zone.
- Build-up play: starts from own half. GK at own goal, 3–4 defenders spread wide, 2 CMs between thirds, 1–2 forwards pressing high.
- Pressing / counter-pressing: defending team applies coordinated pressure. Show arrows converging on ball-carrier. Use zones to mark pressing triggers.
- High pressing: attacking team's forwards press opponent CBs immediately after losing possession near opponent goal.
- Wing play: LB / RB overlapping wide players. Crossing arrows into the box. Striker movement arrows inside the box.
- Finishing drills: multiple attackers converging on goal from different angles. Arrows show runs. Ball starts from a wide or midfield feeder.
- SSG (small-sided game): compact area (20–40 m wide, 25–50 m long). Two teams, mini-goals on both ends. Simple layout.
- Transition drills: two phases — attack → lose ball → immediate counter (or vice versa). Two groups, directional arrows.

## Output Format

Respond with ONLY a valid JSON object matching the DrillDoc type.
- No markdown code fences.
- No prose before or after the JSON.
- No comments inside the JSON.
- Validate mentally: every object must have "id" and "type"; coordinates must be within field bounds; "color" fields on zones must be #rrggbb hex.
- If drill type or player count is ambiguous, choose a sensible default and proceed.`

// ─── Few-shot examples ────────────────────────────────────────────────────────
// 8 examples — one per major drill category.
// Format: alternating user/assistant messages, passed as conversation history.

export const FEW_SHOT_MESSAGES: { role: 'user' | 'assistant'; content: string }[] = [
  // ── 1. Classic 5v2 Rondo ────────────────────────────────────────────────────
  {
    role: 'user',
    content: '5v2 rondo, tight square, middle of training area',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      field: { width_m: 15, length_m: 20, units: 'm', orientation: 'horizontal', half_field: false, style: 'schematic' },
      objects: [
        // Zone marking the rondo square
        { id: 'z1', type: 'zone', x: 4, y: 4, width: 12, height: 7, color: '#22c55e', opacity: 0.15, label: 'Rondo area' },
        // 5 outer players (red) at corners + top centre
        { id: 'p1', type: 'player', x: 4,  y: 4,   role: 'red', number: 1 },
        { id: 'p2', type: 'player', x: 10, y: 4,   role: 'red', number: 2 },
        { id: 'p3', type: 'player', x: 16, y: 4,   role: 'red', number: 3 },
        { id: 'p4', type: 'player', x: 4,  y: 11,  role: 'red', number: 4 },
        { id: 'p5', type: 'player', x: 16, y: 11,  role: 'red', number: 5 },
        // 2 defenders (blue) inside
        { id: 'p6', type: 'player', x: 9,  y: 6.5, role: 'blue', number: 1 },
        { id: 'p7', type: 'player', x: 11, y: 9,   role: 'blue', number: 2 },
        // Ball starts with top-left player
        { id: 'b1', type: 'ball', x: 4.5, y: 4.5 },
        // Example pass arrows showing circulation
        { id: 'a1', type: 'arrow', points: [4.5, 4.5, 10.5, 4.5], style: 'pass', thickness: 2 },
        { id: 'a2', type: 'arrow', points: [10.5, 4.5, 16.5, 4.5], style: 'pass', thickness: 2 },
      ],
    }),
  },

  // ── 2. Rondo with outside (bounce) players — 4v2 + 3 neutrals on edges ─────
  {
    role: 'user',
    content: '4v2 rondo in a 10x10 box with 3 neutral outside bounce players on the edges',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      field: { width_m: 20, length_m: 25, units: 'm', orientation: 'horizontal', half_field: false, style: 'schematic' },
      objects: [
        // Central rondo zone
        { id: 'z1', type: 'zone', x: 7.5, y: 5, width: 10, height: 10, color: '#3b82f6', opacity: 0.12, label: '4v2 box' },
        // 4 red players on corners of the box
        { id: 'p1', type: 'player', x: 7.5,  y: 5,  role: 'red', number: 1 },
        { id: 'p2', type: 'player', x: 17.5, y: 5,  role: 'red', number: 2 },
        { id: 'p3', type: 'player', x: 7.5,  y: 15, role: 'red', number: 3 },
        { id: 'p4', type: 'player', x: 17.5, y: 15, role: 'red', number: 4 },
        // 2 blue defenders in the middle
        { id: 'p5', type: 'player', x: 11, y: 9,  role: 'blue', number: 1 },
        { id: 'p6', type: 'player', x: 14, y: 11, role: 'blue', number: 2 },
        // 3 outside/neutral players on edges of the field (bounce players)
        { id: 'p7', type: 'player', x: 3,  y: 10, role: 'outside', position: 'Out' },
        { id: 'p8', type: 'player', x: 12.5, y: 1, role: 'outside', position: 'Out' },
        { id: 'p9', type: 'player', x: 22, y: 10, role: 'outside', position: 'Out' },
        // Ball
        { id: 'b1', type: 'ball', x: 8, y: 5.5 },
        // Pass to outside player and back
        { id: 'a1', type: 'arrow', points: [8, 5.5, 3.5, 10], style: 'pass', thickness: 2 },
        { id: 'a2', type: 'arrow', points: [3.5, 10, 8, 14.5], style: 'pass', thickness: 2 },
      ],
    }),
  },

  // ── 3. Build-up play (GK + 4 defenders + 2 CMs vs 2 pressing forwards) ─────
  {
    role: 'user',
    content: 'Build-up from the back: GK, 4 defenders, 2 central midfielders building out against 2 pressing forwards on a half field',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      field: { width_m: 68, length_m: 52.5, units: 'm', orientation: 'horizontal', half_field: true, style: 'schematic' },
      objects: [
        // Build-up zone (own half)
        { id: 'z1', type: 'zone', x: 0, y: 0, width: 35, height: 68, color: '#22c55e', opacity: 0.08, label: 'Build-up zone' },
        // GK
        { id: 'p1', type: 'player', x: 2,  y: 34, role: 'gk', position: 'GK' },
        // 4 defenders spread across back line
        { id: 'p2', type: 'player', x: 10, y: 12, role: 'red', position: 'LB', number: 3 },
        { id: 'p3', type: 'player', x: 10, y: 26, role: 'red', position: 'CB', number: 4 },
        { id: 'p4', type: 'player', x: 10, y: 42, role: 'red', position: 'CB', number: 5 },
        { id: 'p5', type: 'player', x: 10, y: 56, role: 'red', position: 'RB', number: 2 },
        // 2 CMs in the middle third
        { id: 'p6', type: 'player', x: 24, y: 28, role: 'red', position: 'CM', number: 6 },
        { id: 'p7', type: 'player', x: 24, y: 40, role: 'red', position: 'CM', number: 8 },
        // 2 pressing forwards (blue) high up
        { id: 'p8', type: 'player', x: 20, y: 26, role: 'blue', number: 9 },
        { id: 'p9', type: 'player', x: 20, y: 42, role: 'blue', number: 10 },
        // Full goal at own end
        { id: 'g1', type: 'goal', x: 0, y: 34, variant: 'full', rotation: 0 },
        // Ball starts with GK
        { id: 'b1', type: 'ball', x: 3, y: 34 },
        // GK plays to CB
        { id: 'a1', type: 'arrow', points: [3, 34, 10.5, 26.5], style: 'pass', thickness: 2 },
        // CB switches to RB
        { id: 'a2', type: 'arrow', points: [10.5, 26.5, 10.5, 56], style: 'pass', thickness: 2 },
        // CM offers as option
        { id: 'a3', type: 'arrow', points: [24.5, 27.5, 18, 27.5], style: 'run', thickness: 2 },
        // Pressure arrows from blue forwards
        { id: 'a4', type: 'arrow', points: [20, 26.5, 11, 26.5], style: 'run', thickness: 1 },
        { id: 'a5', type: 'arrow', points: [20, 42, 11, 42], style: 'run', thickness: 1 },
      ],
    }),
  },

  // ── 4. Midfield pressing (4-3-3 pressing 4-4-2 build-up) ───────────────────
  {
    role: 'user',
    content: 'Midfield pressing drill: 4-3-3 high pressing against a 4-4-2 in build-up. Show the pressing triggers and cover shadows on a full pitch.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      field: { width_m: 68, length_m: 105, units: 'm', orientation: 'horizontal', half_field: false, style: 'schematic' },
      objects: [
        // Pressing trigger zone — opponent half
        { id: 'z1', type: 'zone', x: 0, y: 0, width: 45, height: 68, color: '#ef4444', opacity: 0.08, label: 'Press zone' },
        // ── Pressing team (red, 4-3-3) ──
        // GK
        { id: 'p1', type: 'player', x: 100, y: 34, role: 'gk', position: 'GK' },
        // Back 4
        { id: 'p2', type: 'player', x: 75, y: 10, role: 'red', position: 'LB', number: 3 },
        { id: 'p3', type: 'player', x: 75, y: 25, role: 'red', position: 'CB', number: 4 },
        { id: 'p4', type: 'player', x: 75, y: 43, role: 'red', position: 'CB', number: 5 },
        { id: 'p5', type: 'player', x: 75, y: 58, role: 'red', position: 'RB', number: 2 },
        // Midfield 3
        { id: 'p6', type: 'player', x: 55, y: 20, role: 'red', position: 'CM', number: 8 },
        { id: 'p7', type: 'player', x: 55, y: 34, role: 'red', position: 'DM', number: 6 },
        { id: 'p8', type: 'player', x: 55, y: 48, role: 'red', position: 'CM', number: 10 },
        // Front 3
        { id: 'p9',  type: 'player', x: 38, y: 15, role: 'red', position: 'LW', number: 11 },
        { id: 'p10', type: 'player', x: 35, y: 34, role: 'red', position: 'CF', number: 9 },
        { id: 'p11', type: 'player', x: 38, y: 53, role: 'red', position: 'RW', number: 7 },
        // ── Pressing target team (blue, 4-4-2 in build-up) ──
        { id: 'p12', type: 'player', x: 5,  y: 34, role: 'gk', position: 'GK' },
        { id: 'p13', type: 'player', x: 12, y: 10, role: 'blue', position: 'LB', number: 3 },
        { id: 'p14', type: 'player', x: 12, y: 25, role: 'blue', position: 'CB', number: 4 },
        { id: 'p15', type: 'player', x: 12, y: 43, role: 'blue', position: 'CB', number: 5 },
        { id: 'p16', type: 'player', x: 12, y: 58, role: 'blue', position: 'RB', number: 2 },
        { id: 'p17', type: 'player', x: 28, y: 20, role: 'blue', position: 'LM', number: 11 },
        { id: 'p18', type: 'player', x: 28, y: 34, role: 'blue', position: 'CM', number: 6 },
        { id: 'p19', type: 'player', x: 28, y: 48, role: 'blue', position: 'CM', number: 8 },
        { id: 'p20', type: 'player', x: 28, y: 58, role: 'blue', position: 'RM', number: 7 },
        { id: 'p21', type: 'player', x: 38, y: 28, role: 'blue', number: 9 },
        { id: 'p22', type: 'player', x: 38, y: 40, role: 'blue', number: 10 },
        // Ball with blue CB
        { id: 'b1', type: 'ball', x: 12.5, y: 25.5 },
        // Pressing arrows — red forwards press blue CBs
        { id: 'a1', type: 'arrow', points: [35, 34, 20, 31], style: 'run', thickness: 2 },
        { id: 'a2', type: 'arrow', points: [38, 15, 16, 15], style: 'run', thickness: 2 },
        { id: 'a3', type: 'arrow', points: [38, 53, 16, 53], style: 'run', thickness: 2 },
        // Cover shadow line
        { id: 'zl1', type: 'zone-line', points: [28, 20, 20, 25], color: '#ef4444' },
      ],
    }),
  },

  // ── 5. High pressing — forwards press opponent CBs ──────────────────────────
  {
    role: 'user',
    content: 'High pressing: 3 forwards press the opponent 3 CBs immediately after losing possession near the opponent half. Show pressing angles and cover shadows.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      field: { width_m: 68, length_m: 52.5, units: 'm', orientation: 'horizontal', half_field: true, style: 'schematic' },
      objects: [
        // High press zone
        { id: 'z1', type: 'zone', x: 0, y: 0, width: 25, height: 68, color: '#ef4444', opacity: 0.12, label: 'High press zone' },
        // Opponent back 3 (blue) with ball
        { id: 'p1', type: 'player', x: 8,  y: 15, role: 'blue', position: 'CB', number: 4 },
        { id: 'p2', type: 'player', x: 8,  y: 34, role: 'blue', position: 'CB', number: 5 },
        { id: 'p3', type: 'player', x: 8,  y: 53, role: 'blue', position: 'CB', number: 6 },
        { id: 'p4', type: 'player', x: 3,  y: 34, role: 'gk', position: 'GK' },
        // Ball with center CB
        { id: 'b1', type: 'ball', x: 8.5, y: 34.5 },
        // 3 red forwards pressing
        { id: 'p5', type: 'player', x: 18, y: 15, role: 'red', position: 'LW', number: 11 },
        { id: 'p6', type: 'player', x: 18, y: 34, role: 'red', position: 'CF', number: 9 },
        { id: 'p7', type: 'player', x: 18, y: 53, role: 'red', position: 'RW', number: 7 },
        // Pressing arrows converging on ball-carrying CB
        { id: 'a1', type: 'arrow', points: [18, 15, 10, 22], style: 'run', thickness: 3 },
        { id: 'a2', type: 'arrow', points: [18, 34, 10, 34], style: 'run', thickness: 3 },
        { id: 'a3', type: 'arrow', points: [18, 53, 10, 46], style: 'run', thickness: 3 },
        // Cover shadow lines blocking passing lanes
        { id: 'zl1', type: 'zone-line', points: [18, 15, 12, 30], color: '#ef4444' },
        { id: 'zl2', type: 'zone-line', points: [18, 53, 12, 38], color: '#ef4444' },
        // Full goal at opponent end
        { id: 'g1', type: 'goal', x: 0, y: 34, variant: 'full' },
      ],
    }),
  },

  // ── 6. Wing play — LB overlapping LW, cross into box ───────────────────────
  {
    role: 'user',
    content: 'Wing play drill: LB overlaps LW on the left flank, LW cuts inside, LB delivers a cross into the box where 2 strikers make runs.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      field: { width_m: 68, length_m: 52.5, units: 'm', orientation: 'horizontal', half_field: true, style: 'schematic' },
      objects: [
        // Full goal at the top (opponent goal)
        { id: 'g1', type: 'goal', x: 52.5, y: 34, variant: 'full' },
        // Penalty area zone
        { id: 'z1', type: 'zone', x: 36, y: 13.85, width: 16.5, height: 40.3, color: '#3b82f6', opacity: 0.08, label: 'Penalty area' },
        // LB starts wide left
        { id: 'p1', type: 'player', x: 18, y: 5, role: 'red', position: 'LB', number: 3 },
        // LW with ball
        { id: 'p2', type: 'player', x: 30, y: 8, role: 'red', position: 'LW', number: 11 },
        // 2 strikers in the box
        { id: 'p3', type: 'player', x: 42, y: 22, role: 'red', position: 'CF', number: 9 },
        { id: 'p4', type: 'player', x: 42, y: 38, role: 'red', position: 'SS', number: 10 },
        // Opposing fullback
        { id: 'p5', type: 'player', x: 34, y: 10, role: 'blue', position: 'RB', number: 2 },
        // Ball with LW
        { id: 'b1', type: 'ball', x: 30.5, y: 8.5 },
        // LB overlapping run
        { id: 'a1', type: 'arrow', points: [18, 5, 36, 5], style: 'run', thickness: 2 },
        // LW cuts inside
        { id: 'a2', type: 'arrow', points: [30, 8, 38, 20], style: 'run', thickness: 2 },
        // LB receives and delivers cross
        { id: 'a3', type: 'arrow', points: [30, 8, 36, 5], style: 'pass', thickness: 2 },
        { id: 'a4', type: 'arrow', points: [36, 5, 44, 24], style: 'pass', thickness: 2 },
        // Striker runs into the box
        { id: 'a5', type: 'arrow', points: [42, 22, 48, 30], style: 'run', thickness: 2 },
        { id: 'a6', type: 'arrow', points: [42, 38, 48, 34], style: 'run', thickness: 2 },
      ],
    }),
  },

  // ── 7. Finishing drill — 3 strikers from different angles ───────────────────
  {
    role: 'user',
    content: 'Finishing drill: 3 strikers attack from different angles — one central, one from left, one from right. A feeder plays the ball from midfield. Coach on the left side.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      field: { width_m: 68, length_m: 40, units: 'm', orientation: 'horizontal', half_field: false, style: 'schematic' },
      objects: [
        // Full goal
        { id: 'g1', type: 'goal', x: 38, y: 34, variant: 'full' },
        // Penalty area zone
        { id: 'z1', type: 'zone', x: 21.5, y: 13.85, width: 16.5, height: 40.3, color: '#fde047', opacity: 0.12, label: 'Finishing zone' },
        // GK in goal
        { id: 'p1', type: 'player', x: 37, y: 34, role: 'gk', position: 'GK' },
        // Feeder in midfield
        { id: 'p2', type: 'player', x: 10, y: 34, role: 'neutral', position: 'Feed' },
        // 3 strikers at starting positions
        { id: 'p3', type: 'player', x: 16, y: 20, role: 'red', position: 'LW', number: 11 },
        { id: 'p4', type: 'player', x: 16, y: 34, role: 'red', position: 'CF', number: 9 },
        { id: 'p5', type: 'player', x: 16, y: 48, role: 'red', position: 'RW', number: 7 },
        // Coach on left side
        { id: 'p6', type: 'player', x: 5,  y: 10, role: 'coach' },
        // Balls stacked near feeder
        { id: 'b1', type: 'ball', x: 10.5, y: 35.5 },
        { id: 'b2', type: 'ball', x: 11.5, y: 36.5 },
        // Feeder plays ball to central striker
        { id: 'a1', type: 'arrow', points: [10.5, 34.5, 16.5, 34.5], style: 'pass', thickness: 2 },
        // Striker runs from left → goal
        { id: 'a2', type: 'arrow', points: [16, 20, 26, 27], style: 'run', thickness: 2 },
        { id: 'a3', type: 'arrow', points: [26, 27, 34, 28], style: 'free', thickness: 2 },
        // Striker run from right → goal
        { id: 'a4', type: 'arrow', points: [16, 48, 26, 41], style: 'run', thickness: 2 },
        { id: 'a5', type: 'arrow', points: [26, 41, 34, 38], style: 'free', thickness: 2 },
        // Central striker's shot
        { id: 'a6', type: 'arrow', points: [16.5, 34.5, 34, 34], style: 'run', thickness: 2 },
        // Cones marking starting positions
        { id: 'c1', type: 'cone', x: 15, y: 19, color: 'orange' },
        { id: 'c2', type: 'cone', x: 15, y: 33, color: 'orange' },
        { id: 'c3', type: 'cone', x: 15, y: 47, color: 'orange' },
      ],
    }),
  },

  // ── 8. Small-sided game — 4v4 + GKs with mini-goals ───────────────────────
  {
    role: 'user',
    content: 'Small-sided game: 4v4 with goalkeepers on a compact field (35m x 25m), mini-goals at each end.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      field: { width_m: 25, length_m: 35, units: 'm', orientation: 'horizontal', half_field: false, style: 'schematic' },
      objects: [
        // Mini-goals at each end
        { id: 'g1', type: 'goal', x: 0,  y: 12.5, variant: 'mini-h' },
        { id: 'g2', type: 'goal', x: 35, y: 12.5, variant: 'mini-h', rotation: 180 },
        // Full field zone
        { id: 'z1', type: 'zone', x: 0, y: 0, width: 35, height: 25, color: '#22c55e', opacity: 0.05 },
        // ── Red team (4 outfield + GK) ──
        { id: 'p1', type: 'player', x: 2,  y: 12.5, role: 'gk', position: 'GK' },
        { id: 'p2', type: 'player', x: 8,  y: 6,   role: 'red', number: 2 },
        { id: 'p3', type: 'player', x: 8,  y: 19,  role: 'red', number: 3 },
        { id: 'p4', type: 'player', x: 15, y: 9,   role: 'red', number: 6 },
        { id: 'p5', type: 'player', x: 15, y: 16,  role: 'red', number: 9 },
        // ── Blue team (4 outfield + GK) ──
        { id: 'p6', type: 'player', x: 33, y: 12.5, role: 'gk', position: 'GK' },
        { id: 'p7', type: 'player', x: 27, y: 6,   role: 'blue', number: 2 },
        { id: 'p8', type: 'player', x: 27, y: 19,  role: 'blue', number: 3 },
        { id: 'p9', type: 'player', x: 20, y: 9,   role: 'blue', number: 6 },
        { id: 'p10', type: 'player', x: 20, y: 16, role: 'blue', number: 9 },
        // Ball in the center
        { id: 'b1', type: 'ball', x: 17.5, y: 12.5 },
      ],
    }),
  },
]

/**
 * Claude system messages array with cache_control on both the system prompt
 * and the few-shot examples.  The caller passes this directly as the `system`
 * parameter.  Because both blocks are marked ephemeral they share the same
 * 5-minute TTL; a second call within that window gets a cache hit and pays
 * only the read price (~10 % of creation).
 */
export const SYSTEM_PROMPT_CACHED_MESSAGES: Array<{
  type: 'text'
  text: string
  cache_control: { type: 'ephemeral' }
}> = [
  {
    type: 'text',
    text: SYSTEM_PROMPT_TEXT,
    cache_control: { type: 'ephemeral' },
  },
  {
    type: 'text',
    text:
      'The following are examples of valid drill descriptions and their corresponding DrillDoc JSON. ' +
      'Use them as reference for coordinate placement, player count, and arrow style.\n\n' +
      FEW_SHOT_MESSAGES.map(
        (m, i) =>
          `${m.role === 'user' ? `EXAMPLE ${Math.floor(i / 2) + 1} — User prompt` : 'Expected JSON output'}:\n${m.content}`,
      ).join('\n\n'),
    cache_control: { type: 'ephemeral' },
  },
]
