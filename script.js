let map, userMarker, orgMap, orgMarkers = [];
let orgLocationMarker = null;
let userLocation = null;
let currentUser = null;
let registeredOrgMarkers = [];
let tempOrgData = null;
let onboardingMap = null;
let onboardingMarker = null;
let onboardingCoords = null;
let selectedSOS = null;
let currentResponderLocation = null;
let selectedSOSMarker = null;
let responderMarker = null;
let orgAlerts = {};
let sosCircle = null;
let activeSOS = null;
let activeSOSPollingTimer = null;
let sosAttendedNotified = false;
let sosRadiusIndex = 0;
let sosTimer = null;
const SOS_RADII = [1000, 2000, 3000, 4000, 5000];
const SOS_POLL_INTERVAL = 5000;

// Determine API Base URL based on environment
// Update the Render URL if your backend is deployed at a different address
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : 'https://road-safety-sos-27p4.onrender.com/api';

// Persistence Keys
const SOS_QUEUE_KEY = 'roadsafetysos_sos_queue';
const CACHE_RESOURCES_KEY = 'roadsafetysos_resource_cache';
const CACHE_ORGS_KEY = 'roadsafetysos_registered_org_cache';

const ORG_CATEGORY_META = {
    hospital: { color: '#dc2626', icon: 'fa-hospital', label: 'Hospital' },
    police: { color: '#1e40af', icon: 'fa-shield-alt', label: 'Police Station' },
    clinic: { color: '#16a34a', icon: 'fa-clinic-medical', label: 'Clinic' },
    'ambulance service': { color: '#0284c7', icon: 'fa-ambulance', label: 'Ambulance Service' },
    'emergency center': { color: '#eab308', icon: 'fa-bell-on', label: 'Emergency Center' },
    ngo: { color: '#7c3aed', icon: 'fa-hands-praying', label: 'NGO' },
    'repair/towing': { color: '#92400e', icon: 'fa-tools', label: 'Repair & Towing' }
};

function getOrgCategoryMeta(category) {
    if (!category) return { color: '#475569', icon: 'fa-building', label: 'Organization' };
    const key = category.trim().toLowerCase();
    return ORG_CATEGORY_META[key] || { color: '#475569', icon: 'fa-building', label: category };
}

// Load cached data on startup
let sosQueue = JSON.parse(localStorage.getItem(SOS_QUEUE_KEY)) || [];
let resourceCache = JSON.parse(localStorage.getItem(CACHE_RESOURCES_KEY)) || {};
let registeredOrgCache = JSON.parse(localStorage.getItem(CACHE_ORGS_KEY)) || [];

// Helper to call API with stored JWT token
async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('auth_token');
    const headers = options.headers || {};
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    options.headers = headers;
    return fetch(API_BASE + path, options);
}

// --- Custom Modal Logic ---
let modalCallback = null;

function showAlert(title, message, type = 'info', callback = null) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const iconContainer = document.getElementById('modal-icon');
    const btn = document.getElementById('modal-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    modalCallback = callback;
    titleEl.innerText = title;
    msgEl.innerHTML = message;

    // Reset buttons
    btn.onclick = closeModal;
    if (cancelBtn) cancelBtn.classList.add('hidden');

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

function showConfirm(title, message, onConfirm, onCancel = null) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const iconContainer = document.getElementById('modal-icon');
    const okBtn = document.getElementById('modal-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    titleEl.innerText = title;
    msgEl.innerHTML = message;

    iconContainer.className = "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-blue-100 text-blue-600";
    iconContainer.innerHTML = '<i class="fas fa-question-circle text-4xl"></i>';

    cancelBtn.classList.remove('hidden');

    okBtn.onclick = () => {
        closeModal();
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        closeModal();
        if (onCancel) onCancel();
    };

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
            fetchUserHistory();
        } else if (sectionId === 'org-dashboard') {
            initOrgMap();
            renderOrgLocationMarker();
            refreshOrgDashboard();
        }

        if (sectionId === 'home-section') {
            updateGlobalStats();
        }

        updateOnlineStatus();

        // End transition
        content.classList.remove('blur-out');
    }, 200); // Reduced delay for faster feel
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

    let targetId = 'login-view';
    if (view === 'login') targetId = 'login-view';
    else if (view === 'choice' || view === 'register') targetId = 'auth-choice-view';
    else if (view === 'user-register') targetId = 'user-register-view';
    else if (view === 'organization-register') targetId = 'organization-register-view';
    else if (view === 'organization-onboarding') targetId = 'organization-onboarding-view';
    else if (view === 'email-verification') targetId = 'email-verification-view';

    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === targetId) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        }
    });
}

function setRegisterRole(role) {
    const isOrg = role === 'org';
    document.getElementById('reg-role').value = role;
    document.getElementById('reg-name').placeholder = isOrg ? 'Organization Name' : 'Full Name';
    document.getElementById('org-registration-fields').classList.toggle('hidden', !isOrg);

    const userTab = document.getElementById('reg-user-tab');
    const orgTab = document.getElementById('reg-org-tab');
    userTab.className = isOrg
        ? 'py-2.5 rounded-lg text-sm font-bold text-slate-500'
        : 'py-2.5 rounded-lg text-sm font-bold bg-white text-blue-600 shadow-sm';
    orgTab.className = isOrg
        ? 'py-2.5 rounded-lg text-sm font-bold bg-white text-blue-600 shadow-sm'
        : 'py-2.5 rounded-lg text-sm font-bold text-slate-500';
}

