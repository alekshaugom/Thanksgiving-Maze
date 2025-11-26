import { LEVELS, TILE_SIZE, ROWS, COLS } from './levels.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Game State
let currentLevelIndex = 0;
let score = 0;
let startTime = 0;
let levelStartTime = 0;
let gameState = 'START'; // START, PLAYING, GAMEOVER, WIN
let animationFrameId;
let lastTime = 0;

// Constants (must be defined before entities that use them)
const PLAYER_SPEED = 0.1125; // Grid squares per frame (1.5x original 0.075)
const TURKEY_SPEED_BASE = 0.05625; // Base speed for turkeys (1.5x original 0.0375)
const COIN_VALUE = 10;
const PAR_TIMES = [60, 70, 80, 90, 100];
const FOOD_EMOJIS = ['🌽', '🍎', '🥕', '🥔', '🍠', '🥖', '🧈', '🍗', '🥧', '🧁', '🍾'];

// Entities
let player = { x: 0, y: 0, dir: { x: 0, y: 0 }, nextDir: { x: 0, y: 0 }, speed: PLAYER_SPEED }; // Grid units per frame (approx)
let turkeys = [];
let coins = [];
let walls = [];
let grid = []; // 2D array of the current level

// UI Elements
const levelDisplay = document.getElementById('level-display');
const scoreDisplay = document.getElementById('score-display');
const timeDisplay = document.getElementById('time-display');
const overlay = document.getElementById('game-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const restartBtn = document.getElementById('restart-btn');
const nameEntry = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');
const activePlayersCount = document.getElementById('active-players-count');
const activePlayersBanner = document.getElementById('active-players-banner');
const totalRunsTodayDisplay = document.getElementById('total-runs-today-display');
const leaderboardBody = document.querySelector('#leaderboard-table tbody');
const currentPlayerDisplay = document.getElementById('current-player-display');

// Input Handling
const keys = {};
const touchStart = { x: 0, y: 0 };

window.addEventListener('keydown', (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.code) > -1) {
        e.preventDefault();
    }
    keys[e.code] = true;
    handleInput(e.code);
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Mobile Controls
document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleInput(btn.dataset.key);
    });
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handleInput(btn.dataset.key);
    });
});

function handleInput(key) {
    if (gameState !== 'PLAYING') return;

    switch (key) {
        case 'ArrowUp': player.nextDir = { x: 0, y: -1 }; break;
        case 'ArrowDown': player.nextDir = { x: 0, y: 1 }; break;
        case 'ArrowLeft': player.nextDir = { x: -1, y: 0 }; break;
        case 'ArrowRight': player.nextDir = { x: 1, y: 0 }; break;
    }
}

// Initialization
function initGame() {
    const name = playerNameInput.value.trim();
    if (!name) {
        alert('Please enter your name to start!');
        return;
    }

    // Update current player display
    currentPlayerDisplay.textContent = `Your Name: ${name}`;
    currentPlayerDisplay.classList.remove('hidden');

    // Fetch stats for this player
    // Update run count display
    updateLocalRunCountDisplay();

    currentLevelIndex = 0;
    score = 0;
    startTime = Date.now();
    loadLevel(currentLevelIndex);
    gameState = 'PLAYING';
    gameState = 'PLAYING';
    overlay.classList.add('hidden');
    // nameEntry.classList.add('hidden'); // Keep name entry visible? No, hide it.
    // Actually, we moved name entry to start.
    nameEntry.classList.add('hidden');

    // Track session start
    // fetch('/GameSession', { method: 'POST', body: JSON.stringify({ startedAt: new Date().toISOString() }) });
    // Actually, we need to create a session.
    // Let's assume we just fire and forget for now or implement properly if we had the ID.

    lastTime = performance.now();
    cancelAnimationFrame(animationFrameId);
    gameLoop(lastTime);
}

