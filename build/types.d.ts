export interface ParsedResume {
    rawText: string;
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
    summary?: string;
    skills: string[];
    education: Array<{
        institution?: string;
        degree?: string;
        year?: string;
        fieldOfStudy?: string;
    }>;
    experience: Array<{
        company?: string;
        title?: string;
        duration?: string;
        description?: string;
    }>;
}
export type FormFieldType = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file' | 'unknown';
export interface FormOption {
    label: string;
    value: string;
}
export interface FormFieldDescriptor {
    id: string;
    name: string;
    selector: string;
    type: FormFieldType;
    label: string;
    placeholder: string;
    isRequired: boolean;
    currentValue: string | boolean;
    options?: FormOption[];
}
export interface FieldMapping {
    selector: string;
    value: string | boolean;
    type?: FormFieldType;
}
export interface FillResult {
    selector: string;
    success: boolean;
    valueApplied: string | boolean;
    error?: string;
}
export interface InspectionSummary {
    pageTitle: string;
    pageUrl: string;
    screenshotPath: string;
    totalFieldsCount: number;
    filledFields: Array<{
        label: string;
        value: string | boolean;
    }>;
    emptyFields: Array<{
        label: string;
        isRequired: boolean;
        selector: string;
    }>;
    detectedSubmitButton?: {
        text: string;
        selector: string;
        isEnabled: boolean;
    };
}
export interface SubmissionOutcome {
    success: boolean;
    message: string;
    confirmationScreenshot?: string;
    finalUrl?: string;
}
