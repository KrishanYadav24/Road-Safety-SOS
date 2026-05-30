require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { Resend } = require('resend');

const app = express();
app.set('trust proxy', true);
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_RETRIES = process.env.PORT ? 0 : 10;

/**
 * DATABASE CONNECTION
 */
const MONGO_URI = process.env.MONGO_URI || "mongodb://vinayak:RoadSoS%40123@ac-eduuyaf-shard-00-00.jbo7s55.mongodb.net:27017,ac-eduuyaf-shard-00-01.jbo7s55.mongodb.net:27017,ac-eduuyaf-shard-00-02.jbo7s55.mongodb.net:27017/roadsos?ssl=true&replicaSet=atlas-12xo44-shard-0&authSource=admin&retryWrites=true&w=majority";
const MONGO_OPTIONS = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    retryWrites: true,
    maxPoolSize: 10,
    minPoolSize: 1
};

async function connectMongoDB(attempt = 1) {
    try {
        await mongoose.connect(MONGO_URI, MONGO_OPTIONS);
        console.log('✅ Connected to MongoDB Atlas');
    } catch (err) {
        console.error(`❌ MongoDB connection error (attempt ${attempt}):`, err.message);
        const maxAttempts = 5;
        if (attempt < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
            console.log(`🔁 Retrying MongoDB connection in ${Math.ceil(delay / 1000)}s...`);
            setTimeout(() => connectMongoDB(attempt + 1), delay);
        } else {
            console.error('⚠️ MongoDB could not be reached after multiple attempts. The app will keep running, but database-backed routes may fail until the connection recovers.');
        }
    }
}

async function removeLegacyPhoneUniqueIndex() {
    try {
        const collection = mongoose.connection.db.collection('users');
        const indexes = await collection.indexes();
        const phoneIndex = indexes.find(index => index.key && index.key.phone === 1);

        if (phoneIndex && phoneIndex.unique) {
            await collection.dropIndex(phoneIndex.name);
            console.log(`🧹 Dropped legacy unique phone index: ${phoneIndex.name}`);
        }
    } catch (error) {
        console.error('⚠️ Could not remove legacy phone index:', error.message);
    }
}

mongoose.connection.on('connected', async () => {
    console.log('🔗 MongoDB connection established');
    await removeLegacyPhoneUniqueIndex();
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB connection lost');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB runtime error:', err.message);
});

connectMongoDB();

/**
 * EMAIL CONFIGURATION — Resend
 */
const APP_BASE_URL = process.env.PRODUCTION_URL || process.env.RENDER_EXTERNAL_URL || 'https://road-safety-sos-27p4.onrender.com';
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(user, baseUrl = APP_BASE_URL) {
    if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured in environment variables.');
    }

    const normalizedBaseUrl = String(baseUrl || APP_BASE_URL).replace(/\/$/, '');
    const verificationLink = `${normalizedBaseUrl}/api/verify/${user.verificationToken}`;

    const { error } = await resend.emails.send({
        from: 'RoadSafetySoS <noreply@stigz.xyz>',
        to: user.email,
        subject: 'Complete Your Registration - RoadSafetySoS',
        html: `
            <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7fa; padding: 40px 0;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: -0.5px;">RoadSafetySoS</h1>
                        <p style="color: #bfdbfe; margin-top: 5px; font-size: 14px;">Your Shield on the Road</p>
                    </div>
                    <div style="padding: 40px; color: #334155;">
                        <h2 style="color: #1e293b; font-size: 22px; margin-top: 0;">Welcome to the Network, ${user.name}!</h2>
                        <p style="line-height: 1.6; font-size: 16px;">Thank you for joining RoadSafetySoS. You've taken a vital step toward personal safety and community assistance. Our mission is to eliminate delays during the <b>"Golden Hour"</b> by connecting you instantly with emergency services.</p>
                        <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 25px 0; border: 1px solid #e2e8f0;">
                            <h3 style="margin-top: 0; font-size: 16px; color: #2563eb;">What you can do now:</h3>
                            <ul style="padding-left: 20px; margin-bottom: 0; line-height: 1.5; font-size: 14px;">
                                <li><b>One-Tap SOS:</b> Broadcast location to nearest responders.</li>
                                <li><b>Service Locator:</b> Find verified hospitals and police stations nearby.</li>
                                <li><b>Offline Sync:</b> Safety that works even without internet.</li>
                            </ul>
                        </div>
                        <p style="text-align: center; margin-bottom: 30px; font-size: 16px;">Please click the button below to verify your email and activate your safety dashboard:</p>
                        <div style="text-align: center;">
                            <a href="${verificationLink}" style="display: inline-block; padding: 16px 36px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px;">Verify My Account</a>
                        </div>
                        <p style="color: #64748b; font-size: 13px; text-align: center; margin-top: 40px;">
                            If you did not create an account, please ignore this email.<br><br>
                            <span style="font-size: 11px;">Verification Link: <a href="${verificationLink}" style="color: #2563eb; text-decoration: none;">${verificationLink}</a></span>
                        </p>
                    </div>
                    <div style="background-color: #f1f5f9; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
                        <p>© 2024 RoadSafetySoS Emergency Network. All rights reserved.</p>
                    </div>
                </div>
            </div>
        `
    });

    if (error) {
        throw new Error(`Resend error: ${error.message}`);
    }

    console.log('✅ Verification email sent to', user.email);
}

