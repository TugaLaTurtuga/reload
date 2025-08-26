const { app, BrowserWindow, ipcMain } = require('electron');
const { childProcess, spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const mm = require('music-metadata');
const ColorThief = require('colorthief');
const lastPlayedFilePath = path.join(app.getPath('userData'), 'last-played.json');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 580,
    minHeight: 0,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('app/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  /*
  if (process.platform !== 'darwin') {
    app.quit();
  }
  */

  app.quit(); // plain better + IT'S MY FUCKING APP
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Get music library
ipcMain.handle('get-library', async () => {
  const libraryPath = path.join(app.getPath('documents'), 'reload');
  const appleLibraryPath = path.join(app.getPath('home'), 'Music', 'Music', 'Media.localized'); // Apple Music

  try {
    // Try to get libraries
    const appleMusic = []//await scanMusicFolder(appleLibraryPath, true);
    const reloadMusic = await scanMusicFolder(libraryPath);

    let library = [];
    if (reloadMusic.length > 0)   library.push(...reloadMusic);
    if (appleMusic.length > 0)  library.push(...appleMusic);
    return library;
    
  } catch (error) {
    console.error('Error scanning music library:', error);
    return [];
  }
});

async function scanMusicFolder(rootPath, fromExternalProvider = false) {
  const albums = [];

  async function processFolder(folderPath) {
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
      const dirs = entries.filter(entry => entry.isDirectory());

      // Look for audio files in this folder
      let audioFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.wav', '.aac', '.alac', '.flac', '.ogg', '.m4a', '.m4p', '.movpkg'].includes(ext);
      });

      // Sort audio files by the leading number in the filename
      audioFiles.sort((a, b) => {
        const numA = parseInt(a.match(/^\d+/)?.[0], 10) || Infinity;
        const numB = parseInt(b.match(/^\d+/)?.[0], 10) || Infinity;
        return numA - numB;
      });

      if (audioFiles.length > 0) {
        const album = {
          name: path.basename(folderPath),
          path: folderPath,
          tracks: [],
          cover: null,
          info: {
            trackList: [],
            description: {
              name: path.basename(folderPath),
              author: path.basename(path.dirname(folderPath)),
              label: "none",
              description: "",
              year: "year",
              genre: fromExternalProvider ? "from external provider." : "genre",
              color: "#AAAAAA",
              rating: 5
            }
          },
        };

        // Initialize or read music.json
        const confPath = path.join(folderPath, 'reload.json');
        //deleteConfPath(folderPath, 'reload1.json')
       
        let shouldExtractColor = false;

        if (!fromExternalProvider && !fs.existsSync(confPath)) {
          // no json → build new
          album.info.trackList = audioFiles.map(file => ({
            title: path.basename(file, path.extname(file)).trim(),
            rating: 5
          }));

          const possible_txts = [['Author.txt', 'author'], ['Genre.txt', 'genre'], ['Year.txt', 'year'], ['color.txt', 'color']];
          for (const [txtFile, key] of possible_txts) {
            const txtPath = path.join(folderPath, txtFile);
            if (fs.existsSync(txtPath)) {
              try {
                let content = fs.readFileSync(txtPath, 'utf8').trim();
                if (content) {
                  content = content.trim();
                  const contentToLowerCase = content.toLowerCase();
                  // ignore unknown values from python
                  if (!(contentToLowerCase === 'unknown' || contentToLowerCase === 'n/a' || contentToLowerCase === '0000')) {
                    album.info.description[key] = content;
                  }
                } 
              } catch (err) {
                console.error(`Error reading ${txtFile}:`, err);
              }
            } 
          }
          shouldExtractColor = true; // the python code might be shit.

          try {
            fs.writeFileSync(confPath, JSON.stringify(album.info, null, 2), 'utf8');
          } catch (err) {
            console.error('Error creating music.json:', err);
          }

        } else if (!fromExternalProvider) {
          // json exists → load it
          try {
            const data = fs.readFileSync(confPath, 'utf8');
            const parsedData = JSON.parse(data);
            album.info = parsedData || album.info;

            // mark for extraction only if color missing/placeholder
            if (!album.info.description.color || ['#AAAAAA', '#FFFFFF'].includes(album.info.description.color)) {
              shouldExtractColor = true;
            }
          } catch (err) {
            console.error('Error reading or parsing json:', err);
            shouldExtractColor = true;
          }

        } else {
          // external provider fallback
          album.info.trackList = audioFiles.map(file => ({
            title: path.basename(file, path.extname(file)).trim(),
            rating: 5
          }));
          shouldExtractColor = true;
        }

        album.cover = await lookForCover(folderPath, files);

        // ✅ only rasterize cover if needed
        if (album.cover && shouldExtractColor) {
          album.info.description.color = await getImgColor(album.cover);

          // also update json so we don’t need to redo this later
          try {
            fs.writeFileSync(confPath, JSON.stringify(album.info, null, 2), 'utf8');
          } catch (err) {
            console.error('Error updating json with color:', err);
          }
        }

        // Process tracks
        const cleanTrackTitle = (title) => title.replace(/^\d+\s*\.?\s*/, '').trim();

        const ungarnizedTracks = [];
        for (const audioFile of audioFiles) {
          const trackPath = path.join(folderPath, audioFile);
          const rawTitle = path.basename(audioFile, path.extname(audioFile))

          try {
            const metadata = await mm.parseFile(trackPath);
            if (fromExternalProvider && metadata.common) {
              if (metadata.common.artist) album.info.description.author = metadata.common.artist;
              if (metadata.common.album) album.name = metadata.common.album;
              if (metadata.common.year) album.info.description.year = metadata.common.year;
              if (metadata.common.genre && metadata.common.genre.length > 0) album.info.description.genre = metadata.common.genre[0];
            }

            ungarnizedTracks.push({
              title: rawTitle,
              path: trackPath,
              duration: metadata.format.duration || 0
            });
          } catch (err) {
            console.error(`Error parsing metadata for ${rawTitle}:`, err);
            ungarnizedTracks.push({
              title: rawTitle,
              path: trackPath,
              duration: 0
            });
          }
        }

        // Match tracks with trackList
        const clearTitle = (title) => title.toLowerCase().trim();

        album.info.trackList.forEach(track => {
          for (let i = 0; i < ungarnizedTracks.length; i++) {
            const ungarnizedTrack = ungarnizedTracks[i];
            if (clearTitle(track.title) === clearTitle(ungarnizedTrack.title)) {
              album.tracks.push({
                title: cleanTrackTitle(ungarnizedTrack.title),
                path: ungarnizedTrack.path,
                duration: ungarnizedTrack.duration
              });
              ungarnizedTracks.splice(i, 1); // Remove matched track
              break;
            }
          }
        });

        // Sort trackList and tracks by leading number if present
        const sortByTrackNumber = (a, b) => {
          const numA = parseInt(a.title.match(/^\d+/)?.[0] || Infinity, 10);
          const numB = parseInt(b.title.match(/^\d+/)?.[0] || Infinity, 10);
          return numA - numB;
        };

        album.info.trackList.sort(sortByTrackNumber);
        album.tracks.sort(sortByTrackNumber);
        album.jsonPath = confPath;

        if (album.tracks.length > 0) albums.push(album);
      }

      // Recurse into subdirectories
      for (const dir of dirs) {
        await processFolder(path.join(folderPath, dir.name));
      }

    } catch (error) {
      console.error(`Error processing folder ${folderPath}:`, error);
    }
  }

  if (fs.existsSync(rootPath)) {
    await processFolder(rootPath);
  } else {
    console.error(`Music library path does not exist: ${rootPath}`);
  }

  return albums;
}

