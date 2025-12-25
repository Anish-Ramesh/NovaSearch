---
title: NovaSearch
emoji: 🔍
colorFrom: blue
colorTo: purple
sdk: docker
sdk_version: "0.0.1"
app_file: Dockerfile
pinned: false
---

# Local AI Search Engine (Google-like UI)

This project is a **from-scratch search engine and mini web browser** built in the `LA` directory. It combines:

- **Local LLM via LM Studio** (`http://localhost:1234/v1`)
- **DuckDuckGo web search** via LangChain tools and direct DDGS integration
- A **reflexive agent** that iteratively searches, synthesizes, and self-critiques answers
- A **Google-like UI** with tabs and a clean, minimal layout optimized for low RAM usage
- A **browser-style multi-tab experience** where each tab keeps its own search, AI answer, and web results, plus in-tab page previews

## Features & Novelty

- **Mini browser inside a search app**
  - Multiple internal tabs with their own queries, results, and AI answers.
  - In-tab page preview (open links and images inside the app instead of a separate browser).
- **AI + Web fusion**
  - Local LLM (via LM Studio) summarizes web evidence and suggests key takeaways + follow-up questions.
  - Fast DuckDuckGo web and image search running in parallel with the AI pipeline.
- **Opinionated, cleaner results**
  - Biased toward English and India/US-style results using DuckDuckGo region tuning.
  - Filters out low-signal domains (e.g. obvious non-English spam) when possible while keeping real results.
- **Resource efficient**
  - Even with ~15 internal tabs open, RAM usage is roughly ~500 MB on a typical machine – often about half of what the same number of full browser tabs would use.

## Architecture

- **Backend**: `backend/`
  - Python, FastAPI
  - LangChain agent with:
    - `web_search` tool (DuckDuckGo)
    - Local LLM client (LM Studio, OpenAI-compatible API)
  - Reflexive pipeline:
    1. Tool-calling agent refines the query and optionally calls web search.
    2. A second LLM pass critiques and improves the answer, generating key takeaways and follow-up questions.

- **Frontend**: `frontend/`
  - React + Vite + TailwindCSS
  - Google-style home screen and results page
  - Sub-tabs per search: **All**, **Web**, **AI**, **Insights**
  - A **browser-like top tab strip** where you can open multiple independent search tabs
  - In-tab **page preview** (results and image thumbnails open inside an iframe with a "Back to results" control)
  - Minimal dependencies to reduce RAM use.
  - Even with **around 15 internal tabs open**, RAM usage stays roughly **~500 MB** on a typical machine, which is often about **half of what the same number of full browser tabs would consume**.

## Prerequisites

- **Python 3.10+**
- **Node.js 18+ / npm**
- **LM Studio** running with an OpenAI-compatible server at:

  - Base URL: `http://localhost:1234/v1`
  - Any chat-capable model (set in LM Studio GUI)

## Backend Setup

1. Open a terminal in the `backend` folder:

   ```bash
   cd LA/backend
   ```

2. Create a virtual environment (optional but recommended):

   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # Windows PowerShell
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Run the API server:

   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

5. Test health endpoint:

   - Open: `http://localhost:8000/health`

## Frontend Setup

1. Open a terminal in the `frontend` folder:

   ```bash
   cd LA/frontend
   ```

2. Install Node dependencies:

   ```bash
   npm install
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Open the URL shown in the terminal (typically `http://localhost:5173`).

## Core API

The backend exposes three main endpoints used by the frontend:

- `POST /search`
  - Runs the **reflexive AI pipeline** (local LLM + web evidence) and returns:
    - `ai_summary`
    - `key_takeaways[]`
    - `followup_questions[]`
    - `results[]` (high-level snippets extracted from intermediate tool calls)

- `POST /web_search`
  - Fast **DuckDuckGo text search** for web-style results.
  - Returns a list of `SearchResult` objects with `title`, `url`, `snippet`, `source`, `score`.
  - Used to populate the **Web** / **All** sub-tabs and clickable links.

- `POST /image_search`
  - DuckDuckGo **image search** for the current query.
  - Returns a list of `ImageResult` objects with `url`, optional `thumbnail`, and `title`.
  - Used to render the image strip above the web results.

## Notes on Optimization

- No database or vector store is used, keeping RAM usage low.
- Frontend uses **React + Vite** with a very small dependency set.
- TailwindCSS is configured in JIT mode to only include used styles.

You can now customize prompts, UI colors, and add more tools (e.g. local files, custom APIs) while keeping this as a clean base.