function loadLevel(index) {
    if (index >= LEVELS.length) {
        gameWin();
        return;
    }

    currentLevelIndex = index;
    levelStartTime = Date.now();
    const levelData = LEVELS[index];

    walls = [];
    coins = [];
    turkeys = [];
    grid = [];

    const potentialTurkeySpawns = [];
    const emptyTiles = [];

    for (let y = 0; y < ROWS; y++) {
        const row = [];
        for (let x = 0; x < COLS; x++) {
            const char = levelData[y][x];
            row.push(char === '1' ? 1 : 0);

            if (char === '1') {
                walls.push({ x, y });
            } else if (char === 'C') {
                const randomEmoji = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
                coins.push({ x, y, emoji: randomEmoji });
            } else if (char === 'P') {
                player.x = x;
                player.y = y;
                player.dir = { x: 0, y: 0 };
                player.nextDir = { x: 0, y: 0 };
            } else if (char === 'T') {
                potentialTurkeySpawns.push({ x, y });
            } else if (char === '.') {
                emptyTiles.push({ x, y });
            }
        }
        grid.push(row);
    }

    // Dynamic Turkey Spawning
    const targetTurkeyCount = index + 1;
    let spawns = [...potentialTurkeySpawns];

    // If we need more spawns, use empty tiles
    if (spawns.length < targetTurkeyCount) {
        // Shuffle empty tiles
        for (let i = emptyTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [emptyTiles[i], emptyTiles[j]] = [emptyTiles[j], emptyTiles[i]];
        }
        spawns = spawns.concat(emptyTiles.slice(0, targetTurkeyCount - spawns.length));
    }

    // If we have too many spawns (or just right), pick random ones
    // Actually, let's just shuffle spawns and pick N
    for (let i = spawns.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [spawns[i], spawns[j]] = [spawns[j], spawns[i]];
    }

    const selectedSpawns = spawns.slice(0, targetTurkeyCount);

    selectedSpawns.forEach(s => {
        turkeys.push({
            x: s.x,
            y: s.y,
            dir: { x: 0, y: 0 },
            speed: TURKEY_SPEED_BASE, // Fixed speed for consistency with requirement
            moveTimer: 0,
            cooldown: 0 // Cooldown to prevent immediate re-snapping
        });
    });

    updateUI();
}

// Game Loop
function gameLoop(timestamp) {
    if (gameState !== 'PLAYING') return;

    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    update(deltaTime);
    draw();

    animationFrameId = requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    // Update Time
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    timeDisplay.textContent = elapsed;

    // Player Movement
    movePlayer();

    // Turkey AI
    turkeys.forEach(turkey => moveTurkey(turkey));

    // Collisions
    checkCollisions();

    // Level Complete
    if (coins.length === 0) {
        calculateLevelScore();
        loadLevel(currentLevelIndex + 1);
    }
}

function movePlayer() {
    // Snap to grid logic for smooth turning
    // Simple implementation: Move continuously, but only change direction when centered on a tile

    const speed = player.speed;

    // Try to change direction if close to center
    if (player.nextDir.x !== 0 || player.nextDir.y !== 0) {
        if (canMove(Math.round(player.x), Math.round(player.y), player.nextDir)) {
            // Allow turning if we are close enough to the center of the tile
            const distToCenter = Math.abs(player.x - Math.round(player.x)) + Math.abs(player.y - Math.round(player.y));
            if (distToCenter < 0.1) {
                player.x = Math.round(player.x);
                player.y = Math.round(player.y);
                player.dir = player.nextDir;
                player.nextDir = { x: 0, y: 0 };
            }
        }
    }

    if (canMove(Math.round(player.x), Math.round(player.y), player.dir)) {
        // Check if we are about to hit a wall in the current direction
        const nextX = player.x + player.dir.x * speed;
        const nextY = player.y + player.dir.y * speed;

        // Wall collision check (look ahead)
        // Simple check: if the center of the player moves into a wall tile
        // Actually, let's just use the center point
        if (!isWall(Math.round(nextX + player.dir.x * 0.4), Math.round(nextY + player.dir.y * 0.4))) {
            player.x += player.dir.x * speed;
            player.y += player.dir.y * speed;
        } else {
            // Snap to center if hitting wall
            player.x = Math.round(player.x);
            player.y = Math.round(player.y);
        }
    } else {
        player.x = Math.round(player.x);
        player.y = Math.round(player.y);
    }
}

