// ... existing Spotify logic remains at the top ...
// [Keep your ClientID, RedirectUri, and Auth functions here]

let activeViz = 1;
let vizTimer = null;

// Initialize Viz Cycling
function startVizCycle() {
    if (vizTimer) clearInterval(vizTimer);
    vizTimer = setInterval(() => {
        // Logic to cycle activeViz 1 -> 2 -> 3 (we currently only have 1)
        activeViz = (activeViz % 1) + 1; 
        updateVizClasses();
    }, 30000); // 30 Seconds
}

function updateVizClasses() {
    document.body.classList.remove('active-viz-1', 'active-viz-2', 'active-viz-3');
    document.body.classList.add(`active-viz-${activeViz}`);
}

// Call this inside your track update function
function updateImmersiveMetadata(track) {
    const title = track.name.toUpperCase();
    const artist = track.artists[0].name.toUpperCase();
    const album = track.album.name.toUpperCase();

    // Repeat text for seamless marquee
    document.getElementById('scroll-title').innerText = (title + "   •   ").repeat(10);
    document.getElementById('scroll-artist').innerText = (artist + "   •   ").repeat(15);
    document.getElementById('scroll-album').innerText = (album + "   •   ").repeat(12);
}

// Logic to switch modes
function setupActivityWatchers() {
    const resetTimer = () => {
        document.body.classList.remove('immersive');
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            document.body.classList.add('immersive');
            startVizCycle();
            updateVizClasses();
        }, 5000); // 5 seconds to go immersive
    };
    window.onload = resetTimer;
    window.onmousemove = resetTimer;
    window.onkeydown = resetTimer;
}

// Make sure to call updateImmersiveMetadata(track) in your pollInterval!
