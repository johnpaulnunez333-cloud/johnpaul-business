import hmac
import io
import os
import re
import secrets
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from functools import wraps

import cloudinary.uploader
from flask import Flask, jsonify, render_template, request, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from flask_talisman import Talisman
from sqlalchemy import func
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

IS_PROD = os.environ.get("APP_ENV", "production") == "production"

SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    if IS_PROD:
        raise RuntimeError("SECRET_KEY is required")
    SECRET_KEY = secrets.token_hex(32)

ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
_plain = os.environ.get("ADMIN_PASSWORD", "")
if _plain and IS_PROD and len(_plain) < 12:
    raise RuntimeError("ADMIN_PASSWORD must be at least 12 characters")
ADMIN_HASH = os.environ.get("ADMIN_PASSWORD_HASH") or generate_password_hash(
    _plain or secrets.token_hex(16)
)
ADMIN_PATH = os.environ.get("ADMIN_PATH", "admin").strip("/") or "admin"

CLOUD_PREFIX = "https://res.cloudinary.com/"
PHONE_RE = re.compile(r"^(\+63|63|0)9\d{9}$")
SETTING_KEYS = ("shop_name", "maya_name", "maya_number", "qr_url")
NEXT_STATUS = {
    "pending": ["paid", "cancelled"],
    "paid": ["shipped", "cancelled"],
    "shipped": ["completed"],
    "completed": [],
    "cancelled": [],
}

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

db_url = os.environ.get("DATABASE_URL", "sqlite:///local.db")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

app.config.update(
    SECRET_KEY=SECRET_KEY,
    SQLALCHEMY_DATABASE_URI=db_url,
    SQLALCHEMY_ENGINE_OPTIONS={"pool_pre_ping": True, "pool_recycle": 280},
    SESSION_COOKIE_NAME="__Host-sid" if IS_PROD else "sid",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Strict",
    PERMANENT_SESSION_LIFETIME=timedelta(minutes=30),
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,
)

CSP = {
    "default-src": "'none'",
    "script-src": ["'self'", "https://cdn.jsdelivr.net"],
    "style-src": ["'self'", "https://cdn.jsdelivr.net"],
    "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
    "font-src": ["'self'", "https://cdn.jsdelivr.net"],
    "connect-src": "'self'",
    "form-action": "'self'",
    "base-uri": "'none'",
    "frame-ancestors": "'none'",
    "object-src": "'none'",
}

Talisman(
    app,
    content_security_policy=CSP,
    force_https=IS_PROD,
    strict_transport_security=True,
    strict_transport_security_max_age=31536000,
    session_cookie_secure=IS_PROD,
    frame_options="DENY",
    referrer_policy="same-origin",
    permissions_policy={"geolocation": "()", "camera": "()", "microphone": "()"},
)

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["300 per hour", "60 per minute"],
    storage_uri="memory://",
)