function captureOrgLocation() {
    const statusEl = document.getElementById('reg-location-status');
    if (!navigator.geolocation) {
        statusEl.innerText = 'Geolocation is not supported by your browser.';
        statusEl.className = 'text-xs font-bold text-red-500 text-center';
        return;
    }

    statusEl.innerText = 'Fetching organization location...';
    statusEl.className = 'text-xs font-bold text-blue-500 text-center';

    navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        document.getElementById('reg-lat').value = lat;
        document.getElementById('reg-lng').value = lng;
        statusEl.innerText = `Location captured: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        statusEl.className = 'text-xs font-bold text-emerald-600 text-center';
    }, () => {
        statusEl.innerText = 'Location permission is required for organization registration.';
        statusEl.className = 'text-xs font-bold text-red-500 text-center';
    }, { enableHighAccuracy: true });
}

// --- Team & Services ---
function showTeamModal() {
    showAlert('Team DigiX', `
        <div class="text-left space-y-2">
            <div class="flex items-center"><i class="fas fa-user-circle mr-3 text-blue-500"></i> Krishan Yadav</div>
            <div class="flex items-center"><i class="fas fa-user-circle mr-3 text-blue-500"></i> Om Awasthi</div>
            <div class="flex items-center"><i class="fas fa-user-circle mr-3 text-blue-500"></i> Sarthak Agrawal</div>
            <div class="flex items-center"><i class="fas fa-user-circle mr-3 text-blue-500"></i> Dhruv Upadhayaya</div>
            <div class="flex items-center"><i class="fas fa-user-circle mr-3 text-blue-500"></i> Vinayak Tripathi</div>
        </div>
    `, 'info');
}

function toggleProfile() {
    const modal = document.getElementById('profile-modal');
    if (!currentUser) return showAlert('Not logged in', 'Please login to edit your profile.', 'warning');
    if (modal.classList.contains('hidden')) {
        // populate fields
        document.getElementById('profile-name').value = currentUser.name || '';
        document.getElementById('profile-phone').value = currentUser.phone || '';
        document.getElementById('profile-email').value = currentUser.email || '';
        document.getElementById('profile-category').value = currentUser.category || '';
        document.getElementById('profile-photo').value = currentUser.photoUrl || '';
        document.getElementById('profile-lat').value = currentUser.lat || '';
        document.getElementById('profile-lng').value = currentUser.lng || '';
        document.getElementById('profile-address').value = currentUser.address || '';
        document.getElementById('profile-password').value = '';

        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('modal-active'), 10);
    } else {
        closeProfileModal();
    }
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    modal.classList.remove('modal-active');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

async function saveProfile(e) {
    e.preventDefault();
    const updates = {};
    ['name','phone','category','photo','lat','lng','address','password'].forEach(k=>{});
    const name = document.getElementById('profile-name').value;
    const phone = document.getElementById('profile-phone').value;
    const category = document.getElementById('profile-category').value;
    const photoUrl = document.getElementById('profile-photo').value;
    const lat = parseFloat(document.getElementById('profile-lat').value) || undefined;
    const lng = parseFloat(document.getElementById('profile-lng').value) || undefined;
    const address = document.getElementById('profile-address').value;
    const password = document.getElementById('profile-password').value;

    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (category) updates.category = category;
    if (photoUrl) updates.photoUrl = photoUrl;
    if (lat !== undefined) updates.lat = lat;
    if (lng !== undefined) updates.lng = lng;
    if (address) updates.address = address;
    if (password) updates.password = password;

    try {
        const response = await apiFetch('/profile', { method: 'PUT', body: JSON.stringify({ email: currentUser.email, updates }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Update failed');
        currentUser = data.user;
        localStorage.setItem('cached_user', JSON.stringify(currentUser));
        showAlert('Saved', 'Profile updated successfully.', 'success');
        closeProfileModal();
        // update UI
        document.getElementById('user-display-name').innerText = currentUser.name;
        renderOrgLocationMarker();
    } catch (err) {
        console.error('Profile update failed', err);
        showAlert('Update Failed', err.message || 'Unable to update profile right now.', 'error');
    }
}

function useMyLocationForProfile() {
    if (!navigator.geolocation) return showAlert('Geolocation', 'Geolocation not supported.', 'error');
    navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById('profile-lat').value = pos.coords.latitude;
        document.getElementById('profile-lng').value = pos.coords.longitude;
    }, () => showAlert('Location Denied', 'Please enable location access to use this feature.', 'error'), { enableHighAccuracy: true });
}

function handleGetStarted() {
    showAlert('Our Services', `
        <ul class="text-left text-sm space-y-3">
            <li><i class="fas fa-check text-green-500 mr-2"></i> <b>Real-time SOS:</b> Instant location broadcast to emergency responders.</li>
            <li><i class="fas fa-check text-green-500 mr-2"></i> <b>Service Locator:</b> Find verified hospitals and police stations nearby.</li>
            <li><i class="fas fa-check text-green-500 mr-2"></i> <b>Offline Mode:</b> SOS queuing even without active internet.</li>
            <li><i class="fas fa-check text-green-500 mr-2"></i> <b>Verification:</b> Secure accounts for individuals and organizations.</li>
        </ul>
    `, 'info', () => {
        showAuth('choice');
        document.getElementById('auth-container').scrollIntoView();
    });
}

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
            const userCount = data.userCount ?? 0;
            const orgCount = data.orgCount ?? 0;
            const alertCount = data.alertCount ?? 0;
            updateText('stat-user-count', userCount);
            updateText('stat-org-count', orgCount);
            updateText('stat-sos-count', alertCount);
            updateText('stat-users', userCount + orgCount);
            const activeAlertCount = document.getElementById('active-alert-count');
            if (activeAlertCount && currentUser?.role === 'org') {
                activeAlertCount.innerText = `${alertCount} ACTIVE SOS`;
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

async function handleUserRegistration(event) {
    event.preventDefault();
    const name = document.getElementById('user-reg-name').value;
    const email = document.getElementById('user-reg-email').value;
    const phone = document.getElementById('user-reg-phone').value;
    const password = document.getElementById('user-reg-password').value;
    const age = document.getElementById('user-reg-age').value;
    const gender = document.getElementById('user-reg-gender').value;
    const bloodGroup = document.getElementById('user-reg-blood-group').value;
    const address = document.getElementById('user-reg-address').value;

    if (!name || !email || !phone || !password) {
        return showAlert('Missing Info', 'Please fill all required fields.', 'warning');
    }

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, email, phone, password, role: 'user',
                age, gender, bloodGroup, address
            })
        });
        const data = await response.json();
        if (response.ok) {
            showAuth('email-verification');
            updateGlobalStats();
        } else {
            showAlert('Registration Failed', data.message, 'error');
        }
    } catch (err) {
        showAlert('Connection Error', 'Registration requires an active internet connection.', 'error');
    }
}

function handleOrganizationRegistration(event) {
    event.preventDefault();
    const name = document.getElementById('organization-reg-name').value;
    const email = document.getElementById('organization-reg-email').value;
    const phone = document.getElementById('organization-reg-phone').value;
    const password = document.getElementById('organization-reg-password').value;
    const category = document.getElementById('organization-reg-type').value;

    if (!name || !email || !phone || !password || !category) {
        return showAlert('Missing Info', 'Please fill all fields to continue onboarding.', 'warning');
    }

    tempOrgData = { name, email, phone, password, category };
    showAuth('organization-onboarding');
}

function requestOrganizationLocation() {
    if (!navigator.geolocation) {
        return showAlert('Error', 'Geolocation is not supported by your browser.', 'error');
    }

    showAlert('Locating...', 'Fetching your precise coordinates...', 'info');

    navigator.geolocation.getCurrentPosition(position => {
        onboardingCoords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        closeModal();

        document.getElementById('organization-location-step').classList.add('hidden');
        document.getElementById('new-organization-step').classList.remove('hidden');

        initOnboardingMap();
    }, () => {
        showAlert('Location Denied', 'Please enable location access to continue onboarding.', 'error');
    }, { enableHighAccuracy: true });
}

function initOnboardingMap() {
    if (!onboardingCoords) return;

    document.getElementById('new-org-name').value = tempOrgData.name;
    document.getElementById('new-org-lat-display').innerText = `Lat: ${onboardingCoords.lat.toFixed(6)}`;
    document.getElementById('new-org-lng-display').innerText = `Lng: ${onboardingCoords.lng.toFixed(6)}`;

    setTimeout(() => {
        if (onboardingMap) {
            onboardingMap.setView([onboardingCoords.lat, onboardingCoords.lng], 16);
            if (onboardingMarker) onboardingMarker.setLatLng([onboardingCoords.lat, onboardingCoords.lng]);
            return;
        }

        onboardingMap = L.map('new-org-map').setView([onboardingCoords.lat, onboardingCoords.lng], 16);
        L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png').addTo(onboardingMap);

        onboardingMarker = L.marker([onboardingCoords.lat, onboardingCoords.lng], { draggable: true }).addTo(onboardingMap);

        onboardingMarker.on('dragend', function () {
            const position = onboardingMarker.getLatLng();
            onboardingCoords.lat = position.lat;
            onboardingCoords.lng = position.lng;
            document.getElementById('new-org-lat-display').innerText = `Lat: ${onboardingCoords.lat.toFixed(6)}`;
            document.getElementById('new-org-lng-display').innerText = `Lng: ${onboardingCoords.lng.toFixed(6)}`;
        });

        onboardingMap.on('click', function (e) {
            const position = e.latlng;
            onboardingMarker.setLatLng(position);
            onboardingCoords.lat = position.lat;
            onboardingCoords.lng = position.lng;
            document.getElementById('new-org-lat-display').innerText = `Lat: ${onboardingCoords.lat.toFixed(6)}`;
            document.getElementById('new-org-lng-display').innerText = `Lng: ${onboardingCoords.lng.toFixed(6)}`;
        });
    }, 200);
}

function autofillNewOrganizationGps() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            onboardingCoords = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            onboardingMarker.setLatLng([onboardingCoords.lat, onboardingCoords.lng]);
            onboardingMap.setView([onboardingCoords.lat, onboardingCoords.lng], 16);
            document.getElementById('new-org-lat-display').innerText = `Lat: ${onboardingCoords.lat.toFixed(6)}`;
            document.getElementById('new-org-lng-display').innerText = `Lng: ${onboardingCoords.lng.toFixed(6)}`;
        }, null, { enableHighAccuracy: true });
    }
}

async function createNewOrganization(event) {
    event.preventDefault();
    const name = document.getElementById('new-org-name').value;
    const address = document.getElementById('new-org-address').value;

    if (!name || !address || !onboardingCoords) {
        return showAlert('Missing Info', 'Please enter your organization name, address, and confirm your location on the map.', 'warning');
    }

    const payload = {
        name,
        email: tempOrgData.email,
        phone: tempOrgData.phone,
        password: tempOrgData.password,
        role: 'org',
        category: tempOrgData.category,
        address: address,
        lat: onboardingCoords.lat,
        lng: onboardingCoords.lng
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
            updateGlobalStats();
        } else {
            showAlert('Registration Failed', data.message, 'error');
        }
    } catch (err) {
        showAlert('Connection Error', 'Registration requires an active internet connection.', 'error');
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    let role = document.getElementById('login-role').value;

    if (role === 'organization') role = 'org';

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });
        const data = await response.json();
        if (response.ok) {
            currentUser = data.user;
            if (data.token) localStorage.setItem('auth_token', data.token);
            localStorage.setItem('cached_user', JSON.stringify(currentUser));
            showSection(role === 'user' ? 'user-dashboard' : 'org-dashboard');
            updateGlobalStats();
        } else {
            showAlert('Login Failed', data.message, 'error');
        }
    } catch (err) {
        const cachedUser = JSON.parse(localStorage.getItem('cached_user'));
        if (cachedUser && cachedUser.email === email && cachedUser.role === role) {
            currentUser = cachedUser;
            showAlert('Offline Access', 'Accessing your dashboard using cached credentials.', 'info');
            showSection(role === 'user' ? 'user-dashboard' : 'org-dashboard');
        } else {
            showAlert('Connection Required', 'An internet connection is required for first-time login.', 'warning');
        }
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('cached_user');
    localStorage.removeItem('auth_token');
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
            const statusEl = document.getElementById('location-status');
            if (statusEl) statusEl.innerText = 'Location access denied.';
        }, { enableHighAccuracy: true });
    }
}

async function updateMap() {
    if (!userLocation) return;
    map.eachLayer(layer => { if (layer instanceof L.Marker && layer !== userMarker) map.removeLayer(layer); });
    registeredOrgMarkers = [];

    const radius = document.getElementById('radius-select').value;
    const lat = userLocation.lat;
    const lng = userLocation.lng;

    const categories = [
        { id: 'check-hospital', type: 'Hospital', query: `nwr["amenity"="hospital"](around:${radius},${lat},${lng});`, color: '#dc2626', icon: 'fa-hospital' },
        { id: 'check-police', type: 'Police', query: `(nwr["amenity"="police"](around:${radius},${lat},${lng}); nwr["name"~"Police",i](around:${radius},${lat},${lng}););`, color: '#1e40af', icon: 'fa-shield-alt' },
        { id: 'check-trauma', type: 'Trauma Center', query: `(nwr["emergency"="trauma"](around:${radius},${lat},${lng}); nwr["healthcare"="trauma"](around:${radius},${lat},${lng}); nwr["name"~"Trauma",i](around:${radius},${lat},${lng}););`, color: '#c026d3', icon: 'fa-procedures' },
        { id: 'check-clinic', type: 'Clinic', query: `(nwr["amenity"="clinic"](around:${radius},${lat},${lng}); nwr["healthcare"="clinic"](around:${radius},${lat},${lng}); nwr["name"~"Clinic",i](around:${radius},${lat},${lng}););`, color: '#059669', icon: 'fa-clinic-medical' },
        { id: 'check-ambulance', type: 'Ambulance Service', query: `(nwr["amenity"="ambulance"](around:${radius},${lat},${lng}); nwr["name"~"Ambulance",i](around:${radius},${lat},${lng}););`, color: '#0284c7', icon: 'fa-ambulance' },
        { id: 'check-mechanics', type: 'Mechanic', query: `(nwr["shop"="car_repair"](around:${radius},${lat},${lng}); nwr["shop"="tyres"](around:${radius},${lat},${lng}); nwr["amenity"="car_repair"](around:${radius},${lat},${lng}); nwr["name"~"Mechanic|Towing|Tow|Breakdown|Roadside",i](around:${radius},${lat},${lng}););`, color: '#d97706', icon: 'fa-tools' },
        { id: 'check-puncture', type: 'Puncture Shop', query: `(nwr["shop"="tyres"](around:${radius},${lat},${lng}); nwr["name"~"Puncture|Tyre|Tube",i](around:${radius},${lat},${lng}););`, color: '#f97316', icon: 'fa-circle-notch' },
        { id: 'check-showroom', type: 'Showroom', query: `(nwr["shop"="car_dealer"](around:${radius},${lat},${lng}); nwr["name"~"Showroom|Dealer",i](around:${radius},${lat},${lng}););`, color: '#0ea5e9', icon: 'fa-store' }
    ];

    let totalContacts = 0;
    totalContacts += await fetchRegisteredOrganizations(categories, radius, lat, lng);
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

async function fetchRegisteredOrganizations(categories, radius, lat, lng) {
    const showOrgs = document.getElementById('check-orgs')?.checked;
    if (!showOrgs) return 0;

    try {
        const response = await fetch(`${API_BASE}/organizations`);
        if (response.ok) {
            registeredOrgCache = await response.json();
            localStorage.setItem(CACHE_ORGS_KEY, JSON.stringify(registeredOrgCache));
        }
    } catch (e) {
        console.warn('Using cached registered organizations');
    }

    let count = 0;
    registeredOrgCache.forEach(org => {
        if (!org.lat || !org.lng) return;
        const meta = getOrgCategoryMeta(org.category);
        const distance = getDistanceMeters(lat, lng, org.lat, org.lng);
        if (distance > Number(radius)) return;

        renderRegisteredOrgMarker(org, meta, distance);
        count += 1;
    });
    return count;
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
    const toRad = value => value * Math.PI / 180;
    const earthRadius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function setSupportResource(type) {
    const filters = ['check-hospital', 'check-police', 'check-trauma', 'check-clinic', 'check-ambulance', 'check-mechanics', 'check-puncture', 'check-showroom', 'check-orgs'];
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });

    // Update active button styling
    const allBtns = ['hospital','police','trauma','clinic','ambulance','mechanics','puncture','showroom','orgs'];
    allBtns.forEach(t => {
        const btn = document.getElementById(`btn-${t}`);
        if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`btn-${type}`);
    if (activeBtn) activeBtn.classList.add('active');

    const typeToCheckbox = {
        hospital:   'check-hospital',
        police:     'check-police',
        trauma:     'check-trauma',
        clinic:     'check-clinic',
        ambulance:  'check-ambulance',
        mechanics:  'check-mechanics',
        puncture:   'check-puncture',
        showroom:   'check-showroom',
        orgs:       'check-orgs'
    };

    const typeToLabel = {
        hospital:   'Hospitals',
        police:     'Police Stations',
        trauma:     'Trauma Centers',
        clinic:     'Clinics',
        ambulance:  'Ambulance Services',
        mechanics:  'Mechanics',
        puncture:   'Puncture Shops',
        showroom:   'Showrooms',
        orgs:       'Verified Organisations'
    };

    const checkboxId = typeToCheckbox[type];
    if (checkboxId) {
        const el = document.getElementById(checkboxId);
        if (el) el.checked = true;
    }

    const label = typeToLabel[type] || type;
    const statusEl = document.getElementById('support-resource-status');
    if (statusEl) statusEl.innerText = `Showing nearby ${label} only. This search is separate from SOS broadcasts.`;

    updateMap();
}

function attachMapFilterListeners() {
    const ids = ['radius-select', 'check-hospital', 'check-police', 'check-trauma', 'check-clinic', 'check-ambulance', 'check-mechanics', 'check-puncture', 'check-showroom', 'check-orgs'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateMap);
    });
}

function renderRegisteredOrgMarker(org, meta, distance) {
    const markerIcon = L.divIcon({
        className: 'custom-marker registered-org-marker',
        html: `<div style="background-color:${meta.color}; color:white; width:36px; height:36px; border-radius:12px; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 4px 10px rgba(0,0,0,0.35)"><i class="fas ${meta.icon} text-sm"></i></div>`,
        iconSize: [36, 36]
    });

    const phone = org.phone || 'No contact number available';
    const marker = L.marker([org.lat, org.lng], { icon: markerIcon }).addTo(map)
        .bindPopup(`
            <b>${org.name}</b><br>
            <span class="text-xs font-bold text-slate-500 uppercase">${meta.label}</span><br>
            <span>${org.address || 'Address not available'}</span><br>
            <span>${(distance / 1000).toFixed(1)} km away</span><br>
            <a href="tel:${phone}" class="text-blue-600 font-bold underline">${phone}</a>
        `);
    registeredOrgMarkers.push(marker);
}

async function fetchResources(cat) {
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent('[out:json][timeout:25];(' + cat.query + ');out center;')}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        resourceCache[cat.type] = data.elements;
        resourceCache[`${cat.type}_fetchedAt`] = Date.now();
        localStorage.setItem(CACHE_RESOURCES_KEY, JSON.stringify(resourceCache));
        data.elements.forEach(el => renderMarker(el, cat));
        const statusEl = document.getElementById('support-resource-status');
        if (statusEl) statusEl.innerText = `Showing nearby ${cat.type}. Found ${data.elements.length} contacts.`;
        return data.elements.length;
    } catch (e) {
        const cached = resourceCache[cat.type] || [];
        cached.forEach(el => renderMarker(el, cat));
        const statusEl = document.getElementById('support-resource-status');
        if (statusEl) statusEl.innerText = `Showing cached ${cat.type}. ${cached.length} contacts available.`;
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
function triggerSOS() {
    if (!userLocation || !currentUser) return showAlert('Missing Info', 'Location access and active login are required to trigger a full SOS alert.', 'warning');

    showConfirm('Police SOS?', 'Do you want to also raise a Police SOS? This will notify nearby police stations in addition to your emergency broadcast.',
        () => { // User clicked OK
            sendSOSWithPolice(true);
        },
        () => { // User clicked Cancel
            sendSOSWithPolice(false);
        }
    );

    function sendSOSWithPolice(policeRequested) {
        const alertData = {
            id: Date.now(), userEmail: currentUser.email, userName: currentUser.name, userPhone: currentUser.phone,
            lat: userLocation.lat, lng: userLocation.lng,
            time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(),
            type: 'login',
            policeSOS: policeRequested,
            currentRadius: 0,
            notifiedOrgCount: 0
        };
        handleSOSSend(alertData);
    }
}

function triggerEmergencySOS() {
    if (!navigator.geolocation) return showAlert('Error', 'Geolocation is not supported by your browser.', 'error');

    showConfirm('Police SOS?', 'Do you want to also raise a Police SOS? This will notify nearby police stations in addition to your emergency broadcast.',
        () => { // User clicked OK
            sendEmergencyWithPolice(true);
        },
        () => { // User clicked Cancel
            sendEmergencyWithPolice(false);
        }
    );

    function sendEmergencyWithPolice(policeRequested) {
        showAlert('Broadcasting...', 'Fetching your precise location for emergency services...', 'info');

        navigator.geolocation.getCurrentPosition(position => {
            const alertData = {
                id: Date.now(), userEmail: currentUser?.email, userName: 'Emergency User', userPhone: 'N/A',
                lat: position.coords.latitude, lng: position.coords.longitude,
                time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(),
                type: 'emergency',
                policeSOS: policeRequested,
                currentRadius: 0,
                notifiedOrgCount: 0
            };
            handleSOSSend(alertData);
        }, () => {
            showAlert('Location Denied', 'Please enable location access to use Emergency SOS.', 'error');
        }, { enableHighAccuracy: true });
    }
}

function handleSOSSend(alertData) {
    if (navigator.onLine) {
        createAndSendSOS(alertData);
    } else {
        sosQueue.push(alertData);
        localStorage.setItem(SOS_QUEUE_KEY, JSON.stringify(sosQueue));
        showAlert('Network Issue', 'No network detected. Your SOS has been queued and will be sent automatically when connectivity is restored.', 'info');
    }
}

async function createAndSendSOS(data) {
    try {
        const response = await fetch(`${API_BASE}/sos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'SOS send failed');

        activeSOS = result.alert;
        showAlert('SOS Broadcasted', 'Your alert has been sent to responding organizations. Radius escalation will begin as needed.', 'success');
        updateGlobalStats();
        showSosStatusPanel();
        startSosSequence();
        startActiveSOSPolling();

        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('RoadSafetySoS', { body: 'SOS Broadcasted Successfully!', icon: '/logo.png' });
        }
    } catch (e) {
        if (!sosQueue.find(q => q.id === data.id)) {
            sosQueue.push(data);
            localStorage.setItem(SOS_QUEUE_KEY, JSON.stringify(sosQueue));
        }
        showAlert('SOS Queued', 'Unable to send the SOS right now. It will retry when the network returns.', 'warning');
    }
}

