/**
 * Streamly Demo Content Seeder
 *
 * Seeds 12 demo videos into channel_posts under a "Streamly Official" channel.
 * Uses Cloudflare Stream URL-based upload for video ingestion.
 *
 * Prerequisites:
 *   1. Add SUPABASE_SERVICE_ROLE_KEY to ../.env
 *   2. cd scripts && npm install
 *   3. npm run seed
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CF_ACCOUNT_ID = process.env.EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID;
const CF_STREAM_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env');
  process.exit(1);
}
if (!CF_ACCOUNT_ID || !CF_STREAM_TOKEN) {
  console.error('ERROR: Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_API_TOKEN in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Admin user (krishnapate43@gmail.com) ────────────────────────────────────

const ADMIN_EMAIL = 'krishnapate43@gmail.com';

// ── Demo content catalog ────────────────────────────────────────────────────
// Using freely available videos from Pexels (no attribution required)

const DEMO_CONTENT = [
  // ACTION (3)
  {
    title: 'Urban Chase',
    body: 'High-speed pursuit through the city streets. A gripping action short featuring parkour and stunt driving.',
    genre: 'Action',
    content_type: 'movie',
    duration_min: 8,
    release_year: 2024,
    video_source_url: 'https://videos.pexels.com/video-files/2795173/2795173-uhd_2560_1440_25fps.mp4',
    poster_url: 'https://placehold.co/300x450/1a1a2e/e94560?text=Urban+Chase&font=montserrat',
  },
  {
    title: 'Neon Nightfall',
    body: 'When the city lights up, the shadows come alive. A cyberpunk action short.',
    genre: 'Action',
    content_type: 'short',
    duration_min: 4,
    release_year: 2024,
    video_source_url: 'https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4',
    poster_url: 'https://placehold.co/300x450/0f3460/e94560?text=Neon+Nightfall&font=montserrat',
  },
  {
    title: 'Storm Riders',
    body: 'Extreme weather chasers risk everything for the perfect shot of nature\'s fury.',
    genre: 'Action',
    content_type: 'movie',
    duration_min: 12,
    release_year: 2023,
    video_source_url: 'https://videos.pexels.com/video-files/857195/857195-hd_1920_1080_25fps.mp4',
    poster_url: 'https://placehold.co/300x450/16213e/0f3460?text=Storm+Riders&font=montserrat',
  },

  // COMEDY (2)
  {
    title: 'The Awkward Date',
    body: 'Everything that could go wrong on a first date does go wrong. A hilarious romantic comedy short.',
    genre: 'Comedy',
    content_type: 'short',
    duration_min: 6,
    release_year: 2024,
    video_source_url: 'https://videos.pexels.com/video-files/4065924/4065924-uhd_2560_1440_24fps.mp4',
    poster_url: 'https://placehold.co/300x450/f9ed69/f38181?text=The+Awkward+Date&font=montserrat',
  },
  {
    title: 'Office Shenanigans',
    body: 'A day in the life of the world\'s most dysfunctional workplace.',
    genre: 'Comedy',
    content_type: 'movie',
    duration_min: 15,
    release_year: 2024,
    video_source_url: 'https://videos.pexels.com/video-files/7989580/7989580-uhd_2560_1440_25fps.mp4',
    poster_url: 'https://placehold.co/300x450/f38181/f9ed69?text=Office+Shenanigans&font=montserrat',
  },

  // DRAMA (2)
  {
    title: 'Silent Letters',
    body: 'A collection of unwritten letters between two people who never said goodbye.',
    genre: 'Drama',
    content_type: 'movie',
    duration_min: 18,
    release_year: 2023,
    video_source_url: 'https://videos.pexels.com/video-files/4812202/4812202-uhd_2560_1440_25fps.mp4',
    poster_url: 'https://placehold.co/300x450/2c3e50/ecf0f1?text=Silent+Letters&font=montserrat',
  },
  {
    title: 'The Last Platform',
    body: 'A retired train conductor returns to the station one final time, confronting the memories of a lifetime of goodbyes.',
    genre: 'Drama',
    content_type: 'short',
    duration_min: 9,
    release_year: 2024,
    video_source_url: 'https://videos.pexels.com/video-files/3015510/3015510-hd_1920_1080_24fps.mp4',
    poster_url: 'https://placehold.co/300x450/34495e/95a5a6?text=The+Last+Platform&font=montserrat',
  },

  // DOCUMENTARY (3)
  {
    title: 'Ocean Depths',
    body: 'Explore the mysterious world beneath the waves. From coral reefs to deep-sea trenches.',
    genre: 'Documentary',
    content_type: 'movie',
    duration_min: 22,
    release_year: 2024,
    video_source_url: 'https://videos.pexels.com/video-files/855029/855029-hd_1920_1080_30fps.mp4',
    poster_url: 'https://placehold.co/300x450/006266/00b4d8?text=Ocean+Depths&font=montserrat',
  },
  {
    title: 'Mountain Kingdoms',
    body: 'The untold stories of communities living in the world\'s highest inhabited regions.',
    genre: 'Documentary',
    content_type: 'movie',
    duration_min: 25,
    release_year: 2023,
    video_source_url: 'https://videos.pexels.com/video-files/2169880/2169880-uhd_2560_1440_30fps.mp4',
    poster_url: 'https://placehold.co/300x450/2d6a4f/95d5b2?text=Mountain+Kingdoms&font=montserrat',
  },
  {
    title: 'City at Dawn',
    body: 'A visual meditation on urban life in the quiet hours before the world wakes up.',
    genre: 'Documentary',
    content_type: 'short',
    duration_min: 5,
    release_year: 2024,
    video_source_url: 'https://videos.pexels.com/video-files/1826896/1826896-hd_1920_1080_24fps.mp4',
    poster_url: 'https://placehold.co/300x450/1a1a2e/a8dadc?text=City+at+Dawn&font=montserrat',
  },

  // ANIMATION (2)
  {
    title: 'Pixel Dreams',
    body: 'A retro-inspired animated journey through a digital landscape.',
    genre: 'Animation',
    content_type: 'short',
    duration_min: 3,
    release_year: 2024,
    video_source_url: 'https://videos.pexels.com/video-files/5765713/5765713-uhd_2560_1440_24fps.mp4',
    poster_url: 'https://placehold.co/300x450/6c5ce7/a29bfe?text=Pixel+Dreams&font=montserrat',
  },
  {
    title: 'Nature\'s Canvas',
    body: 'An abstract animation inspired by the colors and patterns of the natural world.',
    genre: 'Animation',
    content_type: 'movie',
    duration_min: 10,
    release_year: 2023,
    video_source_url: 'https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_30fps.mp4',
    poster_url: 'https://placehold.co/300x450/00b894/55efc4?text=Nature%27s+Canvas&font=montserrat',
  },
];

// ── Cloudflare Stream: URL-based upload ─────────────────────────────────────

async function uploadToStream(title, videoUrl) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/copy`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_STREAM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: videoUrl,
      meta: { name: title },
      requireSignedURLs: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudflare Stream upload failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  const uid = json.result?.uid;
  if (!uid) throw new Error(`No UID returned from Cloudflare Stream for "${title}"`);
  return uid;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Streamly Demo Content Seeder ===\n');

  // 1. Find admin user
  let adminId;

  if (process.env.ADMIN_USER_ID) {
    adminId = process.env.ADMIN_USER_ID;
    console.log(`Using ADMIN_USER_ID from env: ${adminId}`);
  } else {
    // Try profiles table first
    const { data: adminUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', ADMIN_EMAIL)
      .maybeSingle();

    if (adminUser) {
      adminId = adminUser.id;
      console.log(`Found admin via profiles: ${adminId}`);
    } else {
      // Fallback: call GoTrue admin API directly with service_role JWT
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
        },
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`Auth admin API failed (${res.status}): ${body}`);
        console.error('Tip: set ADMIN_USER_ID=<uuid> in .env to skip user lookup');
        process.exit(1);
      }
      const json = await res.json();
      const users = json.users || json;
      const admin = users.find(u => u.email === ADMIN_EMAIL);
      if (!admin) {
        console.error(`Admin user ${ADMIN_EMAIL} not found in auth.users`);
        console.error('Available users:', users.map(u => u.email).join(', '));
        process.exit(1);
      }
      adminId = admin.id;
      console.log(`Found admin via GoTrue API: ${adminId}`);
    }
  }

  // 2. Create or find "Streamly Official" channel
  const { data: existingChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('name', 'Streamly Official')
    .single();

  let channelId;
  if (existingChannel) {
    channelId = existingChannel.id;
    console.log(`Using existing "Streamly Official" channel: ${channelId}`);
  } else {
    const { data: newChannel, error: chErr } = await supabase
      .from('channels')
      .insert({
        name: 'Streamly Official',
        description: 'Official Streamly curated content - movies, series, shorts, and documentaries.',
        owner_id: adminId,
        is_public: true,
        status: 'active',
        acquisition_source: 'organic',
      })
      .select('id')
      .single();
    if (chErr) { console.error('Failed to create channel:', chErr.message); process.exit(1); }
    channelId = newChannel.id;
    console.log(`Created "Streamly Official" channel: ${channelId}`);

    // Add admin as member
    await supabase.from('channel_members').insert({
      channel_id: channelId,
      user_id: adminId,
      role: 'admin',
    });
  }

  // 3. Seed videos
  console.log(`\nSeeding ${DEMO_CONTENT.length} demo videos...\n`);

  let success = 0;
  let failed = 0;

  for (const item of DEMO_CONTENT) {
    try {
      process.stdout.write(`  [${success + failed + 1}/${DEMO_CONTENT.length}] "${item.title}" ... `);
      const streamUid = await uploadToStream(item.title, item.video_source_url);

      const { error: insertErr } = await supabase.from('channel_posts').insert({
        channel_id: channelId,
        author_id: adminId,
        title: item.title,
        body: item.body,
        content_type: item.content_type,
        genre: item.genre,
        duration_min: item.duration_min,
        release_year: item.release_year,
        video_url: streamUid,
        thumbnail_url: item.poster_url,
        visibility: 'public',
        status: 'approved',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
      });

      if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

      console.log(`OK (stream uid: ${streamUid.slice(0, 8)}...)`);
      success++;
    } catch (err) {
      console.log(`FAILED - ${err.message}`);
      failed++;
    }
  }

  // 4. Summary
  console.log(`\n=== Done ===`);
  console.log(`  Success: ${success}/${DEMO_CONTENT.length}`);
  console.log(`  Failed:  ${failed}/${DEMO_CONTENT.length}`);
  console.log(`  Channel: Streamly Official (${channelId})`);

  if (success > 0) {
    console.log(`\nNext steps:`);
    console.log(`  1. Open the app and pull-to-refresh on the Explore tab`);
    console.log(`  2. You should see genre rows with the seeded content`);
    console.log(`  3. Tapping a card should open the detail modal with a Play button`);
    console.log(`  4. Cloudflare may take 1-5 min to process videos for HLS playback`);
  }

  if (failed > 0) {
    console.log(`\nWARNING: Some videos failed. Common causes:`);
    console.log(`  - Pexels video URL expired or changed`);
    console.log(`  - Cloudflare Stream quota exceeded`);
    console.log(`  - Network timeout`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
