import {test,expect} from '@playwright/test';
test('student classroom uses the server day even when earlier weeks are hidden',async({page})=>{
 await page.goto('/classroom-questions-test?cumulative=1');
 await expect(page.locator('.lesson-header')).toContainText('DAY 6');
 await expect(page.locator('.learning-nav')).toContainText('DAY 7');
 await expect(page.locator('.learning-nav')).not.toContainText('DAY 1');
});
