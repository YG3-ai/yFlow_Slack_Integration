# Business Partner Slack Bot

A private Slack bot that acts as a lightweight business partner and advisor by answering questions using your **own historical business notes** stored in Google Sheets.

The bot listens in Slack DMs or when mentioned in channels, searches your past notes for relevant context, and generates practical, data-aware advice using a custom LLM backend.

---

## What This Bot Does

- Responds to Slack mentions and direct messages
- Extracts business-related keywords and themes from questions
- Searches a Google Sheets–based notes database
- Scores and prioritizes relevant past entries (with recency weighting)
- Uses real historical context to generate grounded business advice
- Falls back gracefully when no relevant data is found

This is **not** a generic chatbot — it answers questions based on *your actual business activity history*.

---

## Architecture Overview

**Slack → Keyword Extraction → Google Sheets Search → LLM Response**

1. Slack event received (`@mention` or DM)
2. Query cleaned and analyzed for business intent
3. Keywords and business themes extracted
4. Google Sheets searched and scored
5. Context-aware prompt sent to LLM API
6. Response returned to Slack

---

## Tech Stack

- **Node.js**
- **Slack Bolt SDK** (Socket Mode)
- **Google Sheets API**
- **Custom LLM API** (Elysia)
- **dotenv** for environment configuration
- **node-fetch** for API requests

---

## Google Sheets Data Model

The bot expects a Google Sheet with the following structure:

**Sheet name:** `Notes`

| Column | Description |
|------|-------------|
| A | Date (YYYY-MM-DD or compatible date format) |
| B | Freeform business notes |

Recent entries are weighted more heavily when calculating relevance.

---

## Environment Variables

Create a `.env` file with the following values:

```env
SLACK_BOT_TOKEN=your-slack-bot-token
SLACK_SIGNING_SECRET=your-slack-signing-secret
SLACK_APP_TOKEN=your-slack-app-token

GOOGLE_APPLICATION_CREDENTIALS=path-to-service-account.json
SHEET_ID=your-google-sheet-id

YG3_API_KEY=your-yai-api-key
