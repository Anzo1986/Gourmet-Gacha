/**
 * Gourmet Gacha - Main Logic
 * Updated: History API, Layout Fixes, Ratings, Manual Selection
 */

// --- State & Defaults ---
const defaultData = {
    recipes: [
        {
            id: 'uuid-1',
            title: 'Chili con Carne',
            image: 'https://placehold.co/400x300?text=Chili',
            timeMinutes: 45,
            tags: ['Fleisch', 'Scharf'],
            rating: 5,
            lastCooked: null
        },
        {
            id: 'uuid-2',
            title: 'Pfannkuchen',
            image: 'https://placehold.co/400x300?text=Pfannkuchen',
            timeMinutes: 20,
            tags: ['Süß', 'Schnell', 'Veggie'],
            rating: 4,
            lastCooked: null
        },
        {
            id: 'uuid-3',
            title: 'Caesar Salad',
            image: 'https://placehold.co/400x300?text=Salad',
            timeMinutes: 15,
            tags: ['Veggie', 'Schnell', 'Leicht'],
            rating: 3,
            lastCooked: null
        }
    ],
    mealPlan: {}, // Key: "YYYY-MM-DD", Value: recipeID
    settings: {
        darkMode: true
    }
};

let appData = JSON.parse(JSON.stringify(defaultData));
let currentOracleResult = null;
let currentDayFilter = null; // Date string now
let selectedSlotDay = null; // Date string
let currentWeekOffset = 0; // 0 = current week, -1 = prev, 1 = next

// --- DOM Elements ---

// --- DOM Elements ---
const views = {
    cookbook: document.getElementById('view-cookbook'),
    oracle: document.getElementById('view-oracle'),
    weekplan: document.getElementById('view-weekplan')
};
const navItems = document.querySelectorAll('.nav-item');
const recipeGrid = document.getElementById('recipe-grid');
const weekSlotsContainer = document.getElementById('week-slots');

// Oracle Elements
const oracleDisplay = document.getElementById('oracle-display');
const oraclePlaceholder = document.querySelector('.oracle-placeholder');
const oracleResult = document.getElementById('oracle-result');
const oracleImg = document.getElementById('oracle-img');
const oracleTitle = document.getElementById('oracle-title');
const oracleTime = document.getElementById('oracle-time');
const oracleTags = document.getElementById('oracle-tags');
const oracleActions = document.getElementById('oracle-actions');

// Modals
const slotRecipeList = document.getElementById('slotRecipeList');

// --- Initialization ---
function init() {
    loadData();
    renderCookbook();
    renderWeekPlan();

    // Initial View from Hash
    const validViews = ['view-cookbook', 'view-oracle', 'view-weekplan'];
    const hash = window.location.hash.replace('#', '');
    const initialView = validViews.includes(hash) ? hash : 'view-cookbook';

    // Determine history state
    // We replace the current state to ensure we have a valid object
    history.replaceState({ view: initialView, modal: null }, '', `#${initialView}`);
    switchTab(initialView, false);

    // Register SW
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('SW registered'))
            .catch(err => console.log('SW fail', err));
    }

    setupEventListeners();

    // History Listener (Back Button / Swipe Support)
    window.addEventListener('popstate', (e) => {
        if (e.state) {
            // Restore View
            if (e.state.view) {
                switchTab(e.state.view, false);
            }
            // Restore Modal
            if (!e.state.modal) {
                closeAllModals();
            } else {
                const modal = document.getElementById(e.state.modal);
                if (modal) modal.classList.remove('hidden');
            }
        }
    });
}

