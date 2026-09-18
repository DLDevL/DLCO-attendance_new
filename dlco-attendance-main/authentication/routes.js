const express = require('express');
const router = express.Router();
const { supabase, requireAuth } = require('./middleware');

/**
 * POST /api/auth/signup
 * Body: { email, password, role }  — role must be 'teacher' or 'student'
 */
router.post('/signup', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required' });
  }

  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: 'role must be "teacher" or "student"' });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role }, // stored in user_metadata
    },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({
    message: 'Signup successful. Check your email to confirm your account.',
    user: {
      id: data.user?.id,
      email: data.user?.email,
      role: data.user?.user_metadata?.role,
    },
  });
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.status(200).json({
    message: 'Login successful',
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      role: data.user.user_metadata?.role,
    },
  });
});

/**
 * POST /api/auth/logout
 * Requires: Authorization: Bearer <token>
 */
router.post('/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  // Sign out from Supabase (invalidates the session server-side)
  const { error } = await supabase.auth.admin.signOut(token);

  if (error) {
    // Non-fatal: token may already be expired
    console.warn('Logout warning:', error.message);
  }

  return res.status(200).json({ message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's info.
 * Requires: Authorization: Bearer <token>
 */
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({ user: req.user });
});

module.exports = router;