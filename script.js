const clientId = '054bc32e28714b00b83d4761cd5406d9';
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/';
const scope = 'user-read-currently-playing user-read-playback-state';

let pollInterval = null;
let currentTrackId = null;
let activeBgId = 'bg-a';
let inactivityTimer = null;
let cycleTimer = null;
const IDLE_DELAY_MS = 5000;

let currentMetadata = { title: '', artist: '', album: '' };

/* =========================
   AUTH & BOOTSTRAP (Unchanged)
========================= */
// ... (Keep existing redirectToSpotify, bootstrapAuth, handleCallback, refreshAccessToken)

/* =========================
   IMMERSIVE LOGIC
========================= */
function setupActivityWatchers() {
    const wakeEvents = ['mousemove', 'mousedown', 'touchstart', 'keydown'];
    wakeEvents.forEach(e => window.addEventListener(e, handleUserActivity, { passive: true }));
}

function handleUserActivity() {
    exitImmersiveMode();
    resetInactivityTimer();
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(enterImmersiveMode, IDLE_DELAY_MS);
}

function enterImmersiveMode() {
    const player = document.getElementById('player-screen');
    if (!player || player.style.display === 'none') return;
    
    document.body.classList.add('immersive');
    startImmersiveCycle();
}

function exitImmersiveMode() {
    document.body.classList.remove('immersive', 'show-v1', 'show-v2');
    clearTimeout(cycleTimer);
}

function startImmersiveCycle() {
    clearTimeout(cycleTimer);
    
    // Step 1: Show Overlay 1 for 30s
    document.body.classList.add('show-v1');
    document.body.classList.remove('show-v2');
    prepareOverlay1();

    cycleTimer = setTimeout(() => {
        // Step 2: Show Overlay 2 for 30s
        document.body.classList.remove('show-v1');
        document.body.classList.add('show-v2');
        prepareOverlay2();

        cycleTimer = setTimeout(() => {
            // Step 3: Restart cycle
            startImmersiveCycle();
        }, 30000);

    }, 30000);
}

function prepareOverlay1() {
    const { title, artist, album } = currentMetadata;
    const str = `${title}  ${artist}  ${album}  `.repeat(10);
    document.getElementById('m-title').textContent = `${title}  `.repeat(15);
    document.getElementById('m-artist').textContent = `${artist}  `.repeat(15);
    document.getElementById('m-album').textContent = `${album}  `.repeat(15);
}

function prepareOverlay2() {
    const container = document.getElementById('word-wall');
    container.innerHTML = '';
    const { title, artist, album } = currentMetadata;
    const fullText = `${title} ${artist} ${album} `.repeat(20);
    const words = fullText.split(' ');

    words.forEach((word, i) => {
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = word + ' ';
        span.style.animationDelay = `${i * 0.1}s`;
        container.appendChild(span);
    });
}

/* =========================
   POLLING & TRACK UPDATES
========================= */
async function updateNowPlaying(token, hasRetried = false) {
    try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 204) return renderIdleState();
        if (res.status === 401 && !hasRetried) {
            const newToken = await refreshAccessToken();
            return newToken ? updateNowPlaying(newToken, true) : showReconnectScreen();
        }

        const data = await res.json();
        if (!data?.item) return renderIdleState();

        const item = data.item;
        const trackId = item.id;

        if (trackId !== currentTrackId) {
            currentTrackId = trackId;
            currentMetadata = {
                title: item.name.toUpperCase(),
                artist: item.artists[0].name.toUpperCase(),
                album: item.album.name.toUpperCase()
            };

            exitImmersiveMode();
            resetInactivityTimer();

            document.getElementById('track-title').textContent = currentMetadata.title;
            document.getElementById('track-artist').textContent = currentMetadata.artist;
            document.getElementById('track-img').src = item.album.images[0].url;

            showPlayer();

            // Background Logic: Strictly Artist Image
            let artistImg = item.album.images[0].url; 
            try {
                const artistRes = await fetch(`https://api.spotify.com/v1/artists/${item.artists[0].id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (artistRes.ok) {
                    const artistData = await artistRes.json();
                    if (artistData.images.length) artistImg = artistData.images[0].url;
                }
            } catch (e) {}

            swapBackground(artistImg);
            applyPaletteFromImage(item.album.images[0].url);
        }
    } catch (err) { console.error(err); }
}

// ... (Keep existing showPlayer, showReconnectScreen, swapBackground, applyPaletteFromImage, etc.)