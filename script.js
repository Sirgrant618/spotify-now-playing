const clientId = '054bc32e28714b00b83d4761cd5406d9';
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/';
const scope = 'user-read-currently-playing user-read-playback-state';

let pollInterval = null;
let currentTrackId = null;
let currentAlbumName = "";
let activeBgId = 'bg-a';
let inactivityTimer = null;
let immersiveSequenceTimeout = null;
let lastImmersiveIndex = -1; 
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
    // Use backticks for the template literal
    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

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

    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');

    if (accessToken) {
        showPlayer();
        startPolling(accessToken);
        resetInactivityTimer();
    } else if (refreshToken) {
        const newToken = await refreshAccessToken();
        if (newToken) {
            showPlayer();
            startPolling(newToken);
        }
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
            window.history.pushState({}, document.title, window.location.pathname);
            showPlayer(); startPolling(data.access_token); resetInactivityTimer();
        }
    } catch (err) { console.error(err); }
}

/* --- ARTIST IMAGE FETCH --- */
async function getArtistImage(token, artistId) {
    try {
        const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        return data.images[0]?.url || ""; 
    } catch (e) { return ""; }
}

/* --- POLLING & UI --- */
function startPolling(token) {
    if (pollInterval) clearInterval(pollInterval); 
    updateNowPlaying(token);
    pollInterval = setInterval(() => {
        const currentToken = localStorage.getItem('access_token');
        updateNowPlaying(currentToken);
    }, 5000);
}

async function updateNowPlaying(token) {
    try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 401) {
            const newToken = await refreshAccessToken();
            if (newToken) {
                clearInterval(pollInterval);
                startPolling(newToken);
            }
            return; 
        }

        if (res.status === 204 || !res.ok) return;
        
        const data = await res.json();
        if (!data.item) return;

        const item = data.item;
        if (item.id !== currentTrackId) {
            currentTrackId = item.id;
            currentAlbumName = item.album.name;
            
            document.getElementById('track-title').textContent = item.name.toUpperCase();
            document.getElementById('track-artist').textContent = item.artists[0].name.toUpperCase();
            document.getElementById('track-img').src = item.album.images[0].url;

            const artistImgUrl = await getArtistImage(token, item.artists[0].id);
            swapBackground(artistImgUrl || item.album.images[0].url); 
            
            exitImmersiveMode();
            resetInactivityTimer();
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

/* --- IMMERSIVE LOGIC --- */
function setupActivityWatchers() {
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(e => {
        window.addEventListener(e, handleUserActivity, { passive: true });
    });
}

function handleUserActivity() { exitImmersiveMode(); resetInactivityTimer(); }

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
    
    ['1', '2', '3', '4'].forEach(num => {
        const ov = document.getElementById(`immersive-overlay-${num}`);
        if (ov) {
            ov.style.display = 'none';
            ov.classList.remove('fade-in');
        }
    });
}

// --- SEQUENCING START ---
function startImmersiveSequence() {
    // UPDATED: Include the 4th overlay in this list so the sequence sees it
    const overlays = [
        document.getElementById('immersive-overlay-1'),
        document.getElementById('immersive-overlay-2'),
        document.getElementById('immersive-overlay-3'),
        document.getElementById('immersive-overlay-4')
    ];

    // If a visual is already showing, fade it out first
    if (lastImmersiveIndex !== -1) {
        const currentOverlay = overlays[lastImmersiveIndex];
        
        // Safety check to ensure the element exists before trying to modify it
        if (currentOverlay) {
            currentOverlay.classList.remove('fade-in');

            // Wait for the 5s CSS transition to finish before hiding and moving to next
            setTimeout(() => {
                if (!document.body.classList.contains('immersive')) return;
                currentOverlay.style.display = 'none';
                triggerNextVisual(overlays);
            }, 5000); 
        } else {
            // Fallback if the index was somehow out of sync
            triggerNextVisual(overlays);
        }
    } else {
        triggerNextVisual(overlays);
    }
}