function moveTurkey(turkey) {
    // Simple AI: Move towards player at intersections
    // Turkeys move slower than player usually

    const speed = turkey.speed;

    // Cooldown management
    if (turkey.cooldown > 0) {
        turkey.cooldown -= speed;
    }

    // Check if centered (time to make a decision)
    const distToCenter = Math.abs(turkey.x - Math.round(turkey.x)) + Math.abs(turkey.y - Math.round(turkey.y));

    if (distToCenter < speed && turkey.cooldown <= 0) {
        turkey.x = Math.round(turkey.x);
        turkey.y = Math.round(turkey.y);

        // Set cooldown to ensure we leave the tile before checking again
        turkey.cooldown = 0.8;

        // Choose new direction
        const possibleDirs = [
            { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }
        ].filter(d => !isWall(Math.round(turkey.x) + d.x, Math.round(turkey.y) + d.y) && !(d.x === -turkey.dir.x && d.y === -turkey.dir.y)); // Don't reverse immediately if possible

        if (possibleDirs.length === 0) {
            // Dead end, reverse
            turkey.dir = { x: -turkey.dir.x, y: -turkey.dir.y };
        } else {
            // Pick best direction to player
            // Sort by distance to player
            possibleDirs.sort((a, b) => {
                const distA = Math.abs((turkey.x + a.x) - player.x) + Math.abs((turkey.y + a.y) - player.y);
                const distB = Math.abs((turkey.x + b.x) - player.x) + Math.abs((turkey.y + b.y) - player.y);
                return distA - distB;
            });

            // Add some randomness
            if (Math.random() < 0.2 && possibleDirs.length > 1) {
                turkey.dir = possibleDirs[1];
            } else {
                turkey.dir = possibleDirs[0];
            }
        }

        // If just starting
        if (turkey.dir.x === 0 && turkey.dir.y === 0 && possibleDirs.length > 0) {
            turkey.dir = possibleDirs[0];
        }

        // Move immediately to avoid getting stuck in "center" zone
        turkey.x += turkey.dir.x * speed;
        turkey.y += turkey.dir.y * speed;
    } else {
        // Continue moving
        turkey.x += turkey.dir.x * speed;
        turkey.y += turkey.dir.y * speed;
    }
}

function checkCollisions() {
    // Coins
    for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        const dist = Math.abs(player.x - c.x) + Math.abs(player.y - c.y);
        if (dist < 0.5) {
            coins.splice(i, 1);
            score += COIN_VALUE;
            updateUI();
        }
    }

    // Turkeys
    for (const t of turkeys) {
        const dist = Math.abs(player.x - t.x) + Math.abs(player.y - t.y);
        if (dist < 0.8) {
            gameOver();
        }
    }
}

function isWall(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
    return grid[y][x] === 1;
}

function canMove(x, y, dir) {
    return !isWall(x + dir.x, y + dir.y);
}

function calculateLevelScore() {
    const timeTaken = (Date.now() - levelStartTime) / 1000;
    const parTime = PAR_TIMES[currentLevelIndex] || 100;

    // Bonus for speed
    if (timeTaken < parTime) {
        score += Math.floor((parTime - timeTaken) * 5);
    }
    updateUI();
}

function updateUI() {
    levelDisplay.textContent = currentLevelIndex + 1;
    scoreDisplay.textContent = score;
}

