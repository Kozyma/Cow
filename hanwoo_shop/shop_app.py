"""
shop_app.py — '한우의 기준' 농장 직거래 쇼핑몰 + 백오피스 (Flask)

농장 관리 프로그램(web_app.py)과는 별개의 진입점이다.

실행:  python shop_app.py   →  쇼핑몰   http://localhost:8100
                               백오피스 http://localhost:8100/admin
데이터: shop_data.db, uploads/ (이 폴더, 또는 환경변수 DATA_DIR)
"""
import csv
import io
import json
import os
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, date
from functools import wraps

from flask import (Flask, render_template, request, redirect, url_for, session,
                   flash, abort, Response, send_from_directory, g)
from werkzeug.security import generate_password_hash, check_password_hash

import shop_art
from shop_db import (ShopDB, CATEGORIES, CUTS, CUT_CATEGORY, GRADES, STORAGES,
                     PRODUCT_STATUSES, ORDER_STATUSES, BANNER_THEMES, SORTS,
                     DEFAULT_SETTINGS)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR") or BASE_DIR
os.makedirs(DATA_DIR, exist_ok=True)
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

db = ShopDB(os.path.join(DATA_DIR, "shop_data.db"))

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 24 * 1024 * 1024
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("COOKIE_SECURE") == "1"
app.permanent_session_lifetime = timedelta(days=30)

# 다른 사이트의 하위 경로(예: koreacow.kr/hanwoo)에 붙여 띄울 때 쓰는 접두 경로
URL_PREFIX = "/" + os.environ.get("URL_PREFIX", "").strip("/") if os.environ.get("URL_PREFIX", "").strip("/") else ""
# 같은 도메인의 다른 앱(농장 관리)과 로그인 쿠키가 섞이지 않게 이름과 경로를 따로 둔다
app.config["SESSION_COOKIE_NAME"] = "hanwoo_session"
app.config["SESSION_COOKIE_PATH"] = URL_PREFIX or "/"


class _PrefixMiddleware:
    """URL_PREFIX 아래로 들어온 요청에서 접두 경로를 떼어 SCRIPT_NAME 으로 넘긴다.
    이렇게 하면 url_for 가 만드는 모든 주소에 접두 경로가 자동으로 붙는다."""

    def __init__(self, wsgi_app, prefix):
        self.app, self.prefix = wsgi_app, prefix

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path == self.prefix or path.startswith(self.prefix + "/"):
            environ["SCRIPT_NAME"] = environ.get("SCRIPT_NAME", "") + self.prefix
            environ["PATH_INFO"] = path[len(self.prefix):] or "/"
        return self.app(environ, start_response)


if URL_PREFIX:
    app.wsgi_app = _PrefixMiddleware(app.wsgi_app, URL_PREFIX)
if os.environ.get("TRUST_PROXY") == "1":      # Caddy·nginx 뒤에서 실제 접속 IP를 읽는다
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)


def _secret_key():
    """세션 서명 키: 환경변수 SECRET_KEY, 없으면 처음 실행할 때 만들어 DB에 보관."""
    env = os.environ.get("SECRET_KEY")
    if env:      # 다른 앱과 같은 값을 받아도 서명이 서로 통하지 않게 구분값을 붙인다
        return env + "|hanwoo-shop"
    key = db.get_setting("_secret_key")
    if not key:
        key = secrets.token_hex(32)
        db.set_settings({"_secret_key": key})
    return key


app.secret_key = _secret_key()

