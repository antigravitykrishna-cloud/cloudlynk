-- Migration v14: Replace placehold.co thumbnails with picsum.photos
-- Affects only the 7 seeded posts in "Streamly Official" channel from today's seed run.
-- picsum.photos serves real photos from CDN with deterministic seed per title.

UPDATE channel_posts
SET thumbnail_url = 'https://picsum.photos/seed/' || replace(title, ' ', '+') || '/300/450'
WHERE channel_id = '7f9500ac-b73c-4892-88cc-87643c935683'
  AND created_at > '2026-06-12';