db = SQLAlchemy(app)


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, default="")
    price = db.Column(db.Numeric(10, 2), nullable=False)
    stock = db.Column(db.Integer, nullable=False, default=0)
    image_url = db.Column(db.String(500), default="")
    active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": float(self.price),
            "stock": self.stock,
            "image_url": self.image_url,
            "active": self.active,
        }


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(16), unique=True, index=True, nullable=False)
    name = db.Column(db.String(80), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    address = db.Column(db.String(250), nullable=False)
    total = db.Column(db.Numeric(12, 2), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending")
    proof_url = db.Column(db.String(500), default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    items = db.relationship(
        "OrderItem", backref="order", cascade="all, delete-orphan", lazy="joined"
    )

    def items_list(self):
        return [
            {"name": i.name, "qty": i.qty, "price": float(i.price)} for i in self.items
        ]

    def public(self):
        return {
            "code": self.code,
            "status": self.status,
            "total": float(self.total),
            "created_at": self.created_at.isoformat() + "Z",
            "has_proof": bool(self.proof_url),
            "items": self.items_list(),
        }

    def admin(self):
        data = self.public()
        data.update(
            {
                "id": self.id,
                "name": self.name,
                "phone": self.phone,
                "address": self.address,
                "proof_url": self.proof_url,
                "next": NEXT_STATUS.get(self.status, []),
            }
        )
        return data


class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False)
    product_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    qty = db.Column(db.Integer, nullable=False)


class Setting(db.Model):
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(500), default="")


with app.app_context():
    db.create_all()


def clean(value, limit):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def is_image(raw):
    return (
        raw[:3] == b"\xff\xd8\xff"
        or raw[:8] == b"\x89PNG\r\n\x1a\n"
        or (raw[:4] == b"RIFF" and raw[8:12] == b"WEBP")
    )


def store_image(folder):
    upload = request.files.get("file")
    if not upload:
        raise ApiError("No file was uploaded.")
    raw = upload.read()
    if not raw or len(raw) > 4 * 1024 * 1024 or not is_image(raw):
        raise ApiError("Upload a JPG, PNG, or WEBP image under 4 MB.")
    try:
        result = cloudinary.uploader.upload(
            io.BytesIO(raw), folder=folder, resource_type="image"
        )
    except Exception:
        app.logger.exception("Cloudinary upload failed")
        raise ApiError("Image upload failed. Try again later.", 502)
    return result["secure_url"]


def get_settings():
    rows = {s.key: s.value for s in Setting.query.all()}
    return {k: rows.get(k, "") for k in SETTING_KEYS}


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin"):
            raise ApiError("Authentication required.", 401)
        return fn(*args, **kwargs)

    return wrapper


def find_order(code):
    order = Order.query.filter_by(code=clean(code, 16).upper()).first()
    if not order:
        raise ApiError("Order not found.", 404)
    return order


def apply_product(product, data):
    name = clean(data.get("name"), 120)
    if len(name) < 2:
        raise ApiError("Product name is required.")
    try:
        price = Decimal(str(data.get("price"))).quantize(Decimal("0.01"))
        stock = int(data.get("stock"))
    except (InvalidOperation, TypeError, ValueError):
        raise ApiError("Enter a valid price and stock number.")
    if not (0 <= price <= 1000000) or not (0 <= stock <= 100000):
        raise ApiError("Price or stock is out of range.")
    image = str(data.get("image_url") or "")[:500]
    if image and not image.startswith(CLOUD_PREFIX):
        raise ApiError("Invalid image URL.")
    product.name = name
    product.description = clean(data.get("description"), 1000)
    product.price = price
    product.stock = stock
    product.image_url = image
    product.active = bool(data.get("active"))


@app.before_request
def csrf_guard():
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        origin = request.headers.get("Origin")
        if origin and origin.rstrip("/") != request.host_url.rstrip("/"):
            return jsonify(error="Blocked cross-site request."), 403
        sent = request.headers.get("X-CSRF-Token", "")
        expected = session.get("csrf", "")
        if not expected or not hmac.compare_digest(sent, expected):
            return jsonify(error="Security token expired. Refresh the page."), 403


@app.after_request
def api_headers(response):
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    return response


@app.errorhandler(ApiError)
def handle_api_error(err):
    db.session.rollback()
    return jsonify(error=err.message), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err):
    return jsonify(error=err.name), err.code


@app.errorhandler(Exception)
def handle_unknown(err):
    db.session.rollback()
    app.logger.exception("Unhandled error")
    return jsonify(error="Something went wrong."), 500


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/" + ADMIN_PATH)
def admin_page():
    return render_template("admin.html")


@app.get("/api/csrf")
def csrf():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return jsonify(token=session["csrf"])


@app.get("/api/settings")
def public_settings():
    return jsonify(get_settings())


@app.get("/api/products")
def public_products():
    rows = Product.query.filter_by(active=True).order_by(Product.id.desc()).all()
    return jsonify([p.to_dict() for p in rows])


@app.post("/api/orders")
@limiter.limit("10 per hour")
def create_order():
    data = request.get_json(silent=True) or {}
    name = clean(data.get("name"), 80)
    address = clean(data.get("address"), 250)
    phone = re.sub(r"[\s\-]", "", str(data.get("phone", "")))
    if len(name) < 2 or len(address) < 8 or not PHONE_RE.match(phone):
        raise ApiError("Enter a valid name, Philippine mobile number, and address.")
    raw_items = data.get("items")
    if not isinstance(raw_items, list) or not raw_items or len(raw_items) > 30:
        raise ApiError("Your cart is empty.")
    order = Order(
        code=secrets.token_hex(6).upper(),
        name=name,
        phone=phone,
        address=address,
        total=Decimal("0"),
    )
    total = Decimal("0")
    seen = set()
    for item in raw_items:
        try:
            pid = int(item["id"])
            qty = int(item["qty"])
        except (KeyError, TypeError, ValueError):
            raise ApiError("Your cart is invalid.")
        if pid in seen or not 1 <= qty <= 99:
            raise ApiError("Your cart is invalid.")
        seen.add(pid)
        product = (
            Product.query.filter_by(id=pid, active=True).with_for_update().first()
        )
        if not product or product.stock < qty:
            label = product.name if product else "an item"
            raise ApiError("Not enough stock for " + label + ".", 409)
        product.stock -= qty
        total += product.price * qty
        order.items.append(
            OrderItem(
                product_id=product.id, name=product.name, price=product.price, qty=qty
            )
        )
    order.total = total
    db.session.add(order)
    db.session.commit()
    return jsonify(code=order.code, total=float(total)), 201


