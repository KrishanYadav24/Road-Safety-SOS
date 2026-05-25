const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const dns = require('dns');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Force DNS to use Google's servers to bypass local DNS restrictions
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
const PORT = process.env.PORT || 3000;

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
const APP_PASSWORD = 'zmjz kazk omug qmqw';

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
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'org'], default: 'user' },
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

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

/**
 * ROUTES
 */

// Registration with Email Verification
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        const verificationToken = crypto.randomBytes(32).toString('hex');

        const newUser = new User({
            name, email, phone, password, role,
            isVerified: false,
            verificationToken
        });

        await newUser.save();

        const productionUrl = "https://road-safety-sos.onrender.com";
        const verificationLink = `${productionUrl}/api/verify/${verificationToken}`;

        const mailOptions = {
            from: `"RoadSafetySoS Support" <${SUPPORT_EMAIL}>`,
            to: email,
            subject: 'Complete Your Registration - RoadSafetySoS',
            html: `
                <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7fa; padding: 40px 0;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: -0.5px;">RoadSafetySoS</h1>
                            <p style="color: #bfdbfe; margin-top: 5px; font-size: 14px;">Your Shield on the Road</p>
                        </div>
                        <div style="padding: 40px; color: #334155;">
                            <h2 style="color: #1e293b; font-size: 22px; margin-top: 0;">Welcome to the Network, ${name}!</h2>
                            <p style="line-height: 1.6; font-size: 16px;">Thank you for joining RoadSafetySoS. You've taken a vital step toward personal safety and community assistance. Our mission is to eliminate delays during the <b>"Golden Hour"</b> by connecting you instantly with emergency services.</p>
                            <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 25px 0; border: 1px solid #e2e8f0;">
                                <h3 style="margin-top: 0; font-size: 16px; color: #2563eb;">What you can do now:</h3>
                                <ul style="padding-left: 20px; margin-bottom: 0; line-height: 1.5; font-size: 14px;">
                                    <li><b>One-Tap SOS:</b> Broadcast location to nearest responders.</li>
                                    <li><b>Service Locator:</b> Find Hospitals & Police within seconds.</li>
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
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Email Error:", error);
                return res.json({ message: 'Registration successful, but we couldn\'t send the verification email.' });
            }
            res.json({ message: 'Registration successful! Check your email to verify your account.' });
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
                <p>Your account is now active.</p>
                <a href="https://roadsafetysos.vercel.app/">Login Now</a>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const user = await User.findOne({ email, password, role });
        if (user) {
            if (!user.isVerified) return res.status(401).json({ message: 'Verify your email first.' });
            const userObj = user.toObject();
            delete userObj.password;
            res.json({ user: userObj });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
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
        const orgCount = await User.countDocuments({ role: 'org', isVerified: true });
        const alertCount = await Alert.countDocuments();
        res.json({ userCount, orgCount, alertCount });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching stats' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