async function refreshRegisteredOrgCache() {
    try {
        const response = await fetch(`${API_BASE}/organizations`);
        if (response.ok) {
            registeredOrgCache = await response.json();
            localStorage.setItem(CACHE_ORGS_KEY, JSON.stringify(registeredOrgCache));
        }
    } catch (e) {
        console.warn('Failed to refresh org cache.', e);
    }
}

function getNotifiedOrgCount(radius) {
    if (!registeredOrgCache || registeredOrgCache.length === 0) return 0;
    return registeredOrgCache.reduce((count, org) => {
        if (!org.lat || !org.lng) return count;
        const distance = getDistanceMeters(activeSOS.lat, activeSOS.lng, org.lat, org.lng);
        return distance <= radius ? count + 1 : count;
    }, 0);
}

function showSosStatusPanel() {
    // Show the pulsing trigger button below the SOS btn
    document.getElementById('sos-status-trigger')?.classList.remove('hidden');
    // Auto-open the modal immediately after SOS is raised
    openSosModal();
    updateSosStatusPanel();
}

function openSosModal() {
    const modal = document.getElementById('sos-status-panel');
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('modal-active'), 10);
}

function closeSosModal() {
    const modal = document.getElementById('sos-status-panel');
    if (!modal) return;
    modal.classList.remove('modal-active');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

function cancelSOSAndClose() {
    if (!activeSOS) {
        closeSosModal();
        document.getElementById('sos-status-trigger')?.classList.add('hidden');
        return;
    }

    showConfirm(
        'Cancel SOS?',
        'This will permanently remove your active SOS broadcast. Responders will no longer see it.',
        async () => {
            const alertId = activeSOS.id;

            // Stop timers and clean up map immediately
            if (activeSOSPollingTimer) { clearTimeout(activeSOSPollingTimer); activeSOSPollingTimer = null; }
            if (sosTimer) { clearTimeout(sosTimer); sosTimer = null; }
            if (sosCircle && map) { map.removeLayer(sosCircle); sosCircle = null; }
            if (responderMarker && map) { map.removeLayer(responderMarker); responderMarker = null; }
            activeSOS = null;
            sosRadiusIndex = 0;
            sosAttendedNotified = false;

            closeSosModal();
            document.getElementById('sos-status-trigger')?.classList.add('hidden');

            // Delete from server so it disappears from history too
            try {
                const response = await apiFetch(`/alerts/${alertId}`, { method: 'DELETE' });
                if (!response.ok) {
                    const result = await response.json();
                    throw new Error(result.message || 'Delete failed');
                }
                showAlert('SOS Cancelled', 'Your SOS broadcast has been removed.', 'success', () => fetchUserHistory());
            } catch (err) {
                showAlert('SOS Stopped', 'Broadcast stopped locally. It may still appear briefly in history.', 'info', () => fetchUserHistory());
            }
        }
    );
}

function updateSosStatusPanel() {
    if (!activeSOS) return;
    document.getElementById('sos-current-status').innerText = activeSOS.status === 'attended'
        ? 'A responder organisation is on the way'
        : activeSOS.policeSOS
            ? 'Police SOS requested and broadcast is active'
            : 'SOS broadcasting — waiting for organisation response';
    document.getElementById('sos-current-radius').innerText = `${activeSOS.currentRadius || 0} meters`;
    document.getElementById('sos-notified-count').innerText = `${activeSOS.notifiedOrgCount || 0} organisations notified`;

    // Update radius progress bar (max radius = 5000m)
    const radiusPct = Math.min(((activeSOS.currentRadius || 0) / 5000) * 100, 100);
    const bar = document.getElementById('sos-radius-bar');
    if (bar) bar.style.width = radiusPct + '%';

    if (activeSOS.attendingOrg && activeSOS.attendingOrg.name) {
        document.getElementById('sos-attending-org').innerText = `${activeSOS.attendingOrg.name} (${activeSOS.attendingOrg.category || 'Responder'})`;
    } else {
        document.getElementById('sos-attending-org').innerText = activeSOS.policeSOS
            ? 'Police stations are also alerted for this SOS'
            : 'No organisation has responded yet';
    }

    if (activeSOS.responderLocation && activeSOS.responderLocation.lat) {
        document.getElementById('sos-responder-location').innerText = `${activeSOS.responderLocation.lat.toFixed(5)}, ${activeSOS.responderLocation.lng.toFixed(5)}`;
        renderResponderMarker(activeSOS.responderLocation);
    } else {
        document.getElementById('sos-responder-location').innerText = 'Not shared yet';
    }
}

function renderResponderMarker(location) {
    if (!map || !location) return;
    if (responderMarker) map.removeLayer(responderMarker);
    responderMarker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background:#2563eb;color:white;width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.35)"><i class="fas fa-map-pin text-sm"></i></div>',
            iconSize: [36, 36]
        })
    }).addTo(map).bindPopup('Responder location');
}

