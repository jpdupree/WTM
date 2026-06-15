import { watchControl } from "./firebase.js";

const stage = document.getElementById("stage");
const emptyEl = document.getElementById("empty");

// Instagram's embed page pops a "Never miss a post" login modal ~25-30s after
// load. We keep two overlaid iframes: one is shown, one is hidden being
// refreshed. We swap them on a timer well before the modal can surface on the
// visible one, so the audience never sees a reload flash or the login prompt.
const REFRESH_MS = 18_000;
// IG's load event fires when the embed HTML lands; the post content needs a
// beat more to actually render. Wait before crossfading in the back buffer.
const READY_DELAY_MS = 1500;

let refreshTimer = null;
let currentSrc = null;
let frameA = null;
let frameB = null;
let visibleFrame = null;

function clearAll() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  currentSrc = null;
  frameA = frameB = visibleFrame = null;
  stage.innerHTML = "";
}

function makeFrame(src) {
  const f = document.createElement("iframe");
  f.className = "ig-frame";
  f.setAttribute("scrolling", "no");
  f.allow = "encrypted-media";
  f.src = src;
  return f;
}

// Reload whichever frame is currently hidden, then crossfade to it.
function rotate() {
  if (!currentSrc) return;
  const hidden = visibleFrame === frameA ? frameB : frameA;
  const showing = visibleFrame;
  hidden.addEventListener(
    "load",
    () => {
      setTimeout(() => {
        if (!currentSrc) return; // post was cleared mid-flight
        hidden.classList.add("show");
        showing.classList.remove("show");
        visibleFrame = hidden;
      }, READY_DELAY_MS);
    },
    { once: true },
  );
  hidden.src = currentSrc;
}

// Shows the post the commentator picked on the Social Wall control page.
watchControl("socialPost", (val) => {
  clearAll();
  if (!val || !val.code) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  currentSrc = `https://www.instagram.com/${val.type || "p"}/${val.code}/embed`;

  const post = document.createElement("div");
  post.className = "post";
  frameA = makeFrame(currentSrc);
  frameB = makeFrame(currentSrc);
  frameA.classList.add("show");
  visibleFrame = frameA;
  // White box over the embed's non-working "View profile" button.
  const cover = document.createElement("div");
  cover.className = "vp-cover";
  post.append(frameA, frameB, cover);
  stage.appendChild(post);

  refreshTimer = setInterval(rotate, REFRESH_MS);
});
