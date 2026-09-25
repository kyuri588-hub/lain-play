
/* ========================================
   LAIN PLAYER // SUPABASE AUDIO ENGINE
======================================== */

// ========================================
// SUPABASE CONFIGURATION
// ========================================

const SUPABASE_URL =
    "https://zsjhnvglxgocqrugmmbl.supabase.co";

// COLE SUA PUBLISHABLE KEY ENTRE AS ASPAS
const SUPABASE_KEY =
    "sb_publishable_CaSNrFBE57kpYqNBewYOlg_LbPvyhhE";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_AUDIO_TYPES = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/aac",
    "audio/mp4",
    "audio/x-m4a"
];

// ========================================
// ELEMENTS
// ========================================

const audioInput = document.getElementById("audioInput");
const audioPlayer = document.getElementById("audioPlayer");
audioPlayer.crossOrigin = "anonymous";

const playlistElement = document.getElementById("playlist");
const trackCountElement = document.getElementById("trackCount");

const currentTitle = document.getElementById("currentTitle");
const currentArtist = document.getElementById("currentArtist");

const playButton = document.getElementById("playButton");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");

const progressBar = document.getElementById("progressBar");
const volumeBar = document.getElementById("volumeBar");

const currentTimeElement = document.getElementById("currentTime");
const durationElement = document.getElementById("duration");

const systemStatus = document.getElementById("systemStatus");
const systemFiles = document.getElementById("systemFiles");

const visualizerCanvas = document.getElementById("visualizer");
const visualizerStatus = document.getElementById("visualizerStatus");

const ctx = visualizerCanvas.getContext("2d");

// ========================================
// STATE
// ========================================

let tracks = [];
let currentTrackIndex = -1;

let audioContext = null;
let analyser = null;
let sourceNode = null;
let frequencyData = null;

let animationFrame = null;

// ========================================
// IMPORT AUDIO
// ========================================

audioInput.addEventListener("change", async function () {

    const files = Array.from(this.files);

    if (files.length === 0) {
        return;
    }

    for (const file of files) {
        await uploadTrack(file);
    }

    this.value = "";

});

// ========================================
// UPLOAD TO SUPABASE
// ========================================

async function uploadTrack(file) {

    if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
        alert("Formato de áudio não suportado.");
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        alert("O arquivo ultrapassa o limite de 20 MB.");
        return;
    }

    const titleInput = prompt(
        "Nome da música:",
        file.name.replace(/\.[^/.]+$/, "")
    );

    if (titleInput === null) {
        return;
    }

    const nicknameInput = prompt(
        "Seu nickname:",
        "anonymous"
    );

    if (nicknameInput === null) {
        return;
    }

    const title = titleInput.trim();
    const nickname = nicknameInput.trim() || "anonymous";

    if (title.length < 1 || title.length > 100) {
        alert("O nome deve ter entre 1 e 100 caracteres.");
        return;
    }

    if (nickname.length > 30) {
        alert("O nickname deve ter no máximo 30 caracteres.");
        return;
    }

    const safeName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");

    const filePath = `${crypto.randomUUID()}-${safeName}`;

    systemStatus.textContent = "UPLOADING";
    visualizerStatus.textContent = "TRANSMITTING";

    try {

        // Enviar arquivo para o Storage
        const { error: uploadError } =
            await supabaseClient.storage
                .from("music")
                .upload(filePath, file, {
                    contentType: file.type || "audio/mpeg",
                    upsert: false
                });

        if (uploadError) {
            throw uploadError;
        }

        // Obter URL pública
        const { data: publicUrlData } =
            supabaseClient.storage
                .from("music")
                .getPublicUrl(filePath);

        const publicUrl = publicUrlData.publicUrl;

        // Salvar informações na tabela
        const { error: databaseError } =
            await supabaseClient
                .from("tracks")
                .insert({
                    title: title,
                    nickname: nickname,
                    file_path: filePath,
                    public_url: publicUrl
                });

        if (databaseError) {

            await supabaseClient.storage
                .from("music")
                .remove([filePath]);

            throw databaseError;
        }

        alert("Música enviada com sucesso!");

        await loadOnlineTracks();

        systemStatus.textContent = "ONLINE";
        visualizerStatus.textContent = "STANDBY";

    } catch (error) {

        console.error("Erro no upload:", error);

        alert(
            "Erro ao enviar a música. Pressione F12 e confira o Console."
        );

        systemStatus.textContent = "UPLOAD ERROR";
        visualizerStatus.textContent = "STANDBY";

    }

}

