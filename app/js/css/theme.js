async function _getThemesPath() {
    const themePath = await ipcRenderer.invoke("get-theme-path");

    if (!themePath) {
      console.warn("did not return a CSS path");
      return "";
    }
    return themePath;
}

async function updateTheme(theme = settings.theme[settings.themeMode]) {
  const themePath = await _getThemesPath()

  // Convert the absolute filesystem path to a file:// URL
  const cssUrl = require("url").pathToFileURL(themePath).href;

  // Don't add it twice
  let link = document.getElementById("themes-stylesheet");

  if (!link) {
    link = document.createElement("link");
    link.id = "themes-stylesheet";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }


  // Force reload by appending timestamp query
  link.href = `${themePath}?ts=${Date.now()}`;
  document.body.setAttribute("theme", theme);
}

