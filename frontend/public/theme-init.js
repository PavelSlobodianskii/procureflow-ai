// Runs before the page is painted, so a returning visitor never sees a flash of the wrong theme.
// Reads only this browser's saved choice (localStorage) or the system setting. No network, no tracking.
(function () {
  try {
    var theme = window.localStorage.getItem("procureflow.theme");
    if (theme !== "light" && theme !== "dark") {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    var language = window.localStorage.getItem("procureflow.language");
    if (language === "en" || language === "de" || language === "ru" || language === "es") {
      document.documentElement.setAttribute("lang", language);
    }
  } catch (error) {
    // Storage is blocked: the page simply keeps the default theme and language.
  }
})();