// Handle saving last played track info
ipcMain.handle('save-settings', (event, unsavedSettings) => {
  try {
    fs.writeFileSync(lastPlayedFilePath, JSON.stringify(unsavedSettings), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving last played info:', error);
    return false;
  }
});

// Handle loading last played track info
ipcMain.handle('load-settings', () => {
  try {
    if (fs.existsSync(lastPlayedFilePath)) {
      const data = fs.readFileSync(lastPlayedFilePath, 'utf8');
      return JSON.parse(data);
    } else { // create default settings if none exist
      fs.writeFileSync(lastPlayedFilePath, JSON.stringify({}), 'utf8');
      return {};
    }
  } catch (error) {
    console.error('Error loading last played info:', error);
    return null;
  }
});

ipcMain.handle('decode-m4p', async (event, filePath) => {
  const tempOutputPath = path.join(app.getPath('temp'), `decoded-${Date.now()}.m4a`);
  
  return new Promise((resolve, reject) => {
    
    const process = spawn('ffmpeg', [
      '-i', filePath,
      '-vn',            // No video
      '-c:a', 'copy',   // Copy audio codec (no re-encode)
      '-f', 'mp4',      // M4A = MP4 container for audio
      '-y',             // Overwrite output file
      tempOutputPath
    ]);
    
    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log('Extraction successful');
        resolve(tempOutputPath);
      } else {
        console.error(`FFmpeg exited with code ${code}`);
        console.error('Full stderr:', stderr);
        reject(new Error(`FFmpeg extraction failed with code ${code}`));
      }
    });
  });
});

