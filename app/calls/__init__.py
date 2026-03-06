from flask import Blueprint

bp = Blueprint("calls", __name__)

from app.calls import routes  # noqa: E402,F401