// ========================================
// LOAD ONLINE TRACKS
// ========================================

async function loadOnlineTracks() {

    try {

        const { data, error } =
            await supabaseClient
                .from("tracks")
                .select(
                    "id, title, nickname, file_path, public_url, created_at"
                )
                .order("created_at", {
                    ascending: false
                });

        if (error) {
            throw error;
        }

        tracks = (data || []).map(track => ({

            id: track.id,
            name: track.title,
            nickname: track.nickname,
            file_path: track.file_path,
            public_url: track.public_url,
            online: true

        }));

        currentTrackIndex = -1;

        updatePlaylist();
        updateSystemInfo();

        systemStatus.textContent = "ONLINE";

    } catch (error) {

        console.error(
            "Erro ao carregar músicas online:",
            error
        );

        systemStatus.textContent = "DATABASE ERROR";

    }

}

// ========================================
// PLAYLIST RENDER
// ========================================

function updatePlaylist() {

    playlistElement.innerHTML = "";

    trackCountElement.textContent =
        `${tracks.length} TRACKS`;

    if (tracks.length === 0) {

        playlistElement.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">[ ? ]</span>
                <p>NO AUDIO DATA FOUND</p>
                <small>Import files to begin transmission.</small>
            </div>
        `;

        return;
    }

    tracks.forEach((track, index) => {

        const item = document.createElement("div");

        item.className = "track-item";

        if (index === currentTrackIndex) {
            item.classList.add("active");
        }

        const number = String(index + 1).padStart(2, "0");

        item.innerHTML = `
            <span class="track-number">${number}</span>

            <div class="track-main">
                <p class="track-name"></p>
                <small class="track-size"></small>
            </div>

            <button class="remove-track" title="Remove track">
                [X]
            </button>
        `;

        const trackName =
            item.querySelector(".track-name");

        const trackSize =
            item.querySelector(".track-size");

        trackName.textContent = track.name;

        trackSize.textContent =
            `ONLINE AUDIO // @${track.nickname || "anonymous"}`;

        const removeButton =
            item.querySelector(".remove-track");

        item.addEventListener("click", function (event) {

            if (event.target === removeButton) {
                return;
            }

            loadTrack(index);
            playAudio();

        });

        removeButton.addEventListener("click", function (event) {

            event.stopPropagation();

            removeTrack(index);

        });

        playlistElement.appendChild(item);

    });

}

// ========================================
// LOAD TRACK
// ========================================

function loadTrack(index) {

    if (index < 0 || index >= tracks.length) {
        return;
    }

    currentTrackIndex = index;

    const track = tracks[index];

    audioPlayer.src =
        track.public_url || track.url;

    audioPlayer.load();

    currentTitle.textContent = track.name;

    currentArtist.textContent =
        track.nickname
            ? `UPLOADED BY // ${track.nickname}`
            : "ONLINE AUDIO";

    updatePlaylist();
    updateSystemInfo();

}

// ========================================
// PLAY / PAUSE
// ========================================

playButton.addEventListener("click", function () {

    if (tracks.length === 0) {
        return;
    }

    if (currentTrackIndex === -1) {

        loadTrack(0);
        playAudio();

        return;
    }

    if (audioPlayer.paused) {
        playAudio();
    } else {
        pauseAudio();
    }

});

