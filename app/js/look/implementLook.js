async function loadLook() {
  try {
    const lookPath = await ipcRenderer.invoke("get-look");

    if (!lookPath) {
      console.warn("get-look did not return a CSS path");
      return;
    }

    // Convert the absolute filesystem path to a file:// URL
    const cssUrl = require("url").pathToFileURL(lookPath).href;

    // Don't add it twice
    let link = document.getElementById("main-look-css");

    if (!link) {
      link = document.createElement("link");
      link.id = "main-look-css";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    link.href = cssUrl;

    console.log("Loaded look CSS:", cssUrl);
  } catch (err) {
    console.error("Failed to load look CSS:", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadLook();
});

