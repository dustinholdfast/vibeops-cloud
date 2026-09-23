import type { MetadataRoute } from 'next';
import { CANONICAL_PUBLIC_ORIGIN } from '@/src/lib/public-url';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ['', '/pricing', '/privacy', '/terms', '/sign-up'].map((path) => ({
    url: `${CANONICAL_PUBLIC_ORIGIN}${path || '/'}`,
    lastModified,
  }));
}
