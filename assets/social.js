import { watchControl } from "./firebase.js";

const stage = document.getElementById("stage");
const emptyEl = document.getElementById("empty");

// Instagram's embed page pops a "Never miss a post" login modal ~25-30s after
// load. Reloading the iframe a hair sooner keeps the modal at bay; on-air the
// reload is a brief white flash.
const REFRESH_MS = 20_000;
let refreshTimer = null;
function clearRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// Shows the post the commentator picked on the Social Wall control page.
watchControl("socialPost", (val) => {
  clearRefresh();
  if (!val || !val.code) {
    stage.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  const post = document.createElement("div");
  post.className = "post";
  const iframe = document.createElement("iframe");
  iframe.className = "ig-frame";
  const src = `https://www.instagram.com/${val.type || "p"}/${val.code}/embed`;
  iframe.src = src;
  iframe.setAttribute("scrolling", "no");
  iframe.allow = "encrypted-media";
  // White box over the embed's non-working "View profile" button.
  const cover = document.createElement("div");
  cover.className = "vp-cover";
  post.append(iframe, cover);
  stage.innerHTML = "";
  stage.appendChild(post);
  refreshTimer = setInterval(() => {
    iframe.src = src;
  }, REFRESH_MS);
});
