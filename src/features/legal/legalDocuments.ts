import { config } from '@/lib/config';

// Every legal document has one source of truth: the hosted page (supabase/functions/legal-pages),
// which is also what Play Console links to. The app opens it rather than keeping its own copy, so
// the two can never differ.

export type LegalDocumentId =
  'privacy' | 'terms' | 'community-guidelines' | 'refund-policy' | 'copyright';

export type LegalDocument = {
  title: string;
  url: string;
  /** Shown when the build has no URL for it. */
  missingMessage: string;
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    url: config.privacyPolicyUrl,
    missingMessage: "The Privacy Policy isn't configured yet. Contact support for a copy.",
  },
  terms: {
    title: 'Terms of Service',
    url: config.termsUrl,
    missingMessage: "The Terms of Service aren't configured yet. Contact support for a copy.",
  },
  'community-guidelines': {
    title: 'Community Guidelines',
    url: config.communityGuidelinesUrl,
    missingMessage: "The Community Guidelines aren't configured yet. Contact support for a copy.",
  },
  'refund-policy': {
    title: 'Refund Policy',
    url: config.refundPolicyUrl,
    missingMessage: "The Refund Policy isn't configured yet. Contact support for a copy.",
  },
  copyright: {
    title: 'Copyright & IP Policy',
    url: config.copyrightPolicyUrl,
    missingMessage: "The Copyright & IP Policy isn't configured yet. Contact support for a copy.",
  },
};