async function startSosSequence() {
    if (!activeSOS) return;
    sosRadiusIndex = 0;
    sosAttendedNotified = false;
    if (sosTimer) clearTimeout(sosTimer);
    await refreshRegisteredOrgCache();
    advanceSosRadius();
}

async function advanceSosRadius() {
    if (!activeSOS || activeSOS.status === 'attended') return;
    const radius = SOS_RADII[Math.min(sosRadiusIndex, SOS_RADII.length - 1)];
    activeSOS.currentRadius = radius;
    activeSOS.notifiedOrgCount = getNotifiedOrgCount(radius);
    updateSosStatusPanel();
    renderSosCircle(radius);

    try {
        await fetch(`${API_BASE}/sos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...activeSOS, currentRadius: radius, notifiedOrgCount: activeSOS.notifiedOrgCount })
        });
    } catch (e) {
        console.warn('Unable to sync SOS radius update', e);
    }

    if (activeSOS.status !== 'attended' && sosRadiusIndex < SOS_RADII.length - 1) {
        sosTimer = setTimeout(() => {
            sosRadiusIndex += 1;
            advanceSosRadius();
        }, 10000);
    }
}

function renderSosCircle(radius) {
    if (!map || !activeSOS) return;
    if (sosCircle) map.removeLayer(sosCircle);
    sosCircle = L.circle([activeSOS.lat, activeSOS.lng], {
        radius,
        color: '#2563eb',
        fillColor: '#2563eb',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '6'
    }).addTo(map);
}

function startActiveSOSPolling() {
    if (activeSOSPollingTimer) clearTimeout(activeSOSPollingTimer);
    pollActiveSOS();
}

async function pollActiveSOS() {
    if (!activeSOS) return;
    try {
        const response = await fetch(`${API_BASE}/alerts/${activeSOS.id}`);
        if (response.ok) {
            const alert = await response.json();
            const previousStatus = activeSOS.status;
            activeSOS = alert;
            updateSosStatusPanel();
            if (activeSOS.status === 'attended' && previousStatus !== 'attended' && !sosAttendedNotified) {
                sosAttendedNotified = true;
                showAlert('Responder Assigned', `${activeSOS.attendingOrg.name} is attending your SOS now.`, 'success');
                if (sosTimer) clearTimeout(sosTimer);
            }
        }
    } catch (e) {
        console.warn('Unable to poll active SOS', e);
    } finally {
        activeSOSPollingTimer = setTimeout(pollActiveSOS, SOS_POLL_INTERVAL);
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

async function fetchUserHistory() {
    if (!currentUser || currentUser.role !== 'user') return;
    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    historyList.innerHTML = '<div class="text-sm text-slate-500">Loading your SOS history...</div>';

    try {
        const response = await fetch(`${API_BASE}/alerts/user/${encodeURIComponent(currentUser.email)}?status=all`);
        if (!response.ok) throw new Error('Unable to load history');
        const history = await response.json();

        if (!history.length) {
            historyList.innerHTML = '<div class="text-sm text-slate-500">No past alerts have been attended yet.</div>';
            return;
        }

        historyList.innerHTML = history.map(alert => renderHistoryItem(alert)).join('');
    } catch (err) {
        historyList.innerHTML = `<div class="text-sm text-rose-600">Failed to load history: ${err.message}</div>`;
    }
}

function renderHistoryItem(alert) {
    const attendedBy = alert.attendingOrg?.name ? `<div class="text-sm text-slate-600">Attended by <strong>${alert.attendingOrg.name}</strong> (${alert.attendingOrg.category || 'Responder'})</div>` : '<div class="text-sm text-slate-500">No responder assigned</div>';
    const orgDetails = alert.attendingOrg?.name ? `
        <div class="text-sm text-slate-500">Phone: <a href="tel:${alert.attendingOrg.phone}" class="text-blue-600 underline">${alert.attendingOrg.phone}</a></div>
        <div class="text-sm text-slate-500">Location: ${alert.attendingOrg.lat?.toFixed(4) || '-'}, ${alert.attendingOrg.lng?.toFixed(4) || '-'}</div>
    ` : '';
    const statusLabel = alert.status === 'resolved'
        ? '<span class="text-emerald-700">Resolved</span>'
        : alert.status === 'attended'
            ? '<span class="text-amber-700">Attended</span>'
            : '<span class="text-slate-400">Pending</span>';
    const resolvedAt = alert.resolvedAt ? `<div class="text-xs text-slate-400">Resolved at ${new Date(alert.resolvedAt).toLocaleString()}</div>` : '';

    return `
        <div class="p-4 bg-slate-50 rounded-3xl border border-slate-200 shadow-sm">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <div class="font-bold text-slate-900">${alert.type === 'emergency' ? 'Emergency SOS' : 'SOS Alert'}</div>
                    <div class="text-xs uppercase tracking-widest text-slate-500">${alert.date} • ${alert.time}</div>
                </div>
                <div class="text-xs font-bold uppercase tracking-wide">${statusLabel}</div>
            </div>
            <div class="mt-3 text-sm text-slate-700">Location: ${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)}</div>
            ${attendedBy}
            ${orgDetails}
            ${resolvedAt}
        </div>
    `;
}

async function resolveSOS(alertId) {
    try {
        const body = currentUser && currentUser.role === 'org' ? { orgId: currentUser.email } : {};
        const response = await apiFetch(`/alerts/${alertId}/resolve`, { method: 'POST', body: JSON.stringify({}) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Unable to resolve alert');

        showAlert('SOS Resolved', 'This alert has been marked resolved and removed from the active feed.', 'success');
        refreshOrgDashboard();
    } catch (err) {
        console.error('Resolve SOS failed:', err);
        showAlert('Resolve Failed', err.message || 'Unable to resolve this alert right now.', 'error');
    }
}

async function unattendSOS(alertId) {
    try {
        const body = currentUser && currentUser.role === 'org' ? { orgId: currentUser.email } : {};
        const response = await apiFetch(`/alerts/${alertId}/unattend`, { method: 'POST', body: JSON.stringify({}) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Unable to unattend alert');

        showAlert('Unattended', 'This alert is now available for other organizations to attend.', 'success');
        refreshOrgDashboard();
    } catch (err) {
        console.error('Unattend SOS failed:', err);
        showAlert('Unattend Failed', err.message || 'Unable to unattend this alert right now.', 'error');
    }
}

// --- Org Dashboard ---
async function attendSOS(alertId) {
    const alert = orgAlerts[alertId];
    if (!alert) return showAlert('SOS Missing', 'This alert is no longer available. Refresh the feed.', 'error');
    selectedSOS = alert;
    currentResponderLocation = null;

    if (selectedSOSMarker) {
        orgMap.removeLayer(selectedSOSMarker);
        selectedSOSMarker = null;
    }
    if (responderMarker) {
        orgMap.removeLayer(responderMarker);
        responderMarker = null;
    }

    selectedSOSMarker = L.marker([alert.lat, alert.lng], {
        icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background:#ef4444;color:white;width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.35)"><i class="fas fa-exclamation-triangle text-sm"></i></div>',
            iconSize: [36, 36]
        })
    }).addTo(orgMap).bindPopup(`<b>${alert.userName}</b><br>${alert.type} SOS`).openPopup();

    if (!currentUser) return showAlert('User Missing', 'Please login to attend SOS alerts.', 'error');

    try {
        const body = { lat: currentUser.lat || 0, lng: currentUser.lng || 0 };
        const response = await apiFetch(`/alerts/${alert.id}/attend`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Unable to attend SOS');

        selectedSOS = result.alert;
        orgAlerts[alertId] = selectedSOS;
        showAlert('SOS Attended', 'You are now assigned to this alert. Share your exact location to update the user.', 'success');
        updateSOSDetailPanel();
    } catch (e) {
        showAlert('Attend Failed', e.message || 'Unable to attend the SOS right now.', 'error');
    }
}

function shareResponderLocation() {
    if (!selectedSOS) {
        return showAlert('No SOS Selected', 'Tap Attend on an SOS alert first.', 'warning');
    }
    if (!navigator.geolocation) {
        return showAlert('Geolocation Unsupported', 'Your browser does not support location sharing.', 'error');
    }

    showAlert('Sharing Location', 'Sharing your current responder location with the feed.', 'info');
    navigator.geolocation.getCurrentPosition(async position => {
        currentResponderLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        if (responderMarker) {
            orgMap.removeLayer(responderMarker);
        }

        responderMarker = L.marker([currentResponderLocation.lat, currentResponderLocation.lng], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: '<div style="background:#2563eb;color:white;width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.35)"><i class="fas fa-map-pin text-sm"></i></div>',
                iconSize: [36, 36]
            })
        }).addTo(orgMap).bindPopup('Your responder location').openPopup();

        if (selectedSOSMarker) {
            const bounds = L.latLngBounds([
                [selectedSOS.lat, selectedSOS.lng],
                [currentResponderLocation.lat, currentResponderLocation.lng]
            ]);
            orgMap.fitBounds(bounds.pad(0.3));
        }

        try {
            const response = await apiFetch(`/alerts/${selectedSOS.id}/location`, {
                method: 'POST',
                body: JSON.stringify(currentResponderLocation)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Location share failed');
            selectedSOS = result.alert;
            updateSOSDetailPanel();
            showAlert('Location Shared', 'Your responder location has been shared with the requester.', 'success');
        } catch (e) {
            showAlert('Share Failed', e.message || 'Unable to update responder location right now.', 'error');
        }
    }, () => {
        showAlert('Location Denied', 'Please enable location access in your browser settings.', 'error');
    }, { enableHighAccuracy: true });
}

function updateSOSDetailPanel() {
    const panel = document.getElementById('sos-detail-panel');
    if (!selectedSOS) {
        panel?.classList.add('hidden');
        return;
    }

    panel?.classList.remove('hidden');
    document.getElementById('sos-detail-title').innerText = selectedSOS.type === 'emergency' ? 'Emergency Response Interface' : 'Login SOS Response Interface';
    document.getElementById('sos-detail-location').innerText = `${selectedSOS.lat.toFixed(5)}, ${selectedSOS.lng.toFixed(5)}`;
    document.getElementById('sos-detail-distance').innerText = selectedSOS.type === 'emergency' ? 'Priority response required' : 'Standard response';

    const directionsLink = document.getElementById('sos-detail-directions');
    const responderLocation = currentResponderLocation || selectedSOS.responderLocation;
    const originParam = responderLocation ? `&origin=${responderLocation.lat},${responderLocation.lng}` : '';
    directionsLink.href = `https://www.google.com/maps/dir/?api=1${originParam}&destination=${selectedSOS.lat},${selectedSOS.lng}`;

    document.getElementById('responder-location').innerText = responderLocation
        ? `${responderLocation.lat.toFixed(5)}, ${responderLocation.lng.toFixed(5)}`
        : 'Not shared yet';

    const notes = document.getElementById('sos-detail-notes');
    if (notes) notes.innerText = selectedSOS.type === 'emergency' ? 'Emergency responders: prioritize and follow safety protocol.' : 'Login SOS allows you to coordinate with the requester and reach them safely.';
}

function initOrgMap() {
    if (orgMap) return;
    orgMap = L.map('org-map').setView([26.8467, 80.9462], 12);
    L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png').addTo(orgMap);
}

function renderOrgLocationMarker() {
    if (!orgMap || !currentUser || currentUser.role !== 'org') return;
    if (!currentUser.lat || !currentUser.lng) return;

    if (orgLocationMarker) {
        orgMap.removeLayer(orgLocationMarker);
    }

    const orgIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:#1d4ed8;color:white;width:40px;height:40px;border-radius:14px;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.25)"><i class="fas fa-building text-sm"></i></div>`,
        iconSize: [40, 40]
    });

    orgLocationMarker = L.marker([currentUser.lat, currentUser.lng], { icon: orgIcon })
        .addTo(orgMap)
        .bindPopup(`<strong>${currentUser.name}</strong><br>${currentUser.category || 'Organization'}<br>${currentUser.address || 'Registered location'}`)
        .openPopup();

    orgMap.setView([currentUser.lat, currentUser.lng], 13);
}

