const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const dns = require('dns');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Bypass local ISP blocks on MongoDB SRV records
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'roadsafetysos-dev-secret';

/**
 * DATABASE CONNECTION
 * Credentials are now read exclusively from environment variables
 */
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ Error: MONGO_URI is not defined in environment variables.');
} else {
    mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 10000
    })
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
    });
}

/**
 * EMAIL CONFIGURATION
 * Credentials are now read exclusively from environment variables
 */
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL;
const APP_PASSWORD = process.env.APP_PASSWORD;

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: SUPPORT_EMAIL,
        pass: APP_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000
});

if (SUPPORT_EMAIL && APP_PASSWORD) {
    transporter.verify((error) => {
        if (error) console.error("❌ Email transporter error:", error.message);
        else console.log("✅ Email server is ready");
    });
} else {
    console.warn('⚠️ Warning: Email credentials missing in environment variables.');
}

/**
 * MONGODB SCHEMAS
 */
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'organization'], default: 'user' },
    age: Number,
    gender: String,
    bloodGroup: String,
    address: String,
    organizationType: String,
    latitude: Number,
    longitude: Number,
    isVerified: { type: Boolean, default: false },
    verificationToken: String
});

const alertSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    userName: { type: String, default: 'Emergency User' },
    userPhone: { type: String, default: 'N/A' },
    lat: Number,
    lng: Number,
    time: String,
    date: String,
    type: { type: String, enum: ['login', 'emergency'], default: 'login' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Alert = mongoose.model('Alert', alertSchema);

function createAuthResponse(user) {
    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.verificationToken;
    const token = jwt.sign({ userId: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return { user: userObj, token };
}

// Request Logger Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

/**
 * ROUTES
 */

app.get('/api/stats', async (req, res) => {
    try {
        const userCount = await User.countDocuments({ role: 'user', isVerified: true });
        const orgCount = await User.countDocuments({ role: 'organization', isVerified: true });
        const alertCount = await Alert.countDocuments();
        res.json({ userCount, orgCount, alertCount });
    } catch (err) { res.status(500).json({ message: 'Stats Error' }); }
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password, role, age, gender, bloodGroup, address, category, lat, lng } = req.body;
        const cleanEmail = (email || '').toLowerCase().trim();

        if (!cleanEmail || !phone) {
            return res.status(400).json({ message: 'Email and Phone are required' });
        }

        const existingUser = await User.findOne({ $or: [{ email: cleanEmail }, { phone }] });
        if (existingUser) return res.status(400).json({ message: 'Email or Phone already registered' });

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email: cleanEmail,
            phone,
            password: hashedPassword,
            role: role === 'org' ? 'organization' : 'user',
            age,
            gender,
            bloodGroup,
            address,
            organizationType: category,
            latitude: lat,
            longitude: lng,
            isVerified: false,
            verificationToken
        });

        await newUser.save();

        res.json({ message: 'Registration successful! Check your email for verification.' });

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const baseUrl = process.env.PRODUCTION_URL || `${protocol}://${host}`;
        const verificationLink = `${baseUrl}/api/verify/${verificationToken}`;

        const mailOptions = {
            from: `"RoadSoS Support" <${SUPPORT_EMAIL}>`,
            to: cleanEmail,
            subject: 'Verify Your RoadSoS Account',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #2563eb;">Welcome to RoadSoS, ${name}!</h2>
                    <p>Thank you for joining our emergency network. Please click the button below to verify your email address:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Account</a>
                    </div>
                    <p style="font-size: 12px; color: #64748b;">If the button doesn't work, copy and paste this link: <br> ${verificationLink}</p>
                </div>
            `
        };

        if (SUPPORT_EMAIL && APP_PASSWORD) {
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) console.error("❌ Email Error:", error.message);
                else console.log("✅ Email sent: " + info.response);
            });
        }

    } catch (err) {
        console.error("❌ Registration Error:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Registration Failed: ' + err.message });
        }
    }
});

app.get('/api/verify/:token', async (req, res) => {
    try {
        const token = req.params.token;
        const user = await User.findOne({ verificationToken: token });

        if (!user) {
            return res.status(400).send('<h1>Invalid or Expired Link</h1>');
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();

        res.send('<h1>Email Verified Successfully! You can now log in.</h1>');
    } catch (err) {
        console.error("❌ Verification Error:", err);
        res.status(500).send('Verification error.');
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Invalid credentials' });
        if (!user.isVerified) return res.status(401).json({ message: 'Please verify email first' });
        res.json(createAuthResponse(user));
    } catch (err) { res.status(500).json({ message: 'Login Error' }); }
});

app.post('/api/sos', async (req, res) => {
    try {
        await new Alert(req.body).save();
        res.json({ message: 'SOS Sent' });
    } catch (err) { res.status(500).json({ message: 'SOS Error' }); }
});

app.get('/api/alerts', async (req, res) => {
    try {
        const alerts = await Alert.find().sort({ createdAt: -1 });
        res.json(alerts);
    } catch (err) { res.status(500).json({ message: 'Alerts Error' }); }
});

app.get('/api/organizations', async (req, res) => {
    try {
        const orgs = await User.find({ role: 'organization', isVerified: true });
        res.json(orgs.map(o => ({
            name: o.name, address: o.address, lat: o.latitude, lng: o.longitude,
            phone: o.phone, category: (o.organizationType || 'hospital').toLowerCase()
        })));
    } catch (err) { res.status(500).json({ message: 'Orgs Error' }); }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