ipcMain.handle('open-external', (event, absolutePath) => {
  // Create a new BrowserWindow
  const win = new BrowserWindow({
    width: 950,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the local HTML file
  win.loadFile(absolutePath);
});

function rbgToHex(rgb) {
  let r, g, b;
  if (Array.isArray(rgb)) {
    [r, g, b] = rgb;
  } else {
    rbgSlipt = rgb.split(','); // these might have 4 values (rgba) (python code, again)
    for (let i = 0; i < rbgSlipt.length; i++) {
      switch (i) {
        case 0: r = parseInt(rbgSlipt[i].trim()); break;
        case 1: g = parseInt(rbgSlipt[i].trim()); break;
        case 2: b = parseInt(rbgSlipt[i].trim(), 10); break;
        default: break;
      }
    }
  }
  console.log(`\nConverting RGB to Hex: ${r},${g},${b}`);
  
  // limit how bright the color can be (to avoid white colors)
  const total = r + g + b;
  const clamp = 0.9 * 765; // 765 = 255 * 3
  if (total > clamp) {
    const scale = clamp / total;
    r = Math.round(r * scale);
    g = Math.round(g * scale);
    b = Math.round(b * scale);
    console.log(`Clamped: ${r},${g},${b}`);
  }
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b)); // always nice to clamp (bc me bad at js)

  return `#${((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
}

function lookForCover(folderPath, files) {
  const coverFiles = files.filter(file => ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(file).toLowerCase()));
  if (coverFiles.length > 0) {
    let leading_candidate = -1;
    let leading_candidate_score = -1;
    for (let i = 0; i < coverFiles.length; i++) {
      const file = coverFiles[i];
      let score = 0;
      let nameHasCoverInit = false;
      if (file.toLowerCase().includes('cover')) {
        score += 10;
        nameHasCoverInit = true;
      }

      if (file.toLowerCase().includes('front')) { 
        if (nameHasCoverInit) score -= 3; // this allows to have 'Cover.png' to win over 'FrontCover.png'
        else score += 5;
      } else if (file.toLowerCase().includes('back')) {
        if (nameHasCoverInit) score -= 4;
        else score += 4;
      } else if (file.toLowerCase().includes('album')) {
        if (nameHasCoverInit) score -= 2;
        else score += 3;
      } else if (file.toLowerCase().includes('folder')) {
        if (nameHasCoverInit) score -= 1;
        else score += 2;
      }

      if (score > leading_candidate_score) {
        leading_candidate = i;
        leading_candidate_score = score;
      }
    }
    if (leading_candidate === -1) leading_candidate = 0; // fallback
    return path.join(folderPath, coverFiles[leading_candidate]);
  } else {
    return null;
  }
}

async function getImgColor(imgPath) {
  if (imgPath && fs.existsSync(imgPath)) {
    try {
      const color = await ColorThief.getColor(imgPath);
      return rbgToHex(color);
    } catch (error) {
      console.error('\x1b[38;5;160mError extracting color from image:\x1b[38;5;38m', error);
      return '#AAAAAA'; // default color on error
    }
  }
  return '#AAAAAA'; // default color if no image
}

function deleteConfPath(folderPath, confFileName) {
  const confPath = path.join(folderPath, confFileName);
  // Delete old music.json if it exists
  if (fs.existsSync(confPath)) {
    try {
      fs.unlinkSync(confPath);
      console.log(`\x1b[38;5;107mDeleted old json at ${confPath}\x1b[38;5;38m`);
    } catch (err) {
      console.error(`\x1b[38;5;160mFailed to delete old json at ${confPath}:\x1b[38;5;38m`, err);
    }
  }
}

