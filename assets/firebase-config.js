// Firebase web config — paste the values from your Firebase project:
// Project settings -> General -> Your apps -> Web app -> SDK setup.
//
// These values are NOT secret. Firebase web config is meant to ship in
// client code; access is controlled by Realtime Database rules, not by
// keeping these hidden. Safe to commit, even in a public repo.
//
// Leave databaseURL empty to run the pages in preview mode (no live sync).

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  appId: "",
};
