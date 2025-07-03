import express from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-jwt-secret', {
    expiresIn: '7d'
  });
};

// ----------------------
// Register
// ----------------------
router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
    body('password')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
      .matches(/[0-9!@#$%^&*(),.?":{}|<>]/).withMessage('Password must include at least one number or special character')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { name, email, password } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists with this email' });
      }

      const user = new User({ name, email, password });
      await user.save();

      const token = generateToken(user._id);

      res.status(201).json({
        message: 'User created successfully',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Server error during registration' });
    }
  }
);

// ----------------------
// Login
// ----------------------
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      user.lastLogin = new Date();
      await user.save();

      const token = generateToken(user._id);

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          googleId: user.googleId
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error during login' });
    }
  }
);

// ----------------------
// Get Current User
// ----------------------
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        googleId: user.googleId
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------
// Google OAuth Start
// ----------------------
router.get('/google', (req, res, next) => {
  console.log('🔐 Initiating Google OAuth...');
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// ----------------------
// Google OAuth Callback
// ----------------------
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: 'http://localhost:5173/login?error=auth_failed'
  }),
  async (req, res) => {
    try {
      console.log('✅ Google OAuth callback hit');
      console.log('🔎 User from passport:', req.user);

      if (!req.user || !req.user._id) {
        console.error('❌ Missing user or user._id from passport');
        throw new Error('Invalid user after Google login');
      }

      const token = generateToken(req.user._id);
      console.log('✅ JWT issued:', token);

      res.redirect(`http://localhost:5173/login?token=${token}`);
    } catch (error) {
      console.error('🚨 Google callback error:', error.stack || error.message || error);
      res.redirect('http://localhost:5173/login?error=auth_failed');
    }
  }
);

// ----------------------
// Logout
// ----------------------
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Error logging out' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// ----------------------
// Health Check
// ----------------------
router.get('/health', (req, res) => {
  res.json({
    message: 'Auth service is running',
    timestamp: new Date().toISOString()
  });
});

export default router;
