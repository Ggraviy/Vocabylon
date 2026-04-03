const firebaseConfig = {
    apiKey: "AIzaSyBCdTotzPeMyJAHaBNfQsobd_X0T1W9a4k",
    authDomain: "vocabylon.firebaseapp.com",
    projectId: "vocabylon",
    storageBucket: "vocabylon.firebasestorage.app",
    messagingSenderId: "837359062322",
    appId: "1:837359062322:web:2cc15ffa5a06c5232e1b2b"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let words = [];
let userProfile = { xp: 0, dailyGoal: 20, streak: 0, username: null, achievements: [], dailyClaimed: false };
let training = { active: false, queue: [], index: 0, mode: '', lives: 3, flipped: false };
let duelData = null;

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadTheme();
    loadAccent();
    auth.onAuthStateChanged(handleAuthChange);
});

function bindEvents() {
    document.getElementById('themeToggle').onclick = toggleTheme;
    document.getElementById('settingsNavBtn').onclick = () => showView('settings');
    document.getElementById('logoutBtn').onclick = () => auth.signOut();
    document.getElementById('addWordBtn').onclick = () => requireAuth(addWord);
    document.getElementById('changeGoalBtn').onclick = () => requireAuth(openGoalModal);
    document.getElementById('importSetBtn').onclick = () => requireAuth(openImportModal);
    document.getElementById('uploadJsonBtn').onclick = () => document.getElementById('jsonFileInput').click();
    document.getElementById('jsonFileInput').onchange = (e) => requireAuth(() => importJsonFile(e))();
    document.getElementById('addFriendBtn').onclick = () => requireAuth(addFriend);
    document.getElementById('updateUsernameBtn').onclick = () => requireAuth(updateUsername);
    document.getElementById('saveDailyGoalBtn').onclick = () => requireAuth(saveDailyGoalSetting);
    document.getElementById('accentSelect').onchange = (e) => setAccent(e.target.value);
    document.getElementById('themeSelect').onchange = (e) => setTheme(e.target.value);
    document.getElementById('createRoomBtn').onclick = () => requireAuth(createDuelRoom);
    document.getElementById('joinRoomBtn').onclick = () => requireAuth(joinDuelRoom);
    document.getElementById('closeTrainingBtn').onclick = stopTraining;
    document.getElementById('flipCard').onclick = () => { if (training.active && !training.flipped) flipCard(); };
    document.querySelectorAll('.level-buttons button').forEach(btn => btn.onclick = () => rateWord(parseInt(btn.dataset.level)));
    document.querySelectorAll('.mode-btn').forEach(btn => btn.onclick = () => requireAuth(() => startTraining(btn.dataset.mode))());
    document.querySelectorAll('.workspace-tab').forEach(tab => tab.onclick = () => showView(tab.dataset.view));
    document.getElementById('searchWord').oninput = renderGallery;
    document.getElementById('filterLevel').onchange = renderGallery;
    document.getElementById('closeAuth').onclick = (e) => { if (!currentUser) return; closeModal('authModal'); };
    window.onclick = (e) => { if (e.target.classList.contains('modal-overlay') && e.target.id !== 'authModal') e.target.style.display = 'none'; };
    document.getElementById('loginForm').onsubmit = (e) => { e.preventDefault(); login(); };
    document.getElementById('registerForm').onsubmit = (e) => { e.preventDefault(); register(); };
    document.getElementById('guestLoginBtn').onclick = guestLogin;
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const formId = tab.dataset.tab === 'login' ? 'loginForm' : 'registerForm';
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            document.getElementById(formId).classList.add('active');
        };
    });
    document.getElementById('closeGoalModal').onclick = () => closeModal('goalModal');
    document.getElementById('confirmGoalBtn').onclick = () => {
        let val = parseInt(document.getElementById('goalModalInput').value);
        if (isNaN(val)) val = 20;
        val = Math.min(100, Math.max(5, val));
        setDailyGoal(val);
        closeModal('goalModal');
    };
    document.getElementById('achievementCount').parentElement.onclick = showAchievements;
    document.getElementById('closeAchievements').onclick = () => closeModal('achievementsModal');
    document.getElementById('closeDuelLobby').onclick = () => closeModal('duelLobbyModal');
    window.addEventListener('keydown', (e) => {
        if (!training.active) return;
        if (e.code === 'Space') { e.preventDefault(); if (!training.flipped) flipCard(); }
        else if (e.code >= 'Digit1' && e.code <= 'Digit4') rateWord(parseInt(e.code.slice(-1)));
    });
}

