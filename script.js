let map, userMarker, orgMap, orgMarkers = [];
let userLocation = null;
let currentUser = null;

// Determine API Base URL based on environment
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : 'https://road-safety-sos.onrender.com/api';

// Persistence Keys
const SOS_QUEUE_KEY = 'road_safety_sos_queue';
const CACHE_RESOURCES_KEY = 'road_safety_resource_cache';

// Load cached data on startup
let sosQueue = JSON.parse(localStorage.getItem(SOS_QUEUE_KEY)) || [];
let resourceCache = JSON.parse(localStorage.getItem(CACHE_RESOURCES_KEY)) || {};

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('SW registered', reg);
        }).catch(err => {
            console.log('SW registration failed', err);
        });
    });
}

// --- Network & Connectivity Logic ---
window.addEventListener('online', () => {
    updateOnlineStatus();
    processSOSQueue();
});
window.addEventListener('offline', updateOnlineStatus);

function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    const offlineBar = document.getElementById('offline-bar');
    const syncIndicator = document.getElementById('sync-indicator');

    if (isOnline) {
        offlineBar?.classList.add('hidden');
        if (syncIndicator) {
            syncIndicator.classList.remove('bg-red-500');
            syncIndicator.classList.add('bg-green-500');
            syncIndicator.title = "Online - Synced with server";
        }
    } else {
        offlineBar?.classList.remove('hidden');
        if (syncIndicator) {
            syncIndicator.classList.remove('bg-green-500');
            syncIndicator.classList.add('bg-red-500');
            syncIndicator.title = "Offline - Working with cached data";
        }
    }
}

// Fetch Global Stats
async function updateGlobalStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        if (response.ok) {
            const data = await response.json();

            // Home page stats
            updateText('stat-user-count', data.userCount);
            updateText('stat-org-count', data.orgCount);
            updateText('stat-sos-count', data.alertCount);

            // Navbar stats
            updateText('stat-users', (data.userCount || 0) + (data.orgCount || 0));

            const activeAlertCount = document.getElementById('active-alert-count');
            if (activeAlertCount && currentUser?.role === 'org') {
                activeAlertCount.innerText = `${data.alertCount} ACTIVE SOS`;
            }
        }
    } catch (e) {
        console.warn("Could not fetch global stats (Offline)");
    }
}

function updateText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

// --- Navigation ---
function showSection(sectionId) {
    ['home-section', 'user-dashboard', 'org-dashboard'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    });

    const target = document.getElementById(sectionId);
    if (target) target.classList.remove('hidden');

    if (currentUser) {
        document.getElementById('logout-btn')?.classList.remove('hidden');
        document.getElementById('user-info')?.classList.remove('hidden');
        document.getElementById('user-display-name').innerText = currentUser.name;
    } else {
        document.getElementById('logout-btn')?.classList.add('hidden');
        document.getElementById('user-info')?.classList.add('hidden');
    }

    if (sectionId === 'user-dashboard') {
        initUserMap();
        requestLocation();
    } else if (sectionId === 'org-dashboard') {
        initOrgMap();
        refreshOrgDashboard();
    }

    if (sectionId === 'home-section') {
        updateGlobalStats();
    }

    updateOnlineStatus();
}

function showAuth(view) {
    if (view === 'login') {
        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('register-view').classList.add('hidden');
    } else {
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('register-view').classList.remove('hidden');
    }
}

// --- Auth ---
async function handleRegister() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;

    if (!name || !email || !password || !phone) return alert('Please fill all fields');

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password, role })
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message || 'Registration successful! Check your email to verify.');
            showAuth('login');
            updateGlobalStats();
        } else alert(data.message);
    } catch (err) {
        alert('Network error. Registration requires a connection.');
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const role = document.getElementById('login-role').value;

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });
        const data = await response.json();
        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('cached_user', JSON.stringify(currentUser));
            showSection(role === 'user' ? 'user-dashboard' : 'org-dashboard');
            updateGlobalStats();
        } else {
            alert(data.message);
        }
    } catch (err) {
        const cachedUser = JSON.parse(localStorage.getItem('cached_user'));
        if (cachedUser && cachedUser.email === email && cachedUser.role === role) {
            currentUser = cachedUser;
            alert('Offline Login: Accessing cached dashboard.');
            showSection(role === 'user' ? 'user-dashboard' : 'org-dashboard');
        } else {
            alert('Connection required for first-time login.');
        }
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('cached_user');
    showSection('home-section');
}

