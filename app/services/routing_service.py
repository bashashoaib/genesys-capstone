from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.extensions import db
from app.models import AgentPresence, ArchitectFlow, Queue, QueueMembership, RoutingInteraction, User


@dataclass
class RoutingDecision:
    agent_identity: str | None
    interaction_id: int
    flow_id: int | None
    queue_id: int | None
    welcome_prompt: str | None


def build_agent_identity(user: User) -> str:
    return f"agent-{user.id}-{user.username}"


def get_published_flow_for_number(number: str | None) -> ArchitectFlow | None:
    if number:
        flow = ArchitectFlow.query.filter_by(flow_type="inbound_call", inbound_number=number, is_published=True).first()
        if flow:
            return flow

    # Fallback flow: first published inbound flow with no dedicated number.
    return ArchitectFlow.query.filter_by(flow_type="inbound_call", inbound_number=None, is_published=True).order_by(ArchitectFlow.id.asc()).first()


def select_available_member(queue_id: int | None) -> User | None:
    if not queue_id:
        return None

    membership = (
        QueueMembership.query.join(User, User.id == QueueMembership.user_id)
        .join(AgentPresence, AgentPresence.user_id == User.id)
        .join(Queue, Queue.id == QueueMembership.queue_id)
        .filter(
            QueueMembership.queue_id == queue_id,
            QueueMembership.is_active.is_(True),
            Queue.is_active.is_(True),
            User.is_active.is_(True),
            AgentPresence.status == "available",
        )
        .order_by(QueueMembership.priority.desc(), AgentPresence.updated_at.asc())
        .first()
    )

    return membership.user if membership else None


def create_routing_interaction(
    from_number: str | None,
    to_number: str | None,
    twilio_sid: str | None,
    flow_id: int | None,
    queue_id: int | None,
    assigned_user_id: int | None,
) -> RoutingInteraction:
    if twilio_sid:
        existing = RoutingInteraction.query.filter_by(twilio_sid=twilio_sid).first()
        if existing:
            existing.flow_id = flow_id
            existing.queue_id = queue_id
            existing.assigned_user_id = assigned_user_id
            existing.status = "routed" if assigned_user_id else "queued"
            if assigned_user_id and not existing.answered_at:
                existing.answered_at = datetime.utcnow()
            db.session.flush()
            return existing

    interaction = RoutingInteraction(
        channel="voice",
        direction="inbound",
        from_number=from_number,
        to_number=to_number,
        status="routed" if assigned_user_id else "queued",
        twilio_sid=twilio_sid,
        flow_id=flow_id,
        queue_id=queue_id,
        assigned_user_id=assigned_user_id,
        answered_at=datetime.utcnow() if assigned_user_id else None,
    )
    db.session.add(interaction)
    db.session.flush()
    return interaction


def route_inbound_call(to_number: str | None, from_number: str | None, twilio_sid: str | None) -> RoutingDecision:
    flow = get_published_flow_for_number(to_number)
    queue_id = flow.target_queue_id if flow else None
    agent = select_available_member(queue_id)

    interaction = create_routing_interaction(
        from_number=from_number,
        to_number=to_number,
        twilio_sid=twilio_sid,
        flow_id=flow.id if flow else None,
        queue_id=queue_id,
        assigned_user_id=agent.id if agent else None,
    )

    return RoutingDecision(
        agent_identity=build_agent_identity(agent) if agent else None,
        interaction_id=interaction.id,
        flow_id=flow.id if flow else None,
        queue_id=queue_id,
        welcome_prompt=flow.welcome_prompt if flow else None,
    )


def mark_interaction_status_by_sid(twilio_sid: str | None, twilio_status: str | None):
    if not twilio_sid:
        return

    interaction = RoutingInteraction.query.filter_by(twilio_sid=twilio_sid).first()
    if not interaction:
        return

    status_map = {
        "initiated": "initiated",
        "ringing": "ringing",
        "in-progress": "connected",
        "completed": "completed",
        "busy": "failed",
        "failed": "failed",
        "no-answer": "failed",
        "canceled": "failed",
    }

    if twilio_status in status_map:
        interaction.status = status_map[twilio_status]

    if twilio_status in {"completed", "busy", "failed", "no-answer", "canceled"}:
        interaction.ended_at = datetime.utcnow()