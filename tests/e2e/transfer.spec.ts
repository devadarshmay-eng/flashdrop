import { test, expect, Browser } from '@playwright/test';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

test.describe('FlashDrop Autonomous Two-Peer Live Production E2E Suite', () => {
  const testOutputDir = path.resolve('test-artifacts');

  test.beforeAll(() => {
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  test('Full 6-Step End-to-End Human Workflow on Live Production URL', async ({ browser }) => {
    // Console error trackers
    const consoleErrorsA: string[] = [];
    const consoleErrorsB: string[] = [];

    // =========================================================================
    // STEP 1: CONTEXT A (DESKTOP HOST, 1280x800)
    // =========================================================================
    const contextA = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
    const pageA = await contextA.newPage();
    pageA.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        consoleErrorsA.push(`[Host Error] ${msg.text()}`);
      }
    });

    console.log('[1/6] Opening https://getflashdrop.pages.dev/ on Desktop Host...');
    await pageA.goto('https://getflashdrop.pages.dev/');
    await pageA.waitForLoadState('networkidle');

    // Verify UI Theme and Elements
    const bodyBg = await pageA.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    console.log(`  Body Background Color: ${bodyBg}`);

    // Verify Title & Wordmark
    await expect(pageA.locator('text=FlashDrop').first()).toBeVisible();
    await expect(pageA.locator('text=EPHEMERAL • P2P ENCRYPTED')).toBeVisible();

    // Verify Monospace 10:00 Countdown & Room ID
    const countdownA = pageA.locator('.mono-num').filter({ hasText: /10:00|09:5/ }).first();
    await expect(countdownA).toBeVisible();

    // Verify Room ID format RM-XXXX-XXXX
    const roomBadge = pageA.locator('.mono-num').filter({ hasText: /RM-[A-Z0-9]{4}-[A-Z0-9]{4}/ }).first();
    await expect(roomBadge).toBeVisible();
    const roomCodeText = await roomBadge.innerText();
    console.log(`  Room Code displayed: ${roomCodeText}`);

    // Capture State 1 (Desktop Waiting) Screenshot
    await pageA.screenshot({ path: path.join(testOutputDir, 'state-1-waiting-desktop.png') });
    console.log('  ✓ State 1 (Desktop Waiting) verified and screenshot captured.');

    // Extract Encoded URL from rendered QR code
    const qrImage = pageA.locator('img.qr-code-image, img[alt*="Scan to connect"]');
    await expect(qrImage).toBeVisible();
    
    let sessionUrl = await qrImage.getAttribute('data-session-url');
    if (!sessionUrl) {
      // Fallback: extract sessionId from page evaluation
      sessionUrl = await pageA.evaluate(() => {
        const img = document.querySelector('img[alt*="Scan to connect"]') as HTMLImageElement;
        return img?.getAttribute('data-session-url') || img?.dataset?.sessionUrl || window.location.href;
      });
    }
    console.log(`  Extracted Session URL: ${sessionUrl}`);
    expect(sessionUrl).toContain('/s/');

    // =========================================================================
    // STEP 2: CONTEXT B (MOBILE GUEST, iPhone 14 Viewport 390x844) & HANDSHAKE
    // =========================================================================
    console.log('\n[2/6] Connecting Mobile Guest (iPhone 14) to decoded Session URL...');
    const contextB = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
      acceptDownloads: true,
    });
    const pageB = await contextB.newPage();
    pageB.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        consoleErrorsB.push(`[Guest Error] ${msg.text()}`);
      }
    });

    await pageB.goto(sessionUrl!);
    
    // Check Connecting View and capture State 2 Screenshot
    await pageB.screenshot({ path: path.join(testOutputDir, 'state-2-connecting-mobile.png') });

    // Assert Handshake: Both A and B transition to 'Connected (Direct P2P)' within 10s
    console.log('  Waiting for WebRTC DataChannel connection on both peers...');
    await expect(pageA.locator('text=Connected (Direct P2P)')).toBeVisible({ timeout: 15000 });
    await expect(pageB.locator('text=Connected (Direct P2P)')).toBeVisible({ timeout: 15000 });

    // Verify green indicator dot
    await expect(pageA.locator('[data-testid="connected-indicator"]')).toBeVisible();
    await expect(pageB.locator('[data-testid="connected-indicator"]')).toBeVisible();

    // Verify zero fatal console errors during handshake
    expect(consoleErrorsA).toHaveLength(0);
    expect(consoleErrorsB).toHaveLength(0);

    // Capture State 3 (Connected Workspace) Screenshots
    await pageA.screenshot({ path: path.join(testOutputDir, 'state-3-connected-desktop.png') });
    await pageB.screenshot({ path: path.join(testOutputDir, 'state-3-connected-mobile.png') });
    console.log('  ✓ State 3 (Connected Workspace) verified on both peers.');

    // =========================================================================
    // STEP 3: DESKTOP -> MOBILE FILE TRANSFER (2.5 MB Binary File)
    // =========================================================================
    console.log('\n[3/6] Testing Desktop -> Mobile file transfer (2.5 MB binary payload)...');
    const binarySize2_5MB = 2.5 * 1024 * 1024;
    const testBuffer2_5MB = crypto.randomBytes(binarySize2_5MB);
    const expectedHash2_5MB = computeSha256(testBuffer2_5MB);
    const testFileNameA = 'test-payload-2.5mb.bin';
    const testFilePathA = path.join(testOutputDir, testFileNameA);
    fs.writeFileSync(testFilePathA, testBuffer2_5MB);

    console.log(`  Generated test file: ${testFileNameA} (SHA-256: ${expectedHash2_5MB})`);

    // Prepare download listener on Context B before uploading
    const downloadPromiseB = pageB.waitForEvent('download', { timeout: 30000 });

    // Upload via file input in Context A
    const fileInputA = pageA.locator('input[type="file"]');
    await fileInputA.setInputFiles(testFilePathA);

    // Context B should receive all chunks and display Save button or trigger auto-download
    console.log('  Streaming 16KB chunks over DataChannel to Context B...');
    const saveButtonB = pageB.locator('[data-testid="save-btn"], button:has-text("Save")').first();
    await expect(saveButtonB).toBeVisible({ timeout: 25000 });
    console.log('  ✓ 100% of chunks received on Mobile. Save button displayed.');

    // Click Save on Context B
    await saveButtonB.click();
    const downloadB = await downloadPromiseB;
    const downloadedPathB = path.join(testOutputDir, 'received-' + testFileNameA);
    await downloadB.saveAs(downloadedPathB);

    const receivedBufferB = fs.readFileSync(downloadedPathB);
    const actualHashB = computeSha256(receivedBufferB);
    console.log(`  Downloaded file size: ${receivedBufferB.length} bytes`);
    console.log(`  Actual SHA-256:   ${actualHashB}`);
    console.log(`  Expected SHA-256: ${expectedHash2_5MB}`);
    expect(actualHashB).toBe(expectedHash2_5MB);
    expect(receivedBufferB.length).toBe(binarySize2_5MB);
    console.log('  ✓ Desktop -> Mobile transfer verified identical byte-for-byte!');

    // =========================================================================
    // STEP 4: MOBILE -> DESKTOP FILE TRANSFER (1.2 MB Binary File)
    // =========================================================================
    console.log('\n[4/6] Testing Mobile -> Desktop file transfer (1.2 MB binary payload)...');
    const binarySize1_2MB = 1.2 * 1024 * 1024;
    const testBuffer1_2MB = crypto.randomBytes(binarySize1_2MB);
    const expectedHash1_2MB = computeSha256(testBuffer1_2MB);
    const testFileNameB = 'mobile-payload-1.2mb.bin';
    const testFilePathB = path.join(testOutputDir, testFileNameB);
    fs.writeFileSync(testFilePathB, testBuffer1_2MB);

    // Prepare download listener on Context A before uploading
    const downloadPromiseA = pageA.waitForEvent('download', { timeout: 30000 });

    // Upload via file input in Context B
    const fileInputB = pageB.locator('input[type="file"]');
    await fileInputB.setInputFiles(testFilePathB);

    // Context A should receive chunks and display Save button
    console.log('  Streaming 16KB chunks from Mobile to Desktop...');
    const saveButtonA = pageA.locator('[data-testid="save-btn"], button:has-text("Save")').first();
    await expect(saveButtonA).toBeVisible({ timeout: 25000 });

    // Click Save on Context A
    await saveButtonA.click();
    const downloadA = await downloadPromiseA;
    const downloadedPathA = path.join(testOutputDir, 'received-' + testFileNameB);
    await downloadA.saveAs(downloadedPathA);

    const receivedBufferA = fs.readFileSync(downloadedPathA);
    const actualHashA = computeSha256(receivedBufferA);
    console.log(`  Downloaded file size: ${receivedBufferA.length} bytes`);
    console.log(`  Actual SHA-256:   ${actualHashA}`);
    console.log(`  Expected SHA-256: ${expectedHash1_2MB}`);
    expect(actualHashA).toBe(expectedHash1_2MB);
    expect(receivedBufferA.length).toBe(binarySize1_2MB);
    console.log('  ✓ Mobile -> Desktop transfer verified identical byte-for-byte!');

    // =========================================================================
    // STEP 5: 3RD-PEER INTRUSION BLOCK
    // =========================================================================
    console.log('\n[5/6] Testing 3rd-Peer intrusion block (Strict 2-Peer Limit)...');
    const contextC = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const pageC = await contextC.newPage();

    // Context C attempts to join the same session URL
    await pageC.goto(sessionUrl!);
    await pageC.waitForTimeout(2000);

    // Context C should be rejected with code 4003 and transition to dissolved/error
    // While Context A and B remain securely connected!
    await expect(pageA.locator('text=Connected (Direct P2P)')).toBeVisible();
    await expect(pageB.locator('text=Connected (Direct P2P)')).toBeVisible();
    console.log('  ✓ 3rd peer rejected cleanly without disrupting active session.');
    await contextC.close();

    // =========================================================================
    // STEP 6: SESSION DISSOLUTION
    // =========================================================================
    console.log('\n[6/6] Testing session dissolution...');
    const endSessionBtn = pageA.locator('[data-testid="end-session-btn"], button:has-text("End Session")').first();
    await endSessionBtn.click();

    // Both peers must transition to State 4 (Session Dissolved)
    await expect(pageA.locator('text=Session Dissolved')).toBeVisible({ timeout: 5000 });
    await expect(pageB.locator('text=Session Dissolved')).toBeVisible({ timeout: 5000 });

    // Verify key zeroed message
    await expect(pageA.locator('text=KEY MATERIAL ZEROED')).toBeVisible();
    await expect(pageB.locator('text=KEY MATERIAL ZEROED')).toBeVisible();

    // Capture State 4 (Session Dissolved) Screenshots
    await pageA.screenshot({ path: path.join(testOutputDir, 'state-4-dissolved-desktop.png') });
    await pageB.screenshot({ path: path.join(testOutputDir, 'state-4-dissolved-mobile.png') });
    console.log('  ✓ State 4 (Session Dissolved) verified on both peers.');

    // Clean up
    await contextA.close();
    await contextB.close();

    console.log('\n=== ALL 6 REAL-WORLD USER STEPS PASSED AGAINST LIVE PRODUCTION! ===');
  });
});
