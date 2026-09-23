import type { MetadataRoute } from 'next';
import { CANONICAL_PUBLIC_ORIGIN } from '@/src/lib/public-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/uptime', '/api/', '/invite/'],
    },
    sitemap: `${CANONICAL_PUBLIC_ORIGIN}/sitemap.xml`,
    host: CANONICAL_PUBLIC_ORIGIN,
  };
}
