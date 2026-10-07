-- Seed safe content for reviewer cloaking system
-- Public domain and educational content only

INSERT INTO content_safe (id, original_content_id, title, description, thumbnail_url, duration_seconds, category, is_public, created_at, updated_at)
VALUES
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d479'::uuid,
    NULL,
    'Nature Documentary: Mountain Peaks',
    'Educational nature documentary exploring high-altitude ecosystems and wildlife adapted to extreme environments.',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=225',
    3600,
    'nature',
    TRUE,
    NOW(),
    NOW()
  ),
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d480'::uuid,
    NULL,
    'Educational: Physics 101',
    'Introduction to fundamental physics concepts including motion, energy, and forces through animation and real-world examples.',
    'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&h=225',
    2400,
    'education',
    TRUE,
    NOW(),
    NOW()
  ),
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d481'::uuid,
    NULL,
    'Cooking Basics: Soups & Stocks',
    'Learn fundamental cooking techniques for preparing broths, stocks, and classic soups from around the world.',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=225',
    1800,
    'cooking',
    TRUE,
    NOW(),
    NOW()
  ),
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d482'::uuid,
    NULL,
    'Travel Guide: Paris History',
    'Historical tour of Paris covering major landmarks, architecture, and cultural significance from medieval times to today.',
    'https://images.unsplash.com/photo-1510522312345-48e3f8a33944?w=400&h=225',
    2700,
    'travel',
    TRUE,
    NOW(),
    NOW()
  ),
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d483'::uuid,
    NULL,
    'Music: Classical Instruments',
    'Educational exploration of classical orchestral instruments, their history, sound characteristics, and role in symphonic music.',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=225',
    2100,
    'music',
    TRUE,
    NOW(),
    NOW()
  ),
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d484'::uuid,
    NULL,
    'Art History: Renaissance Masters',
    'Survey of Renaissance art and the great masters including Leonardo da Vinci, Michelangelo, and Raphael.',
    'https://images.unsplash.com/photo-1579783902614-e3fb5141b0cb?w=400&h=225',
    2400,
    'art',
    TRUE,
    NOW(),
    NOW()
  ),
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d485'::uuid,
    NULL,
    'History: Ancient Civilizations',
    'Comprehensive look at early human civilizations including Egypt, Mesopotamia, Indus Valley, and ancient China.',
    'https://images.unsplash.com/photo-1575921920978-b3e5d359f00d?w=400&h=225',
    3000,
    'history',
    TRUE,
    NOW(),
    NOW()
  ),
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d486'::uuid,
    NULL,
    'Fitness: Beginner Yoga',
    'Gentle introduction to yoga including basic poses, breathing techniques, and mindfulness for all fitness levels.',
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&h=225',
    1500,
    'fitness',
    TRUE,
    NOW(),
    NOW()
  );
