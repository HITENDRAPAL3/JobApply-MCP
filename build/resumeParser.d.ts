import type { ParsedResume } from './types.js';
/**
 * Parses a resume PDF file and extracts key structured fields.
 */
export declare function parseResume(filePath: string): Promise<ParsedResume>;
