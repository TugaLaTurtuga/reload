const { app, BrowserWindow, ipcMain } = require('electron');
const { childProcess, spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const mm = require('music-metadata');
const { json } = require('stream/consumers');
const ffmpeg = require('fluent-ffmpeg');

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
  mainWindow.webContents.openDevTools(); // Remove this in production
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
  const appleLibraryPath_1 = path.join(app.getPath('home'), 'Music', 'Music', 'Media.localized', 'Apple Music'); // Apple Music
  const appleLibraryPath_2 = path.join(app.getPath('home'), 'Music', 'Music', 'Media.localized', 'Music'); // Apple Music lossless

  try {
    // First try the Apple Music library
    const appleMusic_1 = await scanAppleMusicFolder(appleLibraryPath_1);
    const appleMusic_2 = await scanAppleMusicFolder(appleLibraryPath_2);
    const reloadMusic = await scanMusicFolder(libraryPath);

    let library = [];
    if (reloadMusic.length > 0)   library.push(...reloadMusic);
    if (appleMusic_1.length > 0)  library.push(...appleMusic_1);
    if (appleMusic_2.length > 0)  library.push(...appleMusic_2); 
    return library;
    
  } catch (error) {
    console.error('Error scanning music library:', error);
    return [];
  }
});

async function scanAppleMusicFolder(rootPath) {
  const albums = [];

  async function processFolder(folderPath) {
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
      console.log(files);
      const dirs = entries.filter(entry => entry.isDirectory());

      // Look for audio files in this folder
      const audioFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.wav', '.aac', '.alac', '.flac', '.ogg', '.m4a', '.m4p', '.movpkg'].includes(ext);
      });
      
      console.log('Found audio files:', audioFiles.length);

      if (audioFiles.length > 0) {
        console.log('Found audio files in folder:', folderPath);
        const album = {
          name: path.basename(folderPath),
          path: folderPath,
          tracks: [],
          cover: null,
          info: {
            musicList: audioFiles.map(file => ({
              title: path.basename(file, path.extname(file))
              .replace(/_/g, ' ')
              .replace(/-/g, ' ')
              .trim(),
                  rating: 5
                })),
            description: {
              author: path.basename(path.dirname(folderPath)), // Set author as the second to last folder
              label: "none",
              description: "",
              year: 2000,
              genre: "From Apple Music",
              color: {
                  primary: "#000000",
                  secondary: "#FFFFFF"
              },
              rating: 5
            }
          },
        };

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

        // Process tracks first to build musicList
        for (const audioFile of audioFiles) {
          const trackPath = path.join(folderPath, audioFile);
          const title = path.basename(audioFile, path.extname(audioFile))
            .replace(/^\d+\s+/, '')
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
            .trim();
          
          console.log('Processing track:', title);

          try {
            const metadata = await mm.parseFile(trackPath);
            
            // Add to musicList in album info
            album.info.musicList.push({
              title: title,
              rating: 5
            });
            
            // Add to tracks array with full details
            album.tracks.push({
              title: title,
              path: trackPath,
              duration: metadata.format.duration || 0
            });
            
            // Try to update album metadata if we have it
            if (metadata.common) {
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
            
          } catch (err) {
            console.error(`Error parsing metadata for ${title}:`, err);
            
            // Still add to musicList even if metadata parsing fails
            album.info.musicList.push({
              title: title,
              rating: 5
            });
            
            album.tracks.push({
              title: title,
              path: trackPath,
              duration: 0
            });
          }
        }

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
    console.log(`Found ${albums.length} albums in ${rootPath}`);
  } else {
    console.log(`Music library path does not exist: ${rootPath}`);
  }

  return albums;
}

async function scanMusicFolder(rootPath) {
  const albums = [];

  async function processFolder(folderPath) {
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
      const dirs = entries.filter(entry => entry.isDirectory());

      // Look for audio files in this folder
      const audioFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.wav', '.aac', '.alac', '.flac', '.ogg', '.m4a'].includes(ext);
      });

      if (audioFiles.length > 0) {
        const album = {
          name: path.basename(folderPath),
          path: folderPath,
          tracks: [],
          cover: null,
          info: {
            musicList: audioFiles.map(file => ({
              title: path.basename(file, path.extname(file))
              .replace(/_/g, ' ')
              .replace(/-/g, ' ')
              .trim(),
                  rating: 5
                })),
            description: {
              author: path.basename(path.dirname(folderPath)), // Set author as the second to last folder
              label: "none",
              description: "",
              year: 2000,
              genre: "From Apple Music",
              color: {
                  primary: "#000000",
                  secondary: "#FFFFFF"
              },
              rating: 5
            }
          },
        };

        // Optional metadata
        const tryRead = (filename) => {
          const filePath = path.join(folderPath, filename);
          return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
        };
        
        const musicConfPath = path.join(folderPath, 'music.json');
        if (!fs.existsSync(musicConfPath)) {
            try {
                fs.writeFileSync(musicConfPath, JSON.stringify(album.info, null, 2), 'utf8');
                console.log('music.json created at:', musicConfPath);
            } catch (err) {
                console.error('Error creating music.json:', err);
            }
        }

        try {
            const data = fs.readFileSync(musicConfPath, 'utf8');
            const parsedData = JSON.parse(data);
            album.info = parsedData || null;
            console.log('music.json:', parsedData);
        } catch (err) {
            console.error('Error reading or parsing music.json:', err);
        }

        // Look for cover image
        const coverFile = files.find(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
        });
        if (coverFile) {
          album.cover = path.join(folderPath, coverFile);
        }

        // Process tracks
        const ungarnizedTracks = [];
        for (const audioFile of audioFiles) {
          const trackPath = path.join(folderPath, audioFile);
          const title = path.basename(audioFile, path.extname(audioFile));
          console.log('Track:', title);

          try {
            const metadata = await mm.parseFile(trackPath);
            ungarnizedTracks.push({
              title,
              path: trackPath,
              duration: metadata.format.duration || 0
            });
          } catch (err) {
            ungarnizedTracks.push({
              title,
              path: trackPath,
              duration: 0
            });
          }
        }


        album.info['musicList'].forEach((track) => {
          ungarnizedTracks.forEach((ungarnizedTrack) => {
            const title = track.title
            .replace(/^\d+\s+/, '')
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
            .trim();

            let CheckTitle = title
            .toLowerCase()
            .split('feat')[0]
            .split('ft')[0]
            .split('(')[0]
            .trim()

            if (track.title.toLowerCase().replace(/^\d+\s+/, '').trim() === CheckTitle) {
              console.log('Track found:', ungarnizedTrack);
              album.tracks.push({
                title: title,
                path: ungarnizedTrack.path,
                duration: ungarnizedTrack.duration
              });
              console.log('Track found:', title);
            }
          });
        });

        albums.push(album);
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
    console.log(`Attempting to extract audio and repackage to M4A: ${filePath}`);
    
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
      console.log('FFmpeg stderr:', data.toString());
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
