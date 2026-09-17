import fs from 'node:fs';
import path from 'node:path';
import pdfParse from 'pdf-parse';
/**
 * Common technical and professional skills dictionary for keyword matching
 */
const COMMON_SKILLS = [
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'php',
    'react', 'react native', 'angular', 'vue', 'next.js', 'node.js', 'express', 'spring boot',
    'html', 'css', 'tailwind', 'sass', 'redux', 'graphql', 'rest api', 'sql', 'mysql', 'postgresql',
    'mongodb', 'redis', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci/cd', 'git', 'github',
    'agile', 'scrum', 'jira', 'microservices', 'distributed systems', 'playwright', 'puppeteer',
    'selenium', 'jest', 'cypress', 'linux', 'data structures', 'algorithms'
];
/**
 * Parses a resume PDF file and extracts key structured fields.
 */
export async function parseResume(filePath) {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Resume file not found at path: ${resolvedPath}`);
    }
    const dataBuffer = fs.readFileSync(resolvedPath);
    const pdfData = await pdfParse(dataBuffer);
    const rawText = pdfData.text || '';
    // Extract Emails
    const emailMatch = rawText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    const email = emailMatch ? emailMatch[0] : undefined;
    // Extract Phone Numbers (supports various formats e.g., +1-555-555-5555, +91 9876543210, (555) 555-5555)
    const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0].trim() : undefined;
    // Extract LinkedIn URL
    const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|profile)\/[a-zA-Z0-9_-]+/i);
    const linkedin = linkedinMatch ? (linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : `https://${linkedinMatch[0]}`) : undefined;
    // Extract GitHub URL
    const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
    const github = githubMatch ? (githubMatch[0].startsWith('http') ? githubMatch[0] : `https://${githubMatch[0]}`) : undefined;
    // Extract Portfolio / Personal Website
    const portfolioMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:dev|io|me|tech|com|in)\b/i);
    let portfolio;
    if (portfolioMatch) {
        const matchedUrl = portfolioMatch[0];
        if (!matchedUrl.includes('linkedin.com') && !matchedUrl.includes('github.com')) {
            portfolio = matchedUrl.startsWith('http') ? matchedUrl : `https://${matchedUrl}`;
        }
    }
    // Heuristic Name Extraction: Usually the first non-empty line of the resume
    const lines = rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
    let nameCandidate;
    for (const line of lines.slice(0, 5)) {
        // If the line is 2-4 words, doesn't contain email/urls/digits, it's likely the applicant's name
        if (line.split(/\s+/).length >= 2 &&
            line.split(/\s+/).length <= 4 &&
            !line.includes('@') &&
            !line.includes('http') &&
            !line.includes('.com') &&
            !/\d/.test(line) &&
            line.length < 50) {
            nameCandidate = line;
            break;
        }
    }
    // Skills Extraction: Search for recognized skills
    const lowerText = rawText.toLowerCase();
    const matchedSkills = COMMON_SKILLS.filter(skill => {
        const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, 'i');
        return regex.test(lowerText);
    });
    return {
        rawText,
        name: nameCandidate,
        email,
        phone,
        linkedin,
        github,
        portfolio,
        skills: matchedSkills,
        education: [],
        experience: []
    };
}
