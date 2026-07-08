import { test, expect } from '@playwright/test';

const SUPER_PHONE = '256700000000';
const SUPER_PIN = '1234';

const MANUAL_20_DAY_CURRICULUM = {
  name: '20-Day Manual Driving Curriculum',
  transmission_type: 'manual',
  description: 'Comprehensive 20-day manual transmission driving curriculum covering controls, traffic navigation, manoeuvres, and test preparation.',
  total_days: 20,
  total_weeks: 4,
  items: [
    { day_number: 1, week_number: 1, title: 'Introduction to Vehicle Controls', lesson_objectives: ['Learn cockpit drill, seat adjustment, steering wheel grip, mirror positioning'], practical_objectives: ['Adjust seat and mirrors, identify all pedals and controls, practice steering'], order: 1 },
    { day_number: 2, week_number: 1, title: 'Moving Off and Stopping', lesson_objectives: ['Master clutch control, bite point, moving off smoothly and stopping safely'], practical_objectives: ['Move off on level ground, stop at designated point, practice clutch control'], order: 2 },
    { day_number: 3, week_number: 1, title: 'Gear Changes and Steering', lesson_objectives: ['Understand gear patterns, smooth upshifts and downshifts, proper steering technique'], practical_objectives: ['Practice gear changes at different speeds, maintain steering control during gear changes'], order: 3 },
    { day_number: 4, week_number: 1, title: 'Emerging at Junctions', lesson_objectives: ['Learn junction types, emerging safely, observation priorities'], practical_objectives: ['Emerge at T-junctions and crossroads, proper observation routine'], order: 4 },
    { day_number: 5, week_number: 1, title: 'Turning Left and Right', lesson_objectives: ['Positioning for left and right turns, speed control, mirror-signal-manoeuvre routine'], practical_objectives: ['Execute left and right turns at junctions with proper positioning and observation'], order: 5 },
    { day_number: 6, week_number: 2, title: 'Meeting and Crossing Traffic', lesson_objectives: ['Handle oncoming traffic, narrow roads, give way rules'], practical_objectives: ['Practice meeting situations, crossing traffic at junctions'], order: 6 },
    { day_number: 7, week_number: 2, title: 'Roundabouts', lesson_objectives: ['Understand roundabout lanes, exit positioning, give way rules'], practical_objectives: ['Navigate single and multi-lane roundabouts, correct lane discipline'], order: 7 },
    { day_number: 8, week_number: 2, title: 'Pedestrian Crossings', lesson_objectives: ['Identify crossing types (zebra, pelican, puffin), stopping procedure'], practical_objectives: ['Approach and stop at various pedestrian crossings safely'], order: 8 },
    { day_number: 9, week_number: 2, title: 'Traffic Lights and Signs', lesson_objectives: ['Read traffic lights, road signs, and road markings'], practical_objectives: ['React to traffic light changes, follow directional signs and markings'], order: 9 },
    { day_number: 10, week_number: 2, title: 'Overtaking and Lane Discipline', lesson_objectives: ['Safe overtaking procedure, lane selection, blind spot checks'], practical_objectives: ['Overtake parked vehicles and slower traffic on different road types'], order: 10 },
    { day_number: 11, week_number: 3, title: 'Reverse Around a Corner', lesson_objectives: ['Reverse manoeuvre technique, clutch control in reverse, observation'], practical_objectives: ['Execute reverse around a left corner with control and accuracy'], order: 11 },
    { day_number: 12, week_number: 3, title: 'Parallel Parking', lesson_objectives: ['Parallel parking technique, reference points, spatial awareness'], practical_objectives: ['Park parallel to the kerb between two vehicles'], order: 12 },
    { day_number: 13, week_number: 3, title: 'Bay Parking', lesson_objectives: ['Forward and reverse bay parking, angle approach, correction techniques'], practical_objectives: ['Park in a marked bay both forward and reverse'], order: 13 },
    { day_number: 14, week_number: 3, title: 'Turn in the Road (Three-Point Turn)', lesson_objectives: ['Three-point turn technique, full lock steering, observation'], practical_objectives: ['Complete a three-point turn on a narrow road safely'], order: 14 },
    { day_number: 15, week_number: 3, title: 'Emergency Stop', lesson_objectives: ['Emergency braking technique, clutch control, maintaining control'], practical_objectives: ['Perform emergency stop from different speeds with proper procedure'], order: 15 },
    { day_number: 16, week_number: 4, title: 'Dual Carriageways', lesson_objectives: ['Joining, driving on, and exiting dual carriageways, speed management'], practical_objectives: ['Merge onto dual carriageway, maintain lane discipline, exit safely'], order: 16 },
    { day_number: 17, week_number: 4, title: 'Country Roads and Hills', lesson_objectives: ['Narrow road handling, hill starts, blind bends, country road hazards'], practical_objectives: ['Hill start using handbrake, navigate narrow country roads'], order: 17 },
    { day_number: 18, week_number: 4, title: 'Independent Driving', lesson_objectives: ['Follow road signs and verbal directions independently'], practical_objectives: ['Drive 10-15 minutes following directions with minimal prompts'], order: 18 },
    { day_number: 19, week_number: 4, title: 'Mock Test', lesson_objectives: ['Simulate full driving test conditions including all manoeuvres'], practical_objectives: ['Complete a full mock test with all assessed elements'], order: 19 },
    { day_number: 20, week_number: 4, title: 'Test Preparation and Final Review', lesson_objectives: ['Review weak areas, final tips, test procedure overview'], practical_objectives: ['Practice identified weak areas, review test day procedures'], order: 20 },
  ],
};

