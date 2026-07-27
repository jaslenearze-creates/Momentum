/**
 * Momentum — Gmail to Task Suggestions
 *
 * Scans recent Gmail, asks Gemini to pull out genuinely actionable items,
 * and writes them to a Google Sheet. Runs entirely inside your own Google
 * account — no separate server, no OAuth app to register. First run will
 * ask you to approve the script accessing your own Gmail/Sheets; that's
 * Google's normal consent screen for your own script, not a third party.
 *
 * Setup: see SETUP.md in this folder.
 */

const CONFIG = {
  GMAIL_SEARCH: 'newer_than:3d -label:momentum-processed', // which emails to scan each run
  MAX_THREADS: 15,                                          // cap per run, keeps it fast + cheap
  PROCESSED_LABEL: 'momentum-processed',                    // stops re-scanning the same emails
  SHEET_NAME: 'Momentum Task Suggestions',
  GEMINI_MODEL: 'gemini-2.0-flash'                          // if this errors, check the current model name at aistudio.google.com
};

function generateTasksFromGmail() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing API key. Project Settings (gear icon) > Script Properties > add GEMINI_API_KEY.');
  }

  const label = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  const threads = GmailApp.search(CONFIG.GMAIL_SEARCH, 0, CONFIG.MAX_THREADS);
  if (!threads.length) {
    Logger.log('No new emails matched CONFIG.GMAIL_SEARCH.');
    return;
  }

  const emails = threads.map(t => {
    const msg = t.getMessages()[t.getMessages().length - 1];
    return {
      subject: t.getFirstMessageSubject(),
      from: msg.getFrom(),
      body: msg.getPlainBody().slice(0, 800)
    };
  });

  const tasks = callGemini_(apiKey, emails);
  if (tasks.length) writeTasksToSheet_(tasks);

  threads.forEach(t => t.addLabel(label));
  Logger.log(`Processed ${threads.length} email(s), found ${tasks.length} task suggestion(s).`);
  Logger.log('Sheet: ' + getOrCreateSheet_().getParent().getUrl());
}

function callGemini_(apiKey, emails) {
  const prompt = `You help someone with ADHD turn emails into a short task list.
Read these emails and pull out only genuinely actionable items (things the person needs to DO — reply, pay, book, renew, complete a form, respond by a deadline).
Skip newsletters, marketing, receipts with nothing to action, and anything purely informational.
Return ONLY valid JSON — an array of objects, nothing else, no markdown fences:
[{"title": "short actionable task in imperative form", "source": "the email subject it came from", "notes": "one short line of context, or empty string"}]
If nothing is actionable, return [].

EMAILS:
${emails.map((e, i) => `--- Email ${i + 1} ---\nFrom: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body}`).join('\n\n')}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    }),
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  if (status !== 200) {
    Logger.log(`Gemini API error ${status}: ${res.getContentText()}`);
    throw new Error(`Gemini API error ${status} — check your API key, and check CONFIG.GEMINI_MODEL is still a valid model name at aistudio.google.com.`);
  }

  const data = JSON.parse(res.getContentText());
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text) || '[]';
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    Logger.log('Could not parse Gemini response as JSON:\n' + text);
    return [];
  }
}

function writeTasksToSheet_(tasks) {
  const sheet = getOrCreateSheet_();
  const existingTitles = sheet.getDataRange().getValues().slice(1).map(r => r[1]);
  const now = new Date();
  tasks.forEach(t => {
    if (!t.title || existingTitles.includes(t.title)) return; // skip empty/duplicate
    sheet.appendRow([now, t.title, t.source || '', t.notes || '', 'new']);
  });
}

function getOrCreateSheet_() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  const ssId = props.getProperty('SHEET_ID');
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.SHEET_NAME);
    props.setProperty('SHEET_ID', ss.getId());
    Logger.log('Created new sheet: ' + ss.getUrl());
  }
  let sheet = ss.getSheetByName('Tasks') || ss.insertSheet('Tasks');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date found', 'Task', 'From email', 'Notes', 'Status']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
