// 1. CONFIG
const clientId = '054bc32e28714b00b83d4761cd5406d9'; 
const redirectUri = 'https://sirgrant618.github.io/spotify-now-playing/'; 
const scope = 'user-read-currently-playing user-read-playback-state';

console.log("Script loaded and running!"); // THIS SHOULD APPEAR IN CONSOLE

// 2. AUTHENTICATION FUNCTION
async function redirectToSpotify() {
    console.log("Start button clicked!"); // THIS SHOULD APPEAR WHEN YOU CLICK
    
    const verifier = generateRandomString(64);
    window.localStorage.setItem('code_verifier', verifier);

    const challenge = await generateCodeChallenge(verifier);
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        redirect_uri: redirectUri,
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    console.log("Redirecting to:", authUrl);
    window.location.href = authUrl;
}

// 3. ATTACH THE BUTTON MANUALLY (More reliable)
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('login-button');
    if (btn) {
        btn.addEventListener('click', () => {
            redirectToSpotify();
        });
    } else {
        console.error("Could not find a button with id 'login-button'");
    }
});

// 4. REST OF THE LOGIC (Handle Callback / Polling)
const urlParams = new URLSearchParams(window.location.search);
let code = urlParams.get('code');

if (code) {
    handleCallback(code);
} else if (localStorage.getItem('access_token')) {
    showPlayer();
    startPolling(localStorage.getItem('access_token'));
}

async function handleCallback(code) {
    const codeVerifier = window.localStorage.getItem('code_verifier');
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        }),
    });
    const data = await response.json();
    if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        window.history.pushState({}, document.title, "/spotify-now-playing/"); 
        showPlayer();
        startPolling(data.access_token);
    }
}

function startPolling(token) {
    updateNowPlaying(token);
    setInterval(() => updateNowPlaying(token), 5000); 
}

async function updateNowPlaying(token) {
    try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 204) return;
        const data = await res.json();
        const item = data.item;
        document.getElementById('track-title').innerText = item.name.toUpperCase();
        document.getElementById('track-artist').innerText = item.artists[0].name.toUpperCase();
        document.getElementById('track-img').src = item.album.images[0].url;

        const artistId = item.artists[0].id;
        const artistRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const artistData = await artistRes.json();
        if (artistData.images && artistData.images.length > 0) {
            document.getElementById('bg-image').style.backgroundImage = `url(${artistData.images[0].url})`;
        }
    } catch (e) { console.error(e); }
}

function showPlayer() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'block';
}

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
