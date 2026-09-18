const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Middleware: verifies Supabase JWT from Authorization header.
 * Attaches user + role to req.user on success.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach user info + role (stored in user_metadata at signup)
  req.user = {
    id: user.id,
    email: user.email,
    role: user.user_metadata?.role || 'student',
  };

  next();
}

/**
 * Middleware: restricts route to a specific role.
 * Must be used AFTER requireAuth.
 * Usage: requireRole('teacher')
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Access denied. Required role: ${role}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, supabase };