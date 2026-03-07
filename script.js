const clientId = '054bc32e28714b00b83d4761cd5406d9';
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/';
const scope = 'user-read-currently-playing user-read-playback-state';

let pollInterval = null;
let currentTrackId = null;
let activeBgId = 'bg-a';

let inactivityTimer = null;
const IDLE_DELAY_MS = 5000;

/* =========================
   AUTH
========================= */
async function redirectToSpotify() {
    const verifier = generateRandomString(64);
    localStorage.setItem('code_verifier', verifier);

    const challenge = await generateCodeChallenge(verifier);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        redirect_uri: redirectUri
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');

setupActivityWatchers();
bootstrapAuth();

async function bootstrapAuth() {
    if (code) {
        await handleCallback(code);
        return;
    }

    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');

    if (accessToken) {
        showPlayer();
        startPolling(accessToken);
        resetInactivityTimer();
        return;
    }

    if (refreshToken) {
        const newAccessToken = await refreshAccessToken();
        if (newAccessToken) {
            showPlayer();
            startPolling(newAccessToken);
            resetInactivityTimer();
        }
    }
}

async function handleCallback(code) {
    try {
        const codeVerifier = localStorage.getItem('code_verifier');

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier
            })
        });

        const data = await response.json();

        if (data.access_token) {
            localStorage.setItem('access_token', data.access_token);

            if (data.refresh_token) {
                localStorage.setItem('refresh_token', data.refresh_token);
            }

            window.history.pushState({}, document.title, '/spotify-now-playing/');

            showPlayer();
            startPolling(data.access_token);
            resetInactivityTimer();
        } else {
            console.error('Spotify token error:', data);
            showReconnectScreen();
        }
    } catch (err) {
        console.error('Callback error:', err);
        showReconnectScreen();
    }
}

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return null;

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });

        const data = await response.json();

        if (!response.ok || !data.access_token) {
            console.error('Refresh token error:', data);
            clearSpotifySession();
            showReconnectScreen();
            return null;
        }

        localStorage.setItem('access_token', data.access_token);

        if (data.refresh_token) {
            localStorage.setItem('refresh_token', data.refresh_token);
        }

        return data.access_token;
    } catch (err) {
        console.error('Refresh request failed:', err);
        clearSpotifySession();
        showReconnectScreen();
        return null;
    }
}

/* =========================
   ACTIVITY / IMMERSIVE MODE
========================= */
function setupActivityWatchers() {
    const wakeEvents = ['mousemove', 'mouseenter', 'mousedown', 'touchstart', 'keydown'];

    wakeEvents.forEach(eventName => {
        window.addEventListener(eventName, handleUserActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearTimeout(inactivityTimer);
        } else {
            handleUserActivity();
        }
    });
}

function handleUserActivity() {
    exitImmersiveMode();
    resetInactivityTimer();
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        enterImmersiveMode();
    }, IDLE_DELAY_MS);
}

function enterImmersiveMode() {
    const player = document.getElementById('player-screen');
    if (!player || player.style.display === 'none') return;
    document.body.classList.add('immersive');
}

function exitImmersiveMode() {
    document.body.classList.remove('immersive');
}

/* =========================
   POLLING
========================= */
function startPolling(token) {
    if (pollInterval) clearInterval(pollInterval);

    updateNowPlaying(token);
    pollInterval = setInterval(async () => {
        const latestToken = localStorage.getItem('access_token');
        if (latestToken) {
            await updateNowPlaying(latestToken);
        }
    }, 5000);
}

async function updateNowPlaying(token, hasRetried = false) {
    try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (res.status === 204) {
            renderIdleState();
            return;
        }

        if (res.status === 401) {
            if (hasRetried) {
                clearSpotifySession();
                showReconnectScreen();
                return;
            }

            const newAccessToken = await refreshAccessToken();
            if (newAccessToken) {
                await updateNowPlaying(newAccessToken, true);
            } else {
                showReconnectScreen();
            }
            return;
        }

        if (!res.ok) {
            console.error('Now playing request failed:', res.status);
            return;
        }

        const data = await res.json();

        if (!data || !data.item) {
            renderIdleState();
            return;
        }

        const item = data.item;
        const trackId = item.id || `${item.name}-${item.artists?.[0]?.name || 'unknown'}`;
        const trackTitle = item.name || 'UNKNOWN TITLE';
        const artistName = item.artists?.[0]?.name || 'UNKNOWN ARTIST';
        const albumArt = item.album?.images?.[0]?.url || '';

        // Check if the track has actually changed
        const isTrackChange = trackId !== currentTrackId;

        if (isTrackChange) {
            currentTrackId = trackId;

            // Trigger "Details Mode" visibility on track change
            exitImmersiveMode();
            resetInactivityTimer();

            // Update UI
            document.getElementById('track-title').textContent = trackTitle.toUpperCase();
            document.getElementById('track-artist').textContent = artistName.toUpperCase();
            document.getElementById('track-img').src = albumArt;
            document.getElementById('track-img').alt = `${trackTitle} album art`;

            showPlayer();

            // Handle Backgrounds and Palette
            let backgroundImage = albumArt;
            const primaryArtistId = item.artists?.[0]?.id;

            if (primaryArtistId) {
                try {
                    const artistRes = await fetch(`https://api.spotify.com/v1/artists/${primaryArtistId}`, {
                        headers: {
                            Authorization: `Bearer ${localStorage.getItem('access_token') || token}`
                        }
                    });

                    if (artistRes.ok) {
                        const artistData = await artistRes.json();
                        if (artistData?.images?.length) {
                            backgroundImage = artistData.images[0].url;
                        }
                    }
                } catch (artistErr) {
                    console.warn('Artist image fetch failed, using album art fallback.', artistErr);
                }
            }

            if (backgroundImage) swapBackground(backgroundImage);
            if (albumArt) applyPaletteFromImage(albumArt);
        }
    } catch (err) {
        console.error('Error updating now playing:', err);
    }
}

