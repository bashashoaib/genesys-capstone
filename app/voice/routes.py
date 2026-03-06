from datetime import datetime

from flask import Response, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import AgentPresence, CallLog, CampaignContact
from app.services.auth_utils import role_required
from app.services.campaign_worker import mark_campaign_completed_if_done
from app.services.routing_service import mark_interaction_status_by_sid, route_inbound_call
from app.services.twilio_service import TwilioService
from app.services.webhook_security import validate_twilio_signature
from app.voice import bp


@bp.get("/api/voice/token")
@login_required
@role_required("agent", "admin")
def voice_token():
    service = TwilioService()
    if not service.is_configured():
        return jsonify({"error": "Twilio is not configured"}), 400
    token = service.generate_access_token(f"agent-{current_user.id}-{current_user.username}")
    return jsonify({"token": token})


@bp.post("/api/agent/status")
@login_required
@role_required("agent", "admin")
def set_agent_status():
    payload = request.get_json(silent=True) or {}
    status = payload.get("status")
    if status not in {"available", "offline"}:
        return jsonify({"error": "status must be available or offline"}), 400

    presence = AgentPresence.query.filter_by(user_id=current_user.id).first()
    if not presence:
        presence = AgentPresence(user_id=current_user.id)
        db.session.add(presence)

    presence.status = status
    presence.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"status": presence.status})


@bp.post("/webhooks/twilio/voice/inbound")
def inbound_voice_webhook():
    if not validate_twilio_signature():
        return ("invalid signature", 403)

    to_number = request.form.get("To")
    from_number = request.form.get("From")
    call_sid = request.form.get("CallSid")

    decision = route_inbound_call(to_number=to_number, from_number=from_number, twilio_sid=call_sid)
    db.session.commit()

    service = TwilioService()
    twiml = service.inbound_twiml(decision.agent_identity, decision.welcome_prompt)
    return Response(twiml, mimetype="application/xml")


@bp.post("/webhooks/twilio/call-status")
def call_status_webhook():
    if not validate_twilio_signature():
        return ("invalid signature", 403)

    call_sid = request.form.get("CallSid")
    status = request.form.get("CallStatus")

    call_log = CallLog.query.filter_by(twilio_sid=call_sid).first()
    if call_log:
        call_log.status = status or call_log.status
        if status in {"completed", "busy", "failed", "no-answer", "canceled"}:
            call_log.ended_at = datetime.utcnow()

    contact = CampaignContact.query.filter_by(call_sid=call_sid).first()
    campaign_id = None
    if contact:
        campaign_id = contact.campaign_id
        map_status = {
            "initiated": "dialing",
            "ringing": "ringing",
            "in-progress": "answered",
            "completed": "answered",
            "busy": "failed",
            "failed": "failed",
            "no-answer": "failed",
            "canceled": "failed",
        }
        if status in map_status:
            contact.status = map_status[status]
            contact.updated_at = datetime.utcnow()
            if contact.status == "failed":
                contact.last_error = status

    mark_interaction_status_by_sid(call_sid, status)
    db.session.commit()

    if campaign_id:
        mark_campaign_completed_if_done(campaign_id)

    return ("", 204)


@bp.get("/twiml/manual-call")
def manual_call_twiml():
    to_number = request.args.get("to", "")
    service = TwilioService()
    return Response(service.manual_call_twiml(to_number), mimetype="application/xml")