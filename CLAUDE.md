# Momentum — ADHD-friendly daily task app

Single-user task/goal app. No backend, no build step. Ships as a static site
(GitHub Pages) and can also be pasted into a Claude Artifact for quick preview.

## Files

- `index.html` — the entire app: inline CSS + inline JS, one file. All UI, state
  management, and rendering logic lives here. There is no bundler/build step —
  edit it directly and reload.
- `manifest.json` — PWA manifest (installable "Add to Home Screen").
- `sw.js` — service worker: caches the app shell for offline use, network-first
  for `index.html` so updates roll out promptly, cache-first for static assets.
- `icons/` — app icons (192, 512, 512-maskable, 180/apple-touch), plus two
  header/branding assets built from the same source: `logo-mark.png`
  (transparent-background trim of just the M artwork, used inline in the
  header wordmark) and `og-image.png` (1200×630 social share preview — M mark
  + "omentum" wordmark in Georgia Bold Italic + tagline, same purple gradient).
  All built from a user-supplied "M" sticker artwork composited onto the app's
  actual purple accent gradient (`--accent` → `--accent-strong`), via a one-off
  Pillow script (chroma-keys the white sticker background to transparent,
  trims to content, composites per size — maskable gets extra padding for the
  safe zone, the apple-touch icon is flattened opaque since iOS doesn't handle
  alpha there). Committed to the repo; regenerate from the source PNG (not
  committed — lives outside the repo) if the artwork ever changes.
  The header itself (`.brand h1`) renders the M as an inline `<img>` followed
  by "omentum" in Georgia Bold Italic, so together they read "Momentum" with a
  graphic first letter — the `<h1>` carries `aria-label="Momentum"` with both
  children `aria-hidden` so screen readers get the plain word, not "M omentum".