/* =========================
   UI STATES
========================= */
function showPlayer() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'block';
}

function showReconnectScreen() {
    clearTimeout(inactivityTimer);
    document.body.classList.remove('immersive');
    document.getElementById('player-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'block';
}

function renderIdleState(title = 'NOTHING PLAYING', artist = 'OPEN SPOTIFY') {
    showPlayer();

    document.getElementById('track-title').textContent = title;
    document.getElementById('track-artist').textContent = artist;
    document.getElementById('track-img').src = '';
    document.getElementById('track-img').alt = 'No album art';

    currentTrackId = null;
}

function clearSpotifySession() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('code_verifier');
}

/* =========================
   BACKGROUND CROSSFADE
========================= */
function swapBackground(imageUrl) {
    const active = document.getElementById(activeBgId);
    const inactiveBgId = activeBgId === 'bg-a' ? 'bg-b' : 'bg-a';
    const inactive = document.getElementById(inactiveBgId);

    const cssUrl = `url("${imageUrl}")`;

    if (active.style.backgroundImage === cssUrl) {
        return;
    }

    inactive.style.backgroundImage = cssUrl;
    inactive.classList.add('active');
    active.classList.remove('active');

    activeBgId = inactiveBgId;
}

/* =========================
   COLOR PALETTE SAMPLING
========================= */
function applyPaletteFromImage(imageUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            const sampleSize = 48;
            canvas.width = sampleSize;
            canvas.height = sampleSize;

            ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
            const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

            const colors = extractPalette(data);

            if (colors.length >= 3) {
                setWashColors(colors[0], colors[1], colors[2]);
            } else if (colors.length === 2) {
                setWashColors(colors[0], colors[1], colors[0]);
            } else if (colors.length === 1) {
                setWashColors(colors[0], colors[0], colors[0]);
            }
        } catch (err) {
            console.warn('Palette extraction failed:', err);
        }
    };

    img.onerror = () => {
        console.warn('Could not load image for palette extraction.');
    };

    img.src = imageUrl;
}

function extractPalette(pixelData) {
    const buckets = new Map();

    for (let i = 0; i < pixelData.length; i += 4) {
        const r = pixelData[i];
        const g = pixelData[i + 1];
        const b = pixelData[i + 2];
        const a = pixelData[i + 3];

        if (a < 200) continue;

        const brightness = (r + g + b) / 3;
        if (brightness < 22) continue;

        const key = [
            Math.round(r / 32) * 32,
            Math.round(g / 32) * 32,
            Math.round(b / 32) * 32
        ].join(',');

        const existing = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        existing.count += 1;
        existing.r += r;
        existing.g += g;
        existing.b += b;
        buckets.set(key, existing);
    }

    const palette = Array.from(buckets.values())
        .filter(c => c.count > 4)
        .map(c => ({
            count: c.count,
            r: Math.round(c.r / c.count),
            g: Math.round(c.g / c.count),
            b: Math.round(c.b / c.count)
        }))
        .sort((a, b) => b.count - a.count)
        .filter((c, index, arr) => {
            return !arr.slice(0, index).some(prev => colorDistance(prev, c) < 70);
        })
        .slice(0, 3);

    return palette;
}

function colorDistance(a, b) {
    return Math.sqrt(
        Math.pow(a.r - b.r, 2) +
        Math.pow(a.g - b.g, 2) +
        Math.pow(a.b - b.b, 2)
    );
}

function setWashColors(c1, c2, c3) {
    const root = document.documentElement;

    root.style.setProperty('--spot-1', toRgb(c1));
    root.style.setProperty('--spot-2', toRgb(c2));
    root.style.setProperty('--spot-3', toRgb(c3));
}

function toRgb(color) {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/* =========================
   HELPERS
========================= */
function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);

    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}
