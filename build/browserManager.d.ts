import type { FormFieldDescriptor, FieldMapping, FillResult, InspectionSummary, SubmissionOutcome } from './types.js';
export declare class BrowserManager {
    private browser;
    private context;
    private page;
    private screenshotsDir;
    constructor();
    /**
     * Launches Chromium in visible (headful) mode by default so user can monitor.
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
