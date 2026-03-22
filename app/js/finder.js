const finder = document.querySelector(".finder");
const finderInput = finder.querySelector("input");
let hasAlreadyToogled = false;
let wasAlbumOpenedFinder = null;

function toggleFinder(fromInput = false) {
  if (hasAlreadyToogled && fromInput) {
    hasAlreadyToogled = !hasAlreadyToogled;
    return;
  }
  if (finder.classList.contains("hide")) {
    finder.classList.remove("hide");
    finder.classList.add("show");

    setTimeout(() => {
      finderInput.focus();
    }, 100);
    inp.beginInputChange();

    if (settings.currentAlbum) {
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

    if (wasAlbumOpenedFinder !== null) {
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
    toggleFinder(true);
  }
});