function draw() {
    // Clear
    ctx.fillStyle = '#0d1117'; // Path color
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Walls
    ctx.fillStyle = '#30363d';
    for (const w of walls) {
        ctx.fillRect(w.x * TILE_SIZE, w.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }

    // Coins (Food)
    ctx.font = `${TILE_SIZE * 0.8}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of coins) {
        ctx.fillText(c.emoji, c.x * TILE_SIZE + TILE_SIZE / 2, c.y * TILE_SIZE + TILE_SIZE / 2 + 2);
    }

    // Player (Pilgrim)
    ctx.fillText('🧑‍🌾', player.x * TILE_SIZE + TILE_SIZE / 2, player.y * TILE_SIZE + TILE_SIZE / 2 + 2);

    // Turkeys
    for (const t of turkeys) {
        // Flip turkey if moving left
        ctx.save();
        ctx.translate(t.x * TILE_SIZE + TILE_SIZE / 2, t.y * TILE_SIZE + TILE_SIZE / 2);
        if (t.dir.x < 0) {
            ctx.scale(-1, 1);
        }
        ctx.fillText('🦃', 0, 2);
        ctx.restore();
    }
}

function gameOver() {
    gameState = 'GAMEOVER';
    overlayTitle.textContent = 'Game Over';
    overlayMessage.textContent = `Final Score: ${score}`;
    overlay.classList.remove('hidden');
    overlay.classList.remove('hidden');
    // nameEntry.classList.remove('hidden'); // Name already entered
    restartBtn.classList.remove('hidden');

    // Auto-submit score
    submitScore();
    incrementLocalRunCount();
}

function gameWin() {
    gameState = 'WIN';
    overlayTitle.textContent = 'You Win!';
    overlayMessage.textContent = `Final Score: ${score}`;
    overlay.classList.remove('hidden');
    overlay.classList.remove('hidden');
    // nameEntry.classList.remove('hidden');
    restartBtn.classList.remove('hidden');
    submitScore();
    incrementLocalRunCount();
}

// API Calls
// API Calls
let isSubmitting = false;
async function submitScore() {
    if (isSubmitting) return;
    isSubmitting = true;

    const name = playerNameInput.value.trim() || 'Anonymous';
    const data = {
        playerName: name,
        score: score,
        levelReached: currentLevelIndex + 1,
        coinsCollected: 0, // Need to track total coins
        totalTimeSeconds: (Date.now() - startTime) / 1000
    };

    try {
        const res = await fetch('/Leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to submit score');

        await fetchLeaderboard();
        // await fetchPlayerStats(name); // Removed in favor of local stats
        // alert('Score submitted!');
    } catch (e) {
        console.error('Error submitting score:', e);
    } finally {
        isSubmitting = false;
    }
}

async function fetchLeaderboard() {
    try {
        console.log('Fetching leaderboard...');
        const res = await fetch('/Leaderboard');
        const scores = await res.json();
        console.log('Leaderboard data:', scores);

        leaderboardBody.innerHTML = '';
        scores.forEach((s, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${i + 1}</td>
                <td>${s.playerName}</td>
                <td>${s.score}</td>
                <td>${s.levelReached}</td>
            `;
            leaderboardBody.appendChild(row);
        });
        console.log('Leaderboard updated with', scores.length, 'entries');
    } catch (e) {
        console.error('Error fetching leaderboard:', e);
    }
}

function getLocalRunCount() {
    const today = new Date().toISOString().split('T')[0];
    const key = `thanksgiving_runs_${today}`;
    const count = localStorage.getItem(key);
    return count ? parseInt(count, 10) : 0;
}

function incrementLocalRunCount() {
    const today = new Date().toISOString().split('T')[0];
    const key = `thanksgiving_runs_${today}`;
    let count = getLocalRunCount();
    count++;
    localStorage.setItem(key, count);
    updateLocalRunCountDisplay();
}

function updateLocalRunCountDisplay() {
    const count = getLocalRunCount();
    totalRunsTodayDisplay.textContent = `Rounds Played Today: ${count}`;
    totalRunsTodayDisplay.classList.remove('hidden');
}

// Poll leaderboard every 15 seconds for updates
setInterval(fetchLeaderboard, 15000);

// CRDT Active Count
async function incrementActiveCount() {
    try {
        await fetch('/ActiveCountAPI', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'increment' })
        });
        await fetchActiveCount();
    } catch (e) {
        console.error('Error incrementing active count:', e);
    }
}

async function decrementActiveCount() {
    try {
        await fetch('/ActiveCountAPI', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'decrement' })
        });
    } catch (e) {
        console.error('Error decrementing active count:', e);
    }
}

async function fetchActiveCount() {
    try {
        const res = await fetch('/ActiveCountAPI');
        const data = await res.json();
        console.log('Active count data:', data);

        const count = data.activeCount || 0;
        if (count > 0) {
            activePlayersBanner.classList.remove('hidden');
            activePlayersCount.textContent = count;
            console.log('Active count updated to:', count);
        } else {
            activePlayersBanner.classList.add('hidden');
        }
    } catch (e) {
        console.error('Error fetching active count:', e);
    }
}

// Event Listeners
restartBtn.addEventListener('click', initGame);

// Start
fetchLeaderboard();
updateLocalRunCountDisplay();
incrementActiveCount(); // Increment CRDT counter on load

// Poll active count every 5 seconds
setInterval(fetchActiveCount, 5000);

// Poll leaderboard every 15 seconds
setInterval(fetchLeaderboard, 15000);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    decrementActiveCount(); // Decrement CRDT counter on unload
});

// Show start screen
// Show start screen
overlayTitle.textContent = 'Thanksgiving Maze';
overlayMessage.textContent = 'Enter your name and collect all food to advance. Avoid the turkeys!';
overlay.classList.remove('hidden');
restartBtn.textContent = 'Start Game';
nameEntry.classList.remove('hidden'); // Show name entry at start
