import { describe, expect, it } from 'vitest';
import { exports } from 'cloudflare:workers';

const origin = 'https://party.example';

async function page(path: string) {
  const response = await exports.default.fetch(`${origin}${path}`);
  expect(response.status).toBe(200);
  return response.text();
}

describe('wedding branding', () => {
  it('uses Michael and Marisa wedding RSVP naming on guest and organizer pages', async () => {
    for (const path of ['/', '/edit', '/admin']) {
      const html = await page(path);
      expect(html).toContain("Michael and Marisa's Wedding RSVP");
    }
  });

  it('includes both approved engagement photos on the RSVP landing page', async () => {
    const html = await page('/');
    expect(html).toContain('/images/michael-marisa-ring.webp');
    expect(html).toContain('/images/michael-marisa-couple.webp');
  });
});