// --- Storage Manager ---
function loadData() {
    const saved = localStorage.getItem('gourmetGachaData');
    if (saved) {
        try {
            appData = JSON.parse(saved);
            if (!appData.recipes) appData.recipes = [];

            // Recipe Rating Migration
            appData.recipes.forEach(r => {
                if (typeof r.rating === 'undefined') r.rating = 3;

                // Fix broken legacy URLs
                if (r.image.includes('unsplash.com')) {
                    if (r.title === 'Chili con Carne') r.image = 'https://placehold.co/400x300?text=Chili';
                    if (r.title === 'Pfannkuchen') r.image = 'https://placehold.co/400x300?text=Pfannkuchen';
                    if (r.title === 'Caesar Salad') r.image = 'https://placehold.co/400x300?text=Salad';
                }
            });

            // Weekly Plan Migration (Legacy -> Multi Week)
            if (appData.weeklyPlan) {
                if (!appData.mealPlan) appData.mealPlan = {};

                // Map old days to current week dates as a one-time migration
                const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                const startOfWeek = getStartOfWeek(new Date());

                days.forEach((d, i) => {
                    if (appData.weeklyPlan[d]) {
                        const date = new Date(startOfWeek);
                        date.setDate(startOfWeek.getDate() + i);
                        const dateStr = date.toISOString().split('T')[0];
                        appData.mealPlan[dateStr] = appData.weeklyPlan[d];
                    }
                });
                delete appData.weeklyPlan;
            }

            if (!appData.mealPlan) appData.mealPlan = {};

            // Aggressive Image Fix
            if (window.fixBrokenImages) window.fixBrokenImages();

        } catch (e) {
            console.error('Resetting data', e);
            appData = JSON.parse(JSON.stringify(defaultData));
        }
    } else {
        saveData();
    }
}

function fixBrokenImages() {
    let changed = false;
    appData.recipes.forEach(r => {
        if (r.image && r.image.includes('unsplash.com')) {
            console.log('Fixing broken image for:', r.title);
            r.image = `https://placehold.co/400x300?text=${encodeURIComponent(r.title)}`;
            changed = true;
        }
    });
    if (changed) saveData();
}

function saveData() {
    localStorage.setItem('gourmetGachaData', JSON.stringify(appData));
}

// --- Navigation ---
function switchTab(viewId, pushToHistory = true) {
    Object.values(views).forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    navItems.forEach(item => {
        if (item.dataset.target === viewId) item.classList.add('active');
        else item.classList.remove('active');
    });

    if (viewId === 'view-oracle') resetOracleUI();

    if (pushToHistory) {
        history.pushState({ view: viewId, modal: null }, '', `#${viewId}`);
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    // Push new state with modal
    const currentView = document.querySelector('.view.active').id;
    history.pushState({ view: currentView, modal: modalId }, '', window.location.hash);
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// --- Logic: Cookbook ---
function renderCookbook() {
    recipeGrid.innerHTML = '';
    appData.recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.style.cursor = 'pointer'; // Make it obvious
        const stars = '⭐'.repeat(recipe.rating || 3);

        card.innerHTML = `
            <img src="${recipe.image}" alt="${recipe.title}" onerror="this.onerror=null;this.src='lootbox_closed.png';">
            <div class="recipe-card-content">
                <h3>${recipe.title}</h3>
                <div class="recipe-meta">
                    <span>⏱️ ${recipe.timeMinutes}m</span> • <span>${stars}</span>
                </div>
            </div>
        `;

        // Open Edit Modal on click
        card.addEventListener('click', () => openEditModal(recipe));
        recipeGrid.appendChild(card);
    });
}

function openEditModal(recipe = null) {
    const title = document.getElementById('modalTitle');
    const delBtn = document.getElementById('deleteRecipeBtn');

    if (recipe) {
        // Edit Mode
        title.textContent = "Rezept bearbeiten";
        document.getElementById('editRecipeId').value = recipe.id;
        document.getElementById('recipeName').value = recipe.title;
        document.getElementById('recipeImage').value = recipe.image;
        document.getElementById('recipeLink').value = recipe.link || '';
        document.getElementById('recipeTime').value = recipe.timeMinutes;
        document.getElementById('recipeTags').value = recipe.tags.join(', ');
        document.getElementById('recipeRating').value = recipe.rating || 3;
        document.querySelector('#recipeRating').nextElementSibling.value = recipe.rating || 3;

        delBtn.classList.remove('hidden');
    } else {
        // Add Mode
        title.textContent = "Neues Rezept";
        document.getElementById('addRecipeForm').reset();
        document.getElementById('editRecipeId').value = '';
        document.querySelector('#recipeRating').nextElementSibling.value = 3;

        delBtn.classList.add('hidden');
    }

    openModal('addRecipeModal');
}

