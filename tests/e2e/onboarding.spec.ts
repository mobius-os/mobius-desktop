import { expect, test } from '@playwright/test';

test('hosted is the clear recommended first path', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Where should your Möbius live?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create a hosted Möbius/ })).toContainText('Recommended');
  await expect(page.getByRole('button', { name: /Run locally with Docker/ })).toContainText('not a persistent home');
});

test('hosted creation explains the secure browser handoff', async ({ page }) => {
  await page.goto('/?scenario=hosted');
  await expect(page.getByRole('heading', { name: 'Create your hosted Möbius' })).toBeVisible();
  await expect(page.getByText(/never asks for your password/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue at mobius.you/ })).toBeVisible();
});

test('local setup keeps the persistence warning and folder authority visible', async ({ page }) => {
  await page.goto('/?scenario=local');
  await expect(page.getByRole('heading', { name: 'Run Möbius on this computer' })).toBeVisible();
  await expect(page.getByText('Local mode is not a persistent home for your agent.')).toBeVisible();
  await expect(page.getByText('/Users/you/Projects')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read & edit' })).toHaveClass(/is-active/);
  await page.getByText('Where the agent sees these folders').click();
  await expect(page.getByText('/data/shared/desktop/projects-preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read & edit' })).toHaveAttribute('aria-pressed', 'true');
});

test('local Docker recovery matches the detected state', async ({ page }) => {
  await page.goto('/?scenario=local&docker=stopped');
  await expect(page.getByText('Docker is installed, but its engine is not running.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Get Docker/ })).toHaveCount(0);

  await page.goto('/?scenario=local&docker=missing');
  await expect(page.getByRole('button', { name: /Get Docker/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
});

test('a failed local browser handoff reports beside the action on compact screens', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto('/?scenario=local&external=fail');
  await page.getByRole('button', { name: /Choose hosted instead/ }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Your browser did not open');
  const box = await alert.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 901) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
});

test('saved deployments remain distinct and local status is honest', async ({ page }) => {
  await page.goto('/?scenario=home');
  await expect(page.getByRole('heading', { name: 'Open your Möbius' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My Möbius' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local Möbius' })).toBeVisible();
  await expect(page.getByText('Running')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open My Möbius in browser' })).toBeVisible();
});