function playAudio() {

    if (!audioPlayer.src) {
        return;
    }

    setupAudioContext();

    audioPlayer.play()
        .then(() => {

            playButton.textContent = "Ⅱ";
            systemStatus.textContent = "PLAYING";
            visualizerStatus.textContent = "ACTIVE";

        })
        .catch(error => {

            console.warn(
                "Audio playback error:",
                error
            );

        });

}

function pauseAudio() {

    audioPlayer.pause();

    playButton.textContent = "▶";
    systemStatus.textContent = "PAUSED";
    visualizerStatus.textContent = "STANDBY";

}

// ========================================
// NEXT / PREVIOUS
// ========================================

nextButton.addEventListener("click", function () {

    if (tracks.length === 0) {
        return;
    }

    let nextIndex = currentTrackIndex + 1;

    if (nextIndex >= tracks.length) {
        nextIndex = 0;
    }

    loadTrack(nextIndex);
    playAudio();

});

prevButton.addEventListener("click", function () {

    if (tracks.length === 0) {
        return;
    }

    let previousIndex = currentTrackIndex - 1;

    if (previousIndex < 0) {
        previousIndex = tracks.length - 1;
    }

    loadTrack(previousIndex);
    playAudio();

});

// ========================================
// AUTO NEXT
// ========================================

audioPlayer.addEventListener("ended", function () {

    if (tracks.length === 0) {
        return;
    }

    let nextIndex = currentTrackIndex + 1;

    if (nextIndex >= tracks.length) {
        nextIndex = 0;
    }

    loadTrack(nextIndex);
    playAudio();

});

// ========================================
// PROGRESS
// ========================================

audioPlayer.addEventListener("loadedmetadata", function () {

    progressBar.max =
        audioPlayer.duration || 0;

    durationElement.textContent =
        formatTime(audioPlayer.duration);

});

audioPlayer.addEventListener("timeupdate", function () {

    progressBar.value =
        audioPlayer.currentTime;

    currentTimeElement.textContent =
        formatTime(audioPlayer.currentTime);

});

progressBar.addEventListener("input", function () {

    audioPlayer.currentTime =
        Number(this.value);

});

// ========================================
// VOLUME
// ========================================

audioPlayer.volume = 0.8;

volumeBar.addEventListener("input", function () {

    audioPlayer.volume =
        Number(this.value);

});

// ========================================
// REMOVE LOCAL TRACK
// ========================================

function removeTrack(index) {

    if (index < 0 || index >= tracks.length) {
        return;
    }

    const removedTrack = tracks[index];

    if (removedTrack.url) {
        URL.revokeObjectURL(removedTrack.url);
    }

    tracks.splice(index, 1);

    if (tracks.length === 0) {

        audioPlayer.pause();
        audioPlayer.removeAttribute("src");
        audioPlayer.load();

        currentTrackIndex = -1;

        currentTitle.textContent =
            "NO TRACK SELECTED";

        currentArtist.textContent =
            "ONLINE AUDIO";

        playButton.textContent = "▶";
        systemStatus.textContent = "IDLE";

    } else if (index === currentTrackIndex) {

        audioPlayer.pause();

        currentTrackIndex =
            Math.min(index, tracks.length - 1);

        loadTrack(currentTrackIndex);

        playButton.textContent = "▶";
        systemStatus.textContent = "IDLE";

    } else if (index < currentTrackIndex) {

        currentTrackIndex--;

    }

    updatePlaylist();
    updateSystemInfo();

}

// ========================================
// SYSTEM INFO
// ========================================

function updateSystemInfo() {

    systemFiles.textContent =
        tracks.length;

}

// ========================================
// THEMES
// ========================================

const themeButtons =
    document.querySelectorAll(".theme-button");

themeButtons.forEach(button => {

    button.addEventListener("click", function () {

        const theme = this.dataset.theme;

        document.body.dataset.theme =
            theme;

        themeButtons.forEach(btn => {

            btn.classList.remove("active");

        });

        this.classList.add("active");

    });

});

