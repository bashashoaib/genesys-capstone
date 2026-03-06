from flask import Blueprint

bp = Blueprint("routing", __name__)

from app.routing import routes  # noqa: E402,F401