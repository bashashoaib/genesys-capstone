from flask import Blueprint

bp = Blueprint("cloud_mock", __name__)

from app.cloud_mock import routes  # noqa: E402,F401