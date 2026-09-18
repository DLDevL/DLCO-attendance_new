const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://xnvisljkjcaqrvaehmmo.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.warn('Missing SUPABASE_ANON_KEY or SUPABASE_KEY environment variable. Auth will likely fail.');
}

if (!serviceRoleKey) {
  console.warn('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Database writes may fail when Row Level Security is enabled.');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const db = createClient(supabaseUrl, serviceRoleKey || supabaseKey);

module.exports = { supabase, db };
