from flask import current_app, request
from twilio.request_validator import RequestValidator


def validate_twilio_signature() -> bool:
    if not current_app.config.get("TWILIO_VALIDATE_SIGNATURE", False):
        return True

    auth_token = current_app.config.get("TWILIO_AUTH_TOKEN")
    if not auth_token:
        return False

    signature = request.headers.get("X-Twilio-Signature", "")
    validator = RequestValidator(auth_token)
    return validator.validate(request.url, request.form, signature)