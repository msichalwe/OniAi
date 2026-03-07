# API Quickstart

## Run the Oni companion app

```bash
npm run dev
```

Run that from `apps/oni`.

## Environment

Create `.env.local` in `apps/oni` with:

```bash
ONI_GATEWAY_URL=http://localhost:19100
ONI_GATEWAY_TOKEN=your_gateway_token_here
```

`ONI_GATEWAY_TOKEN` is only needed if gateway auth is enabled.

## Endpoint

- `POST /api/think`

## Voice cURL

```bash
curl -N -X POST http://localhost:3000/api/think \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "voice",
    "text": "What can you help me with while watching my screen?",
    "context": "The user is testing the Oni companion app.",
    "gatewayUrl": "http://localhost:19100",
    "gatewayToken": "your_gateway_token_here"
  }'
```

Expected response: plain text. If the OniAI gateway chat completions endpoint is enabled, the response can stream from the gateway. If it is disabled, the route falls back to a local voice helper response in development.

## Vision cURL

```bash
curl -N -X POST http://localhost:3000/api/think \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "vision",
    "frame": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
    "context": "The user is editing TypeScript files in the Oni repo.",
    "text": "What do you see? Be brief and helpful."
  }'
```

Expected response today: `501 Not Implemented` with a message explaining that multimodal vision is not enabled on the current gateway-backed route yet.

## REST Client

- `scripts/http/oni.http`

## Auth notes

- This endpoint first attempts to proxy voice requests to the OniAI gateway OpenAI-compatible endpoint at `/v1/chat/completions`.
- If that gateway chat completions endpoint is disabled in local development, the route falls back to a local helper response so `POST /api/think` still works for voice mode.
- Configure `ONI_GATEWAY_URL` and optionally `ONI_GATEWAY_TOKEN` on the server side.
- Do not expose gateway secrets in client code.