function requireAuth(callback) {
    if (!currentUser) {
        document.getElementById('authModal').style.display = 'flex';
        toast('Please log in first', 'error');
        return;
    }
    callback();
}

async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) return toast('Fill all fields', 'error');
    try {
        await auth.signInWithEmailAndPassword(email, password);
        toast('Logged in');
    } catch (err) { toast(err.message, 'error'); }
}

async function register() {
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    if (!username || !email || !password) return toast('Fill all fields', 'error');
    const existing = await db.collection('users').where('username', '==', username).get();
    if (!existing.empty) return toast('Username taken', 'error');
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(cred.user.uid).set({
            xp: 0, dailyGoal: 20, streak: 0, username, achievements: [], dailyClaimed: false,
            lastActiveDate: firebase.firestore.FieldValue.serverTimestamp(),
            isAnonymous: false
        });
        toast('Account created');
    } catch (err) { toast(err.message, 'error'); }
}

async function guestLogin() {
    try {
        const cred = await auth.signInAnonymously();
        const guestId = cred.user.uid.slice(0,6);
        let guestName = `Guest_${guestId}`;
        const existing = await db.collection('users').where('username', '==', guestName).get();
        if (!existing.empty) guestName = `Guest_${guestId}_${Date.now()}`;
        await db.collection('users').doc(cred.user.uid).set({
            xp: 0, dailyGoal: 20, streak: 0, username: guestName, achievements: [], dailyClaimed: false,
            lastActiveDate: firebase.firestore.FieldValue.serverTimestamp(),
            isAnonymous: true
        });
        toast('Guest mode');
    } catch (err) { toast(err.message, 'error'); }
}

async function handleAuthChange(user) {
    if (user) {
        currentUser = user;
        await loadUserProfile();
        await loadWords();
        await seedDefaultSets();
        updateUI();
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('userName').innerText = userProfile.username || (user.isAnonymous ? 'Guest' : user.email?.split('@')[0] || 'User');
        document.getElementById('userInitial').innerText = (userProfile.username?.[0] || (user.isAnonymous ? 'G' : 'U')).toUpperCase();
        checkStreak();
        updateLevelProgress();
    } else {
        currentUser = null;
        words = [];
        userProfile = { xp: 0, dailyGoal: 20, streak: 0, username: null, achievements: [], dailyClaimed: false };
        document.getElementById('authModal').style.display = 'flex';
        updateUI();
    }
}

async function loadUserProfile() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) userProfile = doc.data();
    else {
        userProfile = { xp: 0, dailyGoal: 20, streak: 0, username: currentUser.isAnonymous ? `Guest_${currentUser.uid.slice(0,6)}` : 'User', achievements: [], dailyClaimed: false, isAnonymous: currentUser.isAnonymous };
        await db.collection('users').doc(currentUser.uid).set(userProfile);
    }
    document.getElementById('userXP').innerText = userProfile.xp;
    const level = Math.floor(Math.sqrt(userProfile.xp / 100)) + 1;
    document.getElementById('userLvl').innerText = level;
    document.getElementById('dailyGoalDisplay').innerText = userProfile.dailyGoal;
    document.getElementById('streakCount').innerText = userProfile.streak || 0;
    document.getElementById('profileUsername').value = userProfile.username || '';
    document.getElementById('dailyGoalInput').value = userProfile.dailyGoal;
    document.getElementById('achievementCount').innerText = userProfile.achievements?.length || 0;
    updateLevelProgress();
}

