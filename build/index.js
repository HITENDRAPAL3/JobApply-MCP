#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { parseResume } from './resumeParser.js';
import { BrowserManager } from './browserManager.js';
const browserManager = new BrowserManager();
const server = new Server({
    name: 'job-applier-mcp',
    version: '1.0.0'
}, {
    capabilities: {
        tools: {}
    }
});
const TOOLS = [
    {
        name: 'parse_resume',
        description: 'Parses a local PDF resume file and extracts structured contact info (name, email, phone, location, LinkedIn, GitHub, portfolio), recognized skills, and full text.',
        inputSchema: {
            type: 'object',
            properties: {
                resume_path: {
                    type: 'string',
                    description: 'Absolute or relative local file path to the resume PDF'
                }
            },
            required: ['resume_path']
        }
    },
    {
        name: 'open_job_portal',
        description: 'Launches a visible Chromium browser window and navigates to the specified job URL. Keeps the browser open so the user can watch progress and handle any login/CAPTCHA prompts.',
        inputSchema: {
            type: 'object',
            properties: {
                job_url: {
                    type: 'string',
                    description: 'The URL of the job posting or application page'
                },
                headless: {
                    type: 'boolean',
                    description: 'Whether to run headless (default: false, runs visible headful browser)'
                }
            },
            required: ['job_url']
        }
    },
    {
        name: 'detect_apply_button',
        description: 'Detects and clicks common "Apply" / "Apply Now" buttons on job listings if the application form is not yet visible.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'analyze_application_fields',
        description: 'Scans the active page and returns a structured list of all form inputs, textareas, selects, and file upload fields with their labels, types, required flags, and current values.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'fill_application_fields',
        description: 'Populates the application form fields with given mappings and attaches the resume PDF file to the file input.',
        inputSchema: {
            type: 'object',
            properties: {
                mappings: {
                    type: 'array',
                    description: 'Array of field mappings to populate into the form',
                    items: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector of the field' },
                            value: {
                                type: ['string', 'boolean'],
                                description: 'Value to fill or checkbox boolean state'
                            },
                            type: {
                                type: 'string',
                                description: 'Field type (text, email, tel, select, checkbox, radio, file)'
                            }
                        },
                        required: ['selector', 'value']
                    }
                },
                resume_file_path: {
                    type: 'string',
                    description: 'Optional path to the resume PDF file to upload into file inputs'
                }
            },
            required: ['mappings']
        }
    },
    {
        name: 'preview_application',
        description: 'Captures a full-page screenshot of the application and returns a summary of filled vs empty required fields, plus status of the submit button for user review.',
        inputSchema: {
            type: 'object',
            properties: {
                screenshot_name: {
                    type: 'string',
                    description: 'Base name for the screenshot file (default: preview)'
                }
            }
        }
    },
    {
        name: 'submit_application',
        description: 'Submits the job application by clicking the final submit button. STRICT SAFETY GATE: user_confirmed MUST be true. This tool must ONLY be called after receiving explicit confirmation from the user in chat.',
        inputSchema: {
            type: 'object',
            properties: {
                user_confirmed: {
                    type: 'boolean',
                    description: 'Must be true. Confirmation from user explicitly permitting submission.'
                }
            },
            required: ['user_confirmed']
        }
    },
    {
        name: 'close_browser',
        description: 'Closes the browser session and frees resources.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    }
];
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case 'parse_resume': {
                const resumePath = String(args?.resume_path || '');
                if (!resumePath) {
                    throw new Error('resume_path is required');
                }
                const data = await parseResume(resumePath);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(data, null, 2)
                        }
                    ]
                };
            }
            case 'open_job_portal': {
                const jobUrl = String(args?.job_url || '');
                const headless = Boolean(args?.headless ?? false);
                if (!jobUrl) {
                    throw new Error('job_url is required');
                }
                await browserManager.launch(headless);
                const nav = await browserManager.navigateTo(jobUrl);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(nav, null, 2)
                        }
                    ]
                };
            }
            case 'detect_apply_button': {
                const res = await browserManager.detectAndClickApply();
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(res, null, 2)
                        }
                    ]
                };
            }
            case 'analyze_application_fields': {
                const fields = await browserManager.scanFormFields();
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ count: fields.length, fields }, null, 2)
                        }
                    ]
                };
            }
            case 'fill_application_fields': {
                const mappings = args?.mappings || [];
                const resumePath = args?.resume_file_path ? String(args.resume_file_path) : undefined;
                const res = await browserManager.fillFields(mappings, resumePath);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(res, null, 2)
                        }
                    ]
                };
            }
            case 'preview_application': {
                const screenshotName = args?.screenshot_name ? String(args.screenshot_name) : 'preview';
                const summary = await browserManager.inspectAndScreenshot(screenshotName);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(summary, null, 2)
                        }
                    ]
                };
            }
            case 'submit_application': {
                const userConfirmed = Boolean(args?.user_confirmed);
                const outcome = await browserManager.submitApplication(userConfirmed);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(outcome, null, 2)
                        }
                    ]
                };
            }
            case 'close_browser': {
                await browserManager.close();
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, message: 'Browser session closed.' })
                        }
                    ]
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: 'text',
                    text: `Error executing tool ${name}: ${message}`
                }
            ],
            isError: true
        };
    }
});
// Process cleanup hooks
process.on('SIGINT', async () => {
    await browserManager.close();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await browserManager.close();
    process.exit(0);
});
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Job Applier MCP Server running on stdio');
}
run().catch(err => {
    console.error('Fatal error running MCP server:', err);
    process.exit(1);
});
