const clientId = '054bc32e28714b00b83d4761cd5406d9';
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/';
const scope = 'user-read-currently-playing user-read-playback-state';

let pollInterval = null;
let currentTrackId = null;
let activeBgId = 'bg-a';
let inactivityTimer = null;
const IDLE_DELAY_MS = 5000;

// Immersive Cycle State
let immersiveModeIndex = 0; // 0 = Marquee, 1 = Fill
let cycleInterval = null;

/* =========================
   AUTH & BOOTSTRAP
========================= */
// ... (Keep existing redirectToSpotify, bootstrapAuth, handleCallback, refreshAccessToken)
// Note: Ensure the redirect logic in redirectToSpotify uses valid Spotify URLs
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

async function bootstrapAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) { await handleCallback(code); return; }
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) { showPlayer(); startPolling(accessToken); resetInactivityTimer(); return; }
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) { const token = await refreshAccessToken(); if (token) { showPlayer(); startPolling(token); resetInactivityTimer(); } }
}

/* =========================
   IMMERSIVE LOGIC
========================= */
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
    document.body.classList.remove('immersive');
    stopImmersiveCycle();
}

function startImmersiveCycle() {
    stopImmersiveCycle();
    runCycle();
    cycleInterval = setInterval(runCycle, 30000);
}

function stopImmersiveCycle() {
    clearInterval(cycleInterval);
    document.getElementById('immersive-marquee').classList.remove('active-mode');
    document.getElementById('immersive-fill').classList.remove('active-mode');
}

function runCycle() {
    const marquee = document.getElementById('immersive-marquee');
    const fill = document.getElementById('immersive-fill');

    if (immersiveModeIndex === 0) {
        fill.classList.remove('active-mode');
        marquee.classList.add('active-mode');
        immersiveModeIndex = 1;
    } else {
        marquee.classList.remove('active-mode');
        fill.classList.add('active-mode');
        setupWordFill(); // Re-trigger word animation
        immersiveModeIndex = 0;
    }
}

function setupMarquee(title, artist, album) {
    const s = `<span>${title} &nbsp; ${title} &nbsp;</span>`;
    const ar = `<span>${artist} &nbsp; ${artist} &nbsp;</span>`;
    const al = `<span>${album} &nbsp; ${album} &nbsp;</span>`;
    
    document.getElementById('m-song').innerHTML = s.repeat(10);
    document.getElementById('m-artist').innerHTML = ar.repeat(15);
    document.getElementById('m-album').innerHTML = al.repeat(12);
}

function setupWordFill() {
    const container = document.getElementById('fill-container');
    container.innerHTML = '';
    const text = (document.getElementById('track-title').textContent + " " + 
                  document.getElementById('track-artist').textContent + " " + 
                  (window.currentAlbumName || "")).split(' ');
    
    for (let i = 0; i < 200; i++) {
        const word = document.createElement('span');
        word.className = 'fill-word';
        word.textContent = text[i % text.length];
        word.style.animationDelay = `${i * 0.1}s`;
        container.appendChild(word);
    }
}

/* =========================
   POLLING & UI
========================= */
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
            window.currentAlbumName = item.album.name;
            
            document.getElementById('track-title').textContent = item.name.toUpperCase();
            const artistName = item.artists[0].name.toUpperCase();
            document.getElementById('track-artist').textContent = artistName;
            document.getElementById('track-img').src = item.album.images[0].url;

            setupMarquee(item.name.toUpperCase(), artistName, item.album.name.toUpperCase());
            exitImmersiveMode();
            resetInactivityTimer();

            // Background Logic: Fetch Artist Image
            let bgUrl = item.album.images[0].url;
            const artistRes = await fetch(`https://api.spotify.com/v1/artists/${item.artists[0].id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (artistRes.ok) {
                const aData = await artistRes.json();
                if (aData.images.length > 0) bgUrl = aData.images[0].url;
            }
            swapBackground(bgUrl);
        }
    } catch (e) { console.error(e); }
}

// ... (Keep existing setupActivityWatchers, handleUserActivity, swapBackground, helpers)

function setupActivityWatchers() {
    ['mousemove', 'keydown', 'touchstart'].forEach(e => {
        window.addEventListener(e, () => { exitImmersiveMode(); resetInactivityTimer(); });
    });
}

function swapBackground(imageUrl) {
    const active = document.getElementById(activeBgId);
    activeBgId = activeBgId === 'bg-a' ? 'bg-b' : 'bg-a';
    const inactive = document.getElementById(activeBgId);
    inactive.style.backgroundImage = `url(${imageUrl})`;
    inactive.classList.add('active');
    active.classList.remove('active');
}

// Helper for crypto strings
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

async function handleCallback(code) {
    const codeVerifier = localStorage.getItem('code_verifier');
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId, grant_type: 'authorization_code', code,
            redirect_uri: redirectUri, code_verifier: codeVerifier
        })
    });
    const data = await response.json();
    if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        window.history.pushState({}, document.title, "/");
        bootstrapAuth();
    }
}

function showPlayer() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'block';
}

bootstrapAuth();
setupActivityWatchers();