// --- User Map Logic ---
function initUserMap() {
    if (map) return;
    map = L.map('map', { zoomControl: false }).setView([26.8467, 80.9462], 13);
    L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

function requestLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
            const statusEl = document.getElementById('location-status');
            if (statusEl) statusEl.innerText = `Live: ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
            map.setView([userLocation.lat, userLocation.lng], 15);
            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup('You are here').openPopup();
            updateMap();
        }, () => {
            const statusEl = document.getElementById('location-status');
            if (statusEl) statusEl.innerText = 'Location access denied.';
        }, { enableHighAccuracy: true });
    }
}

async function updateMap() {
    if (!userLocation) return;
    map.eachLayer(layer => { if (layer instanceof L.Marker && layer !== userMarker) map.removeLayer(layer); });

    const radius = document.getElementById('radius-select').value;
    const lat = userLocation.lat;
    const lng = userLocation.lng;

    const categories = [
        { id: 'check-hospital', type: 'Hospital', query: `nwr["amenity"="hospital"](around:${radius},${lat},${lng});`, color: '#dc2626', icon: 'fa-hospital' },
        { id: 'check-police', type: 'Police', query: `nwr["amenity"="police"](around:${radius},${lat},${lng});`, color: '#1e40af', icon: 'fa-shield-alt' },
        { id: 'check-trauma', type: 'Trauma Centre', query: `(nwr["amenity"="hospital"]["emergency"="yes"](around:${radius},${lat},${lng}); nwr["emergency"="yes"](around:${radius},${lat},${lng}); nwr["name"~"Trauma",i](around:${radius},${lat},${lng}););`, color: '#991b1b', icon: 'fa-ambulance' },
        { id: 'check-towing', type: 'Repair/Towing', query: `(nwr["shop"="car_repair"](around:${radius},${lat},${lng}); nwr["shop"="tyres"](around:${radius},${lat},${lng}); nwr["amenity"="car_repair"](around:${radius},${lat},${lng}); nwr["name"~"Towing",i](around:${radius},${lat},${lng}); nwr["name"~"Puncture",i](around:${radius},${lat},${lng}););`, color: '#92400e', icon: 'fa-tools' },
        { id: 'check-clinics', type: 'Clinic', query: `nwr["amenity"="clinic"](around:${radius},${lat},${lng});`, color: '#059669', icon: 'fa-clinic-medical' }
    ];

    let totalContacts = 0;
    for (const cat of categories) {
        const checkbox = document.getElementById(cat.id);
        if (checkbox && checkbox.checked) {
            const count = await fetchResources(cat);
            totalContacts += count;
        }
    }
    const contactsEl = document.getElementById('stat-contacts');
    if (contactsEl) contactsEl.innerText = totalContacts;
}

async function fetchResources(cat) {
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent('[out:json][timeout:25];(' + cat.query + ');out center;')}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        resourceCache[cat.type] = data.elements;
        localStorage.setItem(CACHE_RESOURCES_KEY, JSON.stringify(resourceCache));

        data.elements.forEach(el => renderMarker(el, cat));
        return data.elements.length;
    } catch (e) {
        const cached = resourceCache[cat.type] || [];
        cached.forEach(el => renderMarker(el, cat));
        return cached.length;
    }
}

function renderMarker(el, cat) {
    const lat = el.lat || (el.center && el.center.lat);
    const lon = el.lon || (el.center && el.center.lon);
    if (!lat || !lon) return;

    const name = el.tags.name || `Unnamed ${cat.type}`;
    const phone = el.tags.phone || el.tags['contact:phone'] || 'No contact number available';
    const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color:${cat.color}; color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3)"><i class="fas ${cat.icon} text-xs"></i></div>`,
        iconSize: [30, 30]
    });

    L.marker([lat, lon], { icon: markerIcon }).addTo(map)
        .bindPopup(`<b>${name}</b><br><span class="text-xs font-bold text-slate-500 uppercase">${cat.type}</span><br><a href="tel:${phone}" class="text-blue-600 font-bold underline">${phone}</a>`);
}

