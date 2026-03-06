from flask import jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import ArchitectFlow, Queue, QueueMembership, RoutingInteraction, User
from app.routing import bp
from app.services.auth_utils import role_required


@bp.get("/api/routing/queues")
@login_required
@role_required("admin", "agent")
def list_queues():
    rows = Queue.query.order_by(Queue.name.asc()).all()
    return jsonify(
        [
            {
                "id": q.id,
                "name": q.name,
                "description": q.description,
                "routing_method": q.routing_method,
                "is_active": q.is_active,
            }
            for q in rows
        ]
    )


@bp.post("/api/routing/queues")
@login_required
@role_required("admin")
def create_queue():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    if Queue.query.filter_by(name=name).first():
        return jsonify({"error": "queue name already exists"}), 409

    queue = Queue(
        name=name,
        description=(payload.get("description") or "").strip() or None,
        routing_method=(payload.get("routing_method") or "longest_idle").strip(),
        is_active=bool(payload.get("is_active", True)),
    )
    db.session.add(queue)
    db.session.commit()
    return jsonify({"id": queue.id, "name": queue.name}), 201


@bp.patch("/api/routing/queues/<int:queue_id>")
@login_required
@role_required("admin")
def update_queue(queue_id: int):
    queue = Queue.query.get_or_404(queue_id)
    payload = request.get_json(silent=True) or {}

    if "description" in payload:
        queue.description = (payload.get("description") or "").strip() or None
    if "routing_method" in payload:
        queue.routing_method = (payload.get("routing_method") or "longest_idle").strip()
    if "is_active" in payload:
        queue.is_active = bool(payload.get("is_active"))

    db.session.commit()
    return jsonify({"id": queue.id, "name": queue.name, "is_active": queue.is_active})


@bp.get("/api/routing/queues/<int:queue_id>/members")
@login_required
@role_required("admin", "agent")
def list_queue_members(queue_id: int):
    Queue.query.get_or_404(queue_id)
    rows = QueueMembership.query.filter_by(queue_id=queue_id).all()
    return jsonify(
        [
            {
                "id": row.id,
                "user_id": row.user_id,
                "username": row.user.username,
                "role": row.user.role,
                "priority": row.priority,
                "is_active": row.is_active,
            }
            for row in rows
        ]
    )


@bp.post("/api/routing/queues/<int:queue_id>/members")
@login_required
@role_required("admin")
def upsert_queue_member(queue_id: int):
    Queue.query.get_or_404(queue_id)
    payload = request.get_json(silent=True) or {}
    user_id = payload.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "user not found"}), 404

    row = QueueMembership.query.filter_by(queue_id=queue_id, user_id=user_id).first()
    if not row:
        row = QueueMembership(queue_id=queue_id, user_id=user_id)
        db.session.add(row)

    if "priority" in payload:
        row.priority = max(1, int(payload.get("priority") or 1))
    if "is_active" in payload:
        row.is_active = bool(payload.get("is_active"))

    db.session.commit()
    return jsonify({"id": row.id, "queue_id": row.queue_id, "user_id": row.user_id, "is_active": row.is_active})


@bp.get("/api/architect/flows")
@login_required
@role_required("admin", "agent")
def list_flows():
    rows = ArchitectFlow.query.order_by(ArchitectFlow.updated_at.desc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "name": row.name,
                "flow_type": row.flow_type,
                "inbound_number": row.inbound_number,
                "target_queue_id": row.target_queue_id,
                "welcome_prompt": row.welcome_prompt,
                "is_published": row.is_published,
            }
            for row in rows
        ]
    )


@bp.post("/api/architect/flows")
@login_required
@role_required("admin")
def create_flow():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    queue_id = payload.get("target_queue_id")
    if queue_id and not Queue.query.get(queue_id):
        return jsonify({"error": "target queue not found"}), 404

    flow = ArchitectFlow(
        name=name,
        flow_type=(payload.get("flow_type") or "inbound_call").strip(),
        inbound_number=(payload.get("inbound_number") or "").strip() or None,
        target_queue_id=queue_id,
        welcome_prompt=(payload.get("welcome_prompt") or "").strip() or None,
        is_published=bool(payload.get("is_published", False)),
        created_by=current_user.id,
    )
    db.session.add(flow)
    db.session.commit()
    return jsonify({"id": flow.id, "name": flow.name}), 201


@bp.patch("/api/architect/flows/<int:flow_id>")
@login_required
@role_required("admin")
def update_flow(flow_id: int):
    flow = ArchitectFlow.query.get_or_404(flow_id)
    payload = request.get_json(silent=True) or {}

    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name cannot be empty"}), 400
        flow.name = name

    if "target_queue_id" in payload:
        queue_id = payload.get("target_queue_id")
        if queue_id is not None and not Queue.query.get(queue_id):
            return jsonify({"error": "target queue not found"}), 404
        flow.target_queue_id = queue_id

    if "inbound_number" in payload:
        flow.inbound_number = (payload.get("inbound_number") or "").strip() or None

    if "welcome_prompt" in payload:
        flow.welcome_prompt = (payload.get("welcome_prompt") or "").strip() or None

    db.session.commit()
    return jsonify({"id": flow.id, "name": flow.name})


@bp.post("/api/architect/flows/<int:flow_id>/publish")
@login_required
@role_required("admin")
def publish_flow(flow_id: int):
    flow = ArchitectFlow.query.get_or_404(flow_id)
    flow.is_published = True
    db.session.commit()
    return jsonify({"id": flow.id, "is_published": flow.is_published})


@bp.get("/api/routing/interactions")
@login_required
@role_required("admin", "agent")
def list_interactions():
    limit = request.args.get("limit", default=50, type=int)
    limit = max(1, min(limit, 200))

    rows = RoutingInteraction.query.order_by(RoutingInteraction.created_at.desc()).limit(limit).all()
    return jsonify(
        [
            {
                "id": row.id,
                "channel": row.channel,
                "direction": row.direction,
                "from_number": row.from_number,
                "to_number": row.to_number,
                "status": row.status,
                "twilio_sid": row.twilio_sid,
                "queue_id": row.queue_id,
                "assigned_user_id": row.assigned_user_id,
                "flow_id": row.flow_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "ended_at": row.ended_at.isoformat() if row.ended_at else None,
            }
            for row in rows
        ]
    )
@bp.get("/api/routing/agents")
@login_required
@role_required("admin", "agent")
def list_agents():
    users = User.query.filter(User.role.in_(["agent", "admin"]), User.is_active.is_(True)).order_by(User.username.asc()).all()
    return jsonify(
        [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "presence": u.presence.status if u.presence else "offline",
            }
            for u in users
        ]
    )