test.describe('Lesson Plan Templates', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('#phone', SUPER_PHONE);
    await page.fill('input[type="password"]', SUPER_PIN);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  test('sidebar has Lesson Plans link and page loads', async ({ page }) => {
    await page.goto('/lesson-plans');
    await expect(page).toHaveURL(/\/lesson-plans/, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Lesson Plan Templates');
  });

  test('creates 20-day manual driving curriculum via API and verifies on page', async ({ page }) => {
    const token = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '256700000000', pin: '1234' }),
      });
      return (await res.json()).access_token;
    });

    const created = await page.evaluate(async ({ token, curriculum }) => {
      const res = await fetch('/api/v1/lesson-plan-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(curriculum),
      });
      return res.json();
    }, { token, curriculum: MANUAL_20_DAY_CURRICULUM });

    expect(created.id).toBeDefined();
    expect(created.name).toBe(MANUAL_20_DAY_CURRICULUM.name);
    expect(created.lesson_items.length).toBe(20);

    await page.goto('/lesson-plans');
    await page.waitForTimeout(1000);

    await expect(page.locator(`h2:has-text("${MANUAL_20_DAY_CURRICULUM.name}")`).first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=20 lessons').first()).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Manual').first()).toBeVisible({ timeout: 3000 });

    // Clean up
    await page.evaluate(async ({ token, id }) => {
      await fetch(`/api/v1/lesson-plan-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }, { token, id: created.id });
  });

  test('closes New Template dialog with Escape', async ({ page }) => {
    await page.goto('/lesson-plans');
    await page.waitForTimeout(500);

    await page.click('button:has-text("New Template")');
    await page.waitForTimeout(500);

    await expect(page.locator('.p-dialog-header')).toContainText('New Template', { timeout: 5000 });

    // Focus inside dialog then press Escape to close
    await page.locator('.p-dialog-content').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await expect(page.locator('.p-dialog-header')).toHaveCount(0, { timeout: 5000 });
  });

  test('deletes a template via UI', async ({ page }) => {
    // Create via API
    const token = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '256700000000', pin: '1234' }),
      });
      return (await res.json()).access_token;
    });

    const templateName = `Test Template ${Date.now()}`;
    await page.evaluate(async ({ token, name }) => {
      await fetch('/api/v1/lesson-plan-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, transmission_type: 'manual', total_days: 5, total_weeks: 1, items: [{ day_number: 1, week_number: 1, title: 'Test Lesson', order: 1 }] }),
      });
    }, { token, name: templateName });

    await page.goto('/lesson-plans');
    await page.waitForTimeout(1000);

    // Find card by h2 text and traverse up to the card
    const card = page.locator(`h2:has-text("${templateName}")`).locator('..').locator('..').locator('..');
    await expect(card).toBeVisible({ timeout: 5000 });

    // Find the delete button (danger button with trash icon) inside this card
    const trashBtn = card.locator('button.p-button-danger');
    await expect(trashBtn).toBeVisible({ timeout: 3000 });
    await trashBtn.click();
    await page.waitForTimeout(500);

    // The confirm dialog should be visible - find the accept button by text
    await expect(page.getByRole('button', { name: /yes/i })).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: /yes/i }).click();
    await page.waitForTimeout(1500);

    await expect(page.locator(`text=${templateName}`)).toHaveCount(0, { timeout: 5000 });
  });
});