function saveRecipe(e) {
    e.preventDefault();
    const id = document.getElementById('editRecipeId').value;
    const name = document.getElementById('recipeName').value;
    const img = document.getElementById('recipeImage').value;
    const link = document.getElementById('recipeLink').value;
    const time = parseInt(document.getElementById('recipeTime').value);
    const tagsStr = document.getElementById('recipeTags').value;
    const rating = parseInt(document.getElementById('recipeRating').value);

    const recipeData = {
        id: id || 'uuid-' + Date.now(),
        title: name,
        image: img,
        link: link,
        timeMinutes: time || 0,
        tags: tagsStr.split(',').map(s => s.trim()).filter(Boolean),
        rating: rating || 3,
        lastCooked: null // reset? or keep? If editing, keep!
    };

    if (id) {
        // Update existing
        const index = appData.recipes.findIndex(r => r.id === id);
        if (index !== -1) {
            recipeData.lastCooked = appData.recipes[index].lastCooked; // preserve
            appData.recipes[index] = recipeData;
        }
    } else {
        // New
        appData.recipes.push(recipeData);
    }

    saveData();
    renderCookbook();

    if (history.state && history.state.modal === 'addRecipeModal') {
        history.back();
    } else {
        document.getElementById('addRecipeModal').classList.add('hidden');
    }
}

function deleteCurrentRecipe() {
    const id = document.getElementById('editRecipeId').value;
    if (!id) return;

    if (confirm("Rezept wirklich löschen?")) {
        appData.recipes = appData.recipes.filter(r => r.id !== id);
        // Clean up plan (Iterate all dates)
        Object.keys(appData.mealPlan).forEach(date => {
            if (appData.mealPlan[date] === id) delete appData.mealPlan[date];
        });
        saveData();
        renderCookbook();
        renderWeekPlan();

        if (history.state && history.state.modal === 'addRecipeModal') {
            history.back();
        } else {
            document.getElementById('addRecipeModal').classList.add('hidden');
        }
    }
}

// --- Logic: Oracle ---
function resetOracleUI() {
    oraclePlaceholder.classList.remove('hidden');
    oracleResult.classList.add('hidden');
    oracleActions.classList.add('hidden');

    // Reset Image
    document.getElementById('lootbox-img').src = 'lootbox_closed.png';

    // Clear effects
    oracleDisplay.classList.remove('spinning', 'shaking', 'winner', 'rarity-legendary', 'rarity-epic', 'rarity-rare', 'rarity-common');
    oracleResult.classList.remove('reveal');

    const rays = document.querySelector('.oracle-rays');
    if (rays) rays.classList.add('hidden'); // Check existence just in case

    document.querySelector('.oracle-flash').classList.remove('active');

    currentOracleResult = null;

    const btn = document.getElementById('acceptBtn');
    if (btn) {
        if (currentDayFilter) {
            const [y, m, d] = currentDayFilter.split('-');
            btn.textContent = `Nehmen für ${d}.${m}.`;
        } else {
            btn.textContent = "Nehmen & Planen";
        }
    }

    // Reset button state
    document.getElementById('spinBtn').classList.remove('hidden');
}

function spinOracle() {
    const quickFilter = document.getElementById('filter-quick').checked;
    const veggieFilter = document.getElementById('filter-veggie').checked;

    let candidates = appData.recipes.filter(r => {
        if (quickFilter && r.timeMinutes > 30) return false;
        if (veggieFilter && !r.tags.some(t => t.toLowerCase().includes('veggie') || t.toLowerCase().includes('vegetarisch'))) return false;
        return true;
    });

    if (candidates.length === 0) {
        alert("Keine passenden Rezepte gefunden!");
        return;
    }

    let pool = [];
    candidates.forEach(r => {
        pool.push(r);
        if (r.rating >= 5) { pool.push(r); pool.push(r); }
        else if (r.rating >= 4) { pool.push(r); }
    });

    // UI Setup: Start with Closed Box
    oraclePlaceholder.classList.remove('hidden');
    oracleDisplay.classList.remove('winner', 'rarity-legendary', 'rarity-epic', 'rarity-rare', 'rarity-common');
    document.querySelector('.oracle-rays').classList.add('hidden');
    oracleResult.classList.add('hidden');
    oracleActions.classList.add('hidden');
    document.getElementById('spinBtn').classList.add('hidden');

    // Start Shake Animation
    oracleDisplay.classList.add('shaking');

    // Simulate "Charging" time
    let duration = 1500;
    setTimeout(() => {
        finalizeOraclePick(pool);
    }, duration);
}

