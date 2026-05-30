# RoadSafetySoS

RoadSafetySoS is a real-time emergency response web application designed to help users quickly identify and contact nearby emergency services during road accidents. The platform reduces response time during the critical "golden hour" by providing fast access to emergency services and a robust SOS system that works even in low-connectivity areas.

---

## Live Demo

- **Frontend**: [https://roadsafetysos.vercel.app/](https://roadsafetysos.vercel.app/)
- **Backend API**: [https://road-safety-sos-27p4.onrender.com](https://road-safety-sos-27p4.onrender.com)

---

## Features

### Emergency Services Discovery
- **Live GPS Tracking**: Automatically detects user's current location.
- **Interactive Maps**: Powered by Leaflet.js and OpenStreetMap.
- **Categorized Search**: Find nearby Hospitals, Police Stations, Trauma Centers, and Repair/Towing services within a customizable radius (1km to 10km).
- **Live Data**: Fetches real-time service information using the Overpass API.

### Core Functionalities
- **Secure Registration**: Includes **Email Verification** system via Gmail to ensure authentic users.
- **One-Tap SOS**: Instantly broadcast your location to emergency responders.
- **Dual-Role Dashboard**: 
  - **Individual Users**: Access safety tools and trigger SOS.
  - **Organizations**: Monitor active distress signals in real-time.
- **Offline Reliability**: 
  - **PWA Support**: App works offline via Service Workers.
  - **SOS Queuing**: SOS alerts are queued locally if the network is lost and automatically synced when back online.
  - **Resource Caching**: Previously searched emergency contacts are available even without internet.

---

## Tech Stack

### Frontend
- **Vanilla JavaScript (ES6+)**
- **Tailwind CSS** (UI Styling via CDN)
- **Leaflet.js** (Map Integration)
- **Font Awesome** (Icons)

### Backend
- **Node.js & Express.js**
- **MongoDB Atlas** (Cloud Database for persistent storage)
- **Nodemailer** (Email Verification System)

### Maps & Location
- **OpenStreetMap** (Map Tiles)
- **Overpass API** (Emergency Resource Discovery)
- **Browser Geolocation API**

---

## Project Structure

```plaintext
RoadSafetySoS/
├── index.html        # Main entry point (Frontend UI)
├── script.js         # Frontend logic, Map handling, SOS & Sync
├── server.js         # Express backend & API endpoints (MongoDB & Nodemailer)
├── sw.js             # Service Worker for offline PWA support
├── package.json      # Node.js dependencies and scripts
├── .gitignore        # Git ignore rules (node_modules, etc.)
└── README.md         # Project documentation
```

---

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/RoadSafetySoS.git
   cd RoadSafetySoS
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Environment Configuration**:
   The application uses MongoDB Atlas and Gmail for notifications. Ensure your `server.js` is configured with:
   - `MONGO_URI`
   - `SUPPORT_EMAIL`
   - `APP_PASSWORD`

4. **Run the Application**:
   ```bash
   npm run dev
   ```
   The server will start at `http://localhost:3000`.

---

## API Endpoints

### Statistics
- `GET /api/stats` - Returns counts of verified users, organizations, and resolved alerts.

### Authentication
- `POST /api/register` - Register a new User or Organization (triggers verification email).
- `GET /api/verify/:token` - Verify email address.
- `POST /api/login` - Authenticate verified users.

### Emergency Alerts
- `POST /api/sos` - Trigger a new SOS alert with location data.
- `GET /api/alerts` - Fetch all active SOS alerts (used by the Organization dashboard).

---

## Team Members

| Member | Responsibility |
|----------|--------------|
| Vinayak | Team Lead, UI/UX Design & Architecture |
| Dhruv | Maps Integration & Geolocation Services |
| Krishan | Backend API Development & Data Persistence |
| Sarthak | SOS Workflow & Offline Synchronization Logic |
| Om | Testing, Documentation & Feature Innovation |

---

## Future Scope
- **Secure Auth**: Implementation of JWT and Bcrypt hashing.
- **Real-time Notifications**: WebSockets (Socket.io) for instant SOS alerts.
- **Accident Detection**: Integration with mobile accelerometers.
- **Voice SOS**: Voice-controlled emergency triggers.

---

## Contributors
- Vinayak
- Dhruv
- Krishan
- Sarthak
- Om

---

## License
This project is developed for educational and hackathon purposes.
