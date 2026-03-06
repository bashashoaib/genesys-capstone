from datetime import datetime

from flask import jsonify, request
from flask_login import current_user, login_required

from app.campaigns import bp
from app.extensions import db
from app.models import Campaign, CampaignContact
from app.services.auth_utils import role_required
from app.services.campaign_worker import (
    pause_campaign_schedule,
    resume_campaign_schedule,
    schedule_campaign,
    stop_campaign_schedule,
)
from app.services.csv_parser import parse_contacts_csv

VALID_TRANSITIONS = {
    "draft": {"running", "stopped"},
    "running": {"paused", "stopped", "completed"},
    "paused": {"running", "stopped"},
    "stopped": set(),
    "completed": set(),
}


@bp.post("/api/campaigns")
@login_required
@role_required("admin")
def create_campaign():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    campaign = Campaign(name=name, created_by=current_user.id, status="draft")
    db.session.add(campaign)
    db.session.commit()
    return jsonify({"id": campaign.id, "name": campaign.name, "status": campaign.status}), 201


@bp.post("/api/campaigns/<int:campaign_id>/contacts/upload")
@login_required
@role_required("admin")
def upload_contacts(campaign_id: int):
    campaign = Campaign.query.get_or_404(campaign_id)
    if campaign.status not in {"draft", "paused"}:
        return jsonify({"error": "contacts can only be uploaded in draft or paused state"}), 409

    csv_file = request.files.get("file")
    if not csv_file:
        return jsonify({"error": "file is required"}), 400

    try:
        result = parse_contacts_csv(csv_file.read())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    for row in result.valid_rows:
        db.session.add(CampaignContact(campaign_id=campaign.id, name=row["name"], phone=row["phone"], status="pending"))

    db.session.commit()

    return jsonify(
        {
            "campaign_id": campaign.id,
            "inserted": len(result.valid_rows),
            "invalid": result.invalid_rows,
        }
    )


@bp.post("/api/campaigns/<int:campaign_id>/start")
@login_required
@role_required("admin")
def start_campaign(campaign_id: int):
    campaign = Campaign.query.get_or_404(campaign_id)
    if campaign.status not in {"draft", "paused"}:
        return jsonify({"error": f"cannot start campaign in {campaign.status} state"}), 409

    previous_status = campaign.status
    if campaign.status == "draft" and not CampaignContact.query.filter_by(campaign_id=campaign.id).first():
        return jsonify({"error": "campaign has no contacts"}), 400

    _set_campaign_status(campaign, "running")
    if campaign.started_at is None:
        campaign.started_at = datetime.utcnow()

    db.session.commit()

    if campaign.status == "running":
        if previous_status == "paused":
            resume_campaign_schedule(campaign.id)
        else:
            schedule_campaign(campaign.id)

    return jsonify({"id": campaign.id, "status": campaign.status})


@bp.post("/api/campaigns/<int:campaign_id>/pause")
@login_required
@role_required("admin")
def pause_campaign(campaign_id: int):
    campaign = Campaign.query.get_or_404(campaign_id)
    if campaign.status != "running":
        return jsonify({"error": "only running campaigns can be paused"}), 409

    _set_campaign_status(campaign, "paused")
    db.session.commit()
    pause_campaign_schedule(campaign.id)
    return jsonify({"id": campaign.id, "status": campaign.status})


@bp.post("/api/campaigns/<int:campaign_id>/stop")
@login_required
@role_required("admin")
def stop_campaign(campaign_id: int):
    campaign = Campaign.query.get_or_404(campaign_id)
    if campaign.status not in {"draft", "running", "paused"}:
        return jsonify({"error": f"cannot stop campaign in {campaign.status} state"}), 409

    _set_campaign_status(campaign, "stopped")
    campaign.stopped_at = datetime.utcnow()
    db.session.commit()
    stop_campaign_schedule(campaign.id)
    return jsonify({"id": campaign.id, "status": campaign.status})


@bp.get("/api/campaigns/<int:campaign_id>/status")
@login_required
@role_required("admin", "agent")
def campaign_status(campaign_id: int):
    campaign = Campaign.query.get_or_404(campaign_id)
    counts = (
        db.session.query(CampaignContact.status, db.func.count(CampaignContact.id))
        .filter_by(campaign_id=campaign.id)
        .group_by(CampaignContact.status)
        .all()
    )
    return jsonify(
        {
            "id": campaign.id,
            "name": campaign.name,
            "status": campaign.status,
            "counts": {status: count for status, count in counts},
        }
    )


@bp.get("/api/campaigns/<int:campaign_id>/contacts")
@login_required
@role_required("admin", "agent")
def campaign_contacts(campaign_id: int):
    Campaign.query.get_or_404(campaign_id)

    offset = request.args.get("offset", default=0, type=int)
    limit = request.args.get("limit", default=50, type=int)
    limit = max(1, min(limit, 200))

    query = CampaignContact.query.filter_by(campaign_id=campaign_id).order_by(CampaignContact.id.asc())
    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    return jsonify(
        {
            "total": total,
            "items": [
                {
                    "id": row.id,
                    "name": row.name,
                    "phone": row.phone,
                    "status": row.status,
                    "attempt_count": row.attempt_count,
                    "last_error": row.last_error,
                    "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                }
                for row in rows
            ],
        }
    )


def _set_campaign_status(campaign: Campaign, target_status: str):
    allowed = VALID_TRANSITIONS.get(campaign.status, set())
    if target_status not in allowed:
        raise ValueError(f"invalid status transition: {campaign.status} -> {target_status}")
    campaign.status = target_status