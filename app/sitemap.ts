import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{
    url: 'https://jack-dee-website-audit.vercel.app',
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 1,
  }];
}