function finalizeOraclePick(pool) {
    const winner = pool[Math.floor(Math.random() * pool.length)];
    currentOracleResult = winner;

    // Stop Shake
    oracleDisplay.classList.remove('shaking');

    // Trigger Flash immediately
    const flash = document.querySelector('.oracle-flash');
    flash.classList.remove('hidden');
    flash.classList.add('active');

    // Apply Rarity
    const rating = winner.rating || 3;
    if (rating >= 5) oracleDisplay.classList.add('rarity-legendary');
    else if (rating === 4) oracleDisplay.classList.add('rarity-epic');
    else if (rating === 3) oracleDisplay.classList.add('rarity-rare');
    else oracleDisplay.classList.add('rarity-common');

    // Show Rays for high tier
    if (rating >= 4) {
        document.querySelector('.oracle-rays').classList.remove('hidden');
    }

    // Reveal Content
    setTimeout(() => {
        oraclePlaceholder.classList.add('hidden');
        oracleResult.classList.remove('hidden');
        oracleResult.classList.add('reveal');

        showOracleResult(winner);
        oracleActions.classList.remove('hidden');
        document.getElementById('spinBtn').classList.remove('hidden');

        setTimeout(() => flash.classList.remove('active'), 500);
    }, 100);
}

function showOracleResult(recipe) {
    oraclePlaceholder.classList.add('hidden');
    oracleResult.classList.remove('hidden');
    oracleImg.src = recipe.image;
    oracleTitle.textContent = recipe.title;
    oracleTime.textContent = `⏱️ ${recipe.timeMinutes} min`;
    oracleTags.textContent = `🏷️ ${recipe.tags.join(', ')}`;

    // Show Link if exists? 
    // Maybe just in cookbook/details. User didn't ask explicitly for Oracle link display but good to have.
}

function acceptOracleResult() {
    if (!currentDayFilter) {
        // Open Day Selection Modal
        renderDaySelectionList();
        openModal('daySelectionModal');
    } else {
        // We came from a specific day slot (dateStr)
        appData.mealPlan[currentDayFilter] = currentOracleResult.id;
        saveData();
        renderWeekPlan();
        switchTab('view-weekplan');
        currentDayFilter = null;
    }
}

function renderDaySelectionList() {
    const container = document.getElementById('daySelectionList');
    container.innerHTML = '';

    // Use the currently viewed week in Week Plan
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
    const startOfWeek = getStartOfWeek(targetDate);

    // Header with Nav
    const navDiv = document.createElement('div');
    navDiv.style.display = "flex";
    navDiv.style.justifyContent = "space-between";
    navDiv.style.alignItems = "center";
    navDiv.style.marginBottom = "15px";

    navDiv.innerHTML = `
        <button class="btn btn-small btn-secondary" id="modalWeekPrev">◀</button>
        <div style="font-weight:bold; color:var(--primary-color)">
            KW ${getWeekNumber(startOfWeek)} <br>
            <span style="font-size:0.8em; color:#888">${formatDateShort(startOfWeek)}</span>
        </div>
        <button class="btn btn-small btn-secondary" id="modalWeekNext">▶</button>
    `;
    container.appendChild(navDiv);

    // Wire up buttons
    navDiv.querySelector('#modalWeekPrev').onclick = () => {
        currentWeekOffset--;
        renderWeekPlan(); // Sync background
        renderDaySelectionList(); // Re-render self
    };
    navDiv.querySelector('#modalWeekNext').onclick = () => {
        currentWeekOffset++;
        renderWeekPlan();
        renderDaySelectionList();
    };

    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];

        const mealId = appData.mealPlan[dateStr];
        const meal = appData.recipes.find(r => r.id === mealId);

        const div = document.createElement('div');
        div.className = 'day-slot'; // Reuse styling
        div.style.cursor = 'pointer';
        div.style.marginBottom = '10px';

        div.innerHTML = `
            <div class="day-name">${formatDate(d)}</div>
            <div class="day-meal" style="margin:0 10px; flex:1">
                ${meal ? `<span style="opacity:0.6">${meal.title}</span>` : '<span style="color:var(--accent-color)">Frei</span>'}
            </div>
            <div>${meal ? '🔄' : '➕'}</div>
        `;

        div.onclick = () => {
            if (meal && !confirm(`${formatDate(d)} ist belegt mit "${meal.title}". Tauschen?`)) return;

            appData.mealPlan[dateStr] = currentOracleResult.id;
            saveData();
            renderWeekPlan();

            if (history.state && history.state.modal === 'daySelectionModal') history.back();
            setTimeout(() => switchTab('view-weekplan'), 50);
        };

        container.appendChild(div);
    }
}