// ========================================
// AUDIO CONTEXT
// ========================================

function setupAudioContext() {

    if (audioContext) {

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        return;
    }

    audioContext = new (
        window.AudioContext ||
        window.webkitAudioContext
    )();

    analyser =
        audioContext.createAnalyser();

    analyser.fftSize = 256;

    analyser.smoothingTimeConstant = 0.8;

    frequencyData =
        new Uint8Array(
            analyser.frequencyBinCount
        );

    sourceNode =
        audioContext.createMediaElementSource(
            audioPlayer
        );

    sourceNode.connect(analyser);

    analyser.connect(
        audioContext.destination
    );

    startVisualizer();

}

// ========================================
// VISUALIZER
// ========================================

function resizeCanvas() {

    const rect =
        visualizerCanvas.getBoundingClientRect();

    const dpr =
        window.devicePixelRatio || 1;

    visualizerCanvas.width =
        Math.max(1, Math.floor(rect.width * dpr));

    visualizerCanvas.height =
        Math.max(1, Math.floor(rect.height * dpr));

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

}

function drawVisualizer() {

    const width =
        visualizerCanvas.clientWidth;

    const height =
        visualizerCanvas.clientHeight;

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    ctx.fillStyle = "#020403";

    ctx.fillRect(
        0,
        0,
        width,
        height
    );

    if (!analyser || !frequencyData) {

        drawIdleVisualizer();

        animationFrame =
            requestAnimationFrame(
                drawVisualizer
            );

        return;
    }

    analyser.getByteFrequencyData(
        frequencyData
    );

    const computedStyle =
        getComputedStyle(document.body);

    const mainColor =
        computedStyle
            .getPropertyValue("--main-color")
            .trim();

    const barCount =
        Math.min(64, frequencyData.length);

    const gap = 3;

    const barWidth =
        Math.max(
            1,
            (width - (barCount - 1) * gap) /
                barCount
        );

    for (let i = 0; i < barCount; i++) {

        const value =
            frequencyData[i] / 255;

        const barHeight =
            Math.max(
                2,
                value * (height - 20)
            );

        const x =
            i * (barWidth + gap);

        const y =
            height - barHeight;

        ctx.fillStyle =
            mainColor;

        ctx.fillRect(
            x,
            y,
            barWidth,
            barHeight
        );

    }

    animationFrame =
        requestAnimationFrame(
            drawVisualizer
        );

}

function drawIdleVisualizer() {

    const width =
        visualizerCanvas.clientWidth;

    const height =
        visualizerCanvas.clientHeight;

    const computedStyle =
        getComputedStyle(document.body);

    const mainColor =
        computedStyle
            .getPropertyValue("--main-color")
            .trim();

    ctx.strokeStyle =
        mainColor;

    ctx.globalAlpha = 0.5;

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(
        0,
        height / 2
    );

    ctx.lineTo(
        width,
        height / 2
    );

    ctx.stroke();

    ctx.globalAlpha = 1;

}

function startVisualizer() {

    if (animationFrame) {
        return;
    }

    animationFrame =
        requestAnimationFrame(
            drawVisualizer
        );

}

// ========================================
// WINDOW RESIZE
// ========================================

window.addEventListener(
    "resize",
    resizeCanvas
);

// ========================================
// UTILITIES
// ========================================

function formatTime(seconds) {

    if (
        !Number.isFinite(seconds) ||
        seconds < 0
    ) {
        return "00:00";
    }

    const minutes =
        Math.floor(seconds / 60);

    const remainingSeconds =
        Math.floor(seconds % 60);

    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;

}

function formatFileSize(bytes) {

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

}

// ========================================
// INITIALIZATION
// ========================================

resizeCanvas();

drawIdleVisualizer();

updateSystemInfo();

loadOnlineTracks();

console.log(
    "WIRED_PLAYER // SUPABASE INITIALIZED"
);