import {
  configured,
  watchSocial,
  setSocialPost,
  removeSocialPost,
  watchControl,
  writeControl,
} from "./firebase.js";

const $ = (id) => document.getElementById(id);
const urlInput = $("url");
const statusEl = $("status");
const grid = $("grid");

const banner = $("fb-banner");
if (configured) {
  banner.textContent = "Live — the post you Show goes to the wall.";
  banner.className = "banner ok";
} else {
  banner.textContent =
    "Preview mode — Firebase not configured (see README). Nothing will sync.";
  banner.className = "banner warn";
}

// Pull the post type (p/reel/tv) and shortcode out of an Instagram URL.
function parseInstagram(url) {
  const m = String(url).match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? { type: m[1].toLowerCase(), code: m[2] } : null;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "msg" + (kind ? " " + kind : "");
}

$("add").addEventListener("click", () => {
  const parsed = parseInstagram(urlInput.value);
  if (!parsed) {
    setStatus("That doesn't look like an Instagram post or reel link.", "error");
    return;
  }
  setSocialPost(parsed.code, {
    type: parsed.type,
    code: parsed.code,
    url: `https://www.instagram.com/${parsed.type}/${parsed.code}/`,
    addedAt: new Date().toISOString(),
  });
  urlInput.value = "";
  setStatus("Added.", "ok");
});

let posts = [];
let activeCode = null;

function render() {
  grid.innerHTML = "";
  if (posts.length === 0) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = "No posts added yet.";
    grid.appendChild(note);
    return;
  }
  for (const p of posts) {
    const isActive = p.code === activeCode;
    const card = document.createElement("div");
    card.className = "post-card" + (isActive ? " active" : "");

    const frame = document.createElement("iframe");
    frame.className = "preview";
    frame.src = `https://www.instagram.com/${p.type}/${p.code}/embed`;
    frame.setAttribute("scrolling", "no");
    frame.loading = "lazy";

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const showBtn = document.createElement("button");
    showBtn.type = "button";
    showBtn.className = "show-btn" + (isActive ? " on" : "");
    showBtn.textContent = isActive ? "● On wall" : "Show on wall";
    showBtn.addEventListener("click", () =>
      writeControl("socialPost", { type: p.type, code: p.code }),
    );

    const x = document.createElement("button");
    x.type = "button";
    x.className = "x-btn";
    x.textContent = "×";
    x.title = "Remove";
    x.addEventListener("click", () => {
      removeSocialPost(p.code);
      if (p.code === activeCode) writeControl("socialPost", null);
    });

    actions.append(showBtn, x);
    card.append(frame, actions);
    grid.appendChild(card);
  }
}

watchSocial((obj) => {
  posts = Object.values(obj || {}).sort((a, b) =>
    String(a.addedAt).localeCompare(String(b.addedAt)),
  );
  render();
});

watchControl("socialPost", (val) => {
  activeCode = val && val.code ? val.code : null;
  render();
});
