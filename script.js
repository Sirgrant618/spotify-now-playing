const clientId = '054bc32e28714b00b83d4761cd5406d9';
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/';
const scope = 'user-read-currently-playing user-read-playback-state';

let pollInterval = null;
let currentTrackId = null;
let currentAlbumName = "";
let activeBgId = 'bg-a';
let inactivityTimer = null;
let immersiveSequenceTimeout = null;
const IDLE_DELAY_MS = 5000;

/* --- AUTH --- */
async function redirectToSpotify() {
    const verifier = generateRandomString(64);
    localStorage.setItem('code_verifier', verifier);
    const challenge = await generateCodeChallenge(verifier);
    const params = new URLSearchParams({
        response_type: 'code', client_id: clientId, scope,
        code_challenge_method: 'S256', code_challenge: challenge, redirect_uri: redirectUri
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
setupActivityWatchers();
bootstrapAuth();

async function bootstrapAuth() {
    if (code) { await handleCallback(code); return; }
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');
    if (accessToken) { showPlayer(); startPolling(accessToken); resetInactivityTimer(); return; }
    if (refreshToken) {
        const newAccessToken = await refreshAccessToken();
        if (newAccessToken) { showPlayer(); startPolling(newAccessToken); resetInactivityTimer(); }
    }
}

async function handleCallback(code) {
    try {
        const codeVerifier = localStorage.getItem('code_verifier');
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId, grant_type: 'authorization_code',
                code, redirect_uri: redirectUri, code_verifier: codeVerifier
            })
        });
        const data = await response.json();
        if (data.access_token) {
            localStorage.setItem('access_token', data.access_token);
            if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
            window.history.pushState({}, document.title, '/spotify-now-playing/');
            showPlayer(); startPolling(data.access_token); resetInactivityTimer();
        }
    } catch (err) { console.error(err); }
}

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return null;
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken })
        });
        const data = await response.json();
        if (!response.ok || !data.access_token) return null;
        localStorage.setItem('access_token', data.access_token);
        return data.access_token;
    } catch (err) { return null; }
}

/* --- POLLING & UI --- */
function startPolling(token) {
    updateNowPlaying(token);
    pollInterval = setInterval(() => updateNowPlaying(localStorage.getItem('access_token')), 5000);
}

async function updateNowPlaying(token) {
    try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 204 || !res.ok) return;
        const data = await res.json();
        if (!data.item) return;

        const item = data.item;
        if (item.id !== currentTrackId) {
            currentTrackId = item.id;
            currentAlbumName = item.album.name;
            exitImmersiveMode();
            resetInactivityTimer();

            // FETCH ARTIST IMAGE
            const artistId = item.artists[0].id;
            const artistRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const artistData = await artistRes.json();
            const artistImg = artistData.images[0]?.url || item.album.images[0].url; // Fallback to album art

            document.getElementById('track-title').textContent = item.name.toUpperCase();
            document.getElementById('track-artist').textContent = item.artists[0].name.toUpperCase();
            document.getElementById('track-img').src = item.album.images[0].url;
            
            swapBackground(artistImg); // Set background to artist image
            // applyPaletteFromImage(artistImg); // Optional: update colors based on artist photo
        }
    } catch (err) { console.error(err); }
}

function swapBackground(imageUrl) {
    const active = document.getElementById(activeBgId);
    activeBgId = activeBgId === 'bg-a' ? 'bg-b' : 'bg-a';
    const inactive = document.getElementById(activeBgId);
    inactive.style.backgroundImage = `url("${imageUrl}")`;
    inactive.classList.add('active');
    active.classList.remove('active');
}

/* --- IMMERSIVE & HELPERS --- */
function setupActivityWatchers() {
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(e => {
        window.addEventListener(e, () => { exitImmersiveMode(); resetInactivityTimer(); }, { passive: true });
    });
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => enterImmersiveMode(), IDLE_DELAY_MS);
}

function enterImmersiveMode() {
    if (document.getElementById('player-screen').style.display === 'block') {
        document.body.classList.add('immersive');
        startImmersiveSequence();
    }
}

function exitImmersiveMode() {
    document.body.classList.remove('immersive');
    clearTimeout(immersiveSequenceTimeout);
    document.getElementById('immersive-overlay-1').style.display = 'none';
    document.getElementById('immersive-overlay-2').style.display = 'none';
}

function startImmersiveSequence() {
    const ov1 = document.getElementById('immersive-overlay-1');
    const ov2 = document.getElementById('immersive-overlay-2');
    
    document.getElementById('imm-track-1').textContent = (document.getElementById('track-title').textContent + ' ').repeat(15);
    document.getElementById('imm-artist-1').textContent = (document.getElementById('track-artist').textContent + ' ').repeat(15);
    document.getElementById('imm-album-1').textContent = (currentAlbumName.toUpperCase() + ' ').repeat(15);

    ov1.style.display = 'block';
    immersiveSequenceTimeout = setTimeout(() => {
        ov1.style.display = 'none';
        ov2.style.display = 'block';
        generateWordCloud();
    }, 30000);
}

function generateWordCloud() {
    const container = document.getElementById('word-cloud-container');
    container.innerHTML = '';
    const words = [document.getElementById('track-title').textContent, document.getElementById('track-artist').textContent, currentAlbumName.toUpperCase()];
    for (let i = 0; i < 60; i++) {
        const span = document.createElement('span');
        span.className = 'cloud-word';
        span.textContent = words[i % 3] + " ";
        container.appendChild(span);
    }
}

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function showPlayer() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'block';
}