const clientId = '054bc32e28714b00b83d4761cd5406d9';
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/';
const scope = 'user-read-currently-playing user-read-playback-state';

let inactivityTimer = null;
let cycleTimer = null;
let currentMetadata = { title: '', artist: '', album: '' };

/* =========================
   AUTH FIXES
========================= */
async function redirectToSpotify() {
    const verifier = generateRandomString(64);
    localStorage.setItem('code_verifier', verifier);
    const challenge = await generateCodeChallenge(verifier);

    const params = new URLSearchParams({
        response_type: 'code', client_id: clientId, scope,
        code_challenge_method: 'S256', code_challenge: challenge, redirect_uri: redirectUri
    });

    // FIXED: Added missing $ for template literal
    window.location.href = `https://accounts.spotify.com/authorize?$?${params.toString()}`;
}

// ... (handleCallback and refreshAccessToken remain similar but ensure URLs use `${}`)

/* =========================
   IMMERSIVE LOGIC
========================= */
function setupActivityWatchers() {
    ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach(e => {
        window.addEventListener(e, () => {
            exitImmersive();
            resetTimer();
        });
    });
}

function resetTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(enterImmersive, 5000);
}

function enterImmersive() {
    if (document.getElementById('player-screen').style.display === 'none') return;
    document.body.classList.add('immersive');
    startCycle();
}

function exitImmersive() {
    document.body.classList.remove('immersive', 'show-v1', 'show-v2');
    clearTimeout(cycleTimer);
}

function startCycle() {
    clearTimeout(cycleTimer);
    
    // Mode 1: Marquee (30s)
    document.body.classList.remove('show-v2');
    document.body.classList.add('show-v1');
    renderV1();

    cycleTimer = setTimeout(() => {
        // Mode 2: Word Wall (30s)
        document.body.classList.remove('show-v1');
        document.body.classList.add('show-v2');
        renderV2();

        cycleTimer = setTimeout(startCycle, 30000); // Loop back
    }, 30000);
}

function renderV1() {
    const { title, artist, album } = currentMetadata;
    const spacer = "&nbsp;&nbsp;&nbsp;&nbsp;";
    document.getElementById('v1-title').innerHTML = (title + spacer).repeat(10);
    document.getElementById('v1-artist').innerHTML = (artist + spacer).repeat(10);
    document.getElementById('v1-album').innerHTML = (album + spacer).repeat(10);
}

function renderV2() {
    const container = document.getElementById('word-wall');
    container.innerHTML = '';
    const { title, artist, album } = currentMetadata;
    const words = `${title} ${artist} ${album} `.repeat(15).split(' ');
    
    words.forEach((w, i) => {
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = w;
        span.style.animationDelay = `${i * 0.15}s`;
        container.appendChild(span);
    });
}

/* =========================
   TRACK UPDATE
========================= */
async function updateNowPlaying(token) {
    try {
        // FIXED URL template literal
        const res = await fetch(`https://api.spotify.com/v1/me/player/currently-playing`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.item) return;

        if (data.item.id !== currentMetadata.id) {
            currentMetadata = {
                id: data.item.id,
                title: data.item.name.toUpperCase(),
                artist: data.item.artists[0].name.toUpperCase(),
                album: data.item.album.name.toUpperCase()
            };

            document.getElementById('track-title').textContent = currentMetadata.title;
            document.getElementById('track-artist').textContent = currentMetadata.artist;
            document.getElementById('track-img').src = data.item.album.images[0].url;

            // BACKGROUND: Always prioritize Artist Image
            fetch(`https://api.spotify.com/v1/artists/$?${data.item.artists[0].id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            .then(r => r.json())
            .then(artistData => {
                const img = artistData.images?.[0]?.url || data.item.album.images[0].url;
                swapBackground(img);
            });
            
            exitImmersive();
            resetTimer();
            document.getElementById('player-screen').style.display = 'block';
            document.getElementById('login-screen').style.display = 'none';
        }
    } catch (e) { console.error(e); }
}

// (Helper functions like generateRandomString, swapBackground etc. go here)
// Make sure to call setupActivityWatchers() and startPolling() on load!