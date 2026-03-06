from flask import jsonify, request
from flask_login import current_user, login_required, login_user, logout_user
from werkzeug.security import check_password_hash

from app.auth import bp
from app.models import User


@bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password_hash, password) or not user.is_active:
        return jsonify({"error": "Invalid credentials"}), 401

    login_user(user)
    return jsonify({"id": user.id, "username": user.username, "role": user.role})


@bp.post("/logout")
@login_required
def logout():
    logout_user()
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    if not current_user.is_authenticated:
        return jsonify({"authenticated": False})
    return jsonify(
        {
            "authenticated": True,
            "id": current_user.id,
            "username": current_user.username,
            "role": current_user.role,
        }
    )