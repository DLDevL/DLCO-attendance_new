const { createClient } = require('@supabase/supabase-js');

// All three values come from environment variables: the local .env file,
// or Vercel → Project → Settings → Environment Variables in production.
// See .env.example for the names.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

if (!serviceRoleKey) {
  console.warn('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Database writes may fail when Row Level Security is enabled.');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const db = createClient(supabaseUrl, serviceRoleKey || supabaseKey);

module.exports = { supabase, db };
