from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

from flask import current_app, url_for
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.rest import Client
from twilio.twiml.voice_response import Dial, VoiceResponse


@dataclass
class TwilioConfig:
    account_sid: str
    auth_token: str
    api_key: str
    api_secret: str
    app_sid: str
    caller_id: str
    webhook_base_url: str


class TwilioService:
    def __init__(self) -> None:
        cfg = current_app.config
        self.config = TwilioConfig(
            account_sid=cfg["TWILIO_ACCOUNT_SID"],
            auth_token=cfg["TWILIO_AUTH_TOKEN"],
            api_key=cfg["TWILIO_API_KEY"],
            api_secret=cfg["TWILIO_API_SECRET"],
            app_sid=cfg["TWILIO_APP_SID"],
            caller_id=cfg["TWILIO_CALLER_ID"],
            webhook_base_url=cfg["TWILIO_WEBHOOK_BASE_URL"],
        )

    def is_configured(self) -> bool:
        return all(
            [
                self.config.account_sid,
                self.config.auth_token,
                self.config.api_key,
                self.config.api_secret,
                self.config.app_sid,
                self.config.caller_id,
                self.config.webhook_base_url,
            ]
        )

    def _client(self) -> Client:
        return Client(self.config.account_sid, self.config.auth_token)

    def generate_access_token(self, identity: str) -> str:
        token = AccessToken(
            self.config.account_sid,
            self.config.api_key,
            self.config.api_secret,
            identity=identity,
        )
        voice = VoiceGrant(outgoing_application_sid=self.config.app_sid, incoming_allow=True)
        token.add_grant(voice)
        jwt_token = token.to_jwt()
        return jwt_token if isinstance(jwt_token, str) else jwt_token.decode("utf-8")

    def create_outbound_call(self, to_number: str, campaign_contact_id: int | None = None):
        status_callback = self._absolute_url("voice.call_status_webhook")
        url = self._absolute_url("voice.manual_call_twiml")
        twiml_params = {"to": to_number}
        if campaign_contact_id:
            twiml_params["campaign_contact_id"] = campaign_contact_id

        return self._client().calls.create(
            to=to_number,
            from_=self.config.caller_id,
            url=f"{url}?{urlencode(twiml_params)}",
            status_callback=status_callback,
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            status_callback_method="POST",
        )

    def inbound_twiml(self, agent_identity: str | None, welcome_prompt: str | None = None) -> str:
        response = VoiceResponse()
        if welcome_prompt:
            response.say(welcome_prompt)

        if agent_identity:
            dial = Dial(caller_id=self.config.caller_id, answer_on_bridge=True, timeout=20)
            dial.client(agent_identity)
            response.append(dial)
        else:
            response.say("No routed agent is currently available. Please call again later.")
            response.hangup()
        return str(response)

    def manual_call_twiml(self, to_number: str) -> str:
        response = VoiceResponse()
        response.dial(caller_id=self.config.caller_id, number=to_number)
        return str(response)

    def _absolute_url(self, endpoint: str) -> str:
        if self.config.webhook_base_url:
            path = url_for(endpoint, _external=False)
            return f"{self.config.webhook_base_url.rstrip('/')}{path}"
        return url_for(endpoint, _external=True)