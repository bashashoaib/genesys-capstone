# Real Working Conditions Checklist

## 1) Switch off simulation
Set in `.env`:
- `APP_ENV=production`
- `ALLOW_SIMULATED_CALLS=false`
- `TWILIO_VALIDATE_SIGNATURE=true`

## 2) Required Twilio settings
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_API_KEY`
- `TWILIO_API_SECRET`
- `TWILIO_APP_SID`
- `TWILIO_CALLER_ID`
- `TWILIO_WEBHOOK_BASE_URL`

## 3) Webhooks
Configure Twilio webhooks to point to:
- `POST /webhooks/twilio/voice/inbound`
- `POST /webhooks/twilio/call-status`

Use a reachable HTTPS base URL in `TWILIO_WEBHOOK_BASE_URL`.

## 4) Campaign tuning
- `CAMPAIGN_DIAL_INTERVAL_SECONDS` controls pacing
- `CAMPAIGN_MAX_ATTEMPTS` controls max retries per contact

## 5) Runtime behavior in real mode
- Manual and campaign calls fail with `503` if Twilio config is missing.
- Twilio webhook signature is verified when enabled.
- Campaigns auto-complete when contacts are no longer pending/dialing/ringing.