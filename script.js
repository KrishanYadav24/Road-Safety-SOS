let map, userMarker, orgMap, orgMarkers = [];
let userLocation = null;
let currentUser = null;
let registeredOrgMarkers = [];
let pendingOrganizationRegistration = null;
let organizationLocation = null;
let newOrgMap = null;
let newOrgMarker = null;

// Use relative path for API calls since the server serves the frontend
// This ensures it works on both localhost and any deployed domain (Render, Vercel, etc.)
const API_BASE = '/api';

// Persistence Keys
const SOS_QUEUE_KEY = 'roadsafetysos_sos_queue';
const CACHE_RESOURCES_KEY = 'roadsafetysos_resource_cache';
const CACHE_ORGS_KEY = 'roadsafetysos_registered_org_cache';

// Load cached data on startup
let sosQueue = JSON.parse(localStorage.getItem(SOS_QUEUE_KEY)) || [];
let resourceCache = JSON.parse(localStorage.getItem(CACHE_RESOURCES_KEY)) || {};
let registeredOrgCache = JSON.parse(localStorage.getItem(CACHE_ORGS_KEY)) || [];

// --- Custom Modal Logic ---
let modalCallback = null;

function showAlert(title, message, type = 'info', callback = null) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const iconContainer = document.getElementById('modal-icon');
    const btn = document.getElementById('modal-btn');

    modalCallback = callback;
    titleEl.innerText = title;
    msgEl.innerHTML = message;

    iconContainer.className = "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ";

    if (type === 'success') {
        iconContainer.classList.add('bg-emerald-100', 'text-emerald-600');
        iconContainer.innerHTML = '<i class="fas fa-check-circle text-4xl"></i>';
    } else if (type === 'error') {
        iconContainer.classList.add('bg-red-100', 'text-red-600');
        iconContainer.innerHTML = '<i class="fas fa-exclamation-circle text-4xl"></i>';
    } else if (type === 'warning') {
        iconContainer.classList.add('bg-amber-100', 'text-amber-600');
        iconContainer.innerHTML = '<i class="fas fa-triangle-exclamation text-4xl"></i>';
    } else {
        iconContainer.classList.add('bg-blue-100', 'text-blue-600');
        iconContainer.innerHTML = '<i class="fas fa-info-circle text-4xl"></i>';
    }

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('modal-active'), 10);
}

function closeModal() {
    const modal = document.getElementById('custom-modal');
    modal.classList.remove('modal-active');
    setTimeout(() => {
        modal.classList.add('hidden');
        if (modalCallback) {
            modalCallback();
            modalCallback = null;
        }
    }, 200);
}

// --- Navigation & Transitions ---
function showSection(sectionId) {
    const content = document.getElementById('main-content');

    // Start transition
    content.classList.add('blur-out');

    setTimeout(() => {
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

        // End transition
        content.classList.remove('blur-out');
    }, 200);
}

function showAuth(view) {
    const views = [
        'login-view',
        'auth-choice-view',
        'user-register-view',
        'organization-register-view',
        'organization-onboarding-view',
        'email-verification-view'
    ];

    views.forEach(id => document.getElementById(id)?.classList.add('hidden'));

    const viewMap = {
        login: 'login-view',
        register: 'auth-choice-view',
        choice: 'auth-choice-view',
        'user-register': 'user-register-view',
        'organization-register': 'organization-register-view',
        'organization-onboarding': 'organization-onboarding-view',
        'email-verification': 'email-verification-view'
    };

    document.getElementById(viewMap[view] || 'login-view')?.classList.remove('hidden');
}

// --- Auth ---
async function handleUserRegistration(event) {
    event.preventDefault();

    const payload = {
        role: 'user',
        name: document.getElementById('user-reg-name').value.trim(),
        email: document.getElementById('user-reg-email').value.trim(),
        phone: document.getElementById('user-reg-phone').value.trim(),
        password: document.getElementById('user-reg-password').value,
        age: document.getElementById('user-reg-age').value,
        gender: document.getElementById('user-reg-gender').value,
        bloodGroup: document.getElementById('user-reg-blood-group').value,
        address: document.getElementById('user-reg-address').value.trim()
    };

    if (!payload.name || !payload.email || !payload.phone || !payload.password) {
        return showAlert('Missing Info', 'Please fill name, email, phone, and password.', 'warning');
    }

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) {
            showAuth('email-verification');
            showAlert('Success!', data.message || 'Registration successful!', 'success');
            updateGlobalStats();
        } else {
            showAlert('Registration Failed', data.message, 'error');
        }
    } catch (err) {
        showAlert('Registration Failed', 'Could not connect to server.', 'error');
    }
}

