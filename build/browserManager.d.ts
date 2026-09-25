import type { FormFieldDescriptor, FieldMapping, FillResult, InspectionSummary, SubmissionOutcome } from './types.js';
export declare class BrowserManager {
    private browser;
    private context;
    private page;
    private screenshotsDir;
    constructor();
    /**
     * Launches Google Chrome on the user's desktop in visible (headful) mode with a persistent
     * user profile directory (.chrome_profile). This preserves cookies, active sessions, and
     * saved passwords across applications without interfering with other windows.
     */
    launch(headless?: boolean): Promise<void>;
    /**
     * Navigates to the specified job portal URL.
     */
    navigateTo(url: string): Promise<{
        title: string;
        currentUrl: string;
    }>;
    /**
     * Detects and clicks common "Apply" / "Apply Now" buttons if not yet on the application form.
     */
    detectAndClickApply(): Promise<{
        clicked: boolean;
        status: string;
    }>;
    /**
     * Scans and extracts all form inputs, labels, placeholders, and current values.
     */
    scanFormFields(): Promise<FormFieldDescriptor[]>;
    /**
     * Applies mappings to the form fields and attaches resume file if provided.
     */
    fillFields(mappings: FieldMapping[], resumeFilePath?: string): Promise<{
        results: FillResult[];
        resumeUploaded: boolean;
    }>;
    /**
     * Clicks 'Save and Continue', 'Next', or 'Continue' buttons to advance multi-step wizard.
     */
    advanceStep(): Promise<{
        success: boolean;
        currentUrl: string;
        stepTitle?: string;
        message: string;
    }>;
    /**
     * Captures a screenshot and provides a comprehensive inspection summary.
     */
    inspectAndScreenshot(screenshotName?: string): Promise<InspectionSummary>;
    /**
     * Submits the application.
     * STRICT SAFETY GATE: Requires explicit user confirmation parameter to prevent accidental submissions.
     */
    submitApplication(userConfirmed: boolean): Promise<SubmissionOutcome>;
    /**
     * Closes browser session cleanly.
     */
    close(): Promise<void>;
}
