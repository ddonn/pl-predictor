// One-off seed script — inserts all 380 Premier League 2026/27 fixtures.
// Usage:
//   npm run seed            (fails if matches already exist)
//   npm run seed -- --reset (wipes matches/results/predictions first, then reseeds)
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fixtures = require('../seed/fixtures-2026-27.json');

const STADIUMS = {
  Arsenal: 'Emirates Stadium',
  'Aston Villa': 'Villa Park',
  'AFC Bournemouth': 'Vitality Stadium',
  Brentford: 'Gtech Community Stadium',
  'Brighton and Hove Albion': 'American Express Stadium',
  Chelsea: 'Stamford Bridge',
  'Coventry City': 'Coventry Building Society Arena',
  'Crystal Palace': 'Selhurst Park',
  Everton: 'Hill Dickinson Stadium',
  Fulham: 'Craven Cottage',
  'Hull City': 'MKM Stadium',
  'Ipswich Town': 'Portman Road',
  'Leeds United': 'Elland Road',
  Liverpool: 'Anfield',
  'Manchester City': 'Etihad Stadium',
  'Manchester United': 'Old Trafford',
  'Newcastle United': "St James' Park",
  'Nottingham Forest': 'The City Ground',
  Sunderland: 'Stadium of Light',
  'Tottenham Hotspur': 'Tottenham Hotspur Stadium',
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);
  const reset = process.argv.includes('--reset');

  const { count, error: countErr } = await supabase.from('matches').select('*', { count: 'exact', head: true });
  if (countErr) {
    console.error('Could not read matches table — did you run supabase/schema.sql first?', countErr.message);
    process.exit(1);
  }

  if (count > 0 && !reset) {
    console.error(`matches table already has ${count} rows. Re-run with --reset to wipe and reseed.`);
    process.exit(1);
  }

  if (count > 0 && reset) {
    console.log('Wiping existing predictions, results and matches…');
    await supabase.from('predictions').delete().neq('id', 0);
    await supabase.from('results').delete().neq('match_id', 0);
    await supabase.from('points_adjustments').update({ match_id: null }).neq('id', 0);
    const { error: delErr } = await supabase.from('matches').delete().neq('id', 0);
    if (delErr) {
      console.error('Failed to wipe matches:', delErr.message);
      process.exit(1);
    }
  }

  const rows = fixtures.map((f) => ({
    home: f.home,
    away: f.away,
    kickoff: f.kickoff,
    gameweek: f.gameweek,
    stadium: STADIUMS[f.home] || null,
  }));

  console.log(`Inserting ${rows.length} fixtures…`);
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('matches').insert(batch);
    if (error) {
      console.error(`Failed inserting batch starting at row ${i}:`, error.message);
      process.exit(1);
    }
    console.log(`  inserted ${Math.min(i + batchSize, rows.length)} / ${rows.length}`);
  }

  console.log('Done! Seeded all 380 fixtures.');
}

main();
