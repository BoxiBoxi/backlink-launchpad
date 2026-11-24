# Wriai AI API (contract used by Backlink Launchpad)

Backlink Launchpad can write content through Wriai instead of the user's own OpenAI-compatible key.
The app only needs one OpenAI-compatible endpoint on wriai.com, authenticated with the user's existing
developer key (`wri_live_...`, same keys as the Wriai REST API v1) and paid in Wriai credits.

Status: **client implemented in this repo, server endpoint to be built in the Wriai app.**

## Endpoint

```
POST https://wriai.com/api/v1/ai/chat/completions
Authorization: Bearer wri_live_xxx          (X-API-Key also accepted, as in lib/api-auth.ts)
Content-Type: application/json
```

Base URL is configurable in the app with `WRIAI_API_BASE` (default `https://wriai.com/api/v1/ai`).

### Request (OpenAI chat format, subset)

```json
{
  "model": "wriai-auto",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "max_tokens": 4000,
  "temperature": 0.8,
  "response_format": { "type": "json_object" }
}
```

- `model`: ignored. The server always picks the model chain itself, in order, from `WRIAI_API_TEXT_MODEL` in Wriai's
  `.env` (default `gpt-5.6-luna|gpt-5.4-nano`). Responses report `model: "wriai-auto"`.
- `max_tokens` / `max_completion_tokens`, `temperature`, `response_format` are optional hints. The server may ignore them.
- No streaming needed (the app reads one JSON response).

### Response (200)

```json
{
  "id": "wriai-...",
  "object": "chat.completion",
  "model": "wriai-auto",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 },
  "wriai": { "characters": 4180, "credits_charged": 4180, "credits_remaining": 182340 }
}
```

Headers (the app reads either the headers or the `wriai` object):

```
X-Wriai-Credits-Charged: 4180
X-Wriai-Credits-Remaining: 182340
```

The app shows "N Wriai credits left" after each generation and after "Save and test" in Settings.

## Billing

- Charge by characters: `credits = ceil(output_chars * OUTPUT_RATE + input_chars * INPUT_RATE)`, rates set server side
  (suggested: input much cheaper than output). Use the same credit ledger as the rest of Wriai.
- Check the balance before calling the model (reject with 402 if clearly insufficient), charge the actual amount after.
- Do not charge when the model call fails.

## Errors

| Status | Body | App behaviour |
| --- | --- | --- |
| 401 | `{ "error": { "message": "Invalid API key" } }` | "Test" shows the message |
| 402 | `{ "error": { "message": "Insufficient credits", "code": "insufficient_credits" } }` | Stops and tells the user to top up at wriai.com/dashboard/billing |
| 429 | `{ "error": { "message": "Rate limit" } }` | Shows the message |
| 400 | `{ "error": { "message": "..." } }` | The app retries once without `response_format` / `temperature` if the message names them |

## Rate limits

Suggested: 30 requests/minute per key. The app generates one post per click (no bulk generation).