// --- Logic: Week Plan ---
// --- Logic: Week Plan ---
function getStartOfWeek(refDate) {
    const d = new Date(refDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
    return new Date(d.setDate(diff));
}

function formatDate(dateObj) {
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const d = days[dateObj.getDay()];
    const date = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    return `${d} ${date}.${month}.`;
}

function formatDateShort(dateObj) {
    return `${dateObj.getDate()}.${dateObj.getMonth() + 1}.`;
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

function renderWeekPlan() {
    weekSlotsContainer.innerHTML = '';

    // Calculate start date based on offset
    const today = new Date();
    const currentWeekStart = getStartOfWeek(new Date()); // Anchor for "Today" check

    // Target week start
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
    const startOfWeek = getStartOfWeek(targetDate);

    // Update Title
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    const startStr = `${startOfWeek.getDate()}.${startOfWeek.getMonth() + 1}.`;
    const endStr = `${endOfWeek.getDate()}.${endOfWeek.getMonth() + 1}.`;

    let title = `${startStr} - ${endStr}`;
    if (currentWeekOffset === 0) title += " (Diese Woche)";
    else if (currentWeekOffset === 1) title += " (Nächste Woche)";

    document.getElementById('weekDisplay').textContent = title;

    // Render Slots
    for (let i = 0; i < 7; i++) {
        const loopDate = new Date(startOfWeek);
        loopDate.setDate(startOfWeek.getDate() + i);
        const dateStr = loopDate.toISOString().split('T')[0]; // YYYY-MM-DD

        const mealId = appData.mealPlan[dateStr];
        const meal = appData.recipes.find(r => r.id === mealId);

        // Styling Check: Is it past?
        // Simple check: if loopDate < today (ignoring time)
        const isPast = loopDate.setHours(0, 0, 0, 0) < today.setHours(0, 0, 0, 0);
        const isToday = loopDate.getTime() === today.getTime();

        const slot = document.createElement('div');
        slot.className = `day-slot ${isPast ? 'past' : ''} ${isToday ? 'today' : ''}`;
        if (isToday) slot.style.border = "1px solid var(--primary-color)";

        slot.innerHTML = `
            <div class="day-name">${formatDate(new Date(startOfWeek.getTime() + i * 86400000))}</div>
            <div class="day-meal ${meal ? 'filled' : ''}" onclick="window.fillDay('${dateStr}')" style="cursor:pointer">
                ${meal ?
                `<img src="${meal.image}" style="width:40px;height:40px;margin-right:10px;border-radius:8px;object-fit:cover;background:#333;" onerror="this.onerror=null;this.src='lootbox_closed.png';" class="week-meal-thumb"> <span>${meal.title}</span>`
                : '--- <br><small style="font-size:0.7em">(Tippen zum Planen)</small>'}
            </div>
            ${meal ?
                `<button class="btn btn-small btn-danger" onclick="window.clearDay(event, '${dateStr}')">x</button>` :
                `<button class="btn btn-small btn-secondary" onclick="window.fillDay('${dateStr}')">+</button>`
            }
        `;

        weekSlotsContainer.appendChild(slot);
    }
}

// Global helpers 
window.clearDay = (e, dateStr) => {
    e.stopPropagation();
    delete appData.mealPlan[dateStr];
    saveData();
    renderWeekPlan();
};

window.fillDay = (dateStr) => {
    selectedSlotDay = dateStr;
    const [y, m, d] = dateStr.split('-');
    document.getElementById('slotModalTitle').textContent = `${d}.${m}. Planen`;
    renderSlotRecipeList();
    openModal('slotModal');
};

// Make global for background fix
window.fixBrokenImages = function () {
    let changed = false;
    appData.recipes.forEach(r => {
        // Fix any unsplash or 404 link
        if (r.image && (r.image.includes('unsplash.com') || r.image.includes('404'))) {
            r.image = `https://placehold.co/400x300?text=${encodeURIComponent(r.title)}`;
            changed = true;
        }
    });
    if (changed) {
        saveData();
        renderCookbook();
        renderWeekPlan();
        console.log("Auto-repaired images.");
    }
};

function clearWeek() {
    if (confirm("Woche wirklich leeren?")) {
        // Only clear displayed week
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
        const startOfWeek = getStartOfWeek(targetDate);

        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            delete appData.mealPlan[dateStr];
        }

        saveData();
        renderWeekPlan();
    }
}

function changeWeek(delta) {
    currentWeekOffset += delta;
    renderWeekPlan();
}

// --- Slot Modal ---
function renderSlotRecipeList() {
    const searchTerm = document.getElementById('recipeSearch').value.toLowerCase();
    slotRecipeList.innerHTML = '';

    appData.recipes
        .filter(r => r.title.toLowerCase().includes(searchTerm))
        .forEach(r => {
            const div = document.createElement('div');
            div.className = 'slot-recipe-item';
            div.innerHTML = `<span>${r.title}</span> <span>${'⭐'.repeat(r.rating || 0)}</span>`;
            div.onclick = () => {
                appData.mealPlan[selectedSlotDay] = r.id; // selectedSlotDay is now dateStr
                saveData();
                renderWeekPlan();
                if (history.state && history.state.modal === 'slotModal') history.back();
            };
            slotRecipeList.appendChild(div);
        });
}

// --- Backup ---
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", "gacha_backup.json");
    document.body.appendChild(dl); dl.click(); dl.remove();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const loaded = JSON.parse(e.target.result);
            if (loaded.recipes && (loaded.weeklyPlan || loaded.mealPlan)) {
                appData = loaded;
                saveData();
                renderCookbook();
                renderWeekPlan();
                alert("Backup geladen!");
                if (history.state && history.state.modal === 'dataModal') history.back();
            }
        } catch (err) { alert("Fehler!"); }
    };
    reader.readAsText(file);
}

