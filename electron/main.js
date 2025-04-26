const { app, BrowserWindow, ipcMain } = require('electron');
const { childProcess, spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const mm = require('music-metadata');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('app/index.html');
  //mainWindow.webContents.openDevTools(); // Remove this in production
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
    const appleMusic = await scanMusicFolder(appleLibraryPath, true);
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
      const audioFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.wav', '.aac', '.alac', '.flac', '.ogg', '.m4a', '.m4p', '.movpkg'].includes(ext);
      });

      if (audioFiles.length > 0) {
        
        const album = {
          name: path.basename(folderPath),
          path: folderPath,
          tracks: [],
          cover: null,
          info: {
            musicList: [],
            description: {
              author: path.basename(path.dirname(folderPath)), // Set author as the second to last folder
              label: "none",
              description: "",
              year: "year",
              genre: fromExternalProvider ? "from external provider." : "Genre",
              color: {
                primary: "#000000",
                secondary: "#FFFFFF"
              },
              rating: 5
            }
          },
        };

        // Check for existing music.json if not Apple Music
        if (!fromExternalProvider) {
          const musicConfPath = path.join(folderPath, 'music.json');
          if (!fs.existsSync(musicConfPath)) {
            // Initialize musicList for the new music.json
            album.info.musicList = audioFiles.map(file => ({
              title: path.basename(file, path.extname(file))
                .replace(/_/g, ' ')
                .replace(/-/g, ' ')
                .trim(),
              rating: 5
            }));
            
            try {
              fs.writeFileSync(musicConfPath, JSON.stringify(album.info, null, 2), 'utf8');
            } catch (err) {
              console.error('Error creating music.json:', err);
            }
          } else {
            // Read existing music.json
            try {
              const data = fs.readFileSync(musicConfPath, 'utf8');
              const parsedData = JSON.parse(data);
              album.info = parsedData || album.info;
            } catch (err) {
              console.error('Error reading or parsing music.json:', err);
            }
          }
        } else {
          // For Apple Music, initialize musicList directly
          album.info.musicList = audioFiles.map(file => ({
            title: path.basename(file, path.extname(file))
              .replace(/_/g, ' ')
              .replace(/-/g, ' ')
              .trim(),
            rating: 5
          }));
        }

        // Look for cover image
        const coverFile = files.find(file => {
          const ext = path.extname(file).toLowerCase();
          try {
            return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
          } catch (err) {
            return null;
          }
        });
        
        if (coverFile) {
          album.cover = path.join(folderPath, coverFile);
        }

        // Process tracks
        const ungarnizedTracks = [];
        for (const audioFile of audioFiles) {
          const trackPath = path.join(folderPath, audioFile);
          const title = path.basename(audioFile, path.extname(audioFile))
            .replace(/^\d+\s+/, '')
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
            .trim();

          try {
            const metadata = await mm.parseFile(trackPath);
            
            // Try to update album metadata if we have it (For Apple Music)
            if (fromExternalProvider && metadata.common) {
              if (metadata.common.artist) {
                album.info.description.author = metadata.common.artist;
              }
              if (metadata.common.album) {
                album.name = metadata.common.album;
              }
              if (metadata.common.year) {
                album.info.description.year = metadata.common.year;
              }
              if (metadata.common.genre && metadata.common.genre.length > 0) {
                album.info.description.genre = metadata.common.genre[0];
              }
            }
            
            ungarnizedTracks.push({
              title,
              path: trackPath,
              duration: metadata.format.duration || 0
            });
          } catch (err) {
            console.error(`Error parsing metadata for ${title}:`, err);
            ungarnizedTracks.push({
              title,
              path: trackPath,
              duration: 0
            });
          }
        }

        // Match tracks with music list
        album.info.musicList.forEach((track) => {
          ungarnizedTracks.forEach((ungarnizedTrack) => {
            const title = ungarnizedTrack.title.trim()
              .replace(/^\d+\s+/, '')
              .replace(/_/g, ' ')
              .replace(/-/g, ' ')
              .trim();

            const checkTitle = title
              .toLowerCase()
              .replace(/ /g, '')
              .split('feat')[0]
              .split('ft')[0]
              .split('(')[0]
              .trim();

            const trackTitleCheck = track.title
              .toLowerCase()
              .replace(/^\d+\s+/, '')
              .replace(/_/g, ' ')
              .replace(/-/g, ' ')
              .replace(/ /g, '')
              .split('feat')[0]
              .split('ft')[0]
              .split('(')[0]
              .trim();

            if (trackTitleCheck === checkTitle) {
              album.tracks.push({
                title: title,
                path: ungarnizedTrack.path,
                duration: ungarnizedTrack.duration
              });
            }
          });
        });

        // Only add albums that have tracks
        if (album.tracks.length > 0) {
          albums.push(album);
        }
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
ipcMain.handle('save-last-played', (event, lastPlayedInfo) => {
  try {
    const userDataPath = app.getPath('userData');
    const lastPlayedFilePath = path.join(userDataPath, 'last-played.json');
    fs.writeFileSync(lastPlayedFilePath, JSON.stringify(lastPlayedInfo), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving last played info:', error);
    return false;
  }
});

// Handle loading last played track info
ipcMain.handle('load-last-played', () => {
  try {
    const userDataPath = app.getPath('userData');
    const lastPlayedFilePath = path.join(userDataPath, 'last-played.json');
    
    if (fs.existsSync(lastPlayedFilePath)) {
      const data = fs.readFileSync(lastPlayedFilePath, 'utf8');
      return JSON.parse(data);
    }
    return null;
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
