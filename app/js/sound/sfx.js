const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const sfxAudioPath = '../sound/sfx/';
const sfx = {
    click: ['click.wav', 1],
    jobPurchase: ['buy.wav', 10],
    jobSell: ['error.wav', 1],
    bankrupt: ['bankrupt.wav', 1],
    warning: ['warning.wav', 1],
    saveChanges: ['buy.wav', 10],
    gameJackpot: ['gameJackpot.wav', 1],
    gameBonus: ['gameBonus.wav', 1],
    gameError: ['gameError.wav', 1],
};

// Pitch sequence (like chord progression)
const notes = [1.1, 1.15, 1.2, 1.15];
let currentNoteIndex = 0;

// Cache for decoded buffers
const audioBuffers = {};

async function loadSound(eventType) {
    const fileName = sfx[eventType]?.[0];
    if (!fileName) return null;

    if (!audioBuffers[eventType]) {
        const filePath = path.join(__dirname, sfxAudioPath, fileName);

        const fileData = await fs.promises.readFile(filePath);
        const arrayBuffer = fileData.buffer.slice(
            fileData.byteOffset,
            fileData.byteOffset + fileData.byteLength
        );
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        audioBuffers[eventType] = decoded;
    }

    return audioBuffers[eventType];
}

async function loadAllSounds() {
    const loadPromises = Object.keys(sfx).map(eventType => loadSound(eventType));
    await Promise.all(loadPromises);
}
loadAllSounds();

function createDistortionCurve(amount = 50) {
    const k = typeof amount === 'number' ? amount : 50;
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
    volumeMultiplier *= settings.volume;

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
        distortionNode.oversample = '4x';
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
