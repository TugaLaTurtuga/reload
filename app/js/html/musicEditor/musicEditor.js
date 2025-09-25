// Global variable to store the music data
let musicData = {
  trackList: [],
  description: {
    name: "",
    author: "",
    label: "",
    description: "",
    year: 2024,
    genre: "",
    color: "#AAAAAA",
    rating: 5,
    copyrightFree: false,
  },
};

// DOM elements
const nameInput = document.getElementById("name");
const authorInput = document.getElementById("author");
const labelInput = document.getElementById("label");
const yearInput = document.getElementById("year");
const genreInput = document.getElementById("genre");
const albumRatingSelect = document.getElementById("albumRating");
const descriptionInput = document.getElementById("description");
const colorInput = document.getElementById("color");
const copyrightFree = document.getElementById("copyrightFree");
const tracksContainer = document.getElementById("tracks-container");
const addTrackButton = document.getElementById("add-track");
const sortTracksButton = document.getElementById("sort-tracks");
const saveButton = document.getElementById("save-button");
const loadButton = document.getElementById("load-button");
const notification = document.getElementById("notification");
let jsonPath = null;

async function loadSettings() {
  let settings = {
    theme: { dark: "", light: "" },
    themeMode: "dark",
  };
  try {
    let newSettings = (await ipcRenderer.invoke("get-settings")) || {};

    for (const key in settings) {
      // saver load
      if (newSettings && newSettings.hasOwnProperty(key)) {
        settings[key] = newSettings[key];
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }

  // Apply settings
  let userLookCSS = document.getElementById("user-look");
  if (!userLookCSS) {
    userLookCSS = document.createElement("link");
    userLookCSS.id = "user-look";
    userLookCSS.rel = "stylesheet";
    document.head.appendChild(userLookCSS);
  }

  userLookCSS.href = `../css/look.css?ts=${Date.now()}`;

  let themeCSS = document.getElementById("themes-stylesheet");
  // Force reload by appending timestamp query
  themeCSS.href = `../css/themes.css?ts=${Date.now()}`;

  document.body.setAttribute("theme", settings.theme[settings.themeMode]);
}

ipcRenderer.on("settings-updated", async (event, updatedSettings) => {
  await loadSettings();

  let link = document.getElementById("themes-stylesheet");
  // Force reload by appending timestamp query
  link.href = `../css/themes.css?ts=${Date.now()}`;
});

// Function to load music data from server
async function loadMusicData() {
  try {
    loadSettings(); // for theme
    jsonPath = await fetch("../saves/jsonToLoad.txt").then((res) => res.text());
    console.log("Loading music data from:", jsonPath);
    const response = await fetch(jsonPath);
    if (!response.ok) {
      throw new Error("Failed to load music data");
    }

    musicData = await response.json();

    await populateForm();
    console.log(musicData.description.name, musicData);
    if (!musicData.description.name) {
      if (musicData.name) {
        musicData.description.name = musicData.name; // this is the folder's name
        nameInput.value = musicData.description.name;
      } else {
        musicData.description.name =
          musicData.description.cover.split("/")[
            musicData.description.cover.split("/").length - 2
          ]; // terrible.
        musicData.name = musicData.description.name;
        nameInput.value = musicData.description.name;
      }
    }
    changeBackGroundColorFromNewAlbum(musicData.description.color);

    setStatus("Music data loaded successfully");
  } catch (error) {
    console.error("Error loading music data:", error);
    setStatus("Error loading music data: " + error.message);
  }
}

// Function to populate the form with music data
async function populateForm() {
  const { description } = musicData;

  // Fill album information
  nameInput.value = description.name || "";
  authorInput.value = description.author || "";
  labelInput.value = description.label || "";
  yearInput.value =
    description.year == "" ? new Date().getFullYear() : description.year;
  genreInput.value = description.genre || "";
  albumRatingSelect.value = description.rating || 5;
  descriptionInput.value = description.description || "";

  // Colors
  colorInput.value = description?.color || "#AAAAAA";
  copyrightFree.checked = description?.copyrightFree || false;

  // Clear existing tracks
  tracksContainer.innerHTML = "";

  // Add tracks
  musicData.trackList.forEach((track, index) => {
    addTrackToDOM(track, index);
  });
  sController.updateSliders();
}

// Function to add a track to the DOM
function addTrackToDOM(track, index) {
  const trackDiv = document.createElement("div");
  trackDiv.className = "track";
  trackDiv.dataset.index = index;

  trackDiv.innerHTML = `
    <input type="text" class="track-title" value="${track.title || ""}" placeholder="Track title">
    <span mode="10;1" data-slider="track-rating ${index}"></span>
    <input type="range" class="slider" step=".1" min="0" value="5" max="10" id="track-rating ${index}">
    <div class="track-actions">
        <button class="move-up">↑</button>
        <button class="move-down">↓</button>
        <button class="danger remove-track">Remove</button>
    </div>
`;

  // Add event listeners to the track
  trackDiv.querySelector(".track-title").addEventListener("input", () => {
    playSoundAffect("click", (volume = 0.35));
    updateTrackData();
  });
  trackDiv.querySelector(".slider").addEventListener("change", updateTrackData);
  trackDiv.querySelector(".slider").addEventListener("input", () => {
    playSoundAffect("click", (volume = 0.35));
  });
  trackDiv.querySelector(".remove-track").addEventListener("click", () => {
    playSoundAffect("warning", (volume = 1));
    removeTrack(trackDiv);
  });
  trackDiv
    .querySelector(".move-up")
    .addEventListener("click", () => moveTrack(trackDiv, "up"));
  trackDiv
    .querySelector(".move-down")
    .addEventListener("click", () => moveTrack(trackDiv, "down"));

  tracksContainer.appendChild(trackDiv);
}

// Function to update track data in the musicData object
function updateTrackData() {
  // Get all track elements
  const trackElements = tracksContainer.querySelectorAll(".track");

  // Create a new array for the track list
  const updatedTracks = [];

  // Loop through track elements and update data
  trackElements.forEach((trackElement) => {
    const titleInput = trackElement.querySelector(".track-title");
    const ratingSelect = trackElement.querySelector(".slider");

    updatedTracks.push({
      title: titleInput.value,
      rating: parseInt(ratingSelect.value, 10),
    });
  });

  // Update the music data
  musicData.trackList = updatedTracks;
}

// Function to add a new track
function addNewTrack() {
  const newTrack = {
    title: `New Track ${musicData.trackList.length + 1}`,
    rating: 5,
  };

  musicData.trackList.push(newTrack);
  addTrackToDOM(newTrack, musicData.trackList.length - 1);
  sController.updateSliders();
}

// Function to remove a track
function removeTrack(trackElement) {
  if (confirm("Are you sure you want to remove this track?")) {
    trackElement.remove();
    updateTrackData();
  }
}

// Function to move a track up or down
function moveTrack(trackElement, direction) {
  const trackElements = Array.from(tracksContainer.querySelectorAll(".track"));
  const currentIndex = trackElements.indexOf(trackElement);

  if (direction === "up" && currentIndex > 0) {
    tracksContainer.insertBefore(trackElement, trackElements[currentIndex - 1]);
  } else if (direction === "down" && currentIndex < trackElements.length - 1) {
    tracksContainer.insertBefore(trackElements[currentIndex + 1], trackElement);
  }

  playSoundAffect("click", (volume = 0.15));
  updateTrackData();
}

// Function to sort tracks by title
function sortTracks() {
  // Sort tracks in musicData
  musicData.trackList.sort((a, b) => {
    const numA = parseInt(a.match(/^\d+/)?.[0], 10) || Infinity;
    const numB = parseInt(b.match(/^\d+/)?.[0], 10) || Infinity;
    return numA - numB;
  });

  // Clear and repopulate track container
  tracksContainer.innerHTML = "";
  musicData.trackList.forEach((track, index) => {
    addTrackToDOM(track, index);
  });

  sController.updateSliders();
  setStatus("Tracks sorted by title");
}

// Function to update the album information
function updateAlbumInfo() {
  musicData.description.name = nameInput.value;
  musicData.description.author = authorInput.value;
  musicData.description.label = labelInput.value;
  musicData.description.year = parseInt(yearInput.value, 10);
  musicData.description.genre = genreInput.value;
  musicData.description.rating = parseInt(albumRatingSelect.value);
  musicData.description.description = descriptionInput.value;
  musicData.description.color = colorInput.value;
  musicData.description.copyrightFree = copyrightFree.checked;
}

// Function to save music data
async function saveMusicData() {
  try {
    saveButton.innerHTML =
      '<object id="spinner" type="image/svg+xml" data="../css/svg/loading.svg"></object>';
    saveButton.disabled = true;

    // Save the latest album and track info before sending
    updateAlbumInfo();
    updateTrackData();

    // Send the updated musicData to the backend
    try {
      await fs.writeFileSync(
        jsonPath,
        JSON.stringify(musicData, null, 2),
        "utf8",
      );
      ipcRenderer.invoke("changed-json-data");
    } catch (err) {
      console.error("Error creating music.json:", err);
    }

    setStatus("Music data saved successfully!");
  } catch (error) {
    console.error("Error saving music data:", error);
    setStatus("Error saving music data: " + error.message, "error");
  } finally {
    saveButton.innerHTML = "Save Changes";
    saveButton.disabled = false;
  }
}

function updateColor() {
  let r, g, b;
  if (colorInput.value.startsWith("#")) {
    // Remove the hash and parse the hex
    let hex = colorInput.value.replace("#", "");
    if (hex.length === 3) {
      // Expand shorthand hex (e.g. #abc -> #aabbcc)
      hex = hex
        .split("")
        .map((x) => x + x)
        .join("");
    }
    const intVal = parseInt(hex, 16);
    const rVal = (intVal >> 16) & 255;
    const gVal = (intVal >> 8) & 255;
    const bVal = intVal & 255;
    [r, b, g] = [rVal, gVal, bVal];
  } else {
    [r, b, g] = colorInput.value;
  }

  colorInput.value = `#${((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
  changeBackGroundColorFromNewAlbum(colorInput.value);
  updateAlbumInfo();
}

// Add event listeners
authorInput.addEventListener("input", updateAlbumInfo);
labelInput.addEventListener("input", updateAlbumInfo);
yearInput.addEventListener("input", updateAlbumInfo);
genreInput.addEventListener("input", updateAlbumInfo);
albumRatingSelect.addEventListener("change", updateAlbumInfo);
descriptionInput.addEventListener("input", updateAlbumInfo);
colorInput.addEventListener("change", updateColor);
colorInput.addEventListener("input", () => {
  changeBackGroundColorFromNewAlbum(colorInput.value);
});

copyrightFree.addEventListener("change", updateAlbumInfo);

addTrackButton.addEventListener("click", addNewTrack);
sortTracksButton.addEventListener("click", sortTracks);
saveButton.addEventListener("click", saveMusicData);
loadButton.addEventListener("click", loadMusicData);

// Load music data when the page loads
document.addEventListener("DOMContentLoaded", loadMusicData);
