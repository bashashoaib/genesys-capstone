from flask import jsonify, request
from flask_login import login_required

from app.explore import bp
from app.services.auth_utils import role_required
from app.explore.catalog import CATALOG, filter_catalog, summary_stats


@bp.get("/api/explore/catalog")
@login_required
@role_required("agent", "admin")
def get_catalog():
    role = request.args.get("role")
    track = request.args.get("track")
    content_type = request.args.get("type")
    level = request.args.get("level")

    items = filter_catalog(role=role, track=track, content_type=content_type, level=level)
    return jsonify({"items": items, "summary": summary_stats(items)})


@bp.get("/api/explore/recommendations")
@login_required
@role_required("agent", "admin")
def recommendations():
    role = request.args.get("role", "agent")
    if role not in {"agent", "admin"}:
        return jsonify({"error": "role must be agent or admin"}), 400

    items = filter_catalog(role=role)
    prioritized = sorted(
        items,
        key=lambda x: (
            0 if x["type"] == "learning_path" else 1,
            0 if x["level"] in {"beginner", "intermediate"} else 1,
            x["duration_hours"],
        ),
    )
    return jsonify({"role": role, "items": prioritized[:4]})


@bp.get("/api/explore/tracks")
@login_required
@role_required("agent", "admin")
def tracks():
    rows = sorted({x["track"] for x in CATALOG})
    return jsonify({"tracks": rows})