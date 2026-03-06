from flask import Blueprint, render_template
from flask_login import current_user, login_required

bp = Blueprint("main", __name__)


@bp.get("/")
def login_page():
    if current_user.is_authenticated:
        return render_template("index.html")
    return render_template("login.html")


@bp.get("/app")
@login_required
def app_page():
    return render_template("index.html")