let lastAlertCount = 0;
async function refreshOrgDashboard() {
    try {
        const orgQuery = currentUser?.role === 'org' && currentUser.email
            ? `?orgEmail=${encodeURIComponent(currentUser.email)}`
            : '';
        const response = await fetch(`${API_BASE}/alerts${orgQuery}`);
        if (!response.ok) return;
        const alerts = await response.json();

        const list = document.getElementById('sos-list');
        const count = document.getElementById('active-alert-count');
        if (list) list.innerHTML = '';
        if (count) count.innerText = `${alerts.length} ACTIVE SOS`;

        if (alerts.length > lastAlertCount) {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('New SOS Alert!', { body: `A new ${alerts[0].type} SOS has been reported.`, icon: '/logo.png' });
            }
        }
        lastAlertCount = alerts.length;

        orgMarkers.forEach(m => orgMap.removeLayer(m));
        orgMarkers = [];

        alerts.forEach(alert => {
            const isLogin = alert.type === 'login';
            const div = document.createElement('div');
            div.className = `p-5 bg-white border ${isLogin ? 'border-blue-100' : 'border-red-100'} shadow-sm rounded-2xl hover:border-blue-300 transition-all mb-2`;

            orgAlerts[alert.id] = alert;
            let actionButtons = `
                <div class="flex flex-col sm:flex-row flex-wrap gap-2 mt-4">
            `;

            if (alert.status === 'pending') {
                actionButtons += `
                    <button onclick="attendSOS(${alert.id})" class="flex-1 min-w-[120px] bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all">
                        <i class="fas fa-handshake mr-1"></i> Attend
                    </button>
                `;
            }

            actionButtons += `
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${alert.lat},${alert.lng}" target="_blank" class="flex-1 min-w-[120px] inline-flex items-center justify-center bg-slate-900 text-white py-2 rounded-xl text-xs font-bold hover:bg-black transition-all">
                        <i class="fas fa-route mr-1"></i> Directions
                    </a>
            `;

            if (isLogin && alert.userPhone !== 'N/A') {
                actionButtons += `
                    <a href="tel:${alert.userPhone}" class="flex-1 min-w-[120px] inline-flex items-center justify-center bg-blue-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-all">
                        <i class="fas fa-phone-alt mr-2"></i> Call
                    </a>
                `;
            }

            if (alert.status === 'attended' && alert.attendingOrg && alert.attendingOrg.orgId === currentUser?.email) {
                actionButtons += `
                    <button onclick="unattendSOS(${alert.id})" class="flex-1 min-w-[120px] inline-flex items-center justify-center bg-slate-500 text-white py-2 rounded-xl text-xs font-bold hover:bg-slate-600 transition-all">
                        <i class="fas fa-times-circle mr-2"></i> Unattend
                    </button>
                    <button onclick="resolveSOS(${alert.id})" class="flex-1 min-w-[120px] inline-flex items-center justify-center bg-amber-500 text-white py-2 rounded-xl text-xs font-bold hover:bg-amber-600 transition-all">
                        <i class="fas fa-check-circle mr-2"></i> Resolve
                    </button>
                `;
            }

            actionButtons += `</div>`;

            div.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="font-bold text-slate-800">${alert.userName}</div>
                        <div class="text-[10px] font-bold text-blue-600 uppercase tracking-widest">${alert.type} SOS</div>
                    </div>
                    <div class="text-[10px] text-slate-400 font-bold text-right">${alert.time}<br>${alert.date}</div>
                </div>
                <div class="text-[10px] text-slate-500 font-medium">Coords: ${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}</div>
                ${actionButtons}
            `;

            div.onclick = (e) => {
                if (e.target.tagName !== 'A' && e.target.parentElement.tagName !== 'A') {
                    orgMap.setView([alert.lat, alert.lng], 16);
                }
            };
            list.appendChild(div);

            const marker = L.marker([alert.lat, alert.lng]).addTo(orgMap).bindPopup(`<b>${alert.userName}</b><br>${alert.type} SOS`);
            orgMarkers.push(marker);
        });
    } catch (e) { console.warn("Failed to sync Org dashboard (Offline)"); }
}

// Detect existing session & Init
window.onload = () => {
    const loader = document.getElementById('loading-screen');
    const content = document.getElementById('main-content');

    // Hide loading screen immediately after DOM setup
    const hideLoader = () => {
        if (loader) {
            loader.style.opacity = '0';
            loader.style.visibility = 'hidden';
        }
    };

    updateGlobalStats();

    if ('Notification' in window) {
        Notification.requestPermission();
    }

    const cachedUser = JSON.parse(localStorage.getItem('cached_user'));
    if (cachedUser) {
        currentUser = cachedUser;
        showSection(currentUser.role === 'user' ? 'user-dashboard' : 'org-dashboard');
    } else {
        content.classList.remove('blur-out');
        document.getElementById('home-section').classList.remove('hidden');
    }

    updateOnlineStatus();
    attachMapFilterListeners();

    // Auto-hide loader after a tiny delay for smooth feel
    setTimeout(hideLoader, 150);
};