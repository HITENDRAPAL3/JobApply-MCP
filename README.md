# Job Applier MCP Server for Antigravity

A high-performance Model Context Protocol (MCP) server designed for Antigravity to automate applying to jobs on any company career portal (Workday, Greenhouse, Lever, Taleo, iCIMS, or custom portals like Mastercard).

## Key Features

1. **Local PDF Resume Extraction**: Extracts text, contact info, GitHub/LinkedIn links, and technical skills from your resume PDF.
2. **Visible (Headful) Browser Automation**: Launches Playwright in headful mode so you can see exactly what the agent is doing in real-time, log into company accounts, or solve CAPTCHA challenges if required.
3. **Smart DOM Field Inspection**: Scans all inputs, textareas, selects, and file upload fields with associated labels and validation rules.
4. **Automated Autofill & Attachment**: Fills the application inputs and uploads your resume file automatically.
5. **Pre-Submission Visual Preview**: Captures full-page screenshots and summarizes filled vs empty fields.
6. **Strict Human-in-the-Loop Safety Gate**: The `submit_application` tool will **refuse** to execute unless you explicitly provide confirmation in chat (`user_confirmed: true`).

---

## Registered MCP Tools

| Tool Name | Description | Key Parameters |
| :--- | :--- | :--- |
| `parse_resume` | Reads PDF resume and extracts structured details | `resume_path` (string) |
| `open_job_portal` | Opens visible Chromium browser at job posting URL | `job_url` (string), `headless` (optional boolean) |
| `detect_apply_button` | Finds and clicks "Apply" / "Apply Now" if needed | none |
| `analyze_application_fields` | Scrapes all form inputs, labels, and types | none |
| `fill_application_fields` | Populates inputs and uploads resume file | `mappings` (array), `resume_file_path` (optional string) |
| `preview_application` | Captures full-page screenshot & review summary | `screenshot_name` (optional string) |
| `submit_application` | Clicks submit button (**Guarded by confirmation**) | `user_confirmed` (boolean) |
| `close_browser` | Closes active browser session | none |

---

## Configuration in Antigravity

Configured in `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "job-applier": {
      "command": "node",
      "args": [
        "d:/Development/Study/MCPs/MCPSwitch/build/index.js"
      ]
    }
  }
}
```

---

## Example Usage in Antigravity Chat

You can simply tell Antigravity in chat:
> *"Here is the job link: https://mastercard.wd1.myworkdayjobs.com/Careers/job/... and here is my resume: `D:/Documents/MyResume.pdf`. Please fill the form and show me the preview before submitting."*

Antigravity will:
1. Parse your resume via `parse_resume`.
2. Open the page via `open_job_portal`.
3. Scan and map the form fields via `analyze_application_fields` and `fill_application_fields`.
4. Capture a preview screenshot with `preview_application`.
5. Ask for your confirmation in chat: *"Here is the preview screenshot. Are you ready for me to submit?"*
6. Only submit once you reply *"Yes, submit"*.
