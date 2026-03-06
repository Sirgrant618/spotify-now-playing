const clientId = '054bc32e28714b00b83d4761cd5406d9';
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/';
const scope = 'user-read-currently-playing user-read-playback-state';

let pollInterval = null;
let currentTrackId = null;
let activeBgId = 'bg-a';

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

if (code) {
    handleCallback(code);
} else if (localStorage.getItem('access_token')) {
    showPlayer();
    startPolling(localStorage.getItem('access_token'));
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

            window.history.pushState({}, document.title, '/spotify-now-playing/');

            showPlayer();
            startPolling(data.access_token);
        } else {
            console.error('Spotify token error:', data);
        }
    } catch (err) {
        console.error('Callback error:', err);
    }
}

/* =========================
   POLLING
========================= */
function startPolling(token) {
    if (pollInterval) clearInterval(pollInterval);

    updateNowPlaying(token);
    pollInterval = setInterval(() => updateNowPlaying(token), 5000);
}

async function updateNowPlaying(token) {
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
            console.warn('Access token expired or invalid.');
            renderIdleState('SESSION EXPIRED', 'RECONNECT TO SPOTIFY');
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

        const isTrackChange = trackId !== currentTrackId;

        document.getElementById('track-title').textContent = trackTitle.toUpperCase();
        document.getElementById('track-artist').textContent = artistName.toUpperCase();
        document.getElementById('track-img').src = albumArt;
        document.getElementById('track-img').alt = `${trackTitle} album art`;

        showPlayer();

        if (!isTrackChange) return;
        currentTrackId = trackId;

        let backgroundImage = albumArt;

        const primaryArtistId = item.artists?.[0]?.id;
        if (primaryArtistId) {
            try {
                const artistRes = await fetch(`https://api.spotify.com/v1/artists/${primaryArtistId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`
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

        if (backgroundImage) {
            await swapBackground(backgroundImage);
        }

        if (albumArt) {
            applyPaletteFromImage(albumArt);
        }

        runTrackChangeAnimations();
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

function renderIdleState(title = 'NOTHING PLAYING', artist = 'OPEN SPOTIFY') {
    showPlayer();

    document.getElementById('track-title').textContent = title;
    document.getElementById('track-artist').textContent = artist;
    document.getElementById('track-img').src = '';
    document.getElementById('track-img').alt = 'No album art';

    currentTrackId = null;
}

/* =========================
   TRACK CHANGE ANIMATIONS
========================= */
function runTrackChangeAnimations() {
    const img = document.getElementById('track-img');
    const title = document.getElementById('track-title');
    const artist = document.getElementById('track-artist');
    const flash = document.getElementById('bg-flash');

    resetAnimation(img, 'track-change');
    resetAnimation(title, 'track-change');
    resetAnimation(artist, 'track-change');
    resetAnimation(flash, 'trigger');
}

function resetAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
}

/* =========================
   BACKGROUND CROSSFADE
========================= */
async function swapBackground(imageUrl) {
    const active = document.getElementById(activeBgId);
    const inactiveBgId = activeBgId === 'bg-a' ? 'bg-b' : 'bg-a';
    const inactive = document.getElementById(inactiveBgId);

    const cssUrl = `url("${imageUrl}")`;

    if (active.style.backgroundImage === cssUrl) {
        return;
    }

    inactive.style.backgroundImage = cssUrl;
    inactive.style.transform = 'scale(1.06)';
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

    root.style.setProperty('--wash-1', toRgba(c1, 0.34));
    root.style.setProperty('--wash-2', toRgba(c2, 0.28));
    root.style.setProperty('--wash-3', toRgba(c3, 0.24));
}

function toRgba(color, alpha) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
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
