-- Seed 10 short posts for the Shorts row in Explore.
-- Uses sample video URLs from public test sources.
-- All inserted into the first active public channel found.

DO $$
DECLARE
  target_channel_id uuid;
  admin_user_id uuid;
BEGIN
  -- Find first active public channel
  SELECT id INTO target_channel_id
  FROM channels
  WHERE status = 'active' AND is_public = true
  LIMIT 1;

  -- Find admin user
  SELECT id INTO admin_user_id
  FROM profiles
  WHERE is_admin = true
  LIMIT 1;

  -- Skip if no channel or admin found
  IF target_channel_id IS NULL OR admin_user_id IS NULL THEN
    RAISE NOTICE 'No active public channel or admin found, skipping seed';
    RETURN;
  END IF;

  INSERT INTO channel_posts (channel_id, author_id, title, content_type, is_short, status, video_url, thumbnail_url, duration_min, created_at)
  VALUES
    (target_channel_id, admin_user_id, 'Quick Tips: Better Lighting', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 'https://picsum.photos/seed/short1/400/720', 1, now() - interval '1 day'),
    (target_channel_id, admin_user_id, 'Behind the Scenes', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 'https://picsum.photos/seed/short2/400/720', 1, now() - interval '2 days'),
    (target_channel_id, admin_user_id, 'Day in the Life', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', 'https://picsum.photos/seed/short3/400/720', 1, now() - interval '3 days'),
    (target_channel_id, admin_user_id, 'Street Food Adventures', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', 'https://picsum.photos/seed/short4/400/720', 1, now() - interval '4 days'),
    (target_channel_id, admin_user_id, 'Sunset Timelapse', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', 'https://picsum.photos/seed/short5/400/720', 1, now() - interval '5 days'),
    (target_channel_id, admin_user_id, 'Guitar Riff of the Day', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', 'https://picsum.photos/seed/short6/400/720', 1, now() - interval '6 days'),
    (target_channel_id, admin_user_id, 'Morning Routine', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', 'https://picsum.photos/seed/short7/400/720', 1, now() - interval '7 days'),
    (target_channel_id, admin_user_id, 'Coding Challenge', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', 'https://picsum.photos/seed/short8/400/720', 1, now() - interval '8 days'),
    (target_channel_id, admin_user_id, 'Travel Vlog: Tokyo', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4', 'https://picsum.photos/seed/short9/400/720', 1, now() - interval '9 days'),
    (target_channel_id, admin_user_id, 'Recipe in 60 Seconds', 'short', true, 'approved', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', 'https://picsum.photos/seed/short10/400/720', 1, now() - interval '10 days');
END $$;

NOTIFY pgrst, 'reload schema';
