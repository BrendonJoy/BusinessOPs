# BusinessOps (by JOYTECH) — Product & Build Specification

## 1. Overview

BusinessOps is a job, staff, and cost-management platform built for tradespeople (builders, electricians, plumbers, and similar trades). It combines practical field usability with proper financial visibility — job costing, quoting, and profit tracking — aimed at owner-operators and small trade businesses who currently rely on spreadsheets, paper, or disconnected tools.

- **Platforms:** Web application (primary, admin/owner-facing) + Mobile application (field-facing companion)
- **Brand:** Dark Grey (Audi Daytona Grey) / Gloss Black / White palette. Design principles: intuitive, easy to use, stable.

## 2. MVP Scope (Phase 1 — Build This First)

The MVP is BusinessOps Individual only, web app first, mobile app second. BusinessOps Business (multi-user, staff rostering) is explicitly out of scope for MVP and should be considered in the data model (so it can be added later) but not built now.

### 2.1 Core entities

- **Job** — unique job number, status, location (address + geo coordinates), customer name, customer contact details, notes, photo/file uploads, start date, finish date
- **Customer** — name, contact details, linked jobs
- **Quote** — line items, total, status (draft/sent/accepted/declined), linked job
- **Invoice** — line items, total, status (draft/sent/paid/overdue), linked job
- **Cost entry** — materials (item, cost) and labour (hours × rate) logged against a job
- **User** — single account for MVP, but design the schema so a company/team layer can be added later without a rebuild

### 2.2 Feature list

**Job creation & management**
- Create job with: unique job number (auto-generated), status, location, customer name & contact, notes, photo/file uploads, start/finish dates
- Job status workflow (e.g. Quoted → Scheduled → In Progress → Completed → Invoiced)
- Job list/detail views with filtering and search

**Scheduling**
- Calendar view (web) showing jobs by date
- Job start/finish dates visible and editable from calendar and job detail

**Quoting**
- Create quote with line items and total, linked to a job
- Generate a shareable online link where the customer can view the quote and accept/decline it (no login required for the customer)
- Quote status updates automatically based on customer action

**Invoicing**
- Generate invoice from a job (materials + labour + any manual line items)
- Export/send as PDF via email (no in-app payment processing in MVP)
- Invoice status tracked manually (sent/paid/overdue) for now

**Job costing / P&L**
- Log materials against a job (item + cost)
- Log labour against a job (hours × rate)
- Job P&L view: Invoiced amount − (materials + labour) = profit, per job
- Summary/reporting view across jobs (e.g. by date range)

**AI-assisted job creation (chat function)**
- Chat interface accepting typed or voice input
- Example input: "Quote booked for tomorrow at this address at this time"
- System parses input into structured fields (date, time, location, customer if identifiable, notes)
- User must review and confirm the drafted job before it is created — no silent auto-creation
- Voice input requires speech-to-text conversion before parsing

**Mobile app (field companion)**
- Create job on the go (subset of full job form)
- Add photos/files to a job
- Add location — capture GPS, with a button to open the address in Google Maps / Apple Maps
- Add notes to a job
- Offline functionality: jobs/photos/notes created while offline are stored locally and sync automatically once back online, with conflict handling if the same job was edited elsewhere

## 3. Phase 2 (Not MVP — design for, don't build yet)

- BusinessOps Business tier: multi-user company accounts (4 additional admin profiles), job assignment to specific users, staff rostering/timesheets ("BusinessOps Staffing"), labour costs auto-populated from timesheets instead of manual entry
- In-app payment collection for invoices
- Xero / Hnry integration: sync invoicing and payment collection to external accounting platforms

## 4. Non-functional requirements

- **Offline-first mobile:** core field actions (create job, add photo/note, capture location) must work with no connectivity and sync when back online
- **Stability:** this is a tool tradespeople rely on mid-job — prioritise reliability over feature breadth
- **Simplicity:** minimal training required; a tradesperson should be able to create a job in under a minute
- **Design:** Dark Grey (Audi Daytona Grey)/Gloss Black/White palette; clean, high-contrast, usable in bright outdoor light and with one hand on a phone

## 5. Open technical decisions (to confirm before/at build start)

- Tech stack for web app (framework, hosting)
- Tech stack for mobile app (native vs. cross-platform e.g. React Native/Flutter)
- Backend/database choice, and how offline sync + conflict resolution will be implemented
- Speech-to-text provider for voice input in the AI chat feature
- Authentication approach (even for single-user MVP, needs to support adding team accounts later without a rebuild)

## 6. Product context

BusinessOps is being built by JOYTECH, founded by someone with 10 years' hands-on trade experience (qualified Panel Beater) combined with a Bachelor of Business (Finance & Management) and a CPA Australia qualification — the product is intentionally shaped around real field workflows and proper job-level financial visibility, rather than being a generic scheduling tool with invoicing bolted on.
