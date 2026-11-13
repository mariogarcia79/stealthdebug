// Applies the theme before the first paint (no flash of the wrong theme).
// A separate file because the CSP allows no inline scripts. The choice is
// "dark" (default), "light" or "system", stored under "theme"; the React
// side (src/theme.tsx) keeps it in sync afterwards.
(function () {
  var choice = "dark";
  try { choice = localStorage.getItem("theme") || "dark"; } catch (e) { /* storage blocked */ }
  var light = choice === "light" || (choice === "system" && !!window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
})();
