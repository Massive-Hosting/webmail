// Prevent flash of wrong theme/density by reading cached preference before render
(function () {
  var theme = localStorage.getItem("theme");
  if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  }
  var density = localStorage.getItem("density");
  if (density === "compact") {
    document.documentElement.classList.add("density-compact");
  }
})();
