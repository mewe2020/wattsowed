// WattsOwed — API Configuration
// Replace placeholder values with your real keys before deploying.
//
// EIA API key:       https://www.eia.gov/opendata/register.php          (free)
// RSS2JSON API key:  https://rss2json.com/#rss_url                      (free)
// LegiScan API key:  https://legiscan.com/legiscan → My Account → API  (free, ~30k req/month)
// Anthropic API key: https://console.anthropic.com                      (paid)
// Supabase:          https://supabase.com → new project                 (free tier)
//
// Supabase SQL setup (run in your Supabase SQL editor):
//
// CREATE TABLE testimonials (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   content TEXT NOT NULL,
//   author TEXT DEFAULT 'Anonymous',
//   location TEXT,
//   upvotes INTEGER DEFAULT 0,
//   approved BOOLEAN DEFAULT FALSE,
//   source TEXT DEFAULT 'direct',
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
// ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "read_approved" ON testimonials FOR SELECT USING (approved = true);
// CREATE POLICY "allow_insert" ON testimonials FOR INSERT WITH CHECK (true);

const CONFIG = {
  ANTHROPIC_API_KEY: 'YOUR_ANTHROPIC_API_KEY',
  EIA_API_KEY:       'n8hhMQlcWSHa6X6V8M2FMOlUOzrrrMy94lgJlAA1',
  RSS2JSON_API_KEY:  'olpdkgvniquqlaqvkpjncsn3oo6wd303fl65xqmv',
  LEGISCAN_API_KEY:  'YOUR_LEGISCAN_API_KEY',   // optional — adds real VA bill tracking
  SUPABASE_URL:      'YOUR_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',

  POLICY_REFRESH_MS: 60 * 60 * 1000,  // refresh live policy data every 1 hour
};
