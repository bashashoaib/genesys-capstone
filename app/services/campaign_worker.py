from __future__ import annotations

from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app.extensions import db
from app.models import CallLog, Campaign, CampaignContact
from app.services.twilio_service import TwilioService

scheduler = BackgroundScheduler()
_app = None


def init_scheduler(app):
    global _app
    _app = app
    if not app.config.get("SCHEDULER_ENABLED", True):
        return
    if not scheduler.running:
        scheduler.start()


def schedule_campaign(campaign_id: int):
    job_id = f"campaign_{campaign_id}"
    if scheduler.get_job(job_id):
        return

    scheduler.add_job(
        func=_tick_campaign,
        id=job_id,
        trigger="interval",
        seconds=5,
        max_instances=1,
        replace_existing=True,
        args=[campaign_id],
    )


def pause_campaign_schedule(campaign_id: int):
    job_id = f"campaign_{campaign_id}"
    job = scheduler.get_job(job_id)
    if job:
        job.pause()


def resume_campaign_schedule(campaign_id: int):
    job_id = f"campaign_{campaign_id}"
    job = scheduler.get_job(job_id)
    if job:
        job.resume()
    else:
        schedule_campaign(campaign_id)


def stop_campaign_schedule(campaign_id: int):
    job_id = f"campaign_{campaign_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)


def _tick_campaign(campaign_id: int):
    if _app is None:
        return

    with _app.app_context():
        campaign = Campaign.query.get(campaign_id)
        if not campaign:
            stop_campaign_schedule(campaign_id)
            return

        if campaign.status != "running":
            return

        pending = CampaignContact.query.filter_by(campaign_id=campaign_id, status="pending").order_by(CampaignContact.id.asc()).first()

        if not pending:
            campaign.status = "completed"
            campaign.stopped_at = datetime.utcnow()
            db.session.commit()
            stop_campaign_schedule(campaign_id)
            return

        pending.status = "dialing"
        pending.attempt_count += 1
        pending.updated_at = datetime.utcnow()
        db.session.flush()

        call_log = CallLog(
            direction="campaign",
            from_number=_app.config.get("TWILIO_CALLER_ID", ""),
            to_number=pending.phone,
            status="queued",
            campaign_contact_id=pending.id,
        )
        db.session.add(call_log)
        db.session.flush()

        service = TwilioService()
        if service.is_configured():
            try:
                call = service.create_outbound_call(pending.phone, pending.id)
                call_log.twilio_sid = call.sid
                pending.call_sid = call.sid
            except Exception as exc:
                pending.status = "failed"
                pending.last_error = str(exc)
                call_log.status = "failed"
                call_log.ended_at = datetime.utcnow()
        else:
            # Local dev fallback allows status transitions to be testable without Twilio credentials.
            call_log.twilio_sid = f"simulated-{pending.id}-{int(datetime.utcnow().timestamp())}"
            pending.call_sid = call_log.twilio_sid
            pending.status = "ringing"
            call_log.status = "ringing"

        db.session.commit()