// --- Event Listeners ---
function setupEventListeners() {
    // Nav
    navItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.target));
    });

    // Add Recipe Button (Opens Modal in Add Mode)
    document.getElementById('addRecipeBtn').addEventListener('click', () => openEditModal(null));

    // Close Modals (The 'x' buttons)
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = function () {
            const modal = this.closest('.modal');
            if (modal && !modal.classList.contains('hidden')) {
                history.back();
            }
        };
    });

    // Handle Form Submit (Create or Update)
    document.getElementById('addRecipeForm').addEventListener('submit', saveRecipe);

    // Delete Button in Modal
    document.getElementById('deleteRecipeBtn').addEventListener('click', deleteCurrentRecipe);

    // Oracle
    document.getElementById('spinBtn').addEventListener('click', spinOracle);
    document.getElementById('rerollBtn').addEventListener('click', spinOracle);
    document.getElementById('acceptBtn').addEventListener('click', acceptOracleResult);

    // Data Modal
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportData);

    const importInput = document.getElementById('importDataInput');
    if (importInput) importInput.addEventListener('change', importData);

    const backupBtn = document.getElementById('backupBtn');
    if (backupBtn) backupBtn.addEventListener('click', () => openModal('dataModal'));

    document.getElementById('prevWeekBtn').addEventListener('click', () => changeWeek(-1));
    document.getElementById('nextWeekBtn').addEventListener('click', () => changeWeek(1));

    // Slot Modal
    document.getElementById('slotOracleBtn').addEventListener('click', () => {
        currentDayFilter = selectedSlotDay;
        if (history.state && history.state.modal === 'slotModal') history.back();
        setTimeout(() => switchTab('view-oracle'), 50);
    });

    // Close Buttons (The 'x' in modals)
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = function () {
            // Check if we are in history mode (modal open)
            if (history.state && history.state.modal) {
                history.back();
            } else {
                // Fallback
                closeAllModals();
            }
        };
    });

    // Global Close (Background Click)
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) {
            if (history.state && history.state.modal === e.target.id) history.back();
        }
    };
}

document.addEventListener('DOMContentLoaded', init);
