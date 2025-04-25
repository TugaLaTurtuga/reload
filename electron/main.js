const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mm = require('music-metadata');
const { json } = require('stream/consumers');

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

  try {
    return await scanMusicFolder(libraryPath);
  } catch (error) {
    console.error('Error scanning music library:', error);
    return [];
  }
});

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
          info: {},
          author: '',
          genre: '',
          year: '',
          color: '#333333'
        };

        // Optional metadata
        const tryRead = (filename) => {
          const filePath = path.join(folderPath, filename);
          return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
        };
        
        const musicConfPath = path.join(folderPath, 'music.json');
        if (!fs.existsSync(musicConfPath)) {
            try {
                const defaultConfig = { description: null };
                fs.writeFileSync(musicConfPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
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


        album.description['musicList'].forEach((track) => {
          ungarnizedTracks.forEach((ungarnizedTrack) => {
            let CheckTitle = ungarnizedTrack.title.trim(); // Remove file extension
            CheckTitle = CheckTitle.replace(/_/g, ' ').replace(/-/g, ' '); // Replace underscores and dashes with spaces
            const title = CheckTitle;

            // remove featured artists from title
            CheckTitle = CheckTitle.split('feat')[0];
            CheckTitle = CheckTitle.split('ft')[0];
            CheckTitle = CheckTitle.split('(')[0];
            console.log(CheckTitle, track);

            if (track.title.toLowerCase().replace(' ', '').trim() === CheckTitle.toLowerCase().replace(' ', '').trim()) {
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
