/* --- CONFIG & STATE --- */
const clientId = '054bc32e28714b00b83d4761cd5406d9';
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/';
const scope = 'user-read-currently-playing user-read-playback-state';

// New variables for Fanart.tv and Background logic
const FANART_API_KEY = 'YOUR_FANART_API_KEY'; // REPLACE WITH YOUR KEY
let artistImages = [];
let backupAlbumArt = ""; 

let pollInterval = null;
let currentTrackId = null;
let currentAlbumName = "";
let activeBgId = 'bg-a';
let inactivityTimer = null;
let immersiveSequenceTimeout = null;
let lastImmersiveIndex = -1; 
const IDLE_DELAY_MS = 5000;

/* --- AUTH & INITIALIZATION --- */
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');

setupActivityWatchers();
bootstrapAuth();

async function bootstrapAuth() {
    if (code) { 
        await handleCallback(code); 
        window.history.replaceState({}, document.title, redirectUri);
        return; 
    }

    const token = localStorage.getItem('access_token');
    if (token) {
        startPolling();
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('player-screen').style.display = 'block';
    }
}

/* --- SPOTIFY DATA FETCHING --- */
function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    fetchCurrentTrack();
    pollInterval = setInterval(fetchCurrentTrack, 3000);
}

async function fetchCurrentTrack() {
    let token = localStorage.getItem('access_token');
    if (!token) return;

    try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            token = await refreshAccessToken();
            return fetchCurrentTrack();
        }

        if (res.status === 204 || res.status > 400) {
            // Nothing playing or error
            return;
        }

        const data = await res.json();
        updateUI(data);
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

/* --- UI UPDATE LOGIC --- */
function updateUI(data) {
    if (!data || !data.item) {
        document.getElementById('track-title').textContent = "NOTHING PLAYING";
        document.getElementById('track-artist').textContent = "OPEN SPOTIFY";
        return;
    }

    if (data.item.id !== currentTrackId) {
        currentTrackId = data.item.id;
        const trackName = data.item.name;
        const artistName = data.item.artists[0].name;
        currentAlbumName = data.item.album.name;
        const albumArt = data.item.album.images[0].url;

        // Update Standard Dashboard
        document.getElementById('track-title').textContent = trackName.toUpperCase();
        document.getElementById('track-artist').textContent = artistName.toUpperCase();
        document.getElementById('track-img').src = albumArt;

        // Fetch new backgrounds and set fallback
        updateArtistBackgrounds(artistName, albumArt);
        
        // Immediate swap for the standard view background
        swapBackgrounds(albumArt);
    }
}

/* --- FANART.TV & BACKGROUND HELPERS --- */
async function updateArtistBackgrounds(artistName, spotifyAlbumArt) {
    backupAlbumArt = spotifyAlbumArt;
    try {
        // Step 1: Find MusicBrainz ID
        const mbRes = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(artistName)}&fmt=json`);
        const mbData = await mbRes.json();
        const mbid = mbData.artists?.[0]?.id;

        if (!mbid) {
            artistImages = [];
            return;
        }

        // Step 2: Fetch images from Fanart.tv
        const fanRes = await fetch(`https://webservice.fanart.tv/v3/music/${mbid}?api_key=${FANART_API_KEY}`);
        if (!fanRes.ok) throw new Error();
        
        const fanData = await fanRes.json();
        artistImages = fanData.artistbackground?.map(img => img.url) || [];
    } catch (e) {
        artistImages = [];
    }
}

function setRandomImmersiveBackground() {
    let selectedImage = (artistImages.length > 0) 
        ? artistImages[Math.floor(Math.random() * artistImages.length)] 
        : backupAlbumArt;
        
    if (selectedImage) {
        swapBackgrounds(selectedImage); 
    }
}

function swapBackgrounds(imageUrl) {
    const nextBgId = (activeBgId === 'bg-a') ? 'bg-b' : 'bg-a';
    const nextBg = document.getElementById(nextBgId);
    const currBg = document.getElementById(activeBgId);

    nextBg.style.backgroundImage = `url(${imageUrl})`;
    nextBg.style.opacity = 1;
    currBg.style.opacity = 0;
    activeBgId = nextBgId;
}

