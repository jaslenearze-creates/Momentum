# Gmail → Task Suggestions (Google Apps Script)

Scans your recent Gmail, asks Gemini which emails are actually actionable, and
writes them to a Google Sheet. Runs inside your own Google account — nothing
hosted, nothing to pay for hosting, no OAuth app to register.

This does **not** write into Momentum automatically — browsers isolate each
site's storage, so nothing outside Momentum can reach into it. This gives you
a clean task list in a Sheet you can glance at (on phone or desktop) and copy
anything useful into Momentum via voice capture or typing.

## Setup (about 10 minutes)

1. **Get a free Gemini API key**: go to [aistudio.google.com](https://aistudio.google.com),
   sign in with the same Google account, click "Get API key" → "Create API key".
   Copy it.

2. **Create the script**: go to [script.google.com](https://script.google.com) →
   "New project". Delete the placeholder code in `Code.gs` and paste in the
   contents of `gmail-to-tasks.gs` from this folder.

3. **Add your API key**: in the Apps Script editor, click the gear icon
   ("Project Settings") on the left → scroll to "Script Properties" →
   "Add script property" → name it `GEMINI_API_KEY`, paste your key as the
   value → Save.

4. **Run it once**: back in the editor, pick `generateTasksFromGmail` from the
   function dropdown at the top, click "Run". The first run will show
   Google's own permission screen ("This app isn't verified" is expected for
   your own personal script) — click "Advanced" → "Go to (your project name)"
   → "Allow". This is your account granting your own script access to your
   own Gmail and Sheets, not a third party.

5. **Find the sheet**: after it runs, check "Executions" (clock icon on the
   left) or `View > Logs` for a line like `Created new sheet: https://docs.google.com/...`
   — that's your task list. It's also just called **"Momentum Task
   Suggestions"** in your Google Drive / Sheets.

6. **Make it run automatically**: click the alarm-clock icon ("Triggers") on
   the left → "Add Trigger" → function: `generateTasksFromGmail` → event
   source: "Time-driven" → "Day timer" → pick a time (e.g. 7–8am). Now it
   checks your inbox every morning without you doing anything.

## Tuning it

Edit the `CONFIG` block at the top of `gmail-to-tasks.gs`:
- `GMAIL_SEARCH` — which emails to scan (default: last 3 days, skips anything
  already processed). Uses normal Gmail search syntax.
- `MAX_THREADS` — cap per run, keeps it fast and keeps API usage light.
- `GEMINI_MODEL` — if you get a "model not found" error, the model name has
  likely changed; check the current one at aistudio.google.com and update it here.

## Cost

Gemini's API has a free tier that should comfortably cover this at personal-inbox
volume (once a day, ~15 emails). Worth a glance at current limits/pricing at
[ai.google.dev](https://ai.google.dev) if you scale up the frequency or volume.

## Known limitations

- Only sees emails matching `GMAIL_SEARCH` at run time — it's not real-time.
- No write-back into Momentum (see note above) — this is a suggestions list,
  not automation. Closing that loop (e.g. Momentum fetching a published CSV
  of this sheet) is a reasonable next step once you've seen whether the
  suggestions themselves are actually useful.
- Health/period data has no path into this at all — that's a Health Connect
  (on-device Android) limitation, unrelated to Gmail access. See the note in
  the main project's `CLAUDE.md`.
