let hasAlreadyToogled = false;
let wasAlbumOpenedFinder = null;

function toggleFinder(fromInput = false) {
  finderSearchWord = "";
  if (hasAlreadyToogled && fromInput) {
    hasAlreadyToogled = false;
    return;
  }

  const isFinderHidden =
    finder.classList.contains("hide") ||
    finder.classList.contains("initially-hidden");

  if (isFinderHidden) {
    finder.classList.remove("initially-hidden");
    finder.classList.remove("hide");
    finder.classList.add("show");

    setTimeout(() => {
      finderInput.focus();
    }, 100);
    inp.beginInputChange();

    if (settings.currentAlbum && albumOpened) {
      wasAlbumOpenedFinder = settings.currentAlbum;
      backToLibrary();
    } else {
      wasAlbumOpenedFinder = null;
    }
  } else {
    hasAlreadyToogled = true;
    finder.classList.remove("show");
    finder.classList.add("hide");
    finderInput.blur();
    inp.finishInputChange();

    if (wasAlbumOpenedFinder !== null && !fromInput) {
      setTimeout(() => {
        console.log(wasAlbumOpenedFinder);
        openAlbum(wasAlbumOpenedFinder);
      }, 100);
    }
  }
}

finderInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    toggleFinder(true);
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    toggleFinder(true);
    const albumsDiv = document.querySelectorAll(".album-card");
    // simulate a click in the first album
    albumsDiv[0].click();
  }
});

finderInput.addEventListener("input", () => {
  finderSearchWord = finderInput.value;
  renderLibrary();
});

document.querySelector("#now-playing-small").addEventListener("click", () => {
  openAlbum(settings.currentPlayingAlbum);
});
