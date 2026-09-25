import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import type {
  FormFieldDescriptor,
  FormFieldType,
  FieldMapping,
  FillResult,
  InspectionSummary,
  SubmissionOutcome
} from './types.js';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getProjectRoot(): string {
  let curr = __dirname;
  while (curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, 'package.json'))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return path.resolve(__dirname, '..');
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private screenshotsDir: string;

  constructor() {
    const root = getProjectRoot();
    this.screenshotsDir = path.join(root, 'screenshots');
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  /**
   * Launches Google Chrome on the user's desktop in visible (headful) mode with a persistent
   * user profile directory (.chrome_profile). This preserves cookies, active sessions, and
   * saved passwords across applications without interfering with other windows.
   */
  async launch(headless = false): Promise<void> {
    if (this.context && this.page && !this.page.isClosed()) {
      return;
    }

    const root = getProjectRoot();
    const userDataDir = path.join(root, '.chrome_profile');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    this.context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless,
      viewport: null, // Maximized desktop window
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ],
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    });

    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    // Track active page if new tab/window is opened
    this.context.on('page', newPage => {
      this.page = newPage;
    });
  }

  /**
   * Navigates to the specified job portal URL.
   */
  async navigateTo(url: string): Promise<{ title: string; currentUrl: string }> {
    if (!this.page) {
      await this.launch(false);
    }
    const page = this.page!;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000); // Allow dynamic scripts/react hydration

    return {
      title: await page.title(),
      currentUrl: page.url()
    };
  }

  /**
   * Detects and clicks common "Apply" / "Apply Now" buttons if not yet on the application form.
   */
  async detectAndClickApply(): Promise<{ clicked: boolean; status: string }> {
    if (!this.page) {
      throw new Error('Browser is not open. Call open_job_portal first.');
    }
    const page = this.page;

    // Common selectors for Apply buttons
    const applyButtonSelectors = [
      'a:has-text("Apply Now")',
      'button:has-text("Apply Now")',
      'a:has-text("Apply for this job")',
      'button:has-text("Apply for this job")',
      'a[data-qa="apply-button"]',
      'button[data-qa="apply-button"]',
      'a[href*="/apply"]',
      'a[href*="apply"]',
      'a:has-text("Apply")',
      'button:has-text("Apply")',
      'button:has-text("I\'m interested")'
    ];

    for (const selector of applyButtonSelectors) {
      const loc = page.locator(selector).first();
      if (await loc.isVisible().catch(() => false)) {
        // Track possible new window/tab popup
        let newPagePromise: Promise<Page | null> = Promise.resolve(null);
        if (this.context) {
          newPagePromise = this.context.waitForEvent('page', { timeout: 4000 }).catch(() => null);
        }
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.click();
        const popup = await newPagePromise;
        if (popup) {
          this.page = popup;
          await this.page.waitForLoadState('domcontentloaded').catch(() => {});
          await this.page.waitForTimeout(2500);
          return {
            clicked: true,
            status: `Clicked apply button matching "${selector}" and switched to new application tab: ${this.page.url()}`
          };
        }
        await page.waitForTimeout(2500);
        return { clicked: true, status: `Clicked apply button matching: ${selector}` };
      }
    }

    // Check if form is already visible on page
    const formInputCount = await page.locator('input:not([type="hidden"]), textarea, select').count();
    if (formInputCount >= 3) {
      return { clicked: false, status: 'Application form is already present on the page.' };
    }

    return { clicked: false, status: 'No distinct Apply button found. Already at destination or custom layout.' };
  }

  /**
   * Scans and extracts all form inputs, labels, placeholders, and current values.
   */
  async scanFormFields(): Promise<FormFieldDescriptor[]> {
    if (!this.page) {
      throw new Error('Browser is not open. Call open_job_portal first.');
    }
    const page = this.page;

    const fields = await page.evaluate(() => {
      const results: FormFieldDescriptor[] = [];
      const elements = Array.from(
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select')
      );

      elements.forEach((el, index) => {
        const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const tagName = inputEl.tagName.toLowerCase();
        let type: FormFieldType = 'unknown';

        if (tagName === 'textarea') {
          type = 'textarea';
        } else if (tagName === 'select') {
          type = 'select';
        } else {
          const rawType = (inputEl as HTMLInputElement).type?.toLowerCase() || 'text';
          if (['text', 'email', 'tel', 'number', 'file', 'checkbox', 'radio'].includes(rawType)) {
            type = rawType as FormFieldType;
          } else {
            type = 'text';
          }
        }

        // Determine Label
        let label = '';
        if (inputEl.id) {
          const labelEl = document.querySelector(`label[for="${inputEl.id}"]`);
          if (labelEl) {
            label = labelEl.textContent?.trim() || '';
          }
        }

        if (!label) {
          const parentLabel = inputEl.closest('label');
          if (parentLabel) {
            label = parentLabel.textContent?.trim() || '';
          }
        }

        if (!label && inputEl.getAttribute('aria-label')) {
          label = inputEl.getAttribute('aria-label')?.trim() || '';
        }

        if (!label && inputEl.getAttribute('aria-labelledby')) {
          const labelId = inputEl.getAttribute('aria-labelledby');
          const labelledByEl = labelId ? document.getElementById(labelId) : null;
          if (labelledByEl) {
            label = labelledByEl.textContent?.trim() || '';
          }
        }

        if (!label) {
          // Look for adjacent text or heading
          const prevEl = inputEl.previousElementSibling;
          if (prevEl && prevEl.textContent) {
            label = prevEl.textContent.trim();
          }
        }

        const placeholder = inputEl.getAttribute('placeholder')?.trim() || '';
        const isRequired =
          inputEl.hasAttribute('required') ||
          inputEl.getAttribute('aria-required') === 'true' ||
          label.includes('*') ||
          label.toLowerCase().includes('required');

        // Clean label of trailing stars and excessive newlines
        const cleanLabel = (label || placeholder || inputEl.name || `Field_${index}`)
          .replace(/\s+/g, ' ')
          .trim();

        // Build Selector
        let selector = '';
        if (inputEl.id) {
          selector = `#${CSS.escape(inputEl.id)}`;
        } else if (inputEl.name) {
          selector = `${tagName}[name="${CSS.escape(inputEl.name)}"]`;
        } else {
          selector = `${tagName}:nth-of-type(${index + 1})`;
        }

        // Read options if select
        let options: Array<{ label: string; value: string }> | undefined;
        if (tagName === 'select') {
          const selectEl = inputEl as HTMLSelectElement;
          options = Array.from(selectEl.options).map(opt => ({
            label: opt.text.trim(),
            value: opt.value
          }));
        }

        // Read current value
        let currentValue: string | boolean = '';
        if (type === 'checkbox' || type === 'radio') {
          currentValue = (inputEl as HTMLInputElement).checked;
        } else {
          currentValue = inputEl.value;
        }

        results.push({
          id: inputEl.id || `field_${index}`,
          name: inputEl.name || '',
          selector,
          type,
          label: cleanLabel,
          placeholder,
          isRequired,
          currentValue,
          options
        });
      });

      return results;
    });

    return fields;
  }

  /**
   * Applies mappings to the form fields and attaches resume file if provided.
   */
  async fillFields(
    mappings: FieldMapping[],
    resumeFilePath?: string
  ): Promise<{ results: FillResult[]; resumeUploaded: boolean }> {
    if (!this.page) {
      throw new Error('Browser is not open. Call open_job_portal first.');
    }
    const page = this.page;
    const results: FillResult[] = [];
    let resumeUploaded = false;

    // Handle Resume File Upload if file input exists and path is valid
    if (resumeFilePath && fs.existsSync(path.resolve(resumeFilePath))) {
      const resolvedResume = path.resolve(resumeFilePath);
      const fileInputs = page.locator('input[type="file"]');
      const count = await fileInputs.count();
      if (count > 0) {
        try {
          await fileInputs.first().setInputFiles(resolvedResume);
          await page.waitForTimeout(1000);
          resumeUploaded = true;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Failed to upload resume file: ${message}`);
        }
      }
    }

    for (const mapping of mappings) {
      try {
        const locator = page.locator(mapping.selector).first();
        const isVisible = await locator.isVisible().catch(() => false);

        if (!isVisible) {
          results.push({
            selector: mapping.selector,
            success: false,
            valueApplied: mapping.value,
            error: 'Element not visible or selector not found'
          });
          continue;
        }

        if (typeof mapping.value === 'boolean' || mapping.type === 'radio' || mapping.type === 'checkbox') {
          try {
            await page.keyboard.press('Escape').catch(() => {});
            await locator.evaluate((el: HTMLElement) => el.click());
          } catch {
            const id = await locator.getAttribute('id').catch(() => null);
            if (id) {
              await page.locator(`label[for="${id}"]`).click({ force: true }).catch(() => {});
            }
          }
        } else if (mapping.type === 'file') {
          if (fs.existsSync(String(mapping.value))) {
            await locator.setInputFiles(String(mapping.value));
            resumeUploaded = true;
          }
        } else {
          // Check if this is a select or custom dropdown widget (like Workday selectinput)
          const tagName = await locator.evaluate((el: Element) => el.tagName.toLowerCase()).catch(() => '');
          const val = String(mapping.value);

          if (tagName === 'select') {
            try {
              await locator.selectOption({ label: val });
            } catch {
              await locator.selectOption({ value: val });
            }
          } else {
            // Text, search combobox, or Workday custom select widget
            await page.keyboard.press('Escape').catch(() => {});
            await locator.scrollIntoViewIfNeeded().catch(() => {});
            await locator.click({ force: true }).catch(async () => {
              await locator.evaluate((el: HTMLElement) => el.click());
            });
            await locator.fill('');
            await locator.fill(val);
            await page.waitForTimeout(400);

            // If it is a searchable dropdown (Workday / ATS), check for popup options
            const optionItem = page
              .locator('[data-automation-id="menuItem"], [role="option"], [data-uxi-widget-type="selectinputlistitem"], li.css-j8lfa5')
              .filter({ hasText: val })
              .first();

            if (await optionItem.isVisible({ timeout: 1500 }).catch(() => false)) {
              await optionItem.click({ force: true });
              await page.waitForTimeout(300);
            } else {
              // Try pressing Enter to commit autocomplete
              await page.keyboard.press('Enter');
            }
            await page.keyboard.press('Escape').catch(() => {});
          }
        }

        results.push({
          selector: mapping.selector,
          success: true,
          valueApplied: mapping.value
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          selector: mapping.selector,
          success: false,
          valueApplied: mapping.value,
          error: message
        });
      }
    }

    return { results, resumeUploaded };
  }

  /**
   * Clicks 'Save and Continue', 'Next', or 'Continue' buttons to advance multi-step wizard.
   */
  async advanceStep(): Promise<{ success: boolean; currentUrl: string; stepTitle?: string; message: string }> {
    if (!this.page) {
      throw new Error('Browser is not open. Call open_job_portal first.');
    }
    const page = this.page;

    const continueLocators = [
      'button[data-automation-id="bottom-navigation-next-button"]',
      'button:has-text("Save and Continue")',
      'button:has-text("Save & Continue")',
      'button:has-text("Next")',
      'button:has-text("Continue")',
      'a:has-text("Save and Continue")',
      'a:has-text("Next")'
    ];

    let clicked = false;
    for (const selector of continueLocators) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ force: true }).catch(async () => {
          await btn.evaluate((el: HTMLElement) => el.click());
        });
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      return {
        success: false,
        currentUrl: page.url(),
        message: 'Could not find a Next/Save and Continue button on the current page.'
      };
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(3000);

    return {
      success: true,
      currentUrl: page.url(),
      stepTitle: await page.title(),
      message: 'Advanced to next step successfully.'
    };
  }

  /**
   * Captures a screenshot and provides a comprehensive inspection summary.
   */
  async inspectAndScreenshot(screenshotName = 'preview'): Promise<InspectionSummary> {
    if (!this.page) {
      throw new Error('Browser is not open. Call open_job_portal first.');
    }
    const page = this.page;
    const timestamp = Date.now();
    const filename = `${screenshotName}_${timestamp}.png`;
    const screenshotPath = path.join(this.screenshotsDir, filename);

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const fields = await this.scanFormFields();
    const filledFields = fields
      .filter(f => (typeof f.currentValue === 'boolean' ? f.currentValue : Boolean(f.currentValue)))
      .map(f => ({ label: f.label, value: f.currentValue }));

    const emptyFields = fields
      .filter(f => (typeof f.currentValue === 'boolean' ? !f.currentValue : !f.currentValue))
      .map(f => ({ label: f.label, isRequired: f.isRequired, selector: f.selector }));

    // Detect Submit Button
    let detectedSubmitButton: InspectionSummary['detectedSubmitButton'] = undefined;
    const submitLocators = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Submit Application")',
      'button:has-text("Review Application")',
      'button:has-text("Next")'
    ];

    for (const selector of submitLocators) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible().catch(() => false)) {
        const text = (await btn.textContent().catch(() => 'Submit'))?.trim() || 'Submit';
        const isEnabled = await btn.isEnabled().catch(() => false);
        detectedSubmitButton = { text, selector, isEnabled };
        break;
      }
    }

    return {
      pageTitle: await page.title(),
      pageUrl: page.url(),
      screenshotPath,
      totalFieldsCount: fields.length,
      filledFields,
      emptyFields,
      detectedSubmitButton
    };
  }

  /**
   * Submits the application.
   * STRICT SAFETY GATE: Requires explicit user confirmation parameter to prevent accidental submissions.
   */
  async submitApplication(userConfirmed: boolean): Promise<SubmissionOutcome> {
    if (!userConfirmed) {
      throw new Error(
        'SECURITY_GATE: Submission blocked. Explicit user confirmation (user_confirmed: true) is required before clicking Submit.'
      );
    }

    if (!this.page) {
      throw new Error('Browser is not open. Call open_job_portal first.');
    }
    const page = this.page;

    const submitLocators = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit Application")',
      'button:has-text("Submit")',
      'button:has-text("Send Application")'
    ];

    let clicked = false;
    for (const selector of submitLocators) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      return {
        success: false,
        message: 'Could not find a visible submit button. Please inspect the page or complete remaining required steps.'
      };
    }

    // Wait for submission request to settle
    await page.waitForTimeout(4000);

    const timestamp = Date.now();
    const confScreenshotPath = path.join(this.screenshotsDir, `submitted_${timestamp}.png`);
    await page.screenshot({ path: confScreenshotPath, fullPage: true });

    return {
      success: true,
      message: 'Submit button clicked successfully. Confirmation screenshot recorded.',
      confirmationScreenshot: confScreenshotPath,
      finalUrl: page.url()
    };
  }

  /**
   * Closes browser session cleanly.
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.page = null;
  }
}
