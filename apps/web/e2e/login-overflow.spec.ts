import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'desktop 1920', width: 1920, height: 1080 },
  { name: 'laptop 1366', width: 1366, height: 768 },
  { name: 'tablet 1024', width: 1024, height: 768 },
  { name: 'mobile 390', width: 390, height: 844 }
];

for (const viewport of viewports) {
  test(`login page has no horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    await expect(page.locator('.login')).toBeVisible();
    await expect(page.locator('.login-card')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Presensi sekolah lebih rapi dalam satu sistem/i })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const clippedOrOverflowing = await page.evaluate(() => {
      const selectors = ['.login', '.login-left', '.login-left-content', '.login-hero', '.login-hero h1', '.login-right', '.login-card'];
      return selectors
        .map((selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return {
            selector,
            left: rect.left,
            right: rect.right,
            scrollOverflow: Math.max(0, element.scrollWidth - element.clientWidth)
          };
        })
        .filter(Boolean)
        .filter((item) => item!.left < -1 || item!.right > window.innerWidth + 1 || item!.scrollOverflow > 1);
    });
    expect(clippedOrOverflowing).toEqual([]);
  });
}
