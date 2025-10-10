const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const sfxAudioPath = "../sound/sfx/";
let sfx = {};

// Pitch sequence (like chord progression)
const notes = [1.1, 1.15, 1.2, 1.15];
let currentNoteIndex = 0;

// Cache for decoded buffers
const audioBuffers = {};

async function loadSound(eventType) {
  const fileName = sfx[eventType]?.[0];
  if (!fileName) return null;

  if (!audioBuffers[eventType]) {
    const fileUrl = `file://${path.join(__dirname, sfxAudioPath, fileName)}`;

    try {
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      audioBuffers[eventType] = decoded;
    } catch (error) {
      console.error(`Failed to load sound "${fileName}":`, error);
      return null;
    }
  }

  return audioBuffers[eventType];
}

async function loadAllSounds() {
  const filePath = path.join(__dirname, sfxAudioPath);

  try {
    const files = fs.readdirSync(filePath);
    const audioExtensions = [".mp3", ".wav", ".ogg", ".flac", ".m4a"]; // Add more as needed

    files.forEach((file) => {
      const ext = path.extname(file).toLowerCase();
      if (audioExtensions.includes(ext)) {
        const key = path.basename(file, ext); // filename without extension
        sfx[key] = [file, 1];
      }
    });

    const loadPromises = Object.keys(sfx).map((eventType) =>
      loadSound(eventType),
    );
    await Promise.all(loadPromises);
  } catch (error) {
    console.error("Error loading sounds:", error);
  }
}
loadAllSounds();

function createDistortionCurve(amount = 50) {
  const k = typeof amount === "number" ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

let sfxBuffers = new Map();
async function playSoundAffect(eventType, distortion = 0, volume = 0) {
  if (sfxBuffers.has(eventType)) {
    if (Date.now() - sfxBuffers.get(eventType) < 13) return; // 13ms, or .13s
    sfxBuffers.set(eventType, Date.now());
  } else {
    sfxBuffers.set(eventType, Date.now());
  }

  const buffer = await loadSound(eventType);
  if (!buffer) return;

  let [_, volumeMultiplier = 1] = sfx[eventType];
  if (volume > 0) volumeMultiplier = volume;
  volumeMultiplier *= easeIn(settings.sfxVolume);

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const playbackRate = distortion > 0 ? distortion : notes[currentNoteIndex];
  source.playbackRate.setValueAtTime(playbackRate, audioCtx.currentTime);

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(volumeMultiplier, audioCtx.currentTime);

  // Optional distortion
  if (distortion > 0) {
    const distortionNode = audioCtx.createWaveShaper();
    distortionNode.curve = createDistortionCurve(distortion * 50);
    distortionNode.oversample = "4x";
    source.connect(distortionNode).connect(gainNode);
  } else {
    source.connect(gainNode);
  }

  gainNode.connect(audioCtx.destination);

  const duration = buffer.duration / playbackRate; // adjust for pitch shift
  gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  source.start();
  source.volume = volume;
  source.stop(audioCtx.currentTime + duration);

  currentNoteIndex = (currentNoteIndex + 1) % notes.length;
}

function createDistortionCurve(amount = 50) {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
