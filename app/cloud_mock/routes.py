from flask import jsonify, request
from flask_login import login_required

from app.cloud_mock import bp
from app.services.auth_utils import role_required
from app.cloud_mock.data import ACTIONS, DASHBOARDS, MODULES, QUEUE_SUMMARY, categories, modules_by_category


@bp.get("/api/cloud-replica/overview")
@login_required
@role_required("agent", "admin")
def cloud_overview():
    return jsonify(
        {
            "modules_total": len(MODULES),
            "categories": categories(),
            "dashboards": DASHBOARDS,
            "queue_summary": QUEUE_SUMMARY,
            "actions": ACTIONS,
        }
    )


@bp.get("/api/cloud-replica/modules")
@login_required
@role_required("agent", "admin")
def cloud_modules():
    category = request.args.get("category")
    q = (request.args.get("q") or "").strip().lower()

    rows = modules_by_category(category)
    if q:
        rows = [
            row
            for row in rows
            if q in row["name"].lower()
            or any(q in feature.lower() for feature in row["features"])
            or q in row["category"].lower()
        ]

    return jsonify({"items": rows, "count": len(rows)})


@bp.get("/api/cloud-replica/module/<module_id>")
@login_required
@role_required("agent", "admin")
def cloud_module_detail(module_id: str):
    module = next((m for m in MODULES if m["id"] == module_id), None)
    if not module:
        return jsonify({"error": "module not found"}), 404

    return jsonify(
        {
            "module": module,
            "dummy_panels": [
                "Configuration",
                "Templates",
                "Permissions",
                "Audit Trail",
                "Export",
            ],
            "dummy_objects": [
                {"name": f"{module['name']} Object A", "status": "active"},
                {"name": f"{module['name']} Object B", "status": "draft"},
                {"name": f"{module['name']} Object C", "status": "archived"},
            ],
        }
    )


@bp.post("/api/cloud-replica/action")
@login_required
@role_required("agent", "admin")
def cloud_action():
    return jsonify(
        {
            "ok": True,
            "message": "Dummy action accepted. No backend mutation is performed in replica mode.",
        }
    )