// --- AUTH MIDDLEWARE ---
const jwt = require('jsonwebtoken');
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const token = authHeader && authHeader.split(' ')[0] === 'Bearer' ? authHeader.split(' ')[1] : null;
    if (!token) return res.status(401).json({ message: 'Missing auth token' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        req.authUser = payload;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

/**
 * MONGODB SCHEMAS
 */
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'org'], default: 'user' },
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    category: { type: String },
    address: { type: String },
    lat: { type: Number },
    lng: { type: Number },
    age: { type: Number },
    gender: { type: String },
    bloodGroup: { type: String }
});

const alertSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    userName: { type: String, default: 'Emergency User' },
    userPhone: { type: String, default: 'N/A' },
    userEmail: { type: String },
    lat: Number,
    lng: Number,
    time: String,
    date: String,
    type: { type: String, enum: ['login', 'emergency'], default: 'login' },
    policeSOS: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'attended', 'resolved'], default: 'pending' },
    attendingOrg: {
        orgId: String,
        name: String,
        phone: String,
        category: String,
        lat: Number,
        lng: Number
    },
    responderLocation: {
        lat: Number,
        lng: Number,
        updatedAt: Date
    },
    currentRadius: { type: Number, default: 0 },
    notifiedOrgCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date }
});

const User = mongoose.model('User', userSchema);
const Alert = mongoose.model('Alert', alertSchema);

const organizationSchema = new mongoose.Schema({
    name: String,
    email: { type: String, lowercase: true, index: true },
    phone: String,
    category: String,
    address: String,
    lat: Number,
    lng: Number,
    createdAt: { type: Date, default: Date.now }
});
const Organization = mongoose.model('Organization', organizationSchema);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

/**
 * ROUTES
 */

// Registration with Email Verification
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password, role, category, address, lat, lng, age, gender, bloodGroup } = req.body;
        const normalizedEmail = String(email || '').toLowerCase().trim();

        const existingUser = await User.findOne({ email: normalizedEmail });
        const forwardedProto = req.headers['x-forwarded-proto'] || req.protocol;
        const forwardedHost = req.headers['x-forwarded-host'] || req.get('host');
        const requestBaseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : APP_BASE_URL;

        if (existingUser) {
            if (!existingUser.isVerified) {
                try {
                    existingUser.verificationToken = crypto.randomBytes(32).toString('hex');
                    await existingUser.save();
                    await sendVerificationEmail(existingUser, requestBaseUrl);
                    return res.status(200).json({ message: 'This email is already registered but not verified. A new verification email has been sent.' });
                } catch (emailError) {
                    console.error('Resend verification email failed:', emailError);
                    return res.status(500).json({ message: 'This email is already registered but we could not resend the verification email right now.' });
                }
            }
            return res.status(400).json({ message: 'User already exists' });
        }

        const existingPhone = await User.findOne({ phone });
        if (existingPhone) return res.status(400).json({ message: 'Phone number already registered' });

        const verificationToken = crypto.randomBytes(32).toString('hex');

        const bcrypt = require('bcryptjs');
        const hashed = await bcrypt.hash(password, 10);

        const newUser = new User({
            name, email: normalizedEmail, phone, password: hashed, role,
            category, address, lat, lng,
            age: age ? Number(age) : undefined,
            gender, bloodGroup,
            isVerified: false,
            verificationToken
        });

        await newUser.save();

        if (role === 'org') {
            try {
                await Organization.updateOne({ email: normalizedEmail }, {
                    $set: { name, email: normalizedEmail, phone, category, address, lat, lng }
                }, { upsert: true });
            } catch (orgErr) {
                console.warn('Failed to create Organization record:', orgErr.message);
            }
        }

        try {
            await sendVerificationEmail(newUser, requestBaseUrl);
            res.json({ message: 'Registration successful! Check your email to verify your account.' });
        } catch (error) {
            console.error('Registration Email Sending Failed:', error);
            res.status(500).json({ message: 'Registration successful, but we couldn\'t send the verification email.' });
        }
    } catch (err) {
        console.error('Registration Execution Failed:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
});