ALLOWED_IMG = {"jpg", "jpeg", "png", "webp"}
PHONE_RE = re.compile(r"^01[016789]\d{7,8}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
PER_PAGE = 12
_fails = {}   # 로그인 실패 기록: key -> (횟수, 잠금 해제 시각)


# ── 공용 ───────────────────────────────────────────────
def won(n):
    try:
        return f"{int(n):,}원"
    except (TypeError, ValueError):
        return "0원"


def per100(p):
    if not p["weight_g"]:
        return ""
    return f"100g당 {round(p['price'] / p['weight_g'] * 100):,}원"


def disc(p):
    """할인율(%). 정가가 판매가보다 높을 때만."""
    lp = p["list_price"] or 0
    return round((lp - p["price"]) / lp * 100) if lp > p["price"] > 0 else 0


def p_img(p):
    if p["image"]:
        return url_for("uploads", name=p["image"])
    return art_url(p["cut"], p["grade"], p["id"])


def art_url(cut, grade, seed):
    return url_for("art", kind=shop_art.kind_for(cut), seed=seed or 1,
                   m=shop_art.GRADE_MARBLE.get(grade, 1))


def p_images(p):
    """상세 화면 사진 목록(대표 사진 + 추가 사진)."""
    extra = []
    try:
        extra = [url_for("uploads", name=n) for n in json.loads(p["images"] or "[]")]
    except (ValueError, TypeError):
        pass
    return [p_img(p)] + extra


def sold_out(p):
    return p["status"] != "판매중" or p["stock"] <= 0


def mask_name(name):
    name = (name or "").strip()
    if len(name) <= 1:
        return name + "*"
    if len(name) == 2:
        return name[0] + "*"
    return name[0] + "*" * (len(name) - 2) + name[-1]


def fmt_phone(p):
    p = re.sub(r"\D", "", p or "")
    if len(p) == 11:
        return f"{p[:3]}-{p[3:7]}-{p[7:]}"
    if len(p) == 10:
        return f"{p[:3]}-{p[3:6]}-{p[6:]}"
    return p


def points(s):
    out = []
    for line in (s.get("points") or "").splitlines():
        if line.strip():
            t, _, d = line.partition("|")
            out.append((t.strip(), d.strip()))
    return out[:4]


app.jinja_env.globals.update(won=won, per100=per100, disc=disc, p_img=p_img, p_images=p_images,
                             csrf_token=lambda: csrf_token(),
                             sold_out=sold_out, art_url=art_url, fmt_phone=fmt_phone,
                             site_url=lambda path: site_url(path))


def csrf_token():
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_hex(16)
    return session["_csrf"]


@app.before_request
def _csrf_check():
    if request.method == "POST":
        sent = request.form.get("_csrf", "")
        if not sent or not secrets.compare_digest(sent, session.get("_csrf", "")):
            abort(400, "화면을 연 지 오래되어 요청이 만료되었습니다. 새로고침한 뒤 다시 시도해 주세요.")


@app.after_request
def _headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return resp


def blocked(key):
    return time.time() < _fails.get(key, (0, 0))[1]


def fail(key):
    cnt = _fails.get(key, (0, 0))[0] + 1
    _fails[key] = (0, time.time() + 300) if cnt >= 5 else (cnt, 0)


def local_ok(n):
    """사이트 안쪽 주소('/…')인지. 바깥 주소로 보내는 값은 걸러낸다."""
    return bool(n) and n.startswith("/") and not n.startswith("//") and "\\" not in n


def site_url(path):
    """앱 안쪽 주소('/shop?cat=…')에 접두 경로를 붙인다. 이미 붙어 있으면 그대로."""
    root = request.script_root
    if not local_ok(path):
        return root + "/"
    if root and (path == root or path.startswith(root + "/")):
        return path
    return root + path


def safe_next(n):
    """돌아갈 주소로 써도 되는 값이면 접두 경로를 붙여 돌려주고, 아니면 None."""
    return site_url(n) if local_ok(n) else None


def can_buy():
    """주문·가입을 받을 수 있는지. 미리보기 중에는 관리자로 로그인한 브라우저만 가능."""
    return db.get_setting("sales_open") == "1" or bool(session.get("admin"))


def current_member():
    if "member" not in g:
        uid = session.get("uid")
        g.member = db.member(uid) if uid else None
        if uid and not g.member:
            session.pop("uid", None)
    return g.member


def login_required(f):
    @wraps(f)
    def wrap(*a, **kw):
        if not current_member():
            flash("로그인이 필요합니다.", "error")
            return redirect(url_for("login", next=request.full_path.rstrip("?")))
        return f(*a, **kw)
    return wrap


def sign_in(key, value):
    """로그인 처리. 세션을 새로 만들되 장바구니·비회원 주문 조회 기록은 이어 준다."""
    keep = {k: session.get(k) for k in ("cart", "gorders", "uid", "admin") if session.get(k)}
    session.clear()
    session.update(keep)
    session[key] = value
    session.permanent = True


def cart_dict():
    return {int(k): int(v) for k, v in session.get("cart", {}).items()}


def save_cart(c):
    session["cart"] = {str(k): v for k, v in c.items() if v > 0}
    session.permanent = True


def cart_lines():
    """장바구니를 실제 상품과 대조해 (lines, 합계) 반환. 사라진 상품은 정리."""
    c, lines, total, changed = cart_dict(), [], 0, False
    for pid, qty in list(c.items()):
        p = db.product(pid)
        if not p or p["status"] == "숨김":
            c.pop(pid); changed = True
            continue
        lines.append({"p": p, "qty": qty, "sum": p["price"] * qty,
                      "ok": p["status"] == "판매중" and p["stock"] >= qty})
        total += p["price"] * qty
    if changed:
        save_cart(c)
    return lines, total


def shipping_for(total, s):
    fee = int(s.get("shipping_fee") or 0)
    free = int(s.get("free_ship_over") or 0)
    return 0 if (free and total >= free) or total == 0 else fee


def remember_order(order_no):
    lst = [n for n in session.get("gorders", []) if n != order_no]
    session["gorders"] = (lst + [order_no])[-10:]
    session.permanent = True


def can_view(o):
    m = current_member()
    return bool(o and ((m and o["member_id"] == m["id"]) or o["order_no"] in session.get("gorders", [])))


def save_image(file):
    """업로드한 사진을 저장하고 파일명을 돌려준다. 사진이 없거나 형식이 다르면 None."""
    if not file or not file.filename:
        return None
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_IMG:
        flash("사진은 JPG, PNG, WEBP 파일만 올릴 수 있습니다.", "error")
        return None
    name = uuid.uuid4().hex + "." + ext
    file.save(os.path.join(UPLOAD_DIR, name))
    return name


@app.context_processor
def _inject():
    s = db.settings()
    m = current_member()
    return dict(S=s, POINTS=points(s), csrf_token=csrf_token, member=m,
                cart_count=sum(cart_dict().values()),
                wish_ids=db.wish_ids(m["id"]) if m else set(),
                is_admin=bool(session.get("admin")),
                preview=s.get("sales_open") != "1", can_buy=can_buy(),
                CATEGORIES=CATEGORIES, CUTS=CUTS, GRADES=GRADES, STORAGES=STORAGES,
                PRODUCT_STATUSES=PRODUCT_STATUSES, ORDER_STATUSES=ORDER_STATUSES,
                BANNER_THEMES=BANNER_THEMES, SORTS=SORTS, CUT_CATEGORY=CUT_CATEGORY,
                year=datetime.now().year)


@app.route("/uploads/<path:name>")
def uploads(name):
    return send_from_directory(UPLOAD_DIR, name, max_age=86400)


@app.route("/favicon.ico")
def favicon():
    return redirect(url_for("static", filename="favicon.svg"), code=301)


@app.route("/art/<kind>/<int:seed>.svg")
def art(kind, seed):
    if kind not in shop_art.KINDS:
        abort(404)
    bg = request.args.get("bg", "")
    svg = shop_art.render(kind, seed % 1000, request.args.get("m", 2, type=int),
                          "#" + bg if re.fullmatch(r"[0-9a-fA-F]{6}", bg) else "#f3f1ed")
    return Response(svg, mimetype="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=604800"})