function triggerNextVisual(overlays) {
    // 1. Prepare data
    const track = document.getElementById('track-title').textContent;
    const artist = document.getElementById('track-artist').textContent;
    const album = currentAlbumName.toUpperCase();

    // 2. Select next index (ensuring we don't repeat the same visual twice)
    let nextIndex;
    const totalVisuals = 4; // Updated to include the Monolith
    do {
        nextIndex = Math.floor(Math.random() * totalVisuals);
    } while (nextIndex === lastImmersiveIndex);
    lastImmersiveIndex = nextIndex;

    // 3. Identify the active overlay
    // We use getElementById for 4 to ensure it's captured if not in the initial array
    const overlaysList = [
        document.getElementById('immersive-overlay-1'),
        document.getElementById('immersive-overlay-2'),
        document.getElementById('immersive-overlay-3'),
        document.getElementById('immersive-overlay-4')
    ];
    const activeOverlay = overlaysList[nextIndex];

    // 4. Initialization Logic per Visual
    if (nextIndex === 0) {
        // VISUAL 1: Marquee
        activeOverlay.style.display = 'block';
        document.getElementById('imm-track-1').textContent = (track + ' ').repeat(50);
        document.getElementById('imm-artist-1').textContent = (artist + ' ').repeat(50);
        document.getElementById('imm-album-1').textContent = (album + ' ').repeat(50);

    } else if (nextIndex === 1) {
        // VISUAL 2: Word Cloud
        activeOverlay.style.display = 'block';
        generateWordCloud();

    } else if (nextIndex === 2) {
        // VISUAL 3: Stacked Drift
        activeOverlay.style.display = 'flex';
        const dTrack = document.getElementById('drift-track');
        const dArtist = document.getElementById('drift-artist');
        const dAlbum = document.getElementById('drift-album');
        
        dTrack.textContent = track;
        dArtist.textContent = artist;
        dAlbum.textContent = album;

        [dTrack, dArtist, dAlbum].forEach(el => {
            el.className = 'drift-text'; 
            void el.offsetWidth; // Trigger reflow to restart animation
        });

        dTrack.classList.add('drift-rtl');
        dArtist.classList.add('drift-ltr');
        dAlbum.classList.add('drift-rtl');

    } else if (nextIndex === 3) {
        // VISUAL 4: Vertical Monolith
        activeOverlay.style.display = 'flex';
        
        // Select all elements by class to fill all 9 slots
        const tracks = activeOverlay.querySelectorAll('.mono-track');
        const artists = activeOverlay.querySelectorAll('.mono-artist');
        const albums = activeOverlay.querySelectorAll('.mono-album');
        
        tracks.forEach(el => el.textContent = track);
        artists.forEach(el => el.textContent = artist);
        albums.forEach(el => el.textContent = album);

        const container = activeOverlay.querySelector('.monolith-container');
        container.classList.remove('monolith-active');
        void container.offsetWidth; // Trigger reflow
        container.classList.add('monolith-active');
    }

    // 5. Trigger the fade-in transition
    setTimeout(() => activeOverlay.classList.add('fade-in'), 50);

    // 6. Schedule the next transition
    if (immersiveSequenceTimeout) clearTimeout(immersiveSequenceTimeout);
    immersiveSequenceTimeout = setTimeout(startImmersiveSequence, 35000);
}

function generateWordCloud() {
    const container = document.getElementById('word-cloud-container');
    container.innerHTML = '';
    
    const track = document.getElementById('track-title').textContent;
    const artist = document.getElementById('track-artist').textContent;
    const album = currentAlbumName.toUpperCase();
    
    const unitText = `${track} • ${artist} • ${album} • `;
    const words = unitText.split(' ');

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'word-block-wrapper';

    for (let i = 0; i < 40; i++) {
        const row = document.createElement('div');
        row.className = 'cloud-row';
        row.style.setProperty('--row-index', i);
        const randomOffset = Math.floor(Math.random() * 150);
        row.style.paddingLeft = `${randomOffset}px`;

        for (let j = 0; j < 6; j++) { 
            words.forEach((word, wordIndex) => {
                const span = document.createElement('span');
                span.className = 'word-unit';
                span.textContent = word + ' ';
                const appearanceDelay = (i * 0.1) + (j * words.length + wordIndex) * 0.05;
                span.style.setProperty('--word-delay', `${appearanceDelay}s`);
                row.appendChild(span);
            });
        }
        scrollWrapper.appendChild(row);
    }
    container.appendChild(scrollWrapper);
}

function showPlayer() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'block';
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
        if (data.refresh_token) {
            localStorage.setItem('refresh_token', data.refresh_token);
        }
        return data.access_token;
    } else {
        redirectToSpotify();
    }
}
//fullscreen stuff
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        // Enter Fullscreen
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        // Exit Fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}