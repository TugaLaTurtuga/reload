// --- keep your existing declarations if already present ---
const btn = document.getElementById("favourite-button");
const star1 = document.getElementById("star1");
const star2 = document.getElementById("star2");
const starsPath = document.querySelectorAll(".star path");

// Keep existing variables: songs, settings, fs, etc.

let showingFirst = true;

// Hover fill handling (unchanged)
btn.addEventListener("mouseenter", () => {
  starsPath.forEach((path) => path.setAttribute("fill", "var(--activeColor)"));
});
btn.addEventListener("mouseleave", () => {
  starsPath.forEach((path) => path.setAttribute("fill", "var(--textSubColor)"));
});

// ---- Toggle favourite: use Date.now() when favouriting (so favourite becomes a number)
// ---- and set falsy (false) when unfavouriting. This uses ONLY the `favourite` var.
btn.addEventListener("click", async () => {
  if (!settings.currentAlbum) return;

  const curFav = settings.currentAlbum.info.description.favourite;

  if (curFav) {
    // currently favourited -> remove favourite
    settings.currentAlbum.info.description.favourite = false;
    // UI
    star2.classList.remove("visible");
    star2.classList.add("hidden");
    star1.classList.remove("hidden");
    star1.classList.add("visible");
  } else {
    // favourite now: store creation time (number). This is the "date of creation".
    settings.currentAlbum.info.description.favourite = Date.now();
    star1.classList.remove("visible");
    star1.classList.add("hidden");
    star2.classList.remove("hidden");
    star2.classList.add("visible");
  }

  // save current album json (same style as your current code)
  try {
    await fs.writeFileSync(
      settings.currentAlbum.jsonPath,
      JSON.stringify(settings.currentAlbum.info, null, 4),
      "utf8",
    );
  } catch (err) {
    console.error("Error saving album JSON:", err);
  }

  // update songs[] entry for this album so in-memory data matches saved file
  for (let i = 0; i < songs.length; i++) {
    if (songs[i].path === settings.currentAlbum.path) {
      songs[i].info.description.favourite =
        settings.currentAlbum.info.description.favourite;
      // also persist this song's json if you want (kept above for the current album)
      break;
    }
  }

  // refresh sidebar (will sort by the favourite number by default)
  loadFavouritesToSidebar();
});

// ---- updateFavouriteBtn remains compatible (it already uses truthiness)
function updateFavouriteBtn() {
  if (!settings.currentAlbum) return;
  if (settings.currentAlbum.info.description.favourite) {
    star1.classList.remove("visible");
    star1.classList.add("hidden");
    star2.classList.remove("hidden");
    star2.classList.add("visible");
  } else {
    star2.classList.remove("visible");
    star2.classList.add("hidden");
    star1.classList.remove("hidden");
    star1.classList.add("visible");
  }
}

// ---- Drag & drop + render favourites
let favouritesDragSetup = false;

async function loadFavouritesToSidebar() {
  const sidebarContent = document.getElementById("favourites-container");
  sidebarContent.innerHTML = "";

  // Wait for songs to exist (keeps your try/timeout pattern)
  const tries = 10;
  const timeout = 50;
  for (let i = 0; i < tries; i++) {
    if (songs.length > 0) break;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, timeout));
  }

  // Gather favourites — we accept *any* truthy favourite, but convert to Number for sorting.
  const favSongs = songs
    .filter(
      (song) =>
        song.info && song.info.description && song.info.description.favourite,
    )
    .slice();

  // sort: larger favourite values first (this makes Date.now() give newest-first).
  favSongs.sort((a, b) => {
    const fa = Number(a.info.description.favourite) || 0;
    const fb = Number(b.info.description.favourite) || 0;
    return fb - fa;
  });

  // render
  favSongs.forEach((song) => {
    const favouriteItem = document.createElement("div");
    favouriteItem.classList.add("favourite-item");
    favouriteItem.dataset.path = song.path; // unique identifier
    favouriteItem.draggable = false; // enabled only while Meta is pressed (see below)

    // Set album details (same logic you had)
    if (song.info.description.cover) {
      favouriteItem.style.backgroundImage = `url('${song.info.description.cover}')`;
      // fix single/double quote inconsistencies like your check
      if (
        favouriteItem.style.backgroundImage !==
          `url("${song.info.description.cover}")` &&
        favouriteItem.style.backgroundImage !==
          `url('${song.info.description.cover}')`
      ) {
        // If the browser rejected it for some reason, clear it
        // (kept same style as your original check)
      }
    } else {
      favouriteItem.style.backgroundImage = "none";
    }

    favouriteItem.addEventListener("click", () => {
      if (settings.favourites.openAlbum) {
        openAlbum(song);
      }
      if (settings.favourites.startPlaying) {
        playTrack(0, song);
      }
    });

    // Make immediate draggable when the user presses meta and starts mousedown (so dragging can start without global key press)
    favouriteItem.addEventListener("mousedown", (e) => {
      if (e.metaKey) favouriteItem.draggable = true;
      else favouriteItem.draggable = false;
    });

    favouriteItem.addEventListener("mouseup", () => {
      // after mouse up, turn off draggable (prevents accidental drags)
      favouriteItem.draggable = false;
    });

    // dragstart / dragend handlers for visual feedback
    favouriteItem.addEventListener("dragstart", (ev) => {
      // Only allow drag if meta was pressed when drag started.
      // Some environments may not set ev.metaKey on dragstart reliably, so also check draggable flag.
      if (!ev.metaKey && !favouriteItem.draggable) {
        ev.preventDefault();
        return;
      }
      favouriteItem.classList.add("dragging");
      ev.dataTransfer.setData("text/plain", song.path);
      // setEffectAllowed helps some platforms
      try {
        ev.dataTransfer.effectAllowed = "move";
      } catch (e) {}
    });

    favouriteItem.addEventListener("dragend", () => {
      favouriteItem.classList.remove("dragging");
      favouriteItem.draggable = false;
    });

    sidebarContent.appendChild(favouriteItem);
  });

  // --- Setup container dragover/drop once (idempotent)
  if (!favouritesDragSetup) {
    favouritesDragSetup = true;

    // helper: write song JSON synchronously and reload the song.info from disk so
    // in-memory songs[] matches what's on disk.
    function writeAndReloadSongSync(song) {
      if (!song || !song.jsonPath) return false;
      try {
        // ensure structure
        song.info = song.info || {};
        song.info.description = song.info.description || {};

        fs.writeFileSync(
          song.jsonPath,
          JSON.stringify(song.info, null, 4),
          "utf8",
        );

        // read back to make sure in-memory matches disk (defensive)
        try {
          const raw = fs.readFileSync(song.jsonPath, "utf8");
          const parsed = JSON.parse(raw);
          // replace info object so songs[] will reflect exactly what's saved
          song.info = parsed;
        } catch (rerr) {
          // read-back failed — keep in-memory but log
          console.warn(
            "Warning: saved but couldn't re-read JSON:",
            song.jsonPath,
            rerr,
          );
        }
        return true;
      } catch (err) {
        console.error("Error writing song JSON:", song.jsonPath, err);
        return false;
      }
    }

    // Save the current order from DOM -> songs[].info.description.favourite
    function saveOrderFromDOM() {
      const container = document.getElementById("favourites-container");
      if (!container) return;

      const items = [...container.querySelectorAll(".favourite-item")];
      if (items.length === 0) return;

      // Make unique descending numbers: top item gets biggest number.
      const base = Date.now() + items.length;
      const pathToNewFav = new Map();
      items.forEach((el, idx) => {
        const newVal = base - idx; // top gets largest number
        pathToNewFav.set(el.dataset.path, newVal);
      });

      // Update songs[] and persist synchronously
      for (let i = 0; i < songs.length; i++) {
        const s = songs[i];
        if (pathToNewFav.has(s.path)) {
          // Update in-memory
          s.info = s.info || {};
          s.info.description = s.info.description || {};
          s.info.description.favourite = pathToNewFav.get(s.path);

          // Persist and re-load into memory
          writeAndReloadSongSync(s);
        }
      }
    }

    // Helper used by dragover to find insertion anchor
    function getDragAfterElement(container, y) {
      const draggableElements = [
        ...container.querySelectorAll(".favourite-item:not(.dragging)"),
      ];
      let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
      for (const child of draggableElements) {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          closest = { offset, element: child };
        }
      }
      return closest.element;
    }

    // While dragging - show where it will be inserted
    sidebarContent.addEventListener("dragover", (e) => {
      e.preventDefault();
      const draggingEl = sidebarContent.querySelector(
        ".favourite-item.dragging",
      );
      if (!draggingEl) return;

      const afterElement = getDragAfterElement(sidebarContent, e.clientY);
      if (!afterElement) {
        sidebarContent.appendChild(draggingEl);
      } else {
        sidebarContent.insertBefore(draggingEl, afterElement);
      }
    });

    // On drop: persist order immediately
    sidebarContent.addEventListener("drop", (e) => {
      e.preventDefault();

      const draggingEl = sidebarContent.querySelector(
        ".favourite-item.dragging",
      );
      if (draggingEl) draggingEl.classList.remove("dragging");

      // Save DOM order into favourites and persist
      saveOrderFromDOM();

      // Re-render to reattach listeners and show fresh state
      // small timeout to avoid interfering with the current event cycle
      setTimeout(() => loadFavouritesToSidebar(), 20);
    });

    // Key handlers: enable draggable while Meta is held
    window.addEventListener("keydown", (e) => {
      if (e.key === "Meta" || e.metaKey) {
        document
          .querySelectorAll(".favourite-item")
          .forEach((el) => (el.draggable = true));
      }
    });

    // When Meta is released: immediately remove drag visuals & persist current order.
    // This ensures there is no flicker/ghost and the order is saved at the exact moment meta is released.
    window.addEventListener("keyup", (e) => {
      if (e.key === "Meta" || !e.metaKey) {
        // turn off draggable for all items and remove dragging visuals
        document.querySelectorAll(".favourite-item").forEach((el) => {
          el.draggable = false;
          el.classList.remove("dragging");
        });

        // If a drag was active, persist the current DOM order
        const anyItems = sidebarContent.querySelectorAll(".favourite-item");
        if (anyItems && anyItems.length > 0) {
          saveOrderFromDOM();
          setTimeout(() => loadFavouritesToSidebar(), 20);
        }
      }
    });

    // Also clear draggable when window loses focus
    window.addEventListener("blur", () => {
      document
        .querySelectorAll(".favourite-item")
        .forEach((el) => (el.draggable = false));
    });
  }

  return null;
}
