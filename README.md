# ROADSOS

ROADSOS is a location-based emergency response web application designed to help users quickly identify and contact nearby emergency services during road accidents. The platform reduces response time during the critical "golden hour" by providing fast access to emergency services and assistance.

---

## Problem Statement

During road accidents, victims and bystanders often face difficulty locating nearby emergency facilities and contacting the right services quickly. Delays in receiving timely assistance can significantly affect outcomes.

ROADSOS solves this problem by integrating emergency resources into a single platform that enables quick action and coordination.

---

## Features

### Emergency Services

- Nearby Hospitals and Trauma Centers
- Nearby Ambulance Services
- Nearby Police Stations
- Vehicle Rescue and Towing Services
- Nearby Puncture Shops and Service Centers

### Core Functionalities

- Live GPS Location Detection
- Interactive Map Integration
- One-Tap SOS Button
- Emergency Contact Management
- Direct Calling Functionality
- Route Navigation
- Real-Time Nearby Service Discovery
- Responsive User Interface

### Additional Features

- Offline Emergency Contact Access
- Cached Service Data
- Live Location Sharing
- Voice SOS Support (Future Scope)
- Accident Detection (Future Scope)

---

## Tech Stack

### Frontend

- React
- Tailwind CSS
- React Router
- Axios

### Backend

- Node.js
- Express.js

### Database

- Firebase Firestore

### Authentication

- Firebase Authentication

### Maps and Location Services

- Google Maps API
- Google Places API
- Browser Geolocation API

### Deployment

Frontend:
- Vercel

Backend:
- Render

---

## Project Structure

```plaintext
Road-Safety-SOS/
│
├── client/
│   │
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── assets/
│   │   ├── App.jsx
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── package-lock.json
│
├── server/
│   │
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── config/
│   ├── services/
│   ├── server.js
│   │
│   ├── package.json
│   └── package-lock.json
│
├── docs/
│
├── README.md
├── .gitignore
└── package.json
```

---

## Installation

Clone the repository:

```bash
git clone https://github.com/your-username/Road-Safety-SOS.git
```

Move into the project directory:

```bash
cd Road-Safety-SOS
```

---

## Install Frontend Dependencies

```bash
cd client
npm install
```

---

## Install Backend Dependencies

```bash
cd ../server
npm install
```

---

## Environment Variables

Create a `.env` file inside the `server` folder:

```env
PORT=5000

FIREBASE_API_KEY=your_key
FIREBASE_PROJECT_ID=your_project_id

GOOGLE_MAPS_API_KEY=your_key
```

---

## Run the Project

Start backend server:

```bash
cd server
npm run dev
```

Start frontend:

```bash
cd client
npm run dev
```

---

## API Endpoints

### Get Nearby Services

```http
GET /api/services/nearby
```

Example:

```http
/api/services/nearby?lat=28.6139&lng=77.2090&type=hospital
```

---

### Trigger SOS

```http
POST /api/sos
```

Request body:

```json
{
  "userId": "123",
  "location": {
    "lat": 28.6139,
    "lng": 77.2090
  }
}
```

---

### Save Emergency Contacts

```http
POST /api/user/emergency-contacts
```

---

## Team Members

| Member | Responsibility |
|----------|--------------|
| Vinayak | Team Lead, Frontend Architecture, UI Integration |
| Dhruv | Maps Integration, Location Services |
| Krish | Backend APIs, Database, Authentication |
| Sarthak | SOS Workflow, Offline Functionality |
| Om | Testing, Documentation, Innovation Features |

---

## Future Scope

- AI-based Emergency Assistance
- Real-Time Ambulance Tracking
- Voice-Controlled SOS
- Hospital Bed Availability
- Accident Detection System
- Cross-Country Emergency Integration

---

## Evaluation Criteria Covered

- Reliability and Data Accuracy
- Number of Contacts Fetched
- Offline Functionality
- Innovation and Additional Features
- Information Integration Across Countries

---

## Contributors

- Vinayak
- Dhruv
- Krish
- Sarthak
- Om

---

## License

This project is developed for educational and hackathon purposes.
