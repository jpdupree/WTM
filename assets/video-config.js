// Config for the video-submission wall (video-admin.html / video.html).
//
// Submissions come from the "World's Toughest Mudder Video Submission Form".
// The admin page auto-pulls them from the form's response sheet, published
// as CSV. To get that URL:
//
//   1. Open the form → Responses tab → click the green Sheets icon to link
//      (or create) the response spreadsheet.
//   2. In that spreadsheet: File → Share → Publish to web → pick the
//      responses sheet/tab, choose "Comma-separated values (.csv)" → Publish.
//   3. Copy the published link (it ends in /pub?...output=csv) and paste it
//      below.
//
// Also required: the uploaded videos are private by default. In Drive, share
// the form's "… (File responses)" folder as "Anyone with the link → Viewer"
// so the clips can play on the public on-air page.
//
// Leave the URL blank to disable auto-pull — the crew can still add clips by
// pasting a Drive link on the admin page.
export const VIDEO_SHEET_CSV_URL = "";

// How often the admin page re-checks the sheet for new submissions (seconds).
export const VIDEO_POLL_SECONDS = 30;