function handleOrganizationRegistration(event) {
    event.preventDefault();

    pendingOrganizationRegistration = {
        role: 'organization',
        name: document.getElementById('organization-reg-name').value.trim(),
        email: document.getElementById('organization-reg-email').value.trim(),
        phone: document.getElementById('organization-reg-phone').value.trim(),
        password: document.getElementById('organization-reg-password').value,
        category: document.getElementById('organization-reg-type').value
    };

    if (!pendingOrganizationRegistration.name || !pendingOrganizationRegistration.email ||
        !pendingOrganizationRegistration.phone || !pendingOrganizationRegistration.password ||
        !pendingOrganizationRegistration.category) {
        return showAlert('Missing Info', 'Please fill all organization registration fields.', 'warning');
    }

    showAuth('organization-onboarding');
}

function requestOrganizationLocation() {
    if (!navigator.geolocation) {
        return showAlert('Location Unavailable', 'Geolocation is not supported by your browser.', 'error');
    }

    navigator.geolocation.getCurrentPosition(position => {
        organizationLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        document.getElementById('organization-location-step')?.classList.add('hidden');
        document.getElementById('new-organization-step')?.classList.remove('hidden');

        document.getElementById('new-org-name').value = pendingOrganizationRegistration?.name || '';
        updateNewOrganizationLocationDisplay();
        initNewOrganizationMap();
    }, () => {
        showAlert('Location Denied', 'Please allow location access to register your organization.', 'warning');
    }, { enableHighAccuracy: true });
}

function updateNewOrganizationLocationDisplay() {
    if (!organizationLocation) return;
    updateText('new-org-lat-display', `Lat: ${organizationLocation.lat.toFixed(6)}`);
    updateText('new-org-lng-display', `Lng: ${organizationLocation.lng.toFixed(6)}`);
}

function initNewOrganizationMap() {
    if (!organizationLocation || !document.getElementById('new-org-map')) return;

    if (!newOrgMap) {
        newOrgMap = L.map('new-org-map').setView([organizationLocation.lat, organizationLocation.lng], 16);
        L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png').addTo(newOrgMap);
    }

    if (newOrgMarker) newOrgMap.removeLayer(newOrgMarker);
    newOrgMarker = L.marker([organizationLocation.lat, organizationLocation.lng], { draggable: true }).addTo(newOrgMap);
    newOrgMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        organizationLocation = { lat: pos.lat, lng: pos.lng };
        updateNewOrganizationLocationDisplay();
    });
}

async function createNewOrganization(event) {
    event.preventDefault();

    const payload = {
        ...pendingOrganizationRegistration,
        address: document.getElementById('new-org-address').value.trim(),
        lat: organizationLocation.lat,
        lng: organizationLocation.lng
    };

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) {
            showAuth('email-verification');
            showAlert('Success!', data.message, 'success');
        } else {
            showAlert('Error', data.message, 'error');
        }
    } catch (err) {
        showAlert('Error', 'Connection failed.', 'error');
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
            showAlert('Login Failed', data.message, 'error');
        }
    } catch (err) {
        console.error("Login fetch error:", err);
        const cachedUser = JSON.parse(localStorage.getItem('cached_user'));
        if (cachedUser && cachedUser.email === email && cachedUser.role === role) {
            currentUser = cachedUser;
            showAlert('Offline Access', 'Accessing dashboard via cache.', 'info');
            showSection(role === 'user' ? 'user-dashboard' : 'org-dashboard');
        } else {
            showAlert('Connection Required', 'An internet connection is required for login.', 'warning');
        }
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('cached_user');
    showSection('home-section');
}