function updateLevelProgress() {
    const xp = userProfile.xp || 0;
    const level = Math.floor(Math.sqrt(xp / 100)) + 1;
    const xpForCurrent = (level - 1) ** 2 * 100;
    const xpForNext = level ** 2 * 100;
    const xpInLevel = xp - xpForCurrent;
    const xpNeeded = xpForNext - xpForCurrent;
    const percent = Math.floor((xpInLevel / xpNeeded) * 100);
    const levelSpan = document.getElementById('userLvl');
    if (levelSpan) {
        let progressSpan = levelSpan.parentElement.querySelector('.level-progress');
        if (!progressSpan) {
            progressSpan = document.createElement('span');
            progressSpan.className = 'level-progress';
            progressSpan.style.fontSize = '0.7rem';
            progressSpan.style.marginLeft = '0.3rem';
            progressSpan.style.opacity = '0.8';
            levelSpan.after(progressSpan);
        }
        progressSpan.textContent = `(${percent}%)`;
    }
}

async function loadWords() {
    const snap = await db.collection('words').where('userId', '==', currentUser.uid).get();
    words = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    words.forEach(w => { if (w.level === undefined) w.level = 0; });
    renderGallery();
    drawChart();
    updateStats();
}

async function addWord() {
    const word = document.getElementById('newWord').value.trim().toLowerCase();
    const trans = document.getElementById('newTranslation').value.trim();
    const example = document.getElementById('newExample').value.trim();
    if (!word || !trans) return toast('Fill both fields');
    if (words.some(w => w.word === word)) return toast('Word already exists', 'error');
    await db.collection('words').add({ userId: currentUser.uid, word, translation: trans, example, level: 0, reviewCount: 0 });
    toast('Word added (level 0)');
    document.getElementById('newWord').value = '';
    document.getElementById('newTranslation').value = '';
    document.getElementById('newExample').value = '';
    await loadWords();
}

async function deleteWord(id) {
    if (confirm('Delete this word?')) {
        await db.collection('words').doc(id).delete();
        await loadWords();
    }
}

function getTrainingWords(limit = null, mode = 'normal') {
    let pool = words.filter(w => mode === 'hard' ? w.level < 4 : w.level < 4);
    if (pool.length === 0) return [];
    const weighted = [];
    pool.forEach(w => {
        const weight = w.level === 0 ? 5 : 5 - w.level;
        for (let i = 0; i < weight; i++) weighted.push(w);
    });
    const shuffled = weighted.sort(() => Math.random() - 0.5);
    const unique = [];
    const seen = new Set();
    for (let w of shuffled) if (!seen.has(w.id)) { seen.add(w.id); unique.push(w); }
    return limit ? unique.slice(0, limit) : unique;
}

async function startTraining(mode) {
    if (words.length === 0) return toast('Add some words first');
    let queue = [];
    if (mode === 'random') queue = getTrainingWords(1);
    else if (mode === '5') queue = getTrainingWords(5);
    else if (mode === '10') queue = getTrainingWords(10);
    else if (mode === 'relay') { queue = getTrainingWords(); training.lives = 3; document.getElementById('relayLives').style.display = 'block'; }
    else if (mode === 'hard') queue = getTrainingWords(8, 'hard');
    else if (mode === 'duel') { document.getElementById('duelLobbyModal').style.display = 'flex'; return; }
    if (queue.length === 0) return toast('No suitable words');
    training = { active: true, queue, index: 0, mode, flipped: false, lives: mode === 'relay' ? 3 : null };
    document.getElementById('trainingModeLabel').innerText = `Mode: ${mode}`;
    updateTrainingCard();
    document.getElementById('trainingModal').style.display = 'flex';
}

