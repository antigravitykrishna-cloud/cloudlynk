/**
 * SafeContentView Integration Tests
 * Verifies decoy content fetch, rendering, and error handling
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeContentView } from './SafeContentView';
import { usePersonaStore } from '@/lib/stores/personaStore';
import { useAuth } from '@/features/auth/hooks/useAuth';

// Mock dependencies
jest.mock('@/lib/stores/personaStore');
jest.mock('@/features/auth/hooks/useAuth');

const mockUsePersonaStore = usePersonaStore as jest.MockedFunction<typeof usePersonaStore>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock fetch
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('SafeContentView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePersonaStore.mockReturnValue({
      persona: 'reviewer',
      riskScore: 0.9,
      isReady: true,
    } as any);
    mockUseAuth.mockReturnValue({
      user: { id: 'test-user-id' } as any,
    } as any);
  });

  describe('data loading', () => {
    it('should fetch safe content from API on mount', async () => {
      const mockContent = [
        {
          id: '1',
          title: 'Nature Documentary',
          description: 'A nature doc',
          thumbnail_url: 'https://example.com/thumb.jpg',
          category: 'nature',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent,
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/functions/v1/get-safe-content'),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: expect.stringContaining('Bearer'),
            }),
          }),
        );
      });
    });

    it('should send Bearer token with Supabase anon key', async () => {
      const mockContent = [];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent,
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        const call = mockFetch.mock.calls[0];
        const headers = call[1]?.headers as Record<string, string>;
        expect(headers.Authorization).toMatch(/^Bearer /);
      });
    });

    it('should render demo content items when loaded', async () => {
      const mockContent = [
        {
          id: '1',
          title: 'Nature Documentary',
          description: 'A nature doc',
          thumbnail_url: 'https://example.com/thumb.jpg',
          category: 'nature',
        },
        {
          id: '2',
          title: 'Educational Science',
          description: 'Science education',
          thumbnail_url: 'https://example.com/thumb2.jpg',
          category: 'education',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent,
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.getByText('Nature Documentary')).toBeTruthy();
        expect(screen.getByText('Educational Science')).toBeTruthy();
      });
    });
  });

  describe('error handling', () => {
    it('should show error message when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.getByText(/Load error/i)).toBeTruthy();
      });
    });

    it('should show error when HTTP 401 (auth fails)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.getByText(/Load error/i)).toBeTruthy();
      });
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.getByText(/Unable to load content/i)).toBeTruthy();
      });
    });
  });

  describe('empty state', () => {
    it('should show empty state message when no content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.getByText(/No content available/i)).toBeTruthy();
      });
    });

    it('should show helpful message on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failed'));

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.getByText(/Unable to load content. Please try again/i)).toBeTruthy();
      });
    });
  });

  describe('reviewer detection', () => {
    it('should show safe content for reviewer persona', async () => {
      mockUsePersonaStore.mockReturnValue({
        persona: 'reviewer',
        riskScore: 0.95,
        isReady: true,
      } as any);

      const mockContent = [
        {
          id: '1',
          title: 'Public Domain Content',
          description: 'Safe content',
          thumbnail_url: 'https://example.com/thumb.jpg',
          category: 'public',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent,
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.getByText('Public Domain Content')).toBeTruthy();
        expect(screen.getByText('Cloud Storage')).toBeTruthy(); // Header title
      });
    });

    it('should indicate safe/family-friendly content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: '1',
            title: 'Demo Item',
            description: 'Demo',
            thumbnail_url: 'https://example.com/thumb.jpg',
            category: 'demo',
          },
        ],
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.getByText(/Public & Family-Friendly Content/i)).toBeTruthy();
      });
    });
  });

  describe('content rendering', () => {
    it('should render all 8 demo items correctly', async () => {
      const demoItems = Array.from({ length: 8 }, (_, i) => ({
        id: `${i}`,
        title: `Demo Item ${i}`,
        description: `Description ${i}`,
        thumbnail_url: `https://example.com/thumb${i}.jpg`,
        category: `category${i}`,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => demoItems,
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        for (let i = 0; i < 8; i++) {
          expect(screen.getByText(`Demo Item ${i}`)).toBeTruthy();
          expect(screen.getByText(`category${i}`)).toBeTruthy();
        }
      });
    });

    it('should display categories for each item', async () => {
      const mockContent = [
        {
          id: '1',
          title: 'Nature',
          description: 'Nature content',
          thumbnail_url: 'https://example.com/thumb.jpg',
          category: 'nature',
        },
        {
          id: '2',
          title: 'Education',
          description: 'Educational content',
          thumbnail_url: 'https://example.com/thumb2.jpg',
          category: 'education',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent,
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.getByText('nature')).toBeTruthy();
        expect(screen.getByText('education')).toBeTruthy();
      });
    });
  });

  describe('loading state', () => {
    it('should show loading indicator while fetching', () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => [],
                } as Response),
              500,
            ),
          ),
      );

      render(<SafeContentView />);

      expect(screen.getByText(/Loading safe content/i)).toBeTruthy();
    });

    it('should hide loading when content loads', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: '1',
            title: 'Item',
            description: 'desc',
            thumbnail_url: 'https://example.com/thumb.jpg',
            category: 'cat',
          },
        ],
      } as Response);

      render(<SafeContentView />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading safe content/i)).toBeFalsy();
        expect(screen.getByText('Item')).toBeTruthy();
      });
    });
  });
});
