const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Initialize Database
async function initDB() {
    if (!await fs.pathExists(DB_FILE)) {
        await fs.writeJson(DB_FILE, { users: [], alerts: [] });
    }
}

// Routes
app.get('/api/stats', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const userCount = db.users.filter(u => u.role === 'user').length;
        const orgCount = db.users.filter(u => u.role === 'org').length;
        const alertCount = db.alerts.length;
        res.json({
            userCount,
            orgCount,
            alertCount
        });
    } catch (err) {
        res.status(500).json({ message: 'Error reading stats' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;
        const db = await fs.readJson(DB_FILE);

        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const newUser = { id: Date.now(), name, email, phone, password, role };
        db.users.push(newUser);
        await fs.writeJson(DB_FILE, db);
        res.json({ message: 'Registration successful' });
    } catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const db = await fs.readJson(DB_FILE);

        const user = db.users.find(u => u.email === email && u.password === password && u.role === role);

        if (user) {
            const { password, ...userWithoutPassword } = user;
            res.json({ user: userWithoutPassword });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/sos', async (req, res) => {
    try {
        const alert = req.body;
        const db = await fs.readJson(DB_FILE);
        // Deduplication for offline sync
        if (!db.alerts.some(a => a.id === alert.id)) {
            db.alerts.unshift(alert);
            await fs.writeJson(DB_FILE, db);
        }
        res.json({ message: 'SOS triggered' });
    } catch (err) {
        res.status(500).json({ message: 'Error triggering SOS' });
    }
});

app.get('/api/alerts', async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        res.json(db.alerts);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching alerts' });
    }
});

// Start Server
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
});
