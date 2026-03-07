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
    window.location.href = `https://accounts.spotify.com/authorize?$${params.toString()}`;
}

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
setupActivityWatchers();
bootstrapAuth();

async function bootstrapAuth() {
    if (code) { 
        await handleCallback(code); 
        // Remove the code from the URL so a refresh doesn't trigger handleCallback again
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
        // If we don't have an access token but HAVE a refresh token, use it!
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
    // Clear any existing interval before starting a new one
    if (pollInterval) clearInterval(pollInterval); 
    
    updateNowPlaying(token);
    pollInterval = setInterval(() => {
        // Always get the latest token from storage in case it was refreshed
        const currentToken = localStorage.getItem('access_token');
        updateNowPlaying(currentToken);
    }, 5000);
}

async function updateNowPlaying(token) {
    try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${token}` }
        });

        // --- NEW REFRESH LOGIC ---
        if (res.status === 401) {
            console.log("Token expired, refreshing...");
            const newToken = await refreshAccessToken();
            if (newToken) {
                // Stop the old interval and start a new one with the fresh token
                clearInterval(pollInterval);
                startPolling(newToken);
            }
            return; 
        }
        // --- END REFRESH LOGIC ---

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

// THIS FUNCTION WAS MISSING
function enterImmersiveMode() {
    const player = document.getElementById('player-screen');
    if (!player || player.style.display === 'none') return;
    document.body.classList.add('immersive');
    startImmersiveSequence();
}

function exitImmersiveMode() {
    document.body.classList.remove('immersive');
    clearTimeout(immersiveSequenceTimeout);
    
    ['1', '2', '3'].forEach(num => {
        const ov = document.getElementById(`immersive-overlay-${num}`);
        ov.style.display = 'none';
        ov.classList.remove('fade-in');
    });
}

let immersiveStep = 0; // Global or scoped inside startImmersiveSequence

function startImmersiveSequence() {
    const overlays = [
        document.getElementById('immersive-overlay-1'),
        document.getElementById('immersive-overlay-2'),
        document.getElementById('immersive-overlay-3')
    ];

    const track = document.getElementById('track-title').textContent;
    const artist = document.getElementById('track-artist').textContent;
    const album = currentAlbumName.toUpperCase();

    // Prep Overlay 1 (Marquee)
    document.getElementById('imm-track-1').textContent = (track + ' ').repeat(50);
    document.getElementById('imm-artist-1').textContent = (artist + ' ').repeat(50);
    document.getElementById('imm-album-1').textContent = (album + ' ').repeat(50);

    // Prep Overlay 3 (Stacked Drift)
    const dTrack = document.getElementById('drift-track');
    const dArtist = document.getElementById('drift-artist');
    const dAlbum = document.getElementById('drift-album');
    
    dTrack.textContent = track;
    dArtist.textContent = artist;
    dAlbum.textContent = album;

    async function switchVisual() {
        const current = overlays[immersiveStep % 3];
        immersiveStep++;
        const next = overlays[immersiveStep % 3];

        current.classList.remove('fade-in');
        await new Promise(r => setTimeout(r, 5500));
        
        current.style.display = 'none';
        next.style.display = (immersiveStep % 3 === 2) ? 'flex' : 'block';

        if (immersiveStep % 3 === 1) generateWordCloud();
        
        if (immersiveStep % 3 === 2) {
            // Trigger Drift Animations with staggered delays
            dTrack.className = 'drift-text'; dArtist.className = 'drift-text'; dAlbum.className = 'drift-text';
            void dTrack.offsetWidth; // Reflow
            dTrack.classList.add('drift-rtl');
            dArtist.classList.add('drift-ltr'); dArtist.style.animationDelay = '0.6s';
            dAlbum.classList.add('drift-rtl'); dAlbum.style.animationDelay = '1.2s';
        }

        setTimeout(() => next.classList.add('fade-in'), 50);
        immersiveSequenceTimeout = setTimeout(switchVisual, 35000);
    }

    // Initial Start
    overlays.forEach(o => o.style.display = 'none');
    overlays[0].style.display = 'block';
    setTimeout(() => overlays[0].classList.add('fade-in'), 50);
    immersiveStep = 0;
    immersiveSequenceTimeout = setTimeout(switchVisual, 35000);
}

function generateWordCloud() {
    const container = document.getElementById('word-cloud-container');
    container.innerHTML = '';
    
    const track = document.getElementById('track-title').textContent;
    const artist = document.getElementById('track-artist').textContent;
    const album = currentAlbumName.toUpperCase();
    
    const unitText = `${track} • ${artist} • ${album} • `;
    const words = unitText.split(' '); // Split into individual words and dots

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'word-block-wrapper';

    for (let i = 0; i < 40; i++) {
        const row = document.createElement('div');
        row.className = 'cloud-row';
        row.style.setProperty('--row-index', i);
        
        // RANDOM STAGGER:
        // Generates a random offset between 0 and 150 pixels for every single row
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
        // If they sent a new refresh token, swap the old one out
        if (data.refresh_token) {
            localStorage.setItem('refresh_token', data.refresh_token);
        }
        return data.access_token;
    } else {
        // If the refresh token itself is expired/revoked, force a login
        redirectToSpotify();
    }
}