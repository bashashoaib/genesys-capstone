# Testing Requirements (Mini-Genesys)

## 1) Environment
- Python 3.10+ installed and available on PATH (`python --version`).
- Virtual environment activated.
- Dependencies installed:
  - `pip install -r requirements.txt`
- Optional Twilio live testing:
  - Valid Twilio credentials in `.env`
  - Public webhook URL (for example, ngrok) set as `TWILIO_WEBHOOK_BASE_URL`

## 2) Test Data
- Use `testing_assets/sample_campaign_contacts.csv` for campaign upload testing.
- CSV columns are required exactly as: `name,phone`.
- Phone numbers should be E.164 format (`+1...`) for reliable behavior.

## 3) Automated Tests
Run:
```bash
python -m pytest -q
```
Expected:
- Auth/session tests pass.
- CSV parser tests pass.
- Campaign transition tests pass.
- Voice webhook/manual call logging tests pass.

## 4) Manual Smoke Test Checklist
1. Start app:
   - `python run.py`
2. Login checks:
   - Login with `admin/admin123` and `agent/agent123`.
3. Agent presence:
   - Toggle `Available` / `Offline` and confirm success message.
4. Manual outbound:
   - Dial a valid number and verify call appears in Recent Calls.
5. Campaign flow:
   - Create campaign.
   - Upload `sample_campaign_contacts.csv`.
   - Start, pause, resume, and stop campaign.
   - Confirm contact statuses update (`pending`, `dialing`, `ringing`, `answered`, `failed`).
6. Inbound webhook:
   - Set agent `Available`, trigger Twilio inbound call, verify browser route.
   - Set `Offline`, verify busy/offline message behavior.

## 5) Common Failure Checks
- `ModuleNotFoundError`: install dependencies in active venv.
- Twilio token errors: verify all `TWILIO_*` env vars.
- Webhook callback failures: ensure `TWILIO_WEBHOOK_BASE_URL` is reachable.
- CSV rejected: confirm headers are `name,phone`.