@app.get("/api/orders/<code>")
@limiter.limit("30 per hour")
def track_order(code):
    return jsonify(find_order(code).public())


@app.post("/api/orders/<code>/proof")
@limiter.limit("10 per hour")
def upload_proof(code):
    order = find_order(code)
    if order.status != "pending":
        raise ApiError("This order no longer accepts payment proof.", 409)
    order.proof_url = store_image("proofs")
    db.session.commit()
    return jsonify(ok=True)


@app.post("/api/admin/login")
@limiter.limit("5 per 15 minutes", deduct_when=lambda r: r.status_code >= 400)
def admin_login():
    data = request.get_json(silent=True) or {}
    user = str(data.get("username", ""))[:100]
    password = str(data.get("password", ""))[:200]
    user_ok = hmac.compare_digest(user.encode(), ADMIN_USER.encode())
    pass_ok = check_password_hash(ADMIN_HASH, password)
    if not (user_ok and pass_ok):
        app.logger.warning("Failed admin login from %s", get_remote_address())
        raise ApiError("Invalid username or password.", 401)
    session.clear()
    session["csrf"] = secrets.token_urlsafe(32)
    session["admin"] = True
    session.permanent = True
    return jsonify(ok=True)


@app.post("/api/admin/logout")
def admin_logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/admin/me")
@admin_required
def admin_me():
    return jsonify(ok=True)


@app.get("/api/admin/stats")
@admin_required
def admin_stats():
    counts = dict(
        db.session.query(Order.status, func.count(Order.id))
        .group_by(Order.status)
        .all()
    )
    revenue = (
        db.session.query(func.coalesce(func.sum(Order.total), 0))
        .filter(Order.status.in_(["paid", "shipped", "completed"]))
        .scalar()
    )
    return jsonify(
        orders={s: counts.get(s, 0) for s in NEXT_STATUS},
        revenue=float(revenue),
        products=Product.query.count(),
        low_stock=Product.query.filter(Product.stock <= 5).count(),
    )


@app.get("/api/admin/products")
@admin_required
def admin_products():
    rows = Product.query.order_by(Product.id.desc()).all()
    return jsonify([p.to_dict() for p in rows])


@app.post("/api/admin/products")
@admin_required
def admin_product_create():
    product = Product(price=Decimal("0"))
    apply_product(product, request.get_json(silent=True) or {})
    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201


@app.put("/api/admin/products/<int:pid>")
@admin_required
def admin_product_update(pid):
    product = db.session.get(Product, pid)
    if not product:
        raise ApiError("Product not found.", 404)
    apply_product(product, request.get_json(silent=True) or {})
    db.session.commit()
    return jsonify(product.to_dict())


@app.delete("/api/admin/products/<int:pid>")
@admin_required
def admin_product_delete(pid):
    product = db.session.get(Product, pid)
    if not product:
        raise ApiError("Product not found.", 404)
    db.session.delete(product)
    db.session.commit()
    return jsonify(ok=True)


@app.post("/api/admin/upload")
@admin_required
@limiter.limit("60 per hour")
def admin_upload():
    return jsonify(url=store_image("products"))


@app.get("/api/admin/orders")
@admin_required
def admin_orders():
    rows = Order.query.order_by(Order.id.desc()).limit(200).all()
    return jsonify([o.admin() for o in rows])


@app.put("/api/admin/orders/<int:oid>")
@admin_required
def admin_order_update(oid):
    order = db.session.get(Order, oid)
    if not order:
        raise ApiError("Order not found.", 404)
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in NEXT_STATUS.get(order.status, []):
        raise ApiError("That status change is not allowed.", 409)
    if status == "cancelled":
        for item in order.items:
            product = db.session.get(Product, item.product_id)
            if product:
                product.stock += item.qty
    order.status = status
    db.session.commit()
    return jsonify(order.admin())


@app.put("/api/admin/settings")
@admin_required
def admin_settings():
    data = request.get_json(silent=True) or {}
    for key in SETTING_KEYS:
        if key not in data:
            continue
        value = clean(data[key], 500 if key == "qr_url" else 100)
        if key == "qr_url" and value and not value.startswith(CLOUD_PREFIX):
            raise ApiError("Invalid QR image URL.")
        db.session.merge(Setting(key=key, value=value))
    db.session.commit()
    return jsonify(get_settings())


if __name__ == "__main__":
    app.run(debug=not IS_PROD)
