const clientId = '054bc32e28714b00b83d4761cd5406d9';
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/';
const scope = 'user-read-currently-playing user-read-playback-state';

let pollInterval = null;
let currentTrackId = null;
let currentAlbumName = "";
let activeBgId = 'bg-a';
let inactivityTimer = null;
let immersiveSequenceTimeout = null;
let overlaySwitchTimeout = null;
const IDLE_DELAY_MS = 5000;
const OVERLAY_FADE_MS = 2000;
const OVERLAY_1_DURATION_MS = 30000;
const OVERLAY_2_DURATION_MS = 30000;

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
    } catch (err) { console.error(err); showReconnectScreen(); }
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
        if (!response.ok || !data.access_token) { clearSpotifySession(); return null; }
        localStorage.setItem('access_token', data.access_token);
        return data.access_token;
    } catch (err) { return null; }
}

/* --- IMMERSIVE LOGIC --- */
function setupActivityWatchers() {
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(e => {
        window.addEventListener(e, handleUserActivity, { passive: true });
    });
}

function handleUserActivity() {
    exitImmersiveMode();
    resetInactivityTimer();
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => enterImmersiveMode(), IDLE_DELAY_MS);
}

function enterImmersiveMode() {
    const player = document.getElementById('player-screen');
    if (!player || player.style.display === 'none') return;
    document.body.classList.add('immersive');
    startImmersiveSequence();
}

function exitImmersiveMode() {
    document.body.classList.remove('immersive');
    clearTimeout(immersiveSequenceTimeout);
    clearTimeout(overlaySwitchTimeout);
    hideOverlay(document.getElementById('immersive-overlay-1'));
    hideOverlay(document.getElementById('immersive-overlay-2'));
}

function hideOverlay(el) {
    if (!el) return;
    el.classList.remove('active');
}

function showOverlay(el) {
    if (!el) return;
    el.classList.add('active');
}

function buildRepeatedLine(text) {
    const value = (text || '').trim();
    return value ? (value + ' ').repeat(34).trim() : '';
}

function populateMarqueeText() {
    const track = document.getElementById('track-title').textContent;
    const artist = document.getElementById('track-artist').textContent;
    const album = currentAlbumName.toUpperCase();

    document.getElementById('imm-track-1').textContent = buildRepeatedLine(track);
    document.getElementById('imm-artist-1').textContent = buildRepeatedLine(artist);
    document.getElementById('imm-album-1').textContent = buildRepeatedLine(album);
}

function startImmersiveSequence() {
    const ov1 = document.getElementById('immersive-overlay-1');
    const ov2 = document.getElementById('immersive-overlay-2');

    clearTimeout(immersiveSequenceTimeout);
    clearTimeout(overlaySwitchTimeout);
    populateMarqueeText();
    generateWordCloud();

    hideOverlay(ov2);
    showOverlay(ov1);

    overlaySwitchTimeout = setTimeout(() => {
        hideOverlay(ov1);
        generateWordCloud();
        showOverlay(ov2);
    }, Math.max(0, OVERLAY_1_DURATION_MS - OVERLAY_FADE_MS));

    immersiveSequenceTimeout = setTimeout(() => {
        hideOverlay(ov2);
        setTimeout(() => {
            if (document.body.classList.contains('immersive')) {
                startImmersiveSequence();
            }
        }, OVERLAY_FADE_MS);
    }, OVERLAY_1_DURATION_MS + OVERLAY_2_DURATION_MS - OVERLAY_FADE_MS);
}

function generateWordCloud() {
    const container = document.getElementById('word-cloud-container');
    container.innerHTML = '';
    container.style.animation = 'none';
    void container.offsetWidth;
    container.style.animation = '';
    const words = [
        document.getElementById('track-title').textContent,
        document.getElementById('track-artist').textContent,
        currentAlbumName.toUpperCase()
    ];
    for (let i = 0; i < 120; i++) {
        const span = document.createElement('span');
        span.className = 'cloud-word';
        span.textContent = words[i % 3] + " ";
        span.style.animationDelay = `${i * 0.15}s`;
        container.appendChild(span);
    }
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

            document.getElementById('track-title').textContent = item.name.toUpperCase();
            document.getElementById('track-artist').textContent = item.artists[0].name.toUpperCase();
            document.getElementById('track-img').src = item.album.images[0].url;
            
            swapBackground(item.album.images[0].url);
            applyPaletteFromImage(item.album.images[0].url);
        }
    } catch (err) { console.error(err); }
}

function showPlayer() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'block';
}

function swapBackground(imageUrl) {
    const active = document.getElementById(activeBgId);
    activeBgId = activeBgId === 'bg-a' ? 'bg-b' : 'bg-a';
    const inactive = document.getElementById(activeBgId);
    inactive.style.backgroundImage = `url("${imageUrl}")`;
    inactive.classList.add('active');
    active.classList.remove('active');
}

/* --- HELPERS --- */
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

// ... include applyPaletteFromImage, extractPalette, etc from your original code here ...
