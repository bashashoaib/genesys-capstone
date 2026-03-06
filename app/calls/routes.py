from datetime import datetime

from flask import current_app, jsonify, request
from flask_login import current_user, login_required

from app.calls import bp
from app.extensions import db
from app.models import CallLog
from app.services.auth_utils import role_required
from app.services.csv_parser import normalize_phone
from app.services.twilio_service import TwilioService


@bp.post("/api/calls/manual")
@login_required
@role_required("agent", "admin")
def manual_call():
    payload = request.get_json(silent=True) or {}
    to_number = normalize_phone((payload.get("to_number") or "").strip())
    if not to_number:
        return jsonify({"error": "Invalid phone number"}), 400

    service = TwilioService()

    call_log = CallLog(
        direction="manual",
        from_number=current_user.username,
        to_number=to_number,
        status="queued",
    )
    db.session.add(call_log)
    db.session.flush()

    if service.is_configured():
        try:
            call = service.create_outbound_call(to_number)
            call_log.twilio_sid = call.sid
        except Exception as exc:
            call_log.status = "failed"
            call_log.notes = str(exc)
            call_log.ended_at = datetime.utcnow()
            db.session.commit()
            return jsonify({"error": "Twilio outbound failed", "detail": str(exc)}), 502
    elif current_app.config.get("ALLOW_SIMULATED_CALLS", True):
        call_log.twilio_sid = f"simulated-manual-{call_log.id}"
        call_log.status = "ringing"
    else:
        call_log.status = "failed"
        call_log.notes = "Twilio is not configured and simulated calls are disabled"
        call_log.ended_at = datetime.utcnow()
        db.session.commit()
        return jsonify({"error": "Twilio is not configured"}), 503

    db.session.commit()
    return jsonify({"id": call_log.id, "twilio_sid": call_log.twilio_sid, "status": call_log.status})


@bp.get("/api/calls/recent")
@login_required
@role_required("agent", "admin")
def recent_calls():
    limit = request.args.get("limit", default=20, type=int)
    limit = max(1, min(limit, 100))

    calls = CallLog.query.order_by(CallLog.started_at.desc()).limit(limit).all()
    return jsonify(
        [
            {
                "id": c.id,
                "direction": c.direction,
                "from_number": c.from_number,
                "to_number": c.to_number,
                "twilio_sid": c.twilio_sid,
                "status": c.status,
                "started_at": c.started_at.isoformat() if c.started_at else None,
                "ended_at": c.ended_at.isoformat() if c.ended_at else None,
            }
            for c in calls
        ]
    )