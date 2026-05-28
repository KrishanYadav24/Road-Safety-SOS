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

// Force DNS to use Google's servers to bypass local DNS restrictions
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'roadsafetysos-dev-secret';

/**
 * DATABASE CONNECTION
 */
const MONGO_URI = "mongodb+srv://vinayak:RoadSoS%40123@roadsos.jbo7s55.mongodb.net/roadsos?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
});

/**
 * EMAIL CONFIGURATION
 */
const SUPPORT_EMAIL = 'roadsosdigix@gmail.com';
const APP_PASSWORD = 'lbcf tejx bhef havn';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: SUPPORT_EMAIL,
        pass: APP_PASSWORD
    }
});

/**
 * MONGODB SCHEMAS
 */
const userSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Representative Full Name
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'organization'], default: 'user' },
    age: Number,
    gender: String,
    bloodGroup: String,
    address: String,
    organizationName: String,
    organizationType: String,
    hospitalId: String,
    claimedBy: String,
    latitude: Number,
    longitude: Number,
    isDigixVerified: { type: Boolean, default: false },
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

const organizationClaimSchema = new mongoose.Schema({
    hospitalId: { type: String, required: true, unique: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    isDigixVerified: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const organizationRecordSchema = new mongoose.Schema({
    organizationAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organizationName: { type: String, required: true },
    address: { type: String, required: true },
    organizationType: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    isDigixVerified: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Alert = mongoose.model('Alert', alertSchema);
const OrganizationClaim = mongoose.model('OrganizationClaim', organizationClaimSchema);
const OrganizationRecord = mongoose.model('OrganizationRecord', organizationRecordSchema);

function normalizeRole(role) {
    if (role === 'org') return 'organization';
    return role === 'organization' ? 'organization' : 'user';
}

function validatePassword(password) {
    if (!password || password.length < 8) {
        return 'Password must be at least 8 characters long.';
    }
    return null;
}

function createAuthResponse(user) {
    const userObj = user.toObject();
    userObj.role = normalizeRole(userObj.role);
    delete userObj.password;
    delete userObj.verificationToken;

    const token = jwt.sign(
        { userId: user._id, role: userObj.role, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    return { user: userObj, token };
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

/**
 * ROUTES
 */

app.post('/api/register', async (req, res) => {
    try {
        const { name, password, age, gender, bloodGroup, address, organizationType } = req.body;
        const email = String(req.body.email || '').trim().toLowerCase();
        const phone = String(req.body.phone || '').trim();
        const role = normalizeRole(req.body.role);

        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: 'Core registration fields are required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'Email already registered' });

        const existingPhone = await User.findOne({ phone });
        if (existingPhone) return res.status(400).json({ message: 'Phone number already registered' });

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role,
            age: role === 'user' ? Number(age) : undefined,
            gender: role === 'user' ? gender : undefined,
            bloodGroup: role === 'user' ? bloodGroup : undefined,
            address: role === 'user' ? address : undefined,
            organizationType: role === 'organization' ? organizationType : undefined,
            isVerified: false,
            verificationToken
        });

        await newUser.save();

        const productionUrl = "https://road-safety-sos.onrender.com";
        const verificationLink = `${productionUrl}/api/verify/${verificationToken}`;

        const mailOptions = {
            from: `"RoadSoS-DigiX Support" <${SUPPORT_EMAIL}>`,
            to: email,
            subject: 'Complete Your Registration - RoadSoS-DigiX',
            html: `
                <div style="font-family: sans-serif; background-color: #f4f7fa; padding: 40px;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <h2 style="color: #1e293b;">Welcome to RoadSoS-DigiX, ${name}!</h2>
                        <p>Verify your account to activate your safety dashboard:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${verificationLink}" style="display: inline-block; padding: 16px 36px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 700;">Verify Account</a>
                        </div>
                    </div>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error) => {
            const payload = {
                message: 'Registration successful! Check email to verify.',
                organizationId: role === 'organization' ? newUser._id : undefined
            };
            res.json(payload);
        });
    } catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/api/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const user = await User.findOne({ verificationToken: token });
        if (!user) return res.status(400).send('Invalid link');
        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();
        res.send(`
            <div style="text-align: center; padding: 100px 20px; font-family: sans-serif;">
                <h1>Email Verified!</h1>
                <p>Your account is active. Close this tab and login.</p>
                <a href="https://roadsafetysos.vercel.app/">Login Now</a>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.post('/api/organizations/claim', async (req, res) => {
    try {
        const { hospitalId, organizationId, organizationName, latitude, longitude } = req.body;

        const organization = await User.findOne({ _id: organizationId, role: 'organization' });
        if (!organization) return res.status(404).json({ message: 'Account not found' });

        const existingClaim = await OrganizationClaim.findOne({ hospitalId });
        if (existingClaim && String(existingClaim.organizationId) !== String(organizationId)) {
            return res.status(409).json({ message: 'Organization already registered.' });
        }

        const claim = existingClaim || new OrganizationClaim({
            hospitalId, organizationId, claimedBy: organizationId, latitude, longitude, isDigixVerified: true
        });

        await claim.save();

        organization.hospitalId = hospitalId;
        organization.organizationName = organizationName;
        organization.latitude = latitude;
        organization.longitude = longitude;
        organization.isDigixVerified = true;
        await organization.save();

        res.json({ message: 'Organization claimed successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error claiming organization' });
    }
});

app.post('/api/organizations/create', async (req, res) => {
    try {
        const { organizationId, organizationName, address, latitude, longitude } = req.body;

        const organization = await User.findOne({ _id: organizationId, role: 'organization' });
        if (!organization) return res.status(404).json({ message: 'Account not found' });

        const record = new OrganizationRecord({
            organizationAccountId: organizationId,
            organizationName,
            address,
            organizationType: organization.organizationType || 'Other',
            latitude,
            longitude,
            isDigixVerified: true
        });
        await record.save();

        organization.hospitalId = String(record._id);
        organization.organizationName = organizationName;
        organization.address = address;
        organization.latitude = latitude;
        organization.longitude = longitude;
        organization.isDigixVerified = true;
        await organization.save();

        res.json({ message: 'Organization created successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error creating organization' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const role = normalizeRole(req.body.role);

        const user = await User.findOne({ email, role: role === 'organization' ? { $in: ['organization', 'org'] } : role });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' });

        if (!user.isVerified) return res.status(401).json({ message: 'Verify email first.' });

        res.json(createAuthResponse(user));
    } catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/sos', async (req, res) => {
    try {
        const alertData = req.body;
        const existingAlert = await Alert.findOne({ id: alertData.id });
        if (!existingAlert) {
            const newAlert = new Alert(alertData);
            await newAlert.save();
        }
        res.json({ message: 'SOS triggered' });
    } catch (err) {
        res.status(500).json({ message: 'Error triggering SOS' });
    }
});

app.get('/api/alerts', async (req, res) => {
    try {
        const alerts = await Alert.find().sort({ createdAt: -1 });
        res.json(alerts);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching alerts' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const userCount = await User.countDocuments({ role: 'user', isVerified: true });
        const orgCount = await User.countDocuments({ role: { $in: ['organization', 'org'] }, isVerified: true });
        const alertCount = await Alert.countDocuments();
        res.json({ userCount, orgCount, alertCount });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching stats' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