// --- SOS Logic ---
async function triggerSOS() {
    if (!userLocation || !currentUser) return alert('Location and Login required');

    const alertData = {
        id: Date.now(), userName: currentUser.name, userPhone: currentUser.phone,
        lat: userLocation.lat, lng: userLocation.lng,
        time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString()
    };

    if (navigator.onLine) {
        sendSOS(alertData);
    } else {
        sosQueue.push(alertData);
        localStorage.setItem(SOS_QUEUE_KEY, JSON.stringify(sosQueue));
        alert('Low/No Network Detected. SOS has been queued and will send automatically when network returns.');
        visualSOSFeedback(true);
    }
}

async function sendSOS(data) {
    try {
        const response = await fetch(`${API_BASE}/sos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            visualSOSFeedback(false);
            updateGlobalStats();
        } else throw new Error();
    } catch (e) {
        if (!sosQueue.find(q => q.id === data.id)) {
            sosQueue.push(data);
            localStorage.setItem(SOS_QUEUE_KEY, JSON.stringify(sosQueue));
        }
    }
}

async function processSOSQueue() {
    if (!navigator.onLine || sosQueue.length === 0) return;
    const queue = [...sosQueue];
    sosQueue = [];
    localStorage.setItem(SOS_QUEUE_KEY, JSON.stringify([]));

    for (const alert of queue) {
        await sendSOS(alert);
    }
}

function visualSOSFeedback(isQueued) {
    const btn = document.querySelector('#user-dashboard button[onclick="triggerSOS()"]');
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = `<div class="flex flex-col items-center"><i class="fas ${isQueued ? 'fa-clock animate-pulse' : 'fa-check-circle'} mb-2"></i><span>${isQueued ? 'QUEUED' : 'SENT'}</span></div>`;
    btn.classList.replace('bg-red-600', 'bg-orange-500');
    setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.replace('bg-orange-500', 'bg-red-600');
    }, 4000);
}

// --- Org Dashboard ---
function initOrgMap() {
    if (orgMap) return;
    orgMap = L.map('org-map').setView([26.8467, 80.9462], 12);
    L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png').addTo(orgMap);
}

async function refreshOrgDashboard() {
    try {
        const response = await fetch(`${API_BASE}/alerts`);
        if (!response.ok) return;
        const alerts = await response.json();

        const list = document.getElementById('sos-list');
        const count = document.getElementById('active-alert-count');
        if (list) list.innerHTML = '';
        if (count) count.innerText = `${alerts.length} ACTIVE SOS`;

        orgMarkers.forEach(m => orgMap.removeLayer(m));
        orgMarkers = [];

        alerts.forEach(alert => {
            const div = document.createElement('div');
            div.className = 'p-5 bg-white border border-slate-100 shadow-sm rounded-2xl hover:border-blue-300 transition-all cursor-pointer mb-2';
            div.innerHTML = `<div class="font-bold text-slate-800">${alert.userName}</div><div class="text-xs font-bold text-blue-600 mb-1">${alert.userPhone}</div><div class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">${alert.time} | ${alert.date}</div>`;
            div.onclick = () => orgMap.setView([alert.lat, alert.lng], 16);
            list.appendChild(div);

            const marker = L.marker([alert.lat, alert.lng]).addTo(orgMap).bindPopup(`<b>${alert.userName}</b><br>${alert.userPhone}`);
            orgMarkers.push(marker);
        });
    } catch (e) { console.warn("Failed to sync Org dashboard (Offline)"); }
}

// Global polling for stats
setInterval(updateGlobalStats, 15000);

// Detect existing session
window.onload = () => {
    updateGlobalStats();
    const cachedUser = JSON.parse(localStorage.getItem('cached_user'));
    if (cachedUser) {
        currentUser = cachedUser;
        showSection(currentUser.role === 'user' ? 'user-dashboard' : 'org-dashboard');
    } else {
        showSection('home-section');
    }
    updateOnlineStatus();
};