# ══ 쇼핑몰 ═════════════════════════════════════════════
@app.route("/")
def home():
    best, _ = db.product_list(flag="best", limit=8)
    if not best:
        best, _ = db.product_list(sort="best", limit=8)
    new, _ = db.product_list(flag="new", limit=4)
    if not new:
        new, _ = db.product_list(sort="new", limit=4)
    gifts, _ = db.product_list(cat="선물세트", limit=2)
    return render_template("shop/home.html", banners=db.banners(active_only=True),
                           best=best, new=new, gifts=gifts, counts=db.category_counts(),
                           reviews=db.recent_reviews(6), notices=db.notices(4))


@app.route("/shop")
def shop():
    cat = request.args.get("cat") or None
    if cat not in CATEGORIES:
        cat = None
    flag = request.args.get("flag") if request.args.get("flag") in ("best", "new") else None
    q = (request.args.get("q") or "").strip()[:40] or None
    sort = request.args.get("sort") if request.args.get("sort") in SORTS else "rec"
    page = max(1, request.args.get("page", 1, type=int) or 1)
    items, total = db.product_list(cat=cat, q=q, sort=sort, flag=flag,
                                   limit=PER_PAGE, offset=(page - 1) * PER_PAGE)
    pages = max(1, -(-total // PER_PAGE))
    title = (f"'{q}' 검색 결과" if q else cat or
             {"best": "베스트", "new": "신상품"}.get(flag) or "전체 상품")
    return render_template("shop/products.html", items=items, total=total, cat=cat, q=q,
                           sort=sort, flag=flag, page=page, pages=pages, title=title)


@app.route("/shop/<int:pid>")
def product(pid):
    p = db.product(pid)
    if not p or p["status"] == "숨김":
        abort(404)
    related, _ = db.product_list(cat=p["category"], exclude=pid, limit=4)
    m = current_member()
    qnas = [dict(q, mine=bool(m and q["member_id"] == m["id"])) for q in db.qnas(pid)]
    return render_template("shop/product.html", p=p, related=related,
                           reviews=db.reviews(pid), dist=db.review_dist(pid), qnas=qnas)


@app.route("/about")
def about():
    return render_template("shop/about.html")


@app.route("/cart")
def cart():
    lines, total = cart_lines()
    return render_template("shop/cart.html", lines=lines, total=total,
                           fee=shipping_for(total, db.settings()))


@app.route("/cart/add", methods=["POST"])
def cart_add():
    pid = request.form.get("pid", type=int)
    qty = max(1, min(request.form.get("qty", 1, type=int) or 1, 99))
    p = db.product(pid) if pid else None
    back = safe_next(request.form.get("back")) or url_for("shop")
    if not p or sold_out(p):
        flash("지금은 주문할 수 없는 상품입니다.", "error")
        return redirect(back)
    c = cart_dict()
    new_qty = min(c.get(pid, 0) + qty, p["stock"])
    if new_qty < c.get(pid, 0) + qty:
        flash(f"남은 수량이 {p['stock']}개라 {new_qty}개까지만 담았습니다.", "error")
    c[pid] = new_qty
    save_cart(c)
    if request.form.get("buy"):
        return redirect(url_for("checkout"))
    flash(f"장바구니에 담았습니다: {p['name']} {p['weight_g']}g", "cart")
    return redirect(back)


@app.route("/cart/update", methods=["POST"])
def cart_update():
    pid = request.form.get("pid", type=int)
    qty = request.form.get("qty", 0, type=int) or 0
    c = cart_dict()
    if pid in c:
        p = db.product(pid)
        c[pid] = max(0, min(qty, p["stock"] if p else 0, 99))
        save_cart(c)
    return redirect(url_for("cart"))


def wish_dates():
    """받는 날 선택지: 모레부터, 일·월 제외(주말에는 출고하지 않으므로)."""
    out, d = [], date.today() + timedelta(days=2)
    wd = "월화수목금토일"
    while len(out) < 10:
        if d.weekday() not in (6, 0):
            out.append((d.isoformat(), f"{d.month}월 {d.day}일 ({wd[d.weekday()]})"))
        d += timedelta(days=1)
    return out


@app.route("/checkout", methods=["GET", "POST"])
def checkout():
    lines, total = cart_lines()
    if not lines:
        flash("장바구니가 비어 있습니다.", "error")
        return redirect(url_for("shop"))
    s = db.settings()
    fee = shipping_for(total, s)
    dates = wish_dates()
    m = current_member()
    form = {}
    if m:
        form = {k: m[k] or "" for k in ("name", "phone", "zipcode", "addr1", "addr2")}
    if request.method == "POST" and not can_buy():
        flash("아직 판매를 시작하지 않았습니다. 지금은 주문을 받지 않습니다.", "error")
        return redirect(url_for("checkout"))
    if request.method == "POST":
        form = {k: (request.form.get(k) or "").strip() for k in
                ("name", "phone", "zipcode", "addr1", "addr2", "memo", "wish_date", "depositor")}
        form["phone"] = re.sub(r"\D", "", form["phone"])
        err = None
        if not form["name"] or len(form["name"]) > 30:
            err = "받는 분 이름을 입력해 주세요."
        elif not PHONE_RE.match(form["phone"]):
            err = "휴대폰 번호를 다시 확인해 주세요. (예: 01012345678)"
        elif not form["addr1"]:
            err = "배송 주소를 입력해 주세요."
        elif form["wish_date"] and form["wish_date"] not in dict(dates):
            err = "받는 날을 다시 선택해 주세요."
        elif not request.form.get("agree"):
            err = "개인정보 수집·이용에 동의해 주세요."
        elif any(not l["ok"] for l in lines):
            err = "재고가 부족하거나 판매가 끝난 상품이 있습니다. 장바구니를 확인해 주세요."
        if not err:
            form["depositor"] = form["depositor"] or form["name"]
            order_no, err = db.create_order(form, [(l["p"]["id"], l["qty"]) for l in lines],
                                            fee, m["id"] if m else None)
            if order_no:
                session["cart"] = {}
                remember_order(order_no)
                if m and not m["addr1"]:
                    db.set_member_address(m["id"], form["zipcode"], form["addr1"], form["addr2"])
                return redirect(url_for("order_view", order_no=order_no, done=1))
        flash(err, "error")
    return render_template("shop/checkout.html", lines=lines, total=total, fee=fee,
                           form=form, wish_dates=dates)


@app.route("/order", methods=["GET", "POST"])
def order_lookup():
    if request.method == "POST":
        key = "o:" + (request.remote_addr or "?")
        no = (request.form.get("order_no") or "").strip().upper()
        phone = re.sub(r"\D", "", request.form.get("phone") or "")
        o = db.order_by_no(no)
        if blocked(key):
            flash("조회 시도가 너무 많습니다. 5분 뒤 다시 시도해 주세요.", "error")
        elif not o or o["phone"] != phone:
            fail(key)
            flash("주문번호와 휴대폰 번호가 맞는 주문을 찾지 못했습니다.", "error")
        else:
            remember_order(no)
            return redirect(url_for("order_view", order_no=no))
    return render_template("shop/order_lookup.html")


@app.route("/order/<order_no>")
def order_view(order_no):
    o = db.order_by_no(order_no)
    if not can_view(o):
        flash("주문번호와 휴대폰 번호로 조회해 주세요.", "error")
        return redirect(url_for("order_lookup"))
    return render_template("shop/order_view.html", o=o, items=db.order_items(o["id"]),
                           done=bool(request.args.get("done")))


@app.route("/order/<order_no>/cancel", methods=["POST"])
def order_cancel(order_no):
    o = db.order_by_no(order_no)
    if not can_view(o):
        abort(404)
    if o["status"] == "입금대기":
        db.set_order_status(o["id"], "취소")
        flash("주문을 취소했습니다.", "ok")
    else:
        flash("입금이 확인된 주문은 고객센터로 연락해 주세요.", "error")
    return redirect(url_for("order_view", order_no=order_no))


# ── 회원 ───────────────────────────────────────────────
@app.route("/join", methods=["GET", "POST"])
def join():
    if current_member():
        return redirect(url_for("my"))
    form = {}
    if request.method == "POST" and not can_buy():
        flash("아직 판매를 시작하지 않아 회원가입을 받지 않습니다.", "error")
        return redirect(url_for("join"))
    if request.method == "POST":
        form = {k: (request.form.get(k) or "").strip() for k in ("email", "name", "phone")}
        form["phone"] = re.sub(r"\D", "", form["phone"])
        pw = request.form.get("password") or ""
        err = None
        if not EMAIL_RE.match(form["email"]) or len(form["email"]) > 120:
            err = "이메일 주소를 다시 확인해 주세요."
        elif len(pw) < 8:
            err = "비밀번호는 8자 이상으로 정해 주세요."
        elif pw != (request.form.get("password2") or ""):
            err = "두 비밀번호가 서로 다릅니다."
        elif not form["name"] or len(form["name"]) > 30:
            err = "이름을 입력해 주세요."
        elif not PHONE_RE.match(form["phone"]):
            err = "휴대폰 번호를 다시 확인해 주세요. (예: 01012345678)"
        elif not (request.form.get("agree_terms") and request.form.get("agree_privacy")):
            err = "이용약관과 개인정보 수집·이용에 동의해 주세요."
        if not err:
            mid = db.create_member(form["email"], generate_password_hash(pw), form["name"],
                                   form["phone"], 1 if request.form.get("marketing") else 0)
            if mid:
                sign_in("uid", mid)
                flash(f"{form['name']}님, 가입되었습니다.", "ok")
                return redirect(safe_next(request.args.get("next")) or url_for("home"))
            err = "이미 가입된 이메일입니다. 로그인해 주세요."
        flash(err, "error")
    return render_template("shop/join.html", form=form)


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_member():
        return redirect(url_for("my"))
    email = ""
    if request.method == "POST":
        key = "m:" + (request.remote_addr or "?")
        email = (request.form.get("email") or "").strip()
        m = db.member_by_email(email)
        if blocked(key):
            flash("로그인 시도가 너무 많습니다. 5분 뒤 다시 시도해 주세요.", "error")
        elif m and check_password_hash(m["pw_hash"], request.form.get("password") or ""):
            _fails.pop(key, None)
            sign_in("uid", m["id"])
            return redirect(safe_next(request.args.get("next")) or url_for("home"))
        else:
            fail(key)
            flash("이메일 또는 비밀번호가 맞지 않습니다.", "error")
    return render_template("shop/login.html", email=email)


@app.route("/logout", methods=["POST"])
def logout():
    session.pop("uid", None)
    return redirect(url_for("home"))


@app.route("/my")
@login_required
def my():
    m = current_member()
    return render_template("shop/my.html", tab="orders", orders=db.orders(member_id=m["id"], limit=100))


@app.route("/my/wish")
@login_required
def my_wish():
    return render_template("shop/my.html", tab="wish", items=db.wish_products(current_member()["id"]))


@app.route("/my/posts")
@login_required
def my_posts():
    mid = current_member()["id"]
    return render_template("shop/my.html", tab="posts", my_reviews=db.member_reviews(mid),
                           my_qnas=db.member_qnas(mid))


@app.route("/my/profile", methods=["GET", "POST"])
@login_required
def my_profile():
    m = current_member()
    if request.method == "POST":
        act = request.form.get("act")
        if act == "info":
            name = (request.form.get("name") or "").strip()
            phone = re.sub(r"\D", "", request.form.get("phone") or "")
            if not name or not PHONE_RE.match(phone):
                flash("이름과 휴대폰 번호를 다시 확인해 주세요.", "error")
            else:
                db.update_member(m["id"], name, phone,
                                 (request.form.get("zipcode") or "").strip(),
                                 (request.form.get("addr1") or "").strip(),
                                 (request.form.get("addr2") or "").strip(),
                                 1 if request.form.get("marketing") else 0)
                flash("회원 정보를 저장했습니다.", "ok")
        elif act == "pw":
            new = request.form.get("new_password") or ""
            if not check_password_hash(m["pw_hash"], request.form.get("password") or ""):
                flash("현재 비밀번호가 맞지 않습니다.", "error")
            elif len(new) < 8:
                flash("새 비밀번호는 8자 이상으로 정해 주세요.", "error")
            else:
                db.set_member_pw(m["id"], generate_password_hash(new))
                flash("비밀번호를 바꿨습니다.", "ok")
        elif act == "leave":
            if not check_password_hash(m["pw_hash"], request.form.get("password") or ""):
                flash("비밀번호가 맞지 않아 탈퇴하지 못했습니다.", "error")
            else:
                db.delete_member(m["id"])
                session.pop("uid", None)
                flash("탈퇴 처리되었습니다. 그동안 이용해 주셔서 감사합니다.", "ok")
                return redirect(url_for("home"))
        return redirect(url_for("my_profile"))
    return render_template("shop/my.html", tab="profile")


@app.route("/wish/<int:pid>", methods=["POST"])
def wish_toggle(pid):
    m = current_member()
    back = safe_next(request.form.get("back")) or url_for("product", pid=pid)
    if not m:
        flash("찜하려면 로그인해 주세요.", "error")
        return redirect(url_for("login", next=back))
    if db.product(pid):
        on = db.toggle_wish(m["id"], pid)
        flash("찜한 상품에 담았습니다." if on else "찜을 해제했습니다.", "ok")
    return redirect(back)


# ── 후기 · 문의 ────────────────────────────────────────
@app.route("/review/<int:item_id>", methods=["GET", "POST"])
def review_new(item_id):
    it = db.order_item(item_id)
    o = db.order(it["order_id"]) if it else None
    if not can_view(o):
        flash("주문을 먼저 조회해 주세요.", "error")
        return redirect(url_for("order_lookup"))
    back = url_for("order_view", order_no=o["order_no"])
    p = db.product(it["product_id"]) if it["product_id"] else None
    done = any(r["id"] == item_id and r["review_id"] for r in db.order_items(o["id"]))
    if o["status"] != "배송완료":
        flash("후기는 배송이 끝난 뒤에 쓸 수 있습니다.", "error")
        return redirect(back)
    if done or not p:
        flash("이미 후기를 쓴 상품이거나 판매가 끝난 상품입니다.", "error")
        return redirect(back)
    form = {"rating": 5, "content": ""}
    if request.method == "POST":
        form["rating"] = max(1, min(5, request.form.get("rating", 5, type=int) or 5))
        form["content"] = (request.form.get("content") or "").strip()[:1000]
        if len(form["content"]) < 10:
            flash("후기를 10자 이상 적어 주세요.", "error")
        else:
            m = current_member()
            db.add_review(p["id"], item_id, m["id"] if m else None, mask_name(o["name"]),
                          form["rating"], form["content"], save_image(request.files.get("image")))
            flash("후기를 등록했습니다. 고맙습니다.", "ok")
            return redirect(url_for("product", pid=p["id"]) + "#reviews")
    return render_template("shop/review_form.html", it=it, p=p, o=o, form=form)


@app.route("/qna/<int:pid>", methods=["POST"])
def qna_new(pid):
    m = current_member()
    back = url_for("product", pid=pid) + "#qna"
    if not m:
        flash("문의하려면 로그인해 주세요.", "error")
        return redirect(url_for("login", next=url_for("product", pid=pid)))
    content = (request.form.get("content") or "").strip()[:1000]
    if not db.product(pid):
        abort(404)
    if len(content) < 5:
        flash("문의 내용을 5자 이상 적어 주세요.", "error")
    else:
        db.add_qna(pid, m["id"], mask_name(m["name"]), content, 1 if request.form.get("secret") else 0)
        flash("문의를 등록했습니다. 답변이 달리면 이 화면에서 확인할 수 있습니다.", "ok")
    return redirect(back)


# ── 고객센터 · 약관 ────────────────────────────────────
@app.route("/cs")
def cs():
    return render_template("shop/cs.html", notices=db.notices(), faqs=db.faqs())


@app.route("/cs/notice/<int:nid>")
def notice(nid):
    n = db.notice(nid)
    if not n:
        abort(404)
    return render_template("shop/notice.html", n=n)


@app.route("/policy/<kind>")
def policy(kind):
    titles = {"terms": "이용약관", "privacy": "개인정보처리방침", "guide": "배송·교환·환불 안내"}
    if kind not in titles:
        abort(404)
    return render_template("shop/policy.html", kind=kind, title=titles[kind],
                           custom=db.get_setting(kind + "_text"))


# ══ 백오피스 ═══════════════════════════════════════════
def admin_required(f):
    @wraps(f)
    def wrap(*a, **kw):
        if not session.get("admin"):
            return redirect(url_for("admin_login", next=request.path))
        return f(*a, **kw)
    return wrap


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if session.get("admin"):
        return redirect(url_for("admin_home"))
    env_pw = os.environ.get("ADMIN_PASSWORD", "").strip()
    first = not env_pw and not db.get_setting("_admin_hash")
    if first and os.environ.get("ADMIN_SETUP") == "off":
        return render_template("admin/login.html", first=False, locked=True)
    if request.method == "POST":
        key = "a:" + (request.remote_addr or "?")
        pw = request.form.get("password") or ""
        if blocked(key):
            flash("로그인 시도가 너무 많습니다. 5분 뒤 다시 시도해 주세요.", "error")
        elif first:
            if len(pw) < 8:
                flash("비밀번호는 8자 이상으로 정해 주세요.", "error")
            elif pw != (request.form.get("password2") or ""):
                flash("두 비밀번호가 서로 다릅니다.", "error")
            else:
                db.set_settings({"_admin_hash": generate_password_hash(pw)})
                sign_in("admin", True)
                flash("관리자 비밀번호를 설정했습니다.", "ok")
                return redirect(url_for("admin_home"))
        else:
            ok = (secrets.compare_digest(pw.encode(), env_pw.encode()) if env_pw
                  else check_password_hash(db.get_setting("_admin_hash"), pw))
            if ok:
                _fails.pop(key, None)
                sign_in("admin", True)
                nxt = safe_next(request.args.get("next")) or ""
                return redirect(nxt if nxt.startswith(request.script_root + "/admin") else url_for("admin_home"))
            fail(key)
            flash("비밀번호가 맞지 않습니다.", "error")
    return render_template("admin/login.html", first=first, locked=False)


@app.route("/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin", None)
    return redirect(url_for("home"))


@app.route("/admin")
@admin_required
def admin_home():
    d = db.dashboard()
    mx = max([v for _, v in d["days"]] + [1])
    return render_template("admin/dashboard.html", d=d, mx=mx,
                           recent=db.orders(limit=8), tab="home")


@app.route("/admin/orders")
@admin_required
def admin_orders():
    status = request.args.get("status") if request.args.get("status") in ORDER_STATUSES else None
    q = (request.args.get("q") or "").strip() or None
    return render_template("admin/orders.html", orders=db.orders(status, q), status=status,
                           q=q or "", counts=db.order_status_counts(), tab="orders")


@app.route("/admin/orders/<int:oid>", methods=["GET", "POST"])
@admin_required
def admin_order(oid):
    o = db.order(oid)
    if not o:
        abort(404)
    if request.method == "POST":
        st = request.form.get("status")
        db.update_order_admin(oid, (request.form.get("tracking_co") or "").strip(),
                              (request.form.get("tracking_no") or "").strip(),
                              (request.form.get("admin_memo") or "").strip())
        if st in ORDER_STATUSES:
            db.set_order_status(oid, st)
        flash("저장했습니다.", "ok")
        return redirect(url_for("admin_order", oid=oid))
    return render_template("admin/order.html", o=o, items=db.order_items(oid), tab="orders")


@app.route("/admin/orders/<int:oid>/status", methods=["POST"])
@admin_required
def admin_order_status(oid):
    st = request.form.get("status")
    if st in ORDER_STATUSES:
        db.set_order_status(oid, st)
        flash(f"주문 상태를 '{st}'(으)로 바꿨습니다.", "ok")
    return redirect(safe_next(request.form.get("back")) or url_for("admin_orders"))


@app.route("/admin/orders.csv")
@admin_required
def admin_orders_csv():
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["주문번호", "주문일시", "상태", "받는분", "연락처", "우편번호", "주소", "상세주소",
                "상품", "상품금액", "배송비", "결제금액", "입금자명", "받는날", "배송메모",
                "택배사", "송장번호"])
    status = request.args.get("status") if request.args.get("status") in ORDER_STATUSES else None
    for o in db.orders(status, limit=100000):
        row = [o["order_no"], o["created_at"], o["status"], o["name"], o["phone"],
               o["zipcode"], o["addr1"], o["addr2"], o["items"], o["items_total"],
               o["shipping_fee"], o["total"], o["depositor"], o["wish_date"], o["memo"],
               o["tracking_co"], o["tracking_no"]]
        # 엑셀이 수식으로 읽지 않도록 =,+,-,@ 로 시작하는 글자는 앞에 ' 를 붙인다
        w.writerow(["'" + v if isinstance(v, str) and v[:1] in "=+-@" else v for v in row])
    fn = "orders_%s.csv" % datetime.now().strftime("%Y%m%d")
    return Response(buf.getvalue().encode("utf-8-sig"), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={fn}"})


@app.route("/admin/products")
@admin_required
def admin_products():
    items, _ = db.product_list(public=False)
    return render_template("admin/products.html", items=items, tab="products")


@app.route("/admin/products/new", methods=["GET", "POST"])
@app.route("/admin/products/<int:pid>", methods=["GET", "POST"])
@admin_required
def admin_product(pid=None):
    p = db.product(pid) if pid else None
    if pid and not p:
        abort(404)
    extras = []
    if p:
        try:
            extras = json.loads(p["images"] or "[]")
        except ValueError:
            extras = []
    if request.method == "POST":
        f = request.form
        num = lambda k: max(0, f.get(k, 0, type=int) or 0)
        keep = [n for n in extras if n not in f.getlist("del_image")]
        keep += [n for n in (save_image(x) for x in request.files.getlist("images")) if n]
        cut = f.get("cut") if f.get("cut") in CUTS else "기타"
        d = dict(name=(f.get("name") or "").strip(),
                 category=f.get("category") if f.get("category") in CATEGORIES else CUT_CATEGORY[cut],
                 cut=cut,
                 grade=f.get("grade") if f.get("grade") in GRADES else "등급없음",
                 weight_g=num("weight_g"), price=num("price"), list_price=num("list_price"),
                 stock=num("stock"),
                 trace_no=re.sub(r"\D", "", f.get("trace_no") or "")[:20],
                 storage=f.get("storage") if f.get("storage") in STORAGES else "냉장",
                 origin=(f.get("origin") or "국내산 한우").strip()[:40],
                 summary=(f.get("summary") or "").strip(),
                 description=(f.get("description") or "").strip(),
                 status=f.get("status") if f.get("status") in PRODUCT_STATUSES else "판매중",
                 sort=f.get("sort", 0, type=int) or 0,
                 is_best=1 if f.get("is_best") else 0, is_new=1 if f.get("is_new") else 0,
                 images=json.dumps(keep[:6]))
        main = save_image(request.files.get("image"))
        if main:
            d["image"] = main
        elif f.get("del_main"):
            d["image"] = None
        if not d["name"] or d["price"] <= 0:
            flash("상품명과 판매가는 꼭 입력해 주세요.", "error")
            return render_template("admin/product_form.html", p=d, pid=pid, extras=keep, tab="products")
        db.save_product(pid, d)
        flash("상품을 저장했습니다.", "ok")
        return redirect(url_for("admin_products"))
    return render_template("admin/product_form.html", p=p, pid=pid, extras=extras, tab="products")


@app.route("/admin/products/<int:pid>/quick", methods=["POST"])
@admin_required
def admin_product_quick(pid):
    st = request.form.get("status")
    db.quick_update_product(pid, max(0, request.form.get("stock", 0, type=int) or 0),
                            st if st in PRODUCT_STATUSES else "판매중")
    flash("재고와 판매 상태를 저장했습니다.", "ok")
    return redirect(url_for("admin_products"))


@app.route("/admin/products/<int:pid>/delete", methods=["POST"])
@admin_required
def admin_product_delete(pid):
    db.delete_product(pid)
    flash("상품을 삭제했습니다. 지난 주문 내역은 그대로 남습니다.", "ok")
    return redirect(url_for("admin_products"))


@app.route("/admin/products/seed", methods=["POST"])
@admin_required
def admin_seed():
    if db.product_count() == 0:
        db.seed_samples()
        flash("예시 상품 10개를 넣었습니다. 가격과 중량은 실제에 맞게 고쳐 주세요.", "ok")
    return redirect(url_for("admin_products"))


@app.route("/admin/banners", methods=["GET", "POST"])
@admin_required
def admin_banners():
    if request.method == "POST":
        f = request.form
        bid = f.get("id", type=int)
        if f.get("act") == "delete" and bid:
            db.delete_banner(bid)
            flash("배너를 삭제했습니다.", "ok")
        else:
            d = dict(title=(f.get("title") or "").strip()[:80],
                     subtitle=(f.get("subtitle") or "").strip()[:120],
                     link=(f.get("link") or "").strip() if local_ok((f.get("link") or "").strip()) else "/shop",
                     link_label=(f.get("link_label") or "").strip()[:20],
                     theme=f.get("theme") if f.get("theme") in BANNER_THEMES else "red",
                     sort=f.get("sort", 0, type=int) or 0, active=1 if f.get("active") else 0)
            img = save_image(request.files.get("image"))
            if img:
                d["image"] = img
            elif f.get("del_image"):
                d["image"] = None
            if not d["title"]:
                flash("배너 문구를 입력해 주세요.", "error")
            else:
                db.save_banner(bid, d)
                flash("배너를 저장했습니다.", "ok")
        return redirect(url_for("admin_banners"))
    return render_template("admin/banners.html", banners=db.banners(), tab="banners")


@app.route("/admin/reviews", methods=["GET", "POST"])
@admin_required
def admin_reviews():
    if request.method == "POST":
        rid = request.form.get("id", type=int)
        if request.form.get("act") == "delete":
            db.delete_review(rid)
            flash("후기를 삭제했습니다.", "ok")
        else:
            db.update_review(rid, (request.form.get("reply") or "").strip()[:1000],
                             bool(request.form.get("hidden")))
            flash("저장했습니다.", "ok")
        return redirect(url_for("admin_reviews"))
    return render_template("admin/reviews.html", rows=db.all_reviews(), tab="reviews")


@app.route("/admin/qna", methods=["GET", "POST"])
@admin_required
def admin_qna():
    if request.method == "POST":
        qid = request.form.get("id", type=int)
        if request.form.get("act") == "delete":
            db.delete_qna(qid)
            flash("문의를 삭제했습니다.", "ok")
        else:
            db.answer_qna(qid, (request.form.get("answer") or "").strip()[:1000])
            flash("답변을 저장했습니다.", "ok")
        return redirect(url_for("admin_qna", f=request.args.get("f") or None))
    open_only = request.args.get("f") == "open"
    return render_template("admin/qna.html", rows=db.all_qnas(open_only), open_only=open_only, tab="qna")


@app.route("/admin/members")
@admin_required
def admin_members():
    return render_template("admin/members.html", members=db.members(),
                           customers=db.customers(), tab="members")


@app.route("/admin/board", methods=["GET", "POST"])
@admin_required
def admin_board():
    if request.method == "POST":
        f = request.form
        kind, rid, act = f.get("kind"), f.get("id", type=int), f.get("act")
        if kind == "notice":
            if act == "delete":
                db.delete_notice(rid)
            elif (f.get("title") or "").strip():
                db.save_notice(rid, f["title"].strip()[:100], (f.get("content") or "").strip(),
                               1 if f.get("pinned") else 0)
        elif kind == "faq":
            if act == "delete":
                db.delete_faq(rid)
            elif (f.get("q") or "").strip() and (f.get("a") or "").strip():
                db.save_faq(rid, f["q"].strip()[:120], f["a"].strip(), f.get("sort", 0, type=int) or 0)
        flash("저장했습니다." if act != "delete" else "삭제했습니다.", "ok")
        return redirect(url_for("admin_board"))
    return render_template("admin/board.html", notices=db.notices(), faqs=db.faqs(), tab="board")


@app.route("/admin/settings", methods=["GET", "POST"])
@admin_required
def admin_settings():
    if request.method == "POST":
        data = {k: (request.form.get(k) or "").strip()
                for k in DEFAULT_SETTINGS if k in request.form}
        for k in ("shipping_fee", "free_ship_over"):
            if k in data:
                data[k] = str(max(0, int(re.sub(r"\D", "", data[k]) or 0)))
        data["sales_open"] = "1" if request.form.get("sales_open") == "1" else "0"
        if data.get("kakao_url") and not data["kakao_url"].startswith(("https://", "http://")):
            data["kakao_url"] = ""
        db.set_settings(data)
        pw = request.form.get("new_password") or ""
        if pw:
            if os.environ.get("ADMIN_PASSWORD"):
                flash("비밀번호가 환경변수(ADMIN_PASSWORD)로 지정돼 있어 여기서는 바꿀 수 없습니다.", "error")
            elif len(pw) < 8:
                flash("새 비밀번호는 8자 이상으로 정해 주세요.", "error")
            else:
                db.set_settings({"_admin_hash": generate_password_hash(pw)})
                flash("관리자 비밀번호를 바꿨습니다.", "ok")
        flash("설정을 저장했습니다.", "ok")
        return redirect(url_for("admin_settings"))
    return render_template("admin/settings.html", tab="settings")


@app.errorhandler(404)
def _404(e):
    return render_template("shop/error.html", msg="찾으시는 페이지가 없습니다."), 404


@app.errorhandler(400)
def _400(e):
    return render_template("shop/error.html", msg=getattr(e, "description", "잘못된 요청입니다.")), 400


@app.errorhandler(413)
def _413(e):
    return render_template("shop/error.html", msg="사진 용량이 너무 큽니다. 한 번에 24MB 이하로 올려 주세요."), 413


def main():
    port = int(os.environ.get("PORT", "8100"))
    print("=" * 56)
    print("  한우의 기준 — 쇼핑몰이 실행되었습니다.")
    print(f"  쇼핑몰:    http://localhost:{port}")
    print(f"  백오피스:  http://localhost:{port}/admin")
    print("  (종료하려면 이 창에서 Ctrl+C)")
    print("=" * 56)
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