- `google-apps-script/` — a separate, optional piece: a Gmail → Gemini →
  Google Sheet task-suggestion script. Runs entirely inside the user's own
  Google account (no server, no OAuth app registration). Not wired into
  Momentum — it produces a Sheet the user reviews and copies from manually,
  by design, since a browser app can't be written into by an external script.
  See `google-apps-script/SETUP.md` for the deploy steps (must be done by the
  user directly in script.google.com — this can't be automated from here).

## Data model (localStorage key: `momentum-adhd-app-v1`)

```
state = {
  version: 1,
  tasks: [{
    id, title, notes, energy: null|"low"|"focus",
    scheduledDate: null|"YYYY-MM-DD",   // set via Calendar view
    inToday: boolean,                    // manually pulled into Today
    order: number,                       // sort key within Today
    completed, completedAt, createdAt,
    subtasks: [{ id, title, completed }]
  }],
  habits: [{
    id, title, freq: "daily"|"weekly", weekdays: [0-6],
    history: { "YYYY-MM-DD": true },     // one entry per day completed
    createdAt
  }],  // seeded with 4 defaults (Shower, Call mum, Take supplements, Plan
       // today's tasks) via defaultHabits() on a genuinely first-ever load
       // (no existing localStorage key at all) — a returning user's saved
       // habits (even []) always win, this never overwrites real data.
  timerSessions: [{ id, taskId, taskTitle, durationSec, completedAt }], // logged when a focus timer runs to completion; feeds Insights
  settings: {
    theme: "auto"|"light"|"dark",
    shareReminderDays: 0|1|7|14,         // 0 = off
    lastShareAt, lastBackupAt, lastReminderShownDate, lastQuoteShownDate
  }
}
```

Task objects also carry `delegatedTo` / `delegatedEmail` (both `""` by default) —
used only to pre-fill a `mailto:` draft, no accounts or sync involved. The `taskDelegateEmail`
field is `type="email"` and validated with `isValidEmail()` before being used as a mailto
recipient — an invalid/non-email value (e.g. a note typed into the wrong field) opens with a
blank "To:" rather than silently stuffing garbage into it. Tasks also carry
`delegationLog: [{ id, at, type: "email"|"copy"|"note", detail }]` — every "Draft an email" or
"Copy message" action logs itself automatically (an honest audit trail of chasing), and the
same log accepts free-text manual notes via its own input, newest entry first.

`state.cycle = { periods: [{ id, startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD"|null }] }`
— period cycle tracker. Fully local, included in the JSON backup like everything
else in `state`. `computeCycleStats()` derives cycle day, average cycle length,
and a predicted next start; all estimates, explicitly labeled as such in the UI
(not medical advice).

Photos are **not** in `state` — they're stored separately in IndexedDB
(`momentum-photos-db`, store `photos`, keyed by id with a `taskId` index) since
localStorage can't hold binary blobs at any real size. Images are downscaled to
max 1280px / JPEG q0.8 on capture (`resizeImageFile`) to keep storage sane.
`photoCounts` is an in-memory cache (task id → count) refreshed after any photo
mutation, used for the 📷 chip on task cards — cheap because IndexedDB access is
async and card rendering isn't. Export/import round-trips photos too: on export
each blob is base64-encoded into the JSON (`photos: [...]`); on import they're
decoded back to blobs and bulk-inserted, so a full backup restore also restores
photos, not just tasks.

Motivational quotes are cached separately under localStorage key
`momentum-quotes-cache-v1` (not part of the exported backup — it's disposable,
refetched from `https://type.fit/api/quotes` at most every 30 days, with a
~20-quote embedded fallback if that fetch fails or the device is offline).

Key derived logic (not stored, computed on render):
- **"Is this task in Today?"** = `task.inToday || task.scheduledDate === today`.
  Scheduling something for today via the Calendar tab auto-surfaces it in Today
  without a separate flag.
- **Streaks are soft.** `computeStreak()` walks backward from today and allows
  exactly one gap day before stopping — missing a single day doesn't zero the
  streak, per the "visible momentum, not guilt" design principle.
- Today has no hard cap. 3–5 items is the *intended* size (quick-capture always
  lands in Backlog, never Today, to keep it curated), but going over just shows
  a soft "that's a full day" note rather than blocking.

## Testing locally

Service workers require `http://` (or `https://`), not `file://`. Serve the
folder with any static server, e.g.:

```bash
python3 -m http.server 8935
```

then open `http://localhost:8935/index.html`.

## Feature notes

- **Time-blindness accommodation**: persistent clock in the header, plus a
  focus timer (FAB, bottom-right) with a circular countdown, presets, and a
  synthesized chime (Web Audio, no audio files) on completion.
- **Task-paralysis accommodation**: subtasks are one tap away on every task
  card, and the subtask input in the task modal stays focused after each
  Enter so a whole breakdown can be typed in one go without re-clicking.
- **Habit chain-add**: same rapid-entry pattern as subtasks — the "New
  recurring habit" modal doesn't close after Create/Enter, it clears and
  refocuses the title field, so several daily habits can be added in one
  sitting without reopening the modal each time.
- **Share/export**: "Share today's log" (header) builds a plain-text summary
  (clipboard) or a canvas-rendered PNG "receipt" card — for sending progress
  to an accountability partner or therapist. This is separate from data
  persistence, which is automatic (see below).
- **Data safety**: every mutation calls `save()` → `localStorage.setItem`
  immediately; there is no manual save step. A small green "saved" pulse near
  the clock confirms this visually. Because storage is device-local, Settings
  (⚙️) also offers a manual JSON export/import for backup/device transfer, and
  an optional soft in-app reminder to send a share log periodically (never a
  push notification — this app has no backend to send one from).
- **Delegation**: tag a task with a name (+ optional email) and one tap opens
  a pre-filled `mailto:` draft (title, notes, subtasks included). No accounts,
  no live sync — the other person just gets an email.
- **Insights tab**: 7-day completion bar chart, focus-minutes-by-task (from
  `timerSessions`), and "took a while to get to" (completedAt − createdAt).
  Framed as pattern-noticing, not a scoreboard — keep any future additions to
  this tab in that spirit (no red flags, no comparisons to other days).
- **Voice capture**: mic button next to quick-capture uses the browser's
  built-in `SpeechRecognition` API (free, on-device or browser-vendor STT, no
  API key). Transcript is split into multiple tasks on commas/"and"/"then".
  Button self-hides on browsers without `SpeechRecognition` support.
- **Motivational quote**: shows once automatically per day (gradient overlay,
  full brand palette), plus on demand via the ✨ header button. Picks
  without-replacement from the cached pool so it won't repeat until the pool
  is exhausted, then reshuffles.
- **Photos**: attach photos to any task (camera or gallery, via
  `<input type=file capture>`). Stored in IndexedDB, not localStorage — see
  data model notes above. Tap a thumbnail for a full-screen preview.
- **Cycle tab**: simple period tracker — log start/end, see current cycle day
  and a rough next-period estimate. Explicitly labeled as an estimate, not
  medical advice; explicitly says on-device-only in the UI itself, since this
  is more sensitive than task data.
- **"Ask Claude to help write this"** (in the delegate section): opens
  `https://claude.ai/new?q=...` in a new tab with the task pre-filled as a
  prompt. This is a convenience shortcut, not real integration — like the
  mailto draft, the user has to copy the result back manually. No app can
  write into another app's data from client-side JS; don't build anything
  that implies otherwise without an actual backend (see deferred section).

## Explicitly deferred

Deep project hierarchies (e.g. Gantt charts) and anything resembling
budget/compliance tracking are still out of scope — they reintroduce exactly
the complexity this app exists to avoid. (Lightweight "delegate via email" is
now built, per above; that's different from real multi-user collaboration,
which is still deferred.)

Gmail-in-app and an AI assistant that can read/write task data both require a
real backend (server to hold API/OAuth credentials — a static file can't do
this safely) plus, for Gmail, a registered Google OAuth app. Neither is
built. If picked up later, scope it as its own project: hosting choice,
Anthropic API key + usage costs, Google Cloud OAuth consent screen, and a
security pass on how the backend stores tokens — don't bolt credentials into
`index.html`.

