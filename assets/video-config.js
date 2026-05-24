// Config for the video-submission wall (video-admin.html / video.html).
//
// Submissions come from the "World's Toughest Mudder Video Submission Form".
// The admin page auto-pulls them from the form's response spreadsheet.
//
// All you need is the response sheet shared as "Anyone with the link →
// Viewer" (no "Publish to web" step). Paste its normal share URL (or just
// the ID) below — the page reads it directly via the sheet's gviz endpoint.
export const VIDEO_SHEET =
  "https://docs.google.com/spreadsheets/d/1TdTK4DQI76S-hVfs5Gp8YbRgR97dvtl6mxsTTMZLCv8/edit?usp=sharing";

// Fallback only: if a browser ever blocks the gviz fetch (CORS), do
// File → Share → Publish to web → CSV on the sheet and paste that
// (…/pub?…output=csv) URL here. When set, it's used instead of VIDEO_SHEET.
export const VIDEO_SHEET_CSV_URL = "";

// Also required so the clips actually play: in Drive, share the form's
// "… (File responses)" folder as "Anyone with the link → Viewer". Uploaded
// files are private by default.

// How often the admin page re-checks the sheet for new submissions (seconds).
export const VIDEO_POLL_SECONDS = 30;