function updateTrainingCard() {
    const w = training.queue[training.index];
    document.getElementById('frontWord').innerText = w.word;
    document.getElementById('backTranslation').innerText = w.translation;
    document.getElementById('exampleDisplay').innerText = w.example || '';
    document.getElementById('flipCard').classList.remove('flipped');
    training.flipped = false;
    document.getElementById('trainingProgress').innerText = `${training.index+1}/${training.queue.length}`;
    if (training.mode === 'relay') document.getElementById('relayLives').innerText = `❤️ Lives: ${training.lives}`;
}

function flipCard() {
    if (!training.flipped) {
        document.getElementById('flipCard').classList.add('flipped');
        training.flipped = true;
    }
}

async function rateWord(level) {
    if (!training.active || !training.flipped) return toast('Flip the card first');
    const current = training.queue[training.index];
    let points = 0;
    if (training.mode === 'duel') {
        if (level === 2) points = 1;
        else if (level === 3) points = 2;
        else if (level === 4) points = 3;
        if (duelData) {
            duelData.myScore += points;
            await db.collection('duelRooms').doc(duelData.roomId).collection('scores').doc(currentUser.uid).set({
                score: duelData.myScore,
                lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }
    await db.collection('words').doc(current.id).update({ level, lastReviewed: firebase.firestore.FieldValue.serverTimestamp() });
    if (level === 4) {
        await addXP(20);
        toast('+20 XP! Word mastered');
    }
    if (training.mode === 'relay' && level === 1) {
        training.lives--;
        if (training.lives <= 0) {
            toast('Game over');
            stopTraining();
            return;
        }
    }
    training.index++;
    if (training.index >= training.queue.length) {
        if (training.mode === 'duel') {
            const finishTime = Date.now();
            if (duelData) {
                await db.collection('duelRooms').doc(duelData.roomId).collection('finished').doc(currentUser.uid).set({
                    finishTime: finishTime,
                    score: duelData.myScore,
                    username: userProfile.username
                });
                const finishedSnap = await db.collection('duelRooms').doc(duelData.roomId).collection('finished').get();
                if (finishedSnap.size === 2) {
                    const results = [];
                    finishedSnap.forEach(doc => results.push(doc.data()));
                    results.sort((a,b) => {
                        if (a.score !== b.score) return b.score - a.score;
                        else return a.finishTime - b.finishTime;
                    });
                    const winner = results[0];
                    toast(`🏆 Winner: ${winner.username} (${winner.score} pts)!`, 'success');
                    await db.collection('duelRooms').doc(duelData.roomId).delete();
                } else {
                    toast(`You finished with ${duelData.myScore} points. Waiting for opponent...`, 'info');
                }
            }
        }
        toast('Training finished');
        stopTraining();
        await loadWords();
        updateDailyProgress();
    } else {
        training.flipped = false;
        updateTrainingCard();
    }
}

async function addXP(amount) {
    const newXP = (userProfile.xp || 0) + amount;
    await db.collection('users').doc(currentUser.uid).update({ xp: newXP });
    userProfile.xp = newXP;
    document.getElementById('userXP').innerText = newXP;
    const newLevel = Math.floor(Math.sqrt(newXP / 100)) + 1;
    document.getElementById('userLvl').innerText = newLevel;
    updateLevelProgress();
    checkAchievements();
}

function stopTraining() {
    training.active = false;
    document.getElementById('trainingModal').style.display = 'none';
    document.getElementById('relayLives').style.display = 'none';
    duelData = null;
}

async function updateDailyProgress() {
    if (!currentUser) return;
    const today = new Date().toDateString();
    const repsToday = words.filter(w => w.lastReviewed && new Date(w.lastReviewed.toDate()).toDateString() === today).length;
    const percent = Math.min(100, (repsToday / userProfile.dailyGoal) * 100);
    const progressFill = document.getElementById('dailyProgressFill');
    progressFill.style.width = percent + '%';
    const goalStatus = document.getElementById('goalStatus');
    if (percent >= 100 && !userProfile.dailyClaimed) {
        const reward = userProfile.dailyGoal * 5;
        await addXP(reward);
        await db.collection('users').doc(currentUser.uid).update({ dailyClaimed: true });
        userProfile.dailyClaimed = true;
        progressFill.classList.add('completed');
        goalStatus.innerHTML = `✅ Completed! Reward +${reward} XP ✅`;
        toast(`🎉 Daily goal completed! +${reward} XP 🎉`);
    } else if (percent >= 100 && userProfile.dailyClaimed) {
        progressFill.classList.add('completed');
        goalStatus.innerHTML = `🏆 Goal completed today! +${userProfile.dailyGoal * 5} XP already claimed.`;
    } else {
        progressFill.classList.remove('completed');
        if (percent === 0) goalStatus.innerHTML = `📅 Not started (0/${userProfile.dailyGoal})`;
        else goalStatus.innerHTML = `📈 In progress: ${Math.floor(percent)}% (${repsToday}/${userProfile.dailyGoal})`;
    }
}

function openGoalModal() {
    document.getElementById('goalModalInput').value = userProfile.dailyGoal;
    document.getElementById('goalModal').style.display = 'flex';
}

async function setDailyGoal(val) {
    await db.collection('users').doc(currentUser.uid).update({ dailyGoal: val, dailyClaimed: false });
    userProfile.dailyGoal = val;
    userProfile.dailyClaimed = false;
    document.getElementById('dailyGoalDisplay').innerText = val;
    document.getElementById('dailyGoalInput').value = val;
    updateDailyProgress();
    toast('Goal updated');
}

async function saveDailyGoalSetting() {
    let val = parseInt(document.getElementById('dailyGoalInput').value);
    if (isNaN(val)) val = 20;
    val = Math.min(100, Math.max(5, val));
    await setDailyGoal(val);
}

async function updateUsername() {
    const newName = document.getElementById('profileUsername').value.trim();
    if (!newName) return;
    if (userProfile.isAnonymous) return toast('Guest cannot change username', 'error');
    const check = await db.collection('users').where('username', '==', newName).get();
    if (!check.empty && check.docs[0].id !== currentUser.uid) return toast('Username taken', 'error');
    await db.collection('users').doc(currentUser.uid).update({ username: newName });
    userProfile.username = newName;
    toast('Username updated');
    document.getElementById('userName').innerText = newName;
    document.getElementById('userInitial').innerText = newName[0].toUpperCase();
}

async function addFriend() {
    const username = document.getElementById('friendUsername').value.trim();
    if (!username) return;
    if (userProfile.isAnonymous) return toast('Guests cannot add friends', 'error');
    const snap = await db.collection('users').where('username', '==', username).get();
    if (snap.empty) return toast('User not found');
    const friendDoc = snap.docs[0];
    const friendData = friendDoc.data();
    if (friendData.isAnonymous) return toast('Cannot add guest users', 'error');
    const friendId = friendDoc.id;
    if (friendId === currentUser.uid) return toast("Can't add yourself");
    const existing = await db.collection('friendships').where('from', '==', currentUser.uid).where('to', '==', friendId).get();
    if (!existing.empty) return toast('Already friends');
    await db.collection('friendships').add({ from: currentUser.uid, to: friendId, status: 'accepted' });
    toast('Friend added');
    loadFriends();
}

async function removeFriend(friendId, friendName) {
    if (!confirm(`Remove ${friendName} from friends?`)) return;
    const friendship = await db.collection('friendships')
        .where('from', '==', currentUser.uid)
        .where('to', '==', friendId)
        .get();
    if (!friendship.empty) {
        await friendship.docs[0].ref.delete();
        toast('Friend removed');
        loadFriends();
    }
}

async function loadFriends() {
    if (!currentUser) return;
    const snap = await db.collection('friendships').where('from', '==', currentUser.uid).get();
    const friendIds = snap.docs.map(d => d.data().to);
    const container = document.getElementById('friendsList');
    if (friendIds.length === 0) {
        container.innerHTML = '<li>No friends</li>';
        return;
    }
    let html = '';
    for (let id of friendIds) {
        const u = await db.collection('users').doc(id).get();
        const friendName = u.data().username || id;
        html += `<li class="friend-item">
                    <span>${friendName}</span>
                    <button onclick="removeFriend('${id}', '${friendName}')">❌ Remove</button>
                 </li>`;
    }
    container.innerHTML = html;
}

async function loadLeaderboard() {
    try {
        const snapshot = await db.collection('users').orderBy('xp', 'desc').limit(20).get();
        const users = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const isGuest = data.isAnonymous === true || (data.username && data.username.startsWith('Guest_'));
            if (!isGuest && data.username && data.username !== 'User') {
                users.push({
                    username: data.username,
                    xp: data.xp || 0
                });
            }
        });
        if (users.length === 0) {
            document.getElementById('leaderboardList').innerHTML = '<li>No registered users yet</li>';
            return;
        }
        const topUsers = users.slice(0, 10);
        const html = topUsers.map(user => `<li>${escapeHtml(user.username)} — ${user.xp} XP</li>`).join('');
        document.getElementById('leaderboardList').innerHTML = html;
    } catch (err) {
        console.error('Leaderboard error:', err);
        document.getElementById('leaderboardList').innerHTML = '<li>Error loading leaderboard</li>';
    }
}

async function createDuelRoom() {
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    const duelWordsRaw = getTrainingWords(5);
    if (duelWordsRaw.length === 0) {
        toast('Not enough words for duel', 'error');
        return;
    }
    const duelWords = duelWordsRaw.map(w => ({
        word: w.word,
        translation: w.translation,
        example: w.example || '',
        id: w.id
    }));
    await db.collection('duelRooms').doc(code).set({
        players: [currentUser.uid],
        words: duelWords,
        status: 'waiting',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('roomStatus').innerHTML = `Room code: <strong>${code}</strong>. Waiting for opponent...`;
    listenRoom(code);
}

async function joinDuelRoom() {
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    const roomRef = db.collection('duelRooms').doc(code);
    const room = await roomRef.get();
    if (!room.exists) return toast('Room not found');
    const data = room.data();
    if (data.players.length >= 2) return toast('Room full');
    if (data.status !== 'waiting') return toast('Game already started');
    await roomRef.update({
        players: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    listenRoom(code);
}

function listenRoom(roomId) {
    const unsubscribe = db.collection('duelRooms').doc(roomId).onSnapshot(async snap => {
        const data = snap.data();
        if (!data) return;
        if (data.players.length === 2 && data.status === 'waiting') {
            await db.collection('duelRooms').doc(roomId).update({ status: 'active' });
            const duelWords = data.words;
            training = {
                active: true,
                queue: duelWords,
                index: 0,
                mode: 'duel',
                flipped: false,
                roomId: roomId
            };
            duelData = {
                roomId: roomId,
                myScore: 0,
                opponentScore: 0,
                myFinishTime: null
            };
            await db.collection('duelRooms').doc(roomId).collection('scores').doc(currentUser.uid).set({
                score: 0,
                lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
            });
            updateTrainingCard();
            document.getElementById('duelLobbyModal').style.display = 'none';
            document.getElementById('trainingModal').style.display = 'flex';
            unsubscribe();
        }
    });
}

function drawChart() {
    const canvas = document.getElementById('levelDonut');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const counts = [0, 0, 0, 0, 0];
    words.forEach(w => { let lvl = w.level; if (lvl < 0) lvl = 0; if (lvl > 4) lvl = 4; counts[lvl]++; });
    const total = words.length;
    if (total === 0) {
        ctx.clearRect(0, 0, 200, 200);
        document.getElementById('legendPanel').innerHTML = 'No words';
        return;
    }
    const colors = ['#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e'];
    const labels = ['Not studied', 'Level 1', 'Level 2', 'Level 3', 'Level 4'];
    canvas.width = 200;
    canvas.height = 200;
    ctx.clearRect(0, 0, 200, 200);
    let start = -Math.PI / 2;
    for (let i = 0; i < 5; i++) {
        let angle = (counts[i] / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(100, 100, 70, start, start + angle);
        ctx.arc(100, 100, 45, start + angle, start, true);
        ctx.fillStyle = colors[i];
        ctx.fill();
        start += angle;
    }
    const legendDiv = document.getElementById('legendPanel');
    legendDiv.innerHTML = counts.map((c, i) => `<div><span style="background:${colors[i]};display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;"></span> ${labels[i]}: ${c}</div>`).join('');
}

function renderGallery() {
    const search = document.getElementById('searchWord').value.toLowerCase();
    const filter = parseInt(document.getElementById('filterLevel').value);
    let filtered = words.filter(w => w.word.includes(search) || w.translation.includes(search));
    if (filter) filtered = filtered.filter(w => w.level === filter);
    const container = document.getElementById('galleryGrid');
    container.innerHTML = filtered.map(w => `
        <div class="gallery-word-card">
            <div><strong>${w.word}</strong> — ${w.translation}<br><small>Level ${w.level}</small></div>
            <button class="small-btn" onclick="deleteWord('${w.id}')">🗑️</button>
        </div>
    `).join('');
}

function updateStats() {
    document.getElementById('totalWordsStat').innerText = words.length;
    const avg = words.length ? (words.reduce((s, w) => s + w.level, 0) / words.length).toFixed(1) : 0;
    document.getElementById('avgLevelStat').innerText = avg;
    document.getElementById('topLevel4Stat').innerText = words.filter(w => w.level === 4).length;
}

function updateUI() {
    drawChart();
    renderGallery();
    updateStats();
    if (currentUser) {
        loadFriends();
        loadLeaderboard();
        updateDailyProgress();
    } else {
        document.getElementById('friendsList').innerHTML = '<li>Log in to see friends</li>';
        document.getElementById('leaderboardList').innerHTML = '<li>Log in to see leaderboard</li>';
    }
}

function showView(view) {
    activeView = view;
    document.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
    document.getElementById(`${view}View`).classList.add('active');
    document.querySelectorAll('.workspace-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
    if (view === 'stats' && currentUser) loadLeaderboard();
}

function toggleTheme() {
    const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

function loadTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    setTheme(theme);
    document.getElementById('themeSelect').value = theme;
}

function setAccent(accent) {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('accent', accent);
}

function loadAccent() {
    const accent = localStorage.getItem('accent') || 'purple';
    setAccent(accent);
    document.getElementById('accentSelect').value = accent;
}

function toast(msg, type = 'info') {
    const container = document.getElementById('notificationToast');
    const toastEl = document.createElement('div');
    toastEl.className = `notification ${type}`;
    toastEl.innerText = msg;
    container.appendChild(toastEl);
    setTimeout(() => toastEl.remove(), 2500);
}

async function checkStreak() {
    const last = userProfile.lastActiveDate ? new Date(userProfile.lastActiveDate.toDate()).toDateString() : null;
    const today = new Date().toDateString();
    if (last !== today) {
        let streak = userProfile.streak || 0;
        if (last && (new Date() - new Date(last) < 86400000 * 2)) streak++;
        else streak = 1;
        await db.collection('users').doc(currentUser.uid).update({ streak, lastActiveDate: firebase.firestore.FieldValue.serverTimestamp() });
        userProfile.streak = streak;
        document.getElementById('streakCount').innerText = streak;
    }
}

async function checkAchievements() {
    let newAch = [];
    if (words.length >= 10 && !userProfile.achievements?.includes('collector')) newAch.push('collector');
    if (userProfile.xp >= 1000 && !userProfile.achievements?.includes('veteran')) newAch.push('veteran');
    if (newAch.length) {
        const updated = [...(userProfile.achievements || []), ...newAch];
        await db.collection('users').doc(currentUser.uid).update({ achievements: updated });
        userProfile.achievements = updated;
        toast(`Achievement unlocked: ${newAch.join(', ')}`);
        document.getElementById('achievementCount').innerText = updated.length;
    }
}

function showAchievements() {
    const modal = document.getElementById('achievementsModal');
    const listDiv = document.getElementById('achievementsList');
    const allAchievements = [
        { id: 'collector', title: 'Collector', desc: 'Add 10 words', icon: '📚' },
        { id: 'veteran', title: 'Veteran', desc: 'Reach 1000 XP', icon: '🏅' }
    ];
    const userAch = userProfile.achievements || [];
    listDiv.innerHTML = allAchievements.map(ach => {
        const unlocked = userAch.includes(ach.id);
        return `
            <div class="achievement-item ${unlocked ? '' : 'achievement-locked'}">
                <div class="achievement-icon">${ach.icon}</div>
                <div class="achievement-info">
                    <div class="achievement-title">${ach.title}</div>
                    <div class="achievement-desc">${ach.desc}</div>
                </div>
                <div>${unlocked ? '✅' : '🔒'}</div>
            </div>
        `;
    }).join('');
    modal.style.display = 'flex';
}

async function seedDefaultSets() {
    const snap = await db.collection('publicSets').limit(1).get();
    if (!snap.empty) return;
    const starter = {
        title: 'Starter pack (5 words)',
        description: 'Basic English words',
        words: [
            { word: 'apple', translation: 'яблоко', example: 'I eat an apple' },
            { word: 'car', translation: 'машина', example: 'red car' },
            { word: 'house', translation: 'дом', example: 'big house' },
            { word: 'happy', translation: 'счастливый', example: 'happy birthday' },
            { word: 'big', translation: 'большой', example: 'big city' }
        ]
    };
    await db.collection('publicSets').add(starter);
}

async function openImportModal() {
    const snap = await db.collection('publicSets').get();
    const container = document.getElementById('publicSetsList');
    container.innerHTML = '';
    snap.forEach(doc => {
        const set = doc.data();
        const div = document.createElement('div');
        div.style.marginBottom = '1rem';
        div.style.padding = '0.5rem';
        div.style.borderBottom = 'var(--border-thin)';
        div.innerHTML = `<strong>${set.title}</strong><p>${set.description}</p><button class="small-btn" data-id="${doc.id}">Import</button>`;
        div.querySelector('button').onclick = async () => {
            for (let w of set.words) {
                const exists = words.some(ew => ew.word === w.word);
                if (!exists) await db.collection('words').add({ userId: currentUser.uid, ...w, level: 0 });
            }
            toast(`Imported "${set.title}"`);
            closeModal('importModal');
            await loadWords();
        };
        container.appendChild(div);
    });
    document.getElementById('importModal').style.display = 'flex';
}

async function importJsonFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const imported = JSON.parse(ev.target.result);
            let count = 0;
            for (let w of imported) {
                if (!w.word || !w.translation) continue;
                if (!words.some(ew => ew.word === w.word)) {
                    await db.collection('words').add({ userId: currentUser.uid, word: w.word, translation: w.translation, example: w.example || '', level: 0 });
                    count++;
                }
            }
            toast(`Imported ${count} new words`);
            await loadWords();
        } catch (err) { toast('Invalid JSON file', 'error'); }
        e.target.value = '';
    };
    reader.readAsText(file);
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function fixVerticalHeight() {
    // Функция больше не нужна, так как CSS теперь работает правильно
}

window.addEventListener('load', () => {
    // Убираем конфликтующие функции
});
window.addEventListener('resize', () => {});

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.deleteWord = deleteWord;
window.removeFriend = removeFriend;