// --- Map Logic ---
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
            if (document.getElementById('location-status'))
                document.getElementById('location-status').innerText = 'Location access denied.';
        }, { enableHighAccuracy: true });
    }
}

async function updateMap() {
    if (!userLocation) return;

    // Clear existing markers except user marker
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== userMarker) map.removeLayer(layer);
    });

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

    // Fetch from registered organizations first
    totalContacts += await fetchRegisteredOrganizations(radius, lat, lng);

    // Fetch from Overpass API for each checked category
    for (const cat of categories) {
        if (document.getElementById(cat.id).checked) {
            const count = await fetchResources(cat);
            totalContacts += count;
        }
    }

    const countEl = document.getElementById('stat-contacts');
    if (countEl) countEl.innerText = totalContacts;
}

async function fetchRegisteredOrganizations(radius, lat, lng) {
    try {
        const response = await fetch(`${API_BASE}/organizations`);
        if (response.ok) {
            registeredOrgCache = await response.json();
            localStorage.setItem(CACHE_ORGS_KEY, JSON.stringify(registeredOrgCache));
        }
    } catch (e) { console.warn("Using cached orgs"); }

    let count = 0;
    registeredOrgCache.forEach(org => {
        // Map org types to checkbox IDs
        const typeMap = {
            'hospital': 'check-hospital',
            'ambulance service': 'check-trauma', // Mapping ambulance to trauma for now
            'clinic': 'check-clinics',
            'police': 'check-police',
            'repair': 'check-towing'
        };

        const checkboxId = typeMap[(org.category || '').toLowerCase()] || 'check-hospital';
        const checkbox = document.getElementById(checkboxId);

        if (checkbox && checkbox.checked) {
            const dist = getDistance(lat, lng, org.lat, org.lng);
            if (dist <= radius) {
                renderMarker({ lat: org.lat, lon: org.lng, tags: { name: org.name, phone: org.phone } }, { type: org.category, color: '#2563eb', icon: 'fa-building-circle-check' });
                count++;
            }
        }
    });
    return count;
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function fetchResources(cat) {
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent('[out:json][timeout:25];(' + cat.query + ');out center;')}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        data.elements.forEach(el => renderMarker(el, cat));
        return data.elements.length;
    } catch (e) { return 0; }
}

function renderMarker(el, cat) {
    const lat = el.lat || (el.center && el.center.lat);
    const lon = el.lon || (el.center && el.center.lon);
    if (!lat || !lon) return;

    const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color:${cat.color}; color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3)"><i class="fas ${cat.icon} text-xs"></i></div>`,
        iconSize: [30, 30]
    });

    const name = el.tags.name || `Unnamed ${cat.type}`;
    const phone = el.tags.phone || 'N/A';
    L.marker([lat, lon], { icon: markerIcon }).addTo(map)
        .bindPopup(`<b>${name}</b><br>${cat.type}<br>Phone: ${phone}`);
}

// --- Global Stats ---
async function updateGlobalStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        if (response.ok) {
            const data = await response.json();
            updateText('stat-user-count', data.userCount);
            updateText('stat-org-count', data.orgCount);
            updateText('stat-sos-count', data.alertCount);
        }
    } catch (e) {}
}

function updateText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function updateOnlineStatus() {
    // Basic implementation
}

// --- SOS Logic ---
async function triggerSOS() {
    if (!userLocation || !currentUser) return showAlert('Error', 'Login and Location required', 'warning');

    const alertData = {
        id: Date.now(), userName: currentUser.name, userPhone: currentUser.phone,
        lat: userLocation.lat, lng: userLocation.lng,
        time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(),
        type: 'login'
    };

    try {
        await fetch(`${API_BASE}/sos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(alertData)
        });
        showAlert('SOS Sent', 'Help is on the way.', 'success');
    } catch (e) {
        showAlert('Error', 'Failed to send SOS.', 'error');
    }
}

window.onload = () => {
    updateGlobalStats();
    const cachedUser = JSON.parse(localStorage.getItem('cached_user'));
    if (cachedUser) {
        currentUser = cachedUser;
        showSection(currentUser.role === 'user' ? 'user-dashboard' : 'org-dashboard');
    }
};
