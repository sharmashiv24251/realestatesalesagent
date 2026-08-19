# Northstar Homes Sales Agent

An AI sales agent ("Aarav") for **Northstar One**, a fictional 2/3 BHK residential
project in Sector 79, Gurugram. Built for the Huvo AI Forward Deployed Engineer
take-home assignment — the focus is the system prompt and agent behaviour, not
the surrounding scaffolding.

- **Backend**: FastAPI (Python), Gemini (`google-genai`) with automatic function
  calling over a small tool set (catalog lookup, slot booking, lead capture,
  do-not-contact, human escalation).
- **Frontend**: Next.js chat widget that talks to the backend over a session-based
  REST API.
- **Prompt**: [`backend/app/core/prompt.py`](backend/app/core/prompt.py) — one prompt,
  used for both chat and voice-style turns (voice turns get shorter, markdown-free,
  number-as-words formatting instructions baked into the same prompt).

## How to run

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env and set GEMINI_API_KEY (https://aistudio.google.com/app/apikey)

python run.py                      # serves on http://localhost:8000
```

API docs are auto-generated at `http://localhost:8000/docs`.

Core endpoints (all under `/api/v1`):
- `POST /session` — start a conversation, returns `session_id`
- `POST /chat` — send `{session_id, message}`, get the agent's reply
- `POST /session/{id}/end` — end the conversation and get analytics
- `GET /session/{id}/analytics` — pull analytics mid-conversation

### Frontend

```bash
cd frontend
npm install     # or bun install
npm run dev     # serves on http://localhost:3000
```

`frontend/.env.local` already points `NEXT_PUBLIC_API_URL` at
`http://localhost:8000` — update it if the backend runs elsewhere.

### Running the test suite

```bash
backend/.venv/bin/python backend/scripts/run_tests.py
```

This replays the scripted conversations in `backend/app/data/test_fixtures.json`
against the **live** agent (real Gemini calls, real tool execution) and
regenerates [`TEST_RESULTS.md`](TEST_RESULTS.md) at the repo root with the
input, expected behaviour, and actual output for every turn, plus pass/fail for
each automated assertion. It requires a valid `GEMINI_API_KEY` in `backend/.env`.

## Key assumptions

- **Single project, fixed facts.** Only Northstar One exists, with exactly the
  configurations and starting prices given in the brief. The catalog, booking
  slots, and process/FAQ knowledge base are all in
  `backend/app/data/*.json` — the agent is instructed to answer only from what's
  in those files and never invent prices, discounts, availability, or other
  details.
- **Site visits are simulated.** Booking checks a fixed set of mock slots
  (`backend/app/data/booking_config.json`) rather than a real calendar system.
  A subset of slots/phone-number shapes are deliberately treated as
  booking failures so that failure-handling behaviour can be exercised and
  tested.
- **Analytics are computed deterministically**, not via a second LLM call —
  `analytics_service.py` derives budget, configuration interest, language mix,
  objections, lead-interest score, site-visit status, and follow-up
  requirement from the tracked session state and `scoring_config.json`. This
  keeps the numbers reproducible and directly testable, at the cost of being
  less flexible than a free-form LLM summary.
- **Session memory is in-process and in-memory** (`session_store.py`), keyed by
  `session_id`, with a TTL. There is no database — restarting the backend
  drops all sessions.
- **One voice/chat prompt.** Rather than branching prompts, the same system
  prompt carries channel-specific instructions (voice: no markdown, numbers
  spoken as words, at most ~2 sentences and one question per turn) and the
  channel is passed in as session state.

## Known limitations

- No persistence layer — sessions and leads live only in memory for the
  process lifetime.
- No authentication/rate-limiting on the API; this is a take-home demo, not a
  production surface.
- No real telephony/voice integration — "voice mode" only shapes the *text*
  the agent produces (formatting, brevity) for a voice channel; it does not
  do speech-to-text/text-to-speech.
- The Hindi/Hinglish handling is prompt-driven, not backed by a translation
  layer, so quality depends on the underlying model's multilingual ability.
- Of 15 scripted fixtures in `TEST_RESULTS.md`, 12 pass automatically, 2 are
  marked manual-review (language-switching and out-of-scope-but-relevant
  questions are judged qualitatively), and 1 (`T12_off_topic_testing`) fails
  an automated check: on a fully off-topic technical question the agent
  answers it directly instead of declining and redirecting, which the prompt
  is meant to prevent.

## AI tools used

Built with Claude Code (Anthropic) for backend/frontend implementation,
prompt drafting and iteration, and test fixture generation.
