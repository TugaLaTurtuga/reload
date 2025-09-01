function updateOverflowsOnNowPlaying() {
  let keyframes = "";
  const minDuration = [0.5, 2];

  function addOverflowFromTitle() {
    // If not already duplicated, wrap in spans
    if (nowPlayingTitle.children.length === 0) {
      const text = nowPlayingTitle.textContent;
      nowPlayingTitle.textContent = ""; // clear

      const firstSpan = document.createElement("span");
      const secondSpan = document.createElement("span");

      firstSpan.textContent = text;
      secondSpan.textContent = text;

      nowPlayingTitle.appendChild(firstSpan);
      nowPlayingTitle.appendChild(secondSpan);
    }

    const scrollWidth = nowPlayingTitle.scrollWidth || 1; // prevent division by zero
    const distance = nowPlayingTitleWrapper.clientWidth - scrollWidth; // negative value
    const duration =
      Math.pow(Math.abs((distance / scrollWidth) * 5), 1.15) + minDuration[0];

    // Create a dynamic keyframes string
    const scrollFrames = `
        @keyframes scroll-playing-title-dynamic {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-50%); }
        }
    `;
    keyframes += scrollFrames;

    nowPlayingTitle.classList.add("overflowing"); // doens't change anything, just makes debuging easaer
    nowPlayingTitle.style.animation = `scroll-playing-title-dynamic ${duration}s linear infinite`;
  }

  function removeOverflowFromTitle() {
    // Not overflowing → show plain text
    nowPlayingTitle.classList.remove("overflowing"); // doens't change anything, just makes debuging easaer

    if (nowPlayingTitle.children.length > 0) {
      // restore single text node
      nowPlayingTitle.textContent = nowPlayingTitle.children[0].textContent;

      for (let i = nowPlayingTitle.children.length - 1; i > 0; --i) {
        nowPlayingTitle.children[i].remove();
      }
    }
  }

  function addOverflowFromArtist() {
    const scrollWidth = nowPlayingArtist.scrollWidth || 1; // prevent division by zero
    const distance = nowPlayingArtistWrapper.clientWidth - scrollWidth; // negative value
    const duration =
      Math.pow(Math.abs((distance / scrollWidth) * 6.5), 2.2) + minDuration[1];

    // Create a dynamic keyframes string
    const scrollFrames = `
        @keyframes scroll-playing-artist-dynamic {
            0%   { transform: translateX(0); }
            45%  { transform: translateX(${distance}px); }
            50%  { transform: translateX(${distance}px); }
            95%  { transform: translateX(0); }
            100% { transform: translateX(0); }
        }
    `;
    keyframes += scrollFrames;

    // Apply the animation
    nowPlayingArtist.classList.add("overflowing"); // doens't change anything, just makes debuging easaer
    nowPlayingArtist.style.animation = `scroll-playing-artist-dynamic ${duration}s linear infinite`;
  }

  function removeOverflowFromArtist() {
    nowPlayingArtist.classList.remove("overflowing"); // doens't change anything, just makes debuging easaer
  }

  // track title
  if (nowPlayingTitle.scrollWidth > nowPlayingTitleWrapper.clientWidth) {
    if (nowPlayingTitle.children[0]) {
      if (
        nowPlayingTitle.children[0].scrollWidth - 20 <=
        nowPlayingTitleWrapper.clientWidth
      ) {
        removeOverflowFromTitle();
      } else {
        // yes.
        addOverflowFromTitle();
      }
    } else {
      addOverflowFromTitle();
    }
  } else {
    removeOverflowFromTitle();
  }

  // track artist
  if (nowPlayingArtist.scrollWidth > nowPlayingArtistWrapper.clientWidth) {
    addOverflowFromArtist();
  } else {
    removeOverflowFromArtist();
  }

  // Remove any previous dynamic style tag
  const prevStyle = document.getElementById("dynamic-scroll-style");
  if (prevStyle) prevStyle.remove();

  // Inject new style
  const styleTag = document.createElement("style");
  styleTag.id = "dynamic-scroll-style";
  styleTag.innerHTML = keyframes;
  document.head.appendChild(styleTag);
}

// Format time helper
function formatTime(time) {
  const days = Math.floor(time / 86400)
    .toString()
    .padStart(2, "0");
  const hours = Math.floor((time % 86400) / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((time % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, "0");

  if (days > 0) {
    return `${days}:${hours}:${minutes}:${seconds}`;
  } else if (hours > 0) {
    return `${hours}:${minutes}:${seconds}`;
  } else {
    return `${minutes}:${seconds}`;
  }
}

// Update progress bar as audio plays
function updateProgress() {
  if (!isNaN(audioPlayer.duration)) {
    progressBar.value = audioPlayer.currentTime / audioPlayer.duration;
    sController._updateSliderBackground(progressBar); // Update the background with the new value
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  }
}
