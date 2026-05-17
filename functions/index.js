// OwnTracks -> Firebase bridge. Camera operators run the OwnTracks app
// in HTTP mode pointed at this function; each location post is mirrored
// into /rabbits/<tid> so the dashboard maps show the camera live, even
// while the operator's phone is using another app.
//
// Deploy:  firebase deploy --only functions   (project must be on Blaze)

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

initializeApp();

// OwnTracks Tracker IDs (tid) -> camera names. Keep this in sync with
// the camera list the operators are given (assets/rabbits.js).
const CAMERAS = {
  c1: "Cam 1",
  c2: "Cam 2",
  c3: "Cam 3",
  c4: "Cam 4",
  c5: "Cam 5",
  c6: "Cam 6",
};

exports.rabbit = onRequest(async (req, res) => {
  const b = req.body || {};
  if (
    b._type === "location" &&
    typeof b.lat === "number" &&
    typeof b.lon === "number"
  ) {
    const tid = String(b.tid || "").trim().toLowerCase();
    if (tid) {
      await getDatabase()
        .ref("rabbits/" + tid)
        .set({
          name: CAMERAS[tid] || "Cam " + tid,
          lat: b.lat,
          lng: b.lon,
          acc: Math.round(b.acc || 0),
          at: new Date(b.tst ? b.tst * 1000 : Date.now()).toISOString(),
        });
    }
  }
  // OwnTracks expects a JSON array response.
  res.json([]);
});
