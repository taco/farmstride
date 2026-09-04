import { test, expect } from '@playwright/test';
import {
    TEST_RIDER_EMAIL,
    TEST_RIDER_PASSWORD,
    TEST_SIGNUP_INVITE_CODE,
} from '@/seedConstants';
import { createTestBarn } from '@/utils/testBarn';

// Auth tests need a clean browser state — they test the login/signup flows directly
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
    test('login page title is FarmStride', async ({ page }) => {
        await page.goto('/login');

        await expect(page).toHaveTitle('FarmStride');
    });

    test('can log in with valid credentials', async ({ page }) => {
        await page.goto('/login');

        // Fill in login form
        await page.fill('input[id="email"]', TEST_RIDER_EMAIL);
        await page.fill('input[id="password"]', TEST_RIDER_PASSWORD);

        // Submit form
        await page.click('button[type="submit"]');

        // Should redirect to dashboard
        await page.waitForURL('/');
        await expect(page).toHaveURL('/');
    });

    test('shows error for invalid credentials', async ({ page }) => {
        await page.goto('/login');

        // Fill in login form with wrong password
        await page.fill('input[id="email"]', TEST_RIDER_EMAIL);
        await page.fill('input[id="password"]', 'wrongpassword');

        // Submit form
        await page.click('button[type="submit"]');

        // Should show error message
        await expect(
            page.locator('text=Invalid email or password')
        ).toBeVisible();

        // Should still be on login page
        await expect(page).toHaveURL('/login');
    });

    test.describe('Signup', () => {
        let cleanup: () => Promise<void> = async () => {};

        test.beforeAll(async () => {
            const barn = await createTestBarn(TEST_SIGNUP_INVITE_CODE);
            cleanup = barn.cleanup;
        });

        test.afterAll(async () => {
            await cleanup();
        });

        test('shows error for duplicate email on signup', async ({ page }) => {
            await page.goto('/signup');

            // Try to sign up with existing email
            await page.fill('input[id="name"]', 'Another User');
            await page.fill('input[id="email"]', TEST_RIDER_EMAIL);
            await page.fill('input[id="password"]', TEST_RIDER_PASSWORD);
            await page.fill('input[id="inviteCode"]', TEST_SIGNUP_INVITE_CODE);

            // Submit form
            await page.click('button[type="submit"]');

            // Should show error message
            await expect(
                page.locator('text=Email already in use')
            ).toBeVisible();

            // Should still be on signup page
            await expect(page).toHaveURL('/signup');
        });
    });
});