/* --- IMMERSIVE MODE & SEQUENCER --- */
function setupActivityWatchers() {
    const reset = () => resetInactivityTimer();
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('touchstart', reset);
    resetInactivityTimer();
}

function resetInactivityTimer() {
    document.getElementById('player-screen').classList.remove('idle');
    const overlays = document.querySelectorAll('.immersive-content');
    overlays.forEach(el => el.style.display = 'none');
    
    if (immersiveSequenceTimeout) {
        clearTimeout(immersiveSequenceTimeout);
        immersiveSequenceTimeout = null;
    }

    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(enterIdleMode, IDLE_DELAY_MS);
}

function enterIdleMode() {
    document.getElementById('player-screen').classList.add('idle');
    triggerNextVisual();
}

function triggerNextVisual() {
    // Pick a new random background whenever the layout changes
    setRandomImmersiveBackground();

    const overlays = document.querySelectorAll('.immersive-content');
    overlays.forEach(el => el.style.display = 'none');

    let nextIndex;
    do {
        nextIndex = Math.floor(Math.random() * overlays.length);
    } while (nextIndex === lastImmersiveIndex);
    lastImmersiveIndex = nextIndex;

    const activeOverlay = document.getElementById(`immersive-overlay-${nextIndex + 1}`);
    const track = document.getElementById('track-title').textContent;
    const artist = document.getElementById('track-artist').textContent;
    const album = currentAlbumName || "";

    activeOverlay.style.display = 'flex';

    if (nextIndex === 0) {
        // Visual 1: Marquee
        document.getElementById('imm-track-1').textContent = track;
        document.getElementById('imm-artist-1').textContent = artist;
    } 
    else if (nextIndex === 1) {
        // Visual 2: Detailed
        document.getElementById('imm-track-2').textContent = track;
        document.getElementById('imm-artist-2').textContent = artist;
    } 
    else if (nextIndex === 2) {
        // Visual 3: Stacked Drift + RANDOM ROTATION
        const angles = [-30, -15, 15, 30];
        const randomAngle = angles[Math.floor(Math.random() * angles.length)];
        const container = activeOverlay.querySelector('.stacked-drift-container');
        if (container) {
            container.style.setProperty('--drift-rotation', `${randomAngle}deg`);
        }

        const dTrack = document.getElementById('drift-track');
        const dArtist = document.getElementById('drift-artist');
        const dAlbum = document.getElementById('drift-album');
        
        dTrack.textContent = track;
        dArtist.textContent = artist;
        dAlbum.textContent = album;

        [dTrack, dArtist, dAlbum].forEach(el => {
            el.className = 'drift-text'; 
            void el.offsetWidth;
        });

        dTrack.classList.add('drift-rtl');
        dArtist.classList.add('drift-ltr');
        dAlbum.classList.add('drift-rtl');
    } 
    else if (nextIndex === 3) {
        // Visual 4: Vertical Stack
        const lines = activeOverlay.querySelectorAll('.stack-line');
        lines.forEach(line => line.textContent = artist);
    }

    immersiveSequenceTimeout = setTimeout(triggerNextVisual, 10000);
}

/* --- AUTH UTILITIES --- */
async function handleCallback(code) {
    const verifier = localStorage.getItem('code_verifier');
    const url = "https://accounts.spotify.com/api/token";
    const payload = {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
        }),
    };

    const response = await fetch(url, payload);
    const data = await response.json();
    if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        location.reload();
    }
}

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return redirectToSpotify();

    const url = "https://accounts.spotify.com/api/token";
    const payload = {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId
        }),
    };

    const response = await fetch(url, payload);
    const data = await response.json();

    if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        return data.access_token;
    } else {
        redirectToSpotify();
    }
}

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

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/* --- FULLSCREEN --- */
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}