app.get('/api/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const user = await User.findOne({ verificationToken: token });
        if (!user) {
            return res.status(400).send(`
                <div style="text-align: center; padding: 100px 20px; font-family: sans-serif;">
                    <h1>Invalid or expired verification link</h1>
                    <p>The verification link is no longer valid. Please register again or request a new verification email.</p>
                </div>
            `);
        }
        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();
        const frontendUrl = process.env.FRONTEND_URL || 'https://roadsafetysos.vercel.app/';
        res.send(`
            <div style="text-align: center; padding: 100px 20px; font-family: sans-serif;">
                <h1>Email Verified!</h1>
                <p>Your account is now active.</p>
                <a href="${frontendUrl}">Login Now</a>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const normalizedEmail = String(email || '').toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail, role });
        const bcrypt = require('bcryptjs');

        if (user) {
            if (!user.isVerified) {
                try {
                    const forwardedProto = req.headers['x-forwarded-proto'] || req.protocol;
                    const forwardedHost = req.headers['x-forwarded-host'] || req.get('host');
                    const requestBaseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : APP_BASE_URL;

                    // Only regenerate token if there isn't one already (avoids invalidating old emails)
                    if (!user.verificationToken) {
                        user.verificationToken = crypto.randomBytes(32).toString('hex');
                        await user.save();
                    }
                    await sendVerificationEmail(user, requestBaseUrl);
                    return res.status(401).json({ message: 'Verify your email first. A new verification email has been sent.' });
                } catch (emailError) {
                    console.error('Resend Email Error:', emailError);
                    return res.status(500).json({ message: 'Verify your email first. We could not resend the verification email right now.' });
                }
            }

            const match = await bcrypt.compare(String(password || ''), user.password);
            if (!match) return res.status(401).json({ message: 'Invalid credentials' });

            const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '12h' });

            const userObj = user.toObject();
            delete userObj.password;
            res.json({ user: userObj, token });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Login Execution Failed:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
});

app.post('/api/sos', async (req, res) => {
    try {
        const alertData = req.body;
        const existingAlert = await Alert.findOne({ id: alertData.id });
        const normalizedEmail = alertData.userEmail ? String(alertData.userEmail).toLowerCase() : undefined;

        const newAlertData = { ...alertData, userEmail: normalizedEmail };

        if (!existingAlert) {
            newAlertData.status = 'pending';
            const newAlert = new Alert(newAlertData);
            await newAlert.save();
            return res.json({ message: 'SOS triggered', alert: newAlert });
        }

        if (existingAlert.status !== 'pending') {
            delete newAlertData.status;
        }

        await Alert.updateOne({ id: alertData.id }, { $set: newAlertData });
        const updatedAlert = await Alert.findOne({ id: alertData.id });
        res.json({ message: 'SOS updated', alert: updatedAlert });
    } catch (err) {
        console.error('SOS Trigger Failed:', err);
        res.status(500).json({ message: 'Error triggering SOS' });
    }
});

app.get('/api/alerts/:id', async (req, res) => {
    try {
        const alert = await Alert.findOne({ id: Number(req.params.id) });
        if (!alert) return res.status(404).json({ message: 'Alert not found' });
        res.json(alert);
    } catch (err) {
        console.error('Fetch Alert Failed:', err);
        res.status(500).json({ message: 'Error fetching alert' });
    }
});

app.post('/api/alerts/:id/attend', authenticateToken, async (req, res) => {
    try {
        const alert = await Alert.findOne({ id: Number(req.params.id) });
        if (!alert) return res.status(404).json({ message: 'Alert not found' });

        if (alert.status !== 'pending') {
            return res.status(400).json({ message: 'This alert is already being attended or has been resolved.' });
        }

        const orgEmail = String(req.authUser.email || '').toLowerCase();
        const user = await User.findOne({ email: orgEmail });
        if (!user || user.role !== 'org') return res.status(403).json({ message: 'Only organizations can attend alerts' });

        const { lat, lng } = req.body || {};

        alert.status = 'attended';
        alert.attendingOrg = {
            orgId: orgEmail,
            name: user.name || orgEmail,
            phone: user.phone || 'N/A',
            category: user.category || 'Organization',
            lat: (lat !== undefined) ? lat : user.lat,
            lng: (lng !== undefined) ? lng : user.lng
        };

        alert.responderLocation = { lat: alert.attendingOrg.lat, lng: alert.attendingOrg.lng, updatedAt: new Date() };
        await alert.save();

        res.json({ message: 'Alert marked as attended', alert });
    } catch (err) {
        console.error('Attend Alert Failed:', err);
        res.status(500).json({ message: 'Error attending alert' });
    }
});

app.post('/api/alerts/:id/resolve', authenticateToken, async (req, res) => {
    try {
        const alert = await Alert.findOne({ id: Number(req.params.id) });
        if (!alert) return res.status(404).json({ message: 'Alert not found' });

        if (alert.status !== 'attended') {
            return res.status(400).json({ message: 'Only attended alerts can be resolved' });
        }

        const orgEmail = String(req.authUser.email || '').toLowerCase();
        if (!alert.attendingOrg || String(alert.attendingOrg.orgId).toLowerCase() !== orgEmail) {
            return res.status(403).json({ message: 'Only the attending organization can resolve this alert' });
        }

        alert.status = 'resolved';
        alert.resolvedAt = new Date();
        await alert.save();

        res.json({ message: 'Alert resolved', alert });
    } catch (err) {
        console.error('Resolve Alert Failed:', err);
        res.status(500).json({ message: 'Error resolving alert' });
    }
});

app.post('/api/alerts/:id/unattend', authenticateToken, async (req, res) => {
    try {
        const alert = await Alert.findOne({ id: Number(req.params.id) });
        if (!alert) return res.status(404).json({ message: 'Alert not found' });

        const orgEmail = String(req.authUser.email || '').toLowerCase();
        if (!alert.attendingOrg || String(alert.attendingOrg.orgId).toLowerCase() !== orgEmail) {
            return res.status(403).json({ message: 'Only the attending organization can unattend this alert' });
        }

        alert.status = 'pending';
        alert.attendingOrg = undefined;
        alert.responderLocation = undefined;
        alert.resolvedAt = undefined;
        await alert.save();

        res.json({ message: 'Alert is available again', alert });
    } catch (err) {
        console.error('Unattend Alert Failed:', err);
        res.status(500).json({ message: 'Error unattending alert' });
    }
});

app.post('/api/alerts/:id/location', async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const alert = await Alert.findOne({ id: Number(req.params.id) });
        if (!alert) return res.status(404).json({ message: 'Alert not found' });

        alert.responderLocation = { lat, lng, updatedAt: new Date() };
        await alert.save();

        res.json({ message: 'Responder location updated', alert });
    } catch (err) {
        console.error('Update Responder Location Failed:', err);
        res.status(500).json({ message: 'Error updating responder location' });
    }
});

app.get('/api/alerts', async (req, res) => {
    try {
        const { status, userEmail, orgEmail } = req.query;
        const filter = {};

        if (status === 'all') {
            // return all statuses
        } else {
            filter.status = { $ne: 'resolved' };
        }

        if (userEmail) {
            filter.userEmail = String(userEmail).toLowerCase();
        }

        if (orgEmail) {
            const orgId = String(orgEmail).toLowerCase();
            filter.$or = [
                { status: 'pending' },
                { status: 'attended', 'attendingOrg.orgId': orgId }
            ];
            if (filter.status) delete filter.status;
        }

        const alerts = await Alert.find(filter).sort({ createdAt: -1 });
        res.json(alerts);
    } catch (err) {
        console.error('Error fetching alerts:', err);
        res.status(500).json({ message: 'Error fetching alerts' });
    }
});

app.get('/api/alerts/user/:email', async (req, res) => {
    try {
        const email = String(req.params.email).toLowerCase();
        const filter = { userEmail: email };
        if (req.query.status !== 'all') {
            filter.status = { $ne: 'pending' };
        }
        const alerts = await Alert.find(filter).sort({ createdAt: -1 });
        res.json(alerts);
    } catch (err) {
        console.error('Error fetching user history:', err);
        res.status(500).json({ message: 'Error fetching user history' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const userCount = await User.countDocuments({ role: 'user', isVerified: true });
        const orgCount = await User.countDocuments({ role: 'org', isVerified: true });
        const alertCount = await Alert.countDocuments();
        res.json({ userCount, orgCount, alertCount });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching stats' });
    }
});

app.get('/api/organizations', async (req, res) => {
    try {
        try {
            const orgs = await Organization.find();
            if (orgs && orgs.length) return res.json(orgs);
        } catch (_) {}

        const orgsFromUsers = await User.find({ role: 'org', isVerified: true });
        res.json(orgsFromUsers.map(u => ({ name: u.name, email: u.email, phone: u.phone, category: u.category, address: u.address, lat: u.lat, lng: u.lng })));
    } catch (err) {
        console.error('Error fetching organizations:', err);
        res.status(500).json({ message: 'Error fetching organizations' });
    }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const email = String(req.query.email || '').toLowerCase();
        if (!email) return res.status(400).json({ message: 'Email is required' });
        if (String(req.authUser.email || '').toLowerCase() !== email) return res.status(403).json({ message: 'Access denied' });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const userObj = user.toObject();
        delete userObj.password;

        if (user.role === 'org') {
            const org = await Organization.findOne({ email });
            if (org) userObj.orgProfile = org.toObject();
        }

        res.json({ user: userObj });
    } catch (err) {
        console.error('Fetch profile failed:', err);
        res.status(500).json({ message: 'Error fetching profile' });
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { email, updates } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });
        const normalizedEmail = String(email).toLowerCase();
        if (String(req.authUser.email || '').toLowerCase() !== normalizedEmail) return res.status(403).json({ message: 'Access denied' });

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const allowed = ['name', 'phone', 'address', 'lat', 'lng', 'category', 'photoUrl'];
        const set = {};
        for (const k of Object.keys(updates || {})) {
            if (allowed.includes(k)) set[k] = updates[k];
        }

        if (updates.password) {
            const bcrypt = require('bcryptjs');
            set.password = await bcrypt.hash(updates.password, 10);
        }

        await User.updateOne({ email: normalizedEmail }, { $set: set });

        if (user.role === 'org') {
            const orgSet = {};
            ['name', 'phone', 'address', 'lat', 'lng', 'category'].forEach(k => { if (set[k] !== undefined) orgSet[k] = set[k]; });
            if (Object.keys(orgSet).length) {
                await Organization.updateOne({ email: normalizedEmail }, { $set: orgSet }, { upsert: true });
            }
        }

        const updated = await User.findOne({ email: normalizedEmail });
        const updatedObj = updated.toObject();
        delete updatedObj.password;
        res.json({ message: 'Profile updated', user: updatedObj });
    } catch (err) {
        console.error('Update profile failed:', err);
        res.status(500).json({ message: 'Error updating profile' });
    }
});

let server;

const startServer = (port = DEFAULT_PORT, retries = MAX_PORT_RETRIES) => {
    server = app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && retries > 0) {
            const nextPort = port + 1;
            console.warn(`Port ${port} is already in use. Trying ${nextPort}...`);
            startServer(nextPort, retries - 1);
            return;
        }

        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use. Stop the existing server process or set PORT to another port.`);
        } else {
            console.error('Server listen error:', err.message);
        }
        process.exit(1);
    });
};

startServer();

const shutdown = async (signal) => {
    console.log(`🛑 Received ${signal}. Shutting down server...`);
    server.close(async () => {
        try {
            await mongoose.disconnect();
            console.log('✅ MongoDB disconnected');
        } catch (error) {
            console.error('❌ MongoDB disconnect error:', error.message);
        }
        process.exit(0);
    });

    setTimeout(() => {
        console.error('⚠️ Forced shutdown after timeout');
        process.exit(1);
    }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGUSR2', () => shutdown('SIGUSR2'));