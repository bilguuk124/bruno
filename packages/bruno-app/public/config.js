// Runtime configuration, read by the app before the bundle loads.
//
// This default is empty: the desktop app and an unconfigured web build start
// with no pinned backend (Preferences -> Connection lets the user set one).
//
// To pin the backend for a managed distribution, replace the body with:
//
//   window.__NEWTON_CONFIG__ = {
//     backendUrl: "https://api.newton.example.com",
//     lockBackendUrl: true   // false in pre-prod to keep the field editable
//   };
//
// For the Electron build this file ships inside the app (resources/.../web/
// config.js) and can be edited post-install; a web deployment has its hosting
// server template it at container start.
window.__NEWTON_CONFIG__ = window.__NEWTON_CONFIG__ || {};
