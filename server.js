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
 */
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://vinayak:RoadSoS%40123@roadsos.jbo7s55.mongodb.net/roadsos?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
});

/**
 * EMAIL CONFIGURATION
 */
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'roadsosdigix@gmail.com';
const APP_PASSWORD = process.env.APP_PASSWORD || 'lbcf tejx bhef havn';

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
    }
});

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

        // Dynamically detect host to make link work on localhost and Render
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const verificationLink = `${protocol}://${host}/api/verify/${verificationToken}`;

        const mailOptions = {
            from: `"RoadSoS-DigiX Support" <${SUPPORT_EMAIL}>`,
            to: cleanEmail,
            subject: 'Complete Your Registration - RoadSoS-DigiX',
            html: `
                <div style="font-family: sans-serif; background-color: #f4f7fa; padding: 40px;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <h2 style="color: #1e293b;">Welcome to RoadSoS-DigiX, ${name}!</h2>
                        <p style="color: #475569; font-size: 16px; line-height: 1.6;">Thank you for joining our emergency network. Please verify your account to activate your safety dashboard and start accessing real-time services:</p>
                        <div style="text-align: center; margin: 35px 0;">
                            <a href="${verificationLink}" style="display: inline-block; padding: 16px 36px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px;">Verify Account</a>
                        </div>
                        <p style="font-size: 13px; color: #64748b; line-height: 1.6;">If the button doesn't work, copy and paste this link into your browser:</p>
                        <p style="font-size: 11px; color: #3b82f6; word-break: break-all;">${verificationLink}</p>
                        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;">
                        <p style="font-size: 12px; color: #94a3b8; text-align: center;">© 2024 RoadSoS-DigiX Network.</p>
                    </div>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) console.error("❌ Email Error:", error.message);
        });

        res.json({ message: 'Registration successful! Check email to verify.' });
    } catch (err) {
        console.error("❌ Registration Error:", err.message);
        res.status(500).json({ message: 'Registration Failed: ' + err.message });
    }
});

app.get('/api/verify/:token', async (req, res) => {
    try {
        const token = req.params.token;
        const user = await User.findOne({ verificationToken: token });

        if (!user) {
            return res.status(400).send(`
                <div style="text-align:center;font-family:sans-serif;margin-top:50px;padding:20px;">
                    <h1 style="color:#e11d48;">Invalid or Expired Link</h1>
                    <p style="color:#64748b;">This verification link is no longer valid. You may have already verified your account.</p>
                    <a href="https://roadsafetysos.vercel.app/" style="color:#2563eb;text-decoration:none;font-weight:bold;">Go to Homepage</a>
                </div>
            `);
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();

        res.send(`
            <div style="text-align:center;font-family:sans-serif;margin-top:50px;padding:20px;">
                <h1 style="color:#16a34a;">Email Verified Successfully!</h1>
                <p style="color:#64748b;">Your account is now active. You can close this tab and log in.</p>
                <a href="https://roadsafetysos.vercel.app/" style="display:inline-block;padding:12px 30px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:20px;">Go to Login</a>
            </div>
        `);
    } catch (err) {
        console.error("❌ Verification Error:", err);
        res.status(500).send('An error occurred during verification.');
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
