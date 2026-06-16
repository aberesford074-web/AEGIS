# Aegis CRM P0 Apps Script Setup

This file explains the P0 foundation in `google-sheets-webhook.gs`.

## What It Adds

- Creates a permanent `Lead ID` for every new website chatbot lead.
- Writes the lead into `Chatbot Leads` without reorganising existing columns.
- Creates an `Event Log` sheet automatically if it does not exist.
- Logs these events:
  - `lead_submitted`
  - `calendar_follow_up_created`
  - `sheet_row_created`
  - `email_notification_sent`
  - `webhook_error`
- Adds the `Lead ID` to:
  - Google Sheet row
  - email subject/body
  - Google Calendar follow-up event title/body
- Adds a dashboard API endpoint:
  - `?action=dashboard`

## Sheet Tabs

The script expects:

- `Chatbot Leads`
- `Pipeline Tracker`

It creates this tab automatically:

- `Event Log`

`Chatbot Leads` remains the raw intake sheet. The script may add missing headers to the end of row 1, but it does not rename, delete, or reorder existing columns.

## Required Paste Step

1. Open the Google Apps Script project connected to the webhook.
2. Replace the current script with the full contents of:
   - `google-sheets-webhook.gs`
3. Save.
4. Deploy using **Manage deployments**.
5. Edit the existing web app deployment.
6. Create a new version.
7. Keep access as the current web app setup.
8. Deploy.

## Permissions

Because the script writes to Sheets, sends email, and creates calendar events, Google may ask you to approve permissions for:

- Google Sheets
- Gmail/MailApp
- Google Calendar

Approve using the Google account whose calendar should receive follow-up reminders.

## Test The Webhook

Submit one fake lead through the website chatbot.

Expected result:

1. A new row appears in `Chatbot Leads`.
2. A `Lead ID` appears in that row.
3. An `Event Log` tab appears with several events for that same `Lead ID`.
4. An email arrives at `aberesford074@gmail.com`.
5. A Google Calendar follow-up event appears.
6. The email and calendar event both include the same `Lead ID`.

## Test The Dashboard API

Open the deployed web app URL with:

```text
?action=dashboard
```

Example:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=dashboard
```

Expected result:

```json
{
  "ok": true,
  "dashboard": {
    "generatedAt": "...",
    "source": "Pipeline Tracker",
    "metrics": {
      "totalLeads": 0,
      "newLeads": 0,
      "highPriorityLeads": 0,
      "followUpsDue": 0,
      "proposalsSent": 0,
      "paymentPending": 0,
      "activeBuilds": 0,
      "deliveredProjects": 0
    },
    "recentLeads": [],
    "nextActions": []
  }
}
```

## Current Dashboard Metrics

The dashboard endpoint returns:

- total leads
- new leads
- high priority leads
- follow-ups due
- proposals sent
- payment pending
- active builds
- delivered projects
- recent leads
- next actions

It reads from `Pipeline Tracker` if that tab exists and has recognisable headers. If not, it falls back to `Chatbot Leads`.

## Test TidyCal Booking Sync

The script now includes a first-pass TidyCal sync that reads bookings from your default Google Calendar and updates `Pipeline Tracker`.

It does not use the TidyCal API yet. It works by scanning Google Calendar because TidyCal already writes bookings there.

Open the deployed web app URL with:

```text
?action=syncTidyCal
```

Example:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=syncTidyCal
```

Expected result:

```json
{
  "ok": true,
  "scannedEvents": 1,
  "updatedBookings": 1,
  "unmatchedBookings": 0,
  "skippedBookings": 0
}
```

What it updates in `Pipeline Tracker`:

- `Pipeline Stage` -> `Consultation Booked`
- `TidyCal Booking Date` -> calendar event start time
- `Next Action` -> consultation prep action
- `Notes` -> synced from Google Calendar

It matches bookings by email. If a booking cannot be matched to a lead email, it logs `tidycal_booking_unmatched` in `Event Log`.

If the lead has already moved beyond booking, for example `Proposal Sent` or `Build In Progress`, it skips the row and logs `tidycal_booking_skipped`.

## Optional TidyCal Sync Trigger

After manual testing works, you can run this Apps Script function once from the Apps Script editor:

```text
installTidyCalSyncTrigger
```

That creates an hourly trigger for:

```text
syncTidyCalBookings
```

Do not create the hourly trigger until the manual `?action=syncTidyCal` test works.

## Create Proposal Email Drafts

The script can now create Gmail proposal drafts from `Pipeline Tracker`.

It does **not** send emails automatically.

To create a draft for a row:

1. Go to `Pipeline Tracker`.
2. Make sure the row has:
   - `Email`
   - `Name`
   - `Company` if available
   - `Website Problem`
   - `AI Solution`
   - `Recommended Price` or `Proposal Price`
   - `Estimated Timeline` if available
3. Set `Proposal Status` to:
   - `Internal Review`

Then open the deployed web app URL with:

```text
?action=createProposalDrafts
```

Example:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=createProposalDrafts
```

Expected result:

```json
{
  "ok": true,
  "scannedRows": 10,
  "draftsCreated": 1,
  "skippedRows": 9
}
```

What it does:

- Creates a Gmail draft addressed to the lead.
- Uses the solution, price, problem, notes, and timeline from `Pipeline Tracker`.
- Adds these columns to `Pipeline Tracker` if missing:
  - `Estimated Timeline`
  - `Proposal Email Drafted At`
  - `Gmail Draft ID`
  - `Proposal Email Subject`
- Updates the row:
  - `Proposal Status` -> `Drafting`
  - `Next Action` -> review/send manually
- Logs `proposal_email_draft_created` in `Event Log`.

Safety rule:

- The automation only creates drafts.
- It skips rows that already have a `Gmail Draft ID`.
- You review the draft and send manually from Gmail.

## Send Approved Proposal Drafts

The script can send Gmail proposal drafts after you explicitly approve them in `Pipeline Tracker`.

It does **not** decide what to send by itself.

To approve a draft:

1. Check the Gmail draft manually.
2. Confirm the scope, price, and timeline are right.
3. In `Pipeline Tracker`, set:
   - `Approved to Send` -> `Yes`
4. Keep `Gmail Draft ID` filled.
5. Keep `Proposal Status` not equal to `Sent`.

Then open:

```text
?action=sendApprovedProposals
```

Example:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=sendApprovedProposals
```

What it does:

- Sends the Gmail draft.
- Updates:
  - `Pipeline Stage` -> `Proposal Sent`
  - `Proposal Status` -> `Sent`
  - `Client Response` -> `Awaiting Reply`
  - `Approved to Send` -> blank
  - `Proposal Sent At` -> current date/time
  - `Gmail Thread ID` -> sent email thread
  - `Next Action` -> wait for reply/follow up
- Logs `proposal_email_sent` in `Event Log`.

## Classify Proposal Replies

The script can check Gmail threads for client replies after a proposal is sent.

Open:

```text
?action=classifyProposalReplies
```

Example:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=classifyProposalReplies
```

It checks rows where:

- `Gmail Thread ID` exists
- `Proposal Status` is `Sent`
- `Client Response` is blank, `No Reply`, or `Awaiting Reply`

It updates:

- `Client Response`
- `Pipeline Stage`
- `Last Reply Checked At`
- `Reply Classification Notes`
- `Next Action`

Classification options:

- `Proceed`
- `Needs Changes`
- `Not Now`
- `Lost`
- `Awaiting Reply` if uncertain

Safety rule:

- Ambiguous replies are not auto-closed.
- They are marked for manual review with a clear next action.
