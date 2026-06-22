"""
web_app.py — 영농형 태양광 관리 프로그램 (웹 버전)

데스크톱판(app.py, tkinter)과 같은 데이터·계산 로직을 그대로 쓰되,
화면을 웹(HTML)으로 바꿔 PC 브라우저와 휴대폰 브라우저에서 모두 열린다.
휴대폰에서는 홈 화면에 추가하면(PWA) 앱처럼 쓸 수 있다.

실행:  python3 web_app.py   → 브라우저에서 http://localhost:8000 접속
데이터는 데스크톱판과 동일하게 SQLite 파일(farm_data.db) 하나에 저장된다.
"""

import io
import os
import random
import sys
import tempfile
import zipfile
from datetime import datetime, timedelta

from functools import wraps

from flask import (
    Flask, render_template, request, redirect, url_for,
    send_file, abort, flash, Response, session, jsonify,
)

import exporter
from database import (
    Database, today_str,
    LIVESTOCK_CATEGORIES, CATTLE_TYPES, FARM_ACTIVITIES, FINANCE_TYPES, FINANCE_SECTORS,
    SUPPORT_STATUSES, REMINDER_CATEGORIES, REMINDER_REPEATS,
    FACILITY_TYPES, FACILITY_STATUSES,
)
from web_charts import (
    won, won_short, bar_chart, line_chart, INCOME, EXPENSE, SOLAR,
)


# ── 데이터 파일 위치 ─────────────────────────────────────────────────
def get_data_dir():
    """
    데이터(farm_data.db)를 저장할 폴더.
    우선순위:
      1) 환경변수 DATA_DIR  — 클라우드 배포 시 '영구 디스크' 경로 지정용
      2) 패키징 실행(.app/.exe) — 사용자 문서/영농형태양광관리
      3) 그 외(로컬 스크립트) — 이 스크립트와 같은 폴더
    """
    env_dir = os.environ.get("DATA_DIR")
    if env_dir:
        base = env_dir
    elif getattr(sys, "frozen", False):
        base = os.path.join(os.path.expanduser("~"), "Documents", "영농형태양광관리")
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(base, exist_ok=True)
    return base


DATA_DIR = get_data_dir()
DB_PATH = os.path.join(DATA_DIR, "farm_data.db")

# ── 서류 바로가기 링크 (필요한 정부/공공 민원 사이트) ────────────────
#   각 항목: (제목, 설명, URL).  새 탭으로 열린다.
#   여기 목록만 고치면 화면이 자동으로 바뀐다(관청·조합 등 직접 추가 가능).
LINK_GROUPS = [
    ("🗺", "토지·부동산 서류", [
        ("토지(임야)대장 발급", "정부24 — 지목·면적·소유 확인",
         "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000026"),
        ("건축물대장 발급", "정부24 — 건축물 현황·용도",
         "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=15000000098"),
        ("토지이용계획·지적도 (토지이음)", "용도지역·행위제한·지적도 열람",
         "https://www.eum.go.kr"),
        ("부동산 등기부등본 (인터넷등기소)", "소유권·근저당 등 권리관계",
         "https://www.iros.go.kr"),
    ]),
    ("☀", "태양광·전력 서류", [
        ("오늘의 SMP·REC (전력거래소)", "정산단가 확인",
         "https://www.kpx.or.kr/main/"),
        ("월별 SMP (EPSIS 통계)", "단가 추이 — 설정값 갱신용",
         "https://epsis.kpx.or.kr/epsisnew/selectEkmaSmpSmpChart.do?menuId=040201"),
        ("재생에너지 클라우드플랫폼 (RECLOUD)", "SMP 정산·REC 거래",
         "https://recloud.energy.or.kr"),
        ("RPS 종합지원시스템", "신재생 공급인증·전자민원",
         "https://rps.energy.or.kr"),
        ("한전 사이버지점 (계통연계)", "분산전원 접속·전기요금",
         "https://cyber.kepco.co.kr/ckepco/front/jsp/CO/H/coMain/main.jsp"),
        ("전기안전공사 사용전검사", "발전설비 검사 신청(전기안전여기로)",
         "https://safety.kesco.or.kr/cyber/cr/ubi/moveUseBfeInspctStep01.do"),
        ("한국에너지공단 신재생에너지센터", "보조·지원사업 안내",
         "https://www.knrec.or.kr"),
    ]),
    ("🐄", "축산 서류", [
        ("가축사육업 허가·등록", "정부24 — 사육업 허가/변경",
         "https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A09006&CappBizCD=15430000001"),
        ("가축분뇨 배출시설 신고", "정부24 — 설치·변경 신고",
         "https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A02002&CappBizCD=14800000127&tp_seq=01"),
        ("축산물 이력제", "개체 이력 등록·조회",
         "https://www.mtrace.go.kr"),
    ]),
    ("🌾", "농사 서류", [
        ("농업경영체 등록확인서", "정부24 — 등록·변경 확인서 발급",
         "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=15430000131"),
        ("농업경영체 등록 (농관원)", "국립농산물품질관리원",
         "https://www.naqs.go.kr"),
        ("농지대장 발급 (정부24)", "정부24에서 '농지대장' 검색·발급",
         "https://www.gov.kr/search?srhQuery=%EB%86%8D%EC%A7%80%EB%8C%80%EC%9E%A5"),
        ("농림사업정보시스템 (Agrix)", "농업 보조·지원사업 신청",
         "https://www.agrix.go.kr"),
        ("기상청 날씨·일사량", "발전량·영농 계획 참고",
         "https://www.weather.go.kr"),
    ]),
    ("🏛", "서천군 (관할 지자체)", [
        ("서천군청 홈페이지", "부서·공지·민원 안내",
         "https://www.seocheon.go.kr/kor.do"),
        ("서천군 고시", "개발행위·태양광 등 고시 확인",
         "https://www.seocheon.go.kr/prog/saeolGosi/01/kor/sub04_06_01/list.do"),
        ("서천군 일반공고", "행정 공고 열람",
         "https://www.seocheon.go.kr/prog/saeolGosi/03/kor/sub04_06_03/list.do"),
        ("서천군 전자민원창구", "지역 민원 신청·발급(새올)",
         "https://eminwon.seocheon.go.kr/emwp/gov/mogaha/ntis/web/emwp/cmmpotal/action/EmwpMainMgtAction.do"),
        ("서천군 농업기술센터", "영농 교육·기술 지원",
         "https://www.seocheon.go.kr/farm/index.do"),
    ]),
]


# 리소스(templates/static) 위치 — 패키징(.app/.exe) 시에는 PyInstaller가
# 풀어놓는 임시 폴더(sys._MEIPASS)에서, 일반 실행 시에는 소스 폴더에서 찾는다.
RESOURCE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(RESOURCE_DIR, "templates"),
    static_folder=os.path.join(RESOURCE_DIR, "static"),
)
# 세션/쿠키 서명 키. 클라우드 배포 시 환경변수 SECRET_KEY 로 임의 값을 주세요.
app.secret_key = os.environ.get("SECRET_KEY", "farm-solar-local-dev-key")

# 비밀번호 보호:
#   환경변수 APP_PASSWORD 가 설정돼 있으면(=인터넷 공개 배포) 로그인을 요구한다.
#   로컬(집/사무실)에서 그냥 실행할 때는 설정하지 않으므로 로그인 없이 바로 쓴다.
APP_PASSWORD = os.environ.get("APP_PASSWORD", "").strip()

db = Database(DB_PATH)


# 로그인 없이 접근 가능한 엔드포인트(정적/PWA 자원·로그인 화면)
OPEN_ENDPOINTS = {"login", "static", "manifest", "service_worker", "assetlinks"}
# 직원(staff) 역할이 접근 가능한 엔드포인트(그 외는 관리자 전용)
STAFF_ENDPOINTS = {
    "me", "work_complete", "logout", "account_password",
    "api_notifications",
} | OPEN_ENDPOINTS


def current_user():
    uid = session.get("uid")
    return db.get_user(uid) if uid else None


@app.before_request
def _require_login():
    ep = request.endpoint
    if ep is None or ep in OPEN_ENDPOINTS:
        return
    u = current_user()
    if not u:
        return redirect(url_for("login", next=request.path))
    # 직원은 허용된 화면만 — 그 외는 본인 작업 홈으로
    if u["role"] != "admin" and ep not in STAFF_ENDPOINTS:
        return redirect(url_for("me"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user():
        return redirect(url_for("dashboard"))
    error = None
    if request.method == "POST":
        u = db.verify_user(_f("username"), request.form.get("password") or "")
        if u:
            session.clear()
            session["uid"] = u["id"]
            session["role"] = u["role"]
            session["name"] = u["name"]
            session.permanent = True
            nxt = request.args.get("next")
            home = url_for("dashboard") if u["role"] == "admin" else url_for("me")
            return redirect(nxt or home)
        error = "아이디 또는 비밀번호가 올바르지 않습니다."
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/account/password", methods=["POST"])
def account_password():
    """본인 비밀번호 변경(관리자·직원 공통)."""
    u = current_user()
    new = request.form.get("new_password") or ""
    if not db.verify_user(u["username"], request.form.get("cur_password") or ""):
        flash("현재 비밀번호가 올바르지 않습니다.", "error")
    elif len(new) < 4:
        flash("새 비밀번호는 4자 이상이어야 합니다.", "error")
    else:
        db.set_password(u["id"], new)
        flash("비밀번호를 변경했습니다.", "ok")
    return redirect(request.referrer or url_for("dashboard"))


@app.route("/rename", methods=["POST"])
def rename_farm():
    """농장(앱) 이름 변경 — 상단 헤더 메뉴에서 호출."""
    name = _f("farm_name")
    if not name:
        flash("이름을 입력하세요.", "error")
    else:
        db.set_setting("farm_name", name)
        flash("이름을 변경했습니다.", "ok")
    return redirect(request.referrer or url_for("dashboard"))


# ── 템플릿 공용 헬퍼/상수 ────────────────────────────────────────────
_WDAY = ["월", "화", "수", "목", "금", "토", "일"]


@app.template_filter("wday")
def wday_filter(date_str):
    """'2026-06-15' → '월'(요일). 잘못된 값이면 빈 문자열."""
    try:
        y, m, d = (int(x) for x in str(date_str).split("-"))
        from datetime import date
        return _WDAY[date(y, m, d).weekday()]
    except Exception:
        return ""


@app.template_filter("md")
def md_filter(date_str):
    """'2026-06-15' → '6월 15일'."""
    try:
        _, m, d = str(date_str).split("-")
        return f"{int(m)}월 {int(d)}일"
    except Exception:
        return date_str


@app.context_processor
def inject_helpers():
    return dict(
        won=won, won_short=won_short, today=today_str(),
        farm_name=db.get_setting("farm_name", ""),
        CATEGORIES=LIVESTOCK_CATEGORIES, CATTLE_TYPES=CATTLE_TYPES,
        ACTIVITIES=FARM_ACTIVITIES,
        FIN_TYPES=FINANCE_TYPES, FIN_SECTORS=FINANCE_SECTORS,
        SUPPORT_STATUSES=SUPPORT_STATUSES,
        REMINDER_CATEGORIES=REMINDER_CATEGORIES, REMINDER_REPEATS=REMINDER_REPEATS,
        FACILITY_TYPES=FACILITY_TYPES, FACILITY_STATUSES=FACILITY_STATUSES,
        nav_active=request.endpoint or "",
        auth_on=True,
        current_user=current_user(),
        is_admin=(session.get("role") == "admin"),
        notif_count=(db.count_completed_unacked()
                     if session.get("role") == "admin" else 0),
    )


def _f(name, default=""):
    """폼 값 가져오기(공백 제거)."""
    return (request.form.get(name) or default).strip()


def _arg(name, default=""):
    """쿼리스트링 값 가져오기(공백 제거)."""
    return (request.args.get(name) or default).strip()


def _num(name, default=0.0):
    """폼 숫자값 — 비거나 잘못되면 default."""
    raw = (request.form.get(name) or "").replace(",", "").strip()
    try:
        return float(raw)
    except ValueError:
        return default


def _days_until(date_str):
    """오늘 기준 D-day(정수). 미래=양수, 지남=음수. 잘못된 값이면 None."""
    from datetime import date
    try:
        y, m, d = (int(x) for x in str(date_str).split("-"))
        return (date(y, m, d) - date.today()).days
    except Exception:
        return None


def _advance_date(date_str, repeat):
    """반복 주기에 맞춰 다음 날짜(YYYY-MM-DD)를 반환."""
    import calendar
    from datetime import date, timedelta
    try:
        y, m, d = (int(x) for x in date_str.split("-"))
    except Exception:
        return date_str
    if repeat == "매주":
        return (date(y, m, d) + timedelta(days=7)).isoformat()
    if repeat == "매월":
        m2, y2 = (1, y + 1) if m == 12 else (m + 1, y)
        return date(y2, m2, min(d, calendar.monthrange(y2, m2)[1])).isoformat()
    if repeat == "매년":
        return date(y + 1, m, min(d, calendar.monthrange(y + 1, m)[1])).isoformat()
    return date_str


# ── 🏠 대시보드 ──────────────────────────────────────────────────────
@app.route("/")
def dashboard():
    now = datetime.now()
    year, month = now.year, now.month

    active, by_cat = db.livestock_summary()
    month_kwh = db.solar_month_total(year, month)
    month_revenue = db.solar_revenue(month_kwh)

    # 이번 달 수입/지출/순이익 (가계부 히어로용)
    fm = db.finance_monthly(year)
    m_income, m_expense = fm[month]
    m_profit = m_income - m_expense

    # 올해 누계
    y_income, y_expense = db.finance_totals(year)
    y_profit = y_income - y_expense

    # 최근 30일 발전량 추이
    solar_rows = list(db.list_solar(limit=30))[::-1]   # 오래된→최근
    labels = [r["log_date"][5:] for r in solar_rows]    # MM-DD
    values = [r["generation_kwh"] for r in solar_rows]
    chart = line_chart(labels, [("발전량(kWh)", values)], colors=[SOLAR])

    # 일정: 전체(활성) + 다가오는 것(60일 이내/지난 것) — D-day 계산
    reminders = []
    for r in db.list_reminders(only_active=True):
        item = dict(r)
        item["dday"] = _days_until(r["due_date"])
        reminders.append(item)
    reminders.sort(key=lambda x: (x["dday"] is None, x["dday"]))
    upcoming = [r for r in reminders if r["dday"] is not None and r["dday"] <= 60]

    # 이번 달 발전 목표 대비(오늘까지)
    solar_prog = db.solar_month_progress(year, month, days_elapsed=now.day)

    return render_template(
        "dashboard.html", by_cat=by_cat, active=active,
        year=year, month=month, chart=chart,
        month_kwh=month_kwh, month_revenue=month_revenue,
        m_income=m_income, m_expense=m_expense, m_profit=m_profit,
        y_income=y_income, y_expense=y_expense, y_profit=y_profit,
        upcoming=upcoming, reminders=reminders, solar_prog=solar_prog,
        work_alerts=db.list_completed_unacked(),
        work_todo=db.list_work_orders(status="지시"),
    )


# ── 🔔 일정/알림 (리마인더) ──────────────────────────────────────────
@app.route("/reminder/save", methods=["POST"])
def reminder_save():
    row_id = request.form.get("id", type=int)
    args = (
        _f("title"), _f("due_date", today_str()),
        _f("category", "기타"), _f("repeat", "없음"), _f("note"),
    )
    if not args[0]:
        flash("일정 제목을 입력하세요.", "error")
        return redirect(url_for("dashboard") + "#sched")
    if row_id:
        db.update_reminder(row_id, *args)
        flash("일정을 수정했습니다.", "ok")
    else:
        db.add_reminder(*args)
        flash("일정을 추가했습니다.", "ok")
    return redirect(url_for("dashboard") + "#sched")


@app.route("/reminder/<int:row_id>/done", methods=["POST"])
def reminder_done(row_id):
    r = db.get_reminder(row_id)
    if not r:
        abort(404)
    if r["repeat"] and r["repeat"] != "없음":
        db.set_reminder_date(row_id, _advance_date(r["due_date"], r["repeat"]))
        flash(f"'{r['title']}' 완료 — 다음 일정으로 넘겼습니다.", "ok")
    else:
        db.delete_reminder(row_id)
        flash(f"'{r['title']}' 일정을 완료(삭제)했습니다.", "ok")
    return redirect(request.referrer or (url_for("dashboard") + "#sched"))


@app.route("/reminder/<int:row_id>/delete", methods=["POST"])
def reminder_delete(row_id):
    db.delete_reminder(row_id)
    flash("일정을 삭제했습니다.", "ok")
    return redirect(request.referrer or (url_for("dashboard") + "#sched"))


# ── 🐄 농축산 (품목 + 영농일지) ──────────────────────────────────────
LOG_PER_PAGE = 10


@app.route("/livestock")
def livestock():
    edit_id = request.args.get("edit", type=int)
    edit_row = None
    if edit_id:
        for r in db.list_livestock():
            if r["id"] == edit_id:
                edit_row = r
                break

    # 영농일지 페이지네이션 (한 페이지 10개)
    total_logs = db.count_farm_log()
    pages = max(1, -(-total_logs // LOG_PER_PAGE))   # ceil
    logp = request.args.get("logp", type=int) or 1
    logp = min(max(logp, 1), pages)
    logs = db.list_farm_log(limit=LOG_PER_PAGE, offset=(logp - 1) * LOG_PER_PAGE)

    fac_edit_id = request.args.get("fedit", type=int)
    facility_edit = db.get_facility(fac_edit_id) if fac_edit_id else None

    return render_template(
        "livestock.html",
        items=db.list_livestock(),
        logs=logs,
        choices=db.livestock_choices(),
        edit_row=edit_row,
        logp=logp, log_pages=pages, total_logs=total_logs,
        facilities=db.list_facility(), facility_edit=facility_edit,
        feeds=db.list_feed_purchase(),
        feed_owners=db.get_owner_list(),
        feed_units=db.get_feed_units(),
        feed_prices=db.get_feed_prices(),
        feed_summary=db.feed_purchase_summary(),
        feed_edit=db.get_feed_purchase(request.args.get("feedit", type=int))
                  if request.args.get("feedit", type=int) else None,
        log_items=[r["name"] for r in db.list_livestock()],
        log_activities=sorted(set(FARM_ACTIVITIES) | set(db.farmlog_activities())),
    )


# ── 🏗 농축산: 시설 (축사 등 공사/준공) ──────────────────────────────
@app.route("/facility/save", methods=["POST"])
def facility_save():
    row_id = request.form.get("id", type=int)
    cost = int(round(_num("cost")))
    args = (
        _f("name"), _f("ftype", "축사"), _f("status", "계획"),
        _f("start_date") or None, _f("done_date") or None,
        _f("approval_date") or None, _f("size"),
        cost if cost > 0 else None, _f("contractor"), _f("note"),
    )
    if not args[0]:
        flash("시설명을 입력하세요.", "error")
        return redirect(url_for("livestock") + "#facility")
    if row_id:
        db.update_facility(row_id, *args)
        flash("시설 정보를 수정했습니다.", "ok")
    else:
        db.add_facility(*args)
        flash("시설을 추가했습니다.", "ok")
    return redirect(url_for("livestock") + "#facility")


@app.route("/facility/<int:row_id>/delete", methods=["POST"])
def facility_delete(row_id):
    db.delete_facility(row_id)
    flash("시설을 삭제했습니다.", "ok")
    return redirect(url_for("livestock") + "#facility")


@app.route("/livestock/save", methods=["POST"])
def livestock_save():
    row_id = request.form.get("id", type=int)
    weight = _num("weight_kg", 0)
    args = (
        _f("category", "작물"), _f("name"), _num("quantity"),
        _f("unit"), _f("start_date", today_str()),
        _f("status", "진행중"), _f("note"),
        weight if weight > 0 else None,
        _f("owner") or None, _f("cattle_type") or None,
    )
    if not args[1]:
        flash("품목명을 입력하세요.", "error")
        return redirect(url_for("livestock"))
    if row_id:
        db.update_livestock(row_id, *args)
        flash("품목을 수정했습니다.", "ok")
    else:
        db.add_livestock(*args)
        flash("품목을 추가했습니다.", "ok")
    return redirect(url_for("livestock"))


@app.route("/livestock/<int:row_id>/sell", methods=["POST"])
def livestock_sell(row_id):
    row = db.get_livestock(row_id)
    if not row:
        abort(404)
    sold_amount = int(round(_num("sold_amount")))
    sold_weight = _num("sold_weight_kg", 0)
    add_fin = bool(request.form.get("add_to_finance"))
    db.sell_livestock(
        row_id, _f("sold_date", today_str()), sold_amount,
        sold_weight if sold_weight > 0 else None,
        _f("note"), add_to_finance=add_fin,
        sold_grade=_f("sold_grade") or None,
    )
    msg = f"'{row['name']}' 판매를 기록했습니다."
    if add_fin and sold_amount > 0:
        msg += f" 재무에 수입 {won(sold_amount)}원을 반영했습니다."
    flash(msg, "ok")
    return redirect(url_for("livestock"))


@app.route("/livestock/<int:row_id>/delete", methods=["POST"])
def livestock_delete(row_id):
    db.delete_livestock(row_id)
    flash("품목을 삭제했습니다.", "ok")
    return redirect(url_for("livestock"))


@app.route("/farmlog/add", methods=["POST"])
def farmlog_add():
    # 품목·활동 모두 자유 입력. 품목명이 등록된 가축/작물과 같으면 자동으로 연결한다.
    item_label = _f("item_label")
    lid = None
    if item_label:
        for r in db.list_livestock():
            if r["name"] == item_label:
                lid = r["id"]
                break
    db.add_farm_log(
        _f("log_date", today_str()), lid,
        _f("activity") or "기타", _num("quantity"), _f("unit"), _f("note"),
        item_label=item_label or None,
    )
    flash("영농 일지를 기록했습니다.", "ok")
    return redirect(url_for("livestock") + "#log")


@app.route("/farmlog/<int:row_id>/delete", methods=["POST"])
def farmlog_delete(row_id):
    db.delete_farm_log(row_id)
    flash("일지를 삭제했습니다.", "ok")
    return redirect(request.referrer or (url_for("livestock") + "#log"))


# ── 🌾 농축산: 사료 구매 (명의별 내역서) ──────────────────────────────
@app.route("/feed/save", methods=["POST"])
def feed_save():
    row_id = request.form.get("id", type=int)
    cattle_type = _f("cattle_type") or None
    qty = _num("quantity")
    unit_price = int(round(_num("unit_price")))
    # 단가 미입력 시 품목별 설정 단가를 적용
    if unit_price <= 0 and cattle_type:
        unit_price = db.get_feed_prices().get(cattle_type, 0)
    # 금액(사료값): 직접 입력값이 있으면 우선, 없으면 수량×단가로 계산
    amount_in = int(round(_num("amount")))
    amount = amount_in if amount_in > 0 else int(round(qty * unit_price))
    add_fin = bool(request.form.get("add_to_finance"))
    # 사료명 미입력 시 품목명을 사료명으로 사용(간이 내역서 대응)
    feed_name = _f("feed_name") or (cattle_type or "")
    args = (
        _f("purchase_date", today_str()), _f("owner"), cattle_type,
        feed_name, qty, _f("unit"), unit_price, amount,
        _f("supplier") or None, _f("note") or None,
    )
    if not args[1]:
        flash("명의(소유주)를 선택하세요.", "error")
        return redirect(url_for("livestock") + "#feed")
    if not feed_name:
        flash("품목 또는 사료명을 입력하세요.", "error")
        return redirect(url_for("livestock") + "#feed")
    if row_id:
        db.update_feed_purchase(row_id, *args, add_to_finance=add_fin)
        flash("사료 구매 내역을 수정했습니다.", "ok")
    else:
        db.add_feed_purchase(*args, add_to_finance=add_fin)
        flash("사료 구매 내역을 추가했습니다.", "ok")
    return redirect(url_for("livestock") + "#feed")


@app.route("/feed/<int:row_id>/delete", methods=["POST"])
def feed_delete(row_id):
    db.delete_feed_purchase(row_id)
    flash("사료 구매 내역을 삭제했습니다.", "ok")
    return redirect(url_for("livestock") + "#feed")


@app.route("/feed/report")
def feed_report():
    """명의별 사료 구매 내역서(인쇄용). owner 미지정 시 전체 명의."""
    owner = _arg("owner")
    owners = [owner] if owner else db.feed_owners()
    groups = []
    for o in owners:
        rows = db.list_feed_purchase(owner=o)
        if not rows:
            continue
        total = sum(r["amount"] or 0 for r in rows)
        groups.append(dict(owner=o, rows=rows, total=total,
                           count=len(rows)))
    grand_total = sum(g["total"] for g in groups)
    return render_template(
        "feed_report.html", groups=groups, grand_total=grand_total,
        owner=owner, all_owners=db.feed_owners(),
    )


def _yymmdd(d):
    """YYYY-MM-DD → YY.MM.DD (간이 내역서 표시용)."""
    p = (d or "").split("-")
    return f"{p[0][2:]}.{p[1]}.{p[2]}" if len(p) == 3 else (d or "")


@app.route("/feed/statement")
def feed_statement():
    """간이 사료 구매내역서(엑셀 양식 형태): 날짜·품목·수량·단가·금액 + 월별 누계."""
    owner = _arg("owner")
    owners = [owner] if owner else db.feed_owners()
    sheets = []
    for o in owners:
        rows = sorted(db.list_feed_purchase(owner=o),
                      key=lambda r: (r["purchase_date"] or "", r["id"]))
        if not rows:
            continue
        display = []
        cumulative = 0
        prev_date = None
        prev_month = None
        for r in rows:
            month = (r["purchase_date"] or "")[:7]
            # 달이 바뀌면 직전까지의 누계 행을 끼워넣는다
            if prev_month is not None and month != prev_month:
                display.append(dict(kind="subtotal", total=cumulative))
            amt = r["amount"] or 0
            cumulative += amt
            new_date = r["purchase_date"] != prev_date
            display.append(dict(
                kind="data",
                date=_yymmdd(r["purchase_date"]) if new_date else "",
                first_of_date=new_date,
                item=r["cattle_type"] or r["feed_name"] or "",
                qty=r["quantity"], unit=r["unit"] or "",
                price=r["unit_price"] or 0, amount=amt,
            ))
            prev_date = r["purchase_date"]
            prev_month = month
        display.append(dict(kind="subtotal", total=cumulative))   # 최종 누계
        sheets.append(dict(owner=o, rows=display, total=cumulative))
    return render_template(
        "feed_statement.html", sheets=sheets,
        owner=owner, all_owners=db.feed_owners(),
    )


@app.route("/feed/settings", methods=["POST"])
def feed_settings():
    """사료 설정 저장: 소유주(명의) 목록 · 단위 목록 · 품목별 단가."""
    owners = [s.strip() for s in (request.form.get("owners") or "").splitlines() if s.strip()]
    units = [s.strip() for s in (request.form.get("units") or "").splitlines() if s.strip()]
    db.set_owner_list(owners)
    db.set_feed_units(units)
    prices = {}
    for t in CATTLE_TYPES:
        prices[t] = _num(f"price_{t}", 0)
    db.set_feed_prices(prices)
    flash("사료 설정을 저장했습니다.", "ok")
    return redirect(url_for("livestock") + "#feedset")


# ── 👷 직원 / 급여 / 작업지시 (관리자) ────────────────────────────────
def _month_str():
    return datetime.now().strftime("%Y-%m")


@app.route("/staff")
def staff():
    """관리자: 직원 계정·급여·작업지시 관리."""
    staff_edit = db.get_user(request.args.get("uedit", type=int)) \
        if request.args.get("uedit", type=int) else None
    pay_edit = db.get_payroll(request.args.get("pedit", type=int)) \
        if request.args.get("pedit", type=int) else None
    work_edit = db.get_work_order(request.args.get("wedit", type=int)) \
        if request.args.get("wedit", type=int) else None
    return render_template(
        "staff.html",
        users=db.list_users(),
        staff_list=db.list_users(role="staff", only_active=True),
        payrolls=db.list_payroll(),
        orders=db.list_work_orders(),
        staff_edit=staff_edit, pay_edit=pay_edit, work_edit=work_edit,
        this_month=_month_str(),
    )


@app.route("/staff/save", methods=["POST"])
def staff_save():
    row_id = request.form.get("id", type=int)
    username = _f("username")
    name = _f("name")
    role = _f("role", "staff")
    phone = _f("phone") or None
    active = bool(request.form.get("active", "1"))
    password = request.form.get("password") or ""
    if not name:
        flash("이름을 입력하세요.", "error")
        return redirect(url_for("staff"))
    if row_id:
        db.update_user(row_id, name, role, phone, active)
        if password:
            db.set_password(row_id, password)
        flash("직원 정보를 수정했습니다.", "ok")
    else:
        if not username or not password:
            flash("새 계정은 아이디와 비밀번호가 필요합니다.", "error")
            return redirect(url_for("staff"))
        if db.username_exists(username):
            flash("이미 사용 중인 아이디입니다.", "error")
            return redirect(url_for("staff"))
        db.add_user(username, password, name, role=role, phone=phone)
        flash(f"'{name}' 계정을 만들었습니다.", "ok")
    return redirect(url_for("staff"))


@app.route("/staff/<int:row_id>/delete", methods=["POST"])
def staff_delete(row_id):
    u = db.get_user(row_id)
    if u and u["id"] == session.get("uid"):
        flash("로그인한 본인 계정은 삭제할 수 없습니다.", "error")
    elif u and u["role"] == "admin" and len(db.list_users(role="admin")) <= 1:
        flash("관리자 계정이 최소 1명은 있어야 합니다.", "error")
    else:
        db.delete_user(row_id)
        flash("계정을 삭제했습니다.", "ok")
    return redirect(url_for("staff"))


@app.route("/payroll/save", methods=["POST"])
def payroll_save():
    row_id = request.form.get("id", type=int)
    user_id = request.form.get("user_id", type=int)
    if not user_id:
        flash("직원을 선택하세요.", "error")
        return redirect(url_for("staff") + "#pay")
    base = int(round(_num("base_pay")))
    allow = int(round(_num("allowance")))
    deduct = int(round(_num("deduction")))
    paid = bool(request.form.get("paid"))
    paid_date = _f("paid_date") or None
    args = (user_id, _f("pay_month", _month_str()), base, allow, deduct,
            paid, paid_date, _f("note") or None)
    if row_id:
        db.update_payroll(row_id, *args, add_to_finance=True)
        flash("급여를 수정했습니다.", "ok")
    else:
        db.add_payroll(*args, add_to_finance=True)
        flash("급여를 등록했습니다.", "ok")
    return redirect(url_for("staff") + "#pay")


@app.route("/payroll/<int:row_id>/delete", methods=["POST"])
def payroll_delete(row_id):
    db.delete_payroll(row_id)
    flash("급여 내역을 삭제했습니다.", "ok")
    return redirect(url_for("staff") + "#pay")


@app.route("/work/save", methods=["POST"])
def work_save():
    row_id = request.form.get("id", type=int)
    assignee_id = request.form.get("assignee_id", type=int)
    title = _f("title")
    if not assignee_id or not title:
        flash("담당 직원과 작업 제목을 입력하세요.", "error")
        return redirect(url_for("staff") + "#work")
    detail = _f("detail") or None
    due = _f("due_date") or None
    if row_id:
        db.update_work_order(row_id, assignee_id, title, detail, due)
        flash("작업지시를 수정했습니다.", "ok")
    else:
        db.add_work_order(assignee_id, title, detail, due, session.get("uid"))
        flash("작업지시를 내렸습니다.", "ok")
    return redirect(url_for("staff") + "#work")


@app.route("/work/<int:row_id>/delete", methods=["POST"])
def work_delete(row_id):
    db.delete_work_order(row_id)
    flash("작업지시를 삭제했습니다.", "ok")
    return redirect(url_for("staff") + "#work")


@app.route("/work/<int:row_id>/reopen", methods=["POST"])
def work_reopen(row_id):
    db.reopen_work_order(row_id)
    flash("작업을 다시 지시 상태로 되돌렸습니다.", "ok")
    return redirect(request.referrer or (url_for("staff") + "#work"))


@app.route("/work/ack", methods=["POST"])
def work_ack():
    """관리자가 완료 알림을 확인 처리."""
    wid = request.form.get("id", type=int)
    if wid:
        db.ack_work_order(wid)
    else:
        db.ack_all_work_orders()
    return redirect(request.referrer or url_for("dashboard"))


@app.route("/me")
def me():
    """직원·관리자 공통: 본인에게 배정된 작업 + 본인 급여."""
    u = current_user()
    return render_template(
        "myhome.html",
        orders=db.list_work_orders(assignee_id=u["id"]),
        payrolls=db.list_payroll(user_id=u["id"]),
    )


@app.route("/work/<int:row_id>/complete", methods=["POST"])
def work_complete(row_id):
    """직원이 본인 작업을 완료 처리 → 관리자 알림 대상이 됨."""
    db.complete_work_order(row_id, session.get("uid"))
    flash("작업을 완료 처리했습니다. 관리자에게 알림이 전달됩니다.", "ok")
    return redirect(url_for("me"))


@app.route("/api/notifications")
def api_notifications():
    """관리자 알림 폴링용 JSON(완료된 미확인 작업)."""
    if session.get("role") != "admin":
        return jsonify(count=0, items=[])
    rows = db.list_completed_unacked()
    items = [dict(id=r["id"], title=r["title"], who=r["assignee_name"],
                  at=r["completed_at"]) for r in rows]
    return jsonify(count=len(items), items=items)


# ── ☀ 태양광 (설비 설정 + 발전 기록) ────────────────────────────────
@app.route("/solar")
def solar():
    rows = db.list_solar(limit=400)
    enriched = [
        dict(id=r["id"], log_date=r["log_date"],
             generation_kwh=r["generation_kwh"],
             net_kwh=db.solar_net_kwh(r["generation_kwh"]),
             revenue=db.solar_revenue(r["generation_kwh"]),
             note=r["note"] or "")
        for r in rows
    ]
    edit_id = request.args.get("edit", type=int)
    edit_row = db.get_solar(edit_id) if edit_id else None
    settings = dict(
        capacity_kw=db.get_setting("capacity_kw", "100"),
        smp_price=db.get_setting("smp_price", "130"),
        rec_price=db.get_setting("rec_price", "70"),
        rec_weight=db.get_setting("rec_weight", "1.2"),
        farm_name=db.get_setting("farm_name", ""),
        daily_yield_hours=db.get_setting("daily_yield_hours", "3.5"),
        loss_rate=db.get_setting("loss_rate", "15"),
    )
    now = datetime.now()
    prog = db.solar_month_progress(now.year, now.month, days_elapsed=now.day)
    return render_template(
        "solar.html", rows=enriched, settings=settings,
        unit_revenue=db.solar_unit_revenue(),
        prog=prog, expected_daily=db.solar_expected_daily(),
        month=now.month, edit_row=edit_row, loss_rate=db.solar_loss_rate(),
    )


@app.route("/solar/settings", methods=["POST"])
def solar_settings():
    db.set_setting("farm_name", _f("farm_name"))
    db.set_setting("capacity_kw", _num("capacity_kw", 100))
    db.set_setting("smp_price", _num("smp_price", 130))
    db.set_setting("rec_price", _num("rec_price", 70))
    db.set_setting("rec_weight", _num("rec_weight", 1.2))
    db.set_setting("daily_yield_hours", _num("daily_yield_hours", 3.5))
    db.set_setting("loss_rate", _num("loss_rate", 15))
    flash("발전 설비 설정을 저장했습니다.", "ok")
    return redirect(url_for("solar"))


@app.route("/solar/add", methods=["POST"])
def solar_add():
    db.add_or_update_solar(_f("log_date", today_str()), _num("generation_kwh"), _f("note"))
    flash("발전량을 기록했습니다. (같은 날짜는 덮어쓰기)", "ok")
    return redirect(url_for("solar"))


@app.route("/solar/<int:row_id>/delete", methods=["POST"])
def solar_delete(row_id):
    db.delete_solar(row_id)
    flash("발전 기록을 삭제했습니다.", "ok")
    return redirect(url_for("solar"))


@app.route("/solar/sync", methods=["POST"])
def solar_sync():
    months, total = db.sync_solar_revenue_to_finance()
    flash(f"{months}개월 발전수익 {won(total)}원을 재무에 반영했습니다.", "ok")
    return redirect(url_for("solar"))


# ── 💰 재무 ──────────────────────────────────────────────────────────
FIN_PER_PAGE = 10


@app.route("/finance")
def finance():
    edit_id = request.args.get("edit", type=int)
    edit_row = db.conn.execute(
        "SELECT * FROM finance WHERE id=?", (edit_id,)
    ).fetchone() if edit_id else None

    # 검색·필터 조건
    flt = dict(
        q=_arg("q"), tx_type=_arg("type"), sector=_arg("sector"),
        date_from=_arg("from"), date_to=_arg("to"),
    )
    total = db.count_finance_filtered(**flt)
    fin_pages = max(1, -(-total // FIN_PER_PAGE))
    fp = request.args.get("fp", type=int) or 1
    fp = min(max(fp, 1), fin_pages)
    rows = [dict(r) for r in db.list_finance_filtered(
        **flt, limit=FIN_PER_PAGE, offset=(fp - 1) * FIN_PER_PAGE)]

    # 현재 페이지를 날짜별로 그룹(이미 날짜 DESC 정렬)
    from itertools import groupby
    groups = []
    for d, items in groupby(rows, key=lambda r: r["tx_date"]):
        items = list(items)
        net = sum((i["amount"] if i["tx_type"] == "수입" else -i["amount"])
                  for i in items)
        groups.append((d, items, net))

    income, expense = db.finance_totals()
    tax_settings = dict(
        vat_rate_solar=db.get_setting("vat_rate_solar", "10"),
        vat_rate_farm=db.get_setting("vat_rate_farm", "0"),
        income_tax_rate=db.get_setting("income_tax_rate", "0"),
        farm_taxfree_limit=db.get_setting("farm_taxfree_limit", "30000000"),
    )
    tax = db.tax_estimate(datetime.now().year)
    support_edit_id = request.args.get("support_edit", type=int)
    support_edit = db.get_support(support_edit_id) if support_edit_id else None
    has_filter = any(flt.values())
    return render_template(
        "finance.html", groups=groups, edit_row=edit_row,
        income=income, expense=expense, profit=income - expense,
        supports=db.list_support(), support_sum=db.support_summary(),
        tax_settings=tax_settings, tax=tax,
        support_edit=support_edit,
        flt=flt, has_filter=has_filter,
        fp=fp, fin_pages=fin_pages, total_tx=total,
    )


@app.route("/finance/save", methods=["POST"])
def finance_save():
    row_id = request.form.get("id", type=int)
    args = (
        _f("tx_date", today_str()), _f("tx_type", "수입"),
        _f("sector", "농축산"), _f("item"),
        int(round(_num("amount"))), _f("note"),
    )
    if not args[3]:
        flash("항목명을 입력하세요.", "error")
        return redirect(url_for("finance"))
    if row_id:
        db.update_finance(row_id, *args)
        flash("거래를 수정했습니다.", "ok")
    else:
        db.add_finance(*args)
        flash("거래를 추가했습니다.", "ok")
    return redirect(url_for("finance"))


@app.route("/finance/<int:row_id>/delete", methods=["POST"])
def finance_delete(row_id):
    db.delete_finance(row_id)
    flash("거래를 삭제했습니다.", "ok")
    return redirect(url_for("finance"))


# ── 세금 자동계산 ────────────────────────────────────────────────────
@app.route("/finance/tax/settings", methods=["POST"])
def tax_settings():
    db.set_setting("vat_rate_solar", _num("vat_rate_solar", 10))
    db.set_setting("vat_rate_farm", _num("vat_rate_farm", 0))
    db.set_setting("income_tax_rate", _num("income_tax_rate", 0))
    db.set_setting("farm_taxfree_limit", int(round(_num("farm_taxfree_limit", 30000000))))
    flash("세금 설정을 저장했습니다.", "ok")
    return redirect(url_for("finance") + "#tax")


@app.route("/finance/tax/sync", methods=["POST"])
def tax_sync():
    count, total = db.sync_tax_to_finance()
    if count:
        flash(f"추정 세금 {count}건 {won(total)}원을 재무에 반영했습니다.", "ok")
    else:
        flash("반영할 세금이 없습니다. 세율과 거래 내역을 확인하세요.", "error")
    return redirect(url_for("finance") + "#tax")


# ── 지원사업 (보조금/지원금) ─────────────────────────────────────────
@app.route("/support/save", methods=["POST"])
def support_save():
    row_id = request.form.get("id", type=int)
    args = (
        _f("name"), _f("agency"), _f("apply_date", today_str()),
        int(round(_num("amount"))), _f("status", "신청"), _f("note"),
    )
    if not args[0]:
        flash("사업명을 입력하세요.", "error")
        return redirect(url_for("finance"))
    if row_id:
        db.update_support(row_id, *args)
        flash("지원사업을 수정했습니다.", "ok")
    else:
        db.add_support(*args)
        flash("지원사업을 추가했습니다.", "ok")
    return redirect(url_for("finance") + "#support")


@app.route("/support/<int:row_id>/delete", methods=["POST"])
def support_delete(row_id):
    db.delete_support(row_id)
    flash("지원사업을 삭제했습니다.", "ok")
    return redirect(url_for("finance") + "#support")


# ── 📊 통계 ──────────────────────────────────────────────────────────
@app.route("/reports")
def reports():
    years = db.finance_years()
    year = request.args.get("year", type=int) or int(years[0])

    fm = db.finance_monthly(year)
    months = [f"{m}월" for m in range(1, 13)]
    income = [fm[m][0] for m in range(1, 13)]
    expense = [fm[m][1] for m in range(1, 13)]
    fin_chart = bar_chart(
        months, [("수입", income), ("지출", expense)],
        money=True, colors=[INCOME, EXPENSE],
    )

    sm = db.solar_monthly(year)
    kwh = [sm[m] for m in range(1, 13)]
    solar_chart = line_chart(months, [("발전량(kWh)", kwh)], colors=[SOLAR])

    # 그래프 아래에 함께 보여줄 월별 금액표 (기록이 있는 달만)
    fin_rows = [
        dict(month=m, income=fm[m][0], expense=fm[m][1], net=fm[m][0] - fm[m][1])
        for m in range(1, 13) if fm[m][0] or fm[m][1]
    ]
    fin_year = dict(
        income=sum(income), expense=sum(expense),
        net=sum(income) - sum(expense),
    )
    solar_rows = [
        dict(month=m, kwh=sm[m], revenue=db.solar_revenue(sm[m]))
        for m in range(1, 13) if sm[m]
    ]
    solar_year = dict(kwh=sum(kwh), revenue=db.solar_revenue(sum(kwh)))

    growth = db.livestock_growth_stats()
    return render_template(
        "reports.html", years=years, year=year,
        fin_chart=fin_chart, solar_chart=solar_chart, growth=growth,
        fin_rows=fin_rows, fin_year=fin_year,
        solar_rows=solar_rows, solar_year=solar_year,
    )


# ── 📄 서류 바로가기 ─────────────────────────────────────────────────
@app.route("/docs")
def docs():
    return render_template("docs.html", groups=LINK_GROUPS)


# ── 파일/데이터 메뉴 ─────────────────────────────────────────────────
@app.route("/export")
def export_csv():
    """CSV 5종을 ZIP 하나로 묶어 내려받게 한다(브라우저는 폴더 선택 불가)."""
    with tempfile.TemporaryDirectory() as tmp:
        files = exporter.export_all(db, tmp)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in files:
                zf.write(p, arcname=os.path.basename(p))
        buf.seek(0)
    stamp = datetime.now().strftime("%Y%m%d")
    return send_file(
        buf, mimetype="application/zip", as_attachment=True,
        download_name=f"영농형태양광_데이터_{stamp}.zip",
    )


@app.route("/backup")
def backup_db():
    """데이터베이스 파일(.db) 전체를 통째로 내려받는다(완전 백업)."""
    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    return send_file(
        DB_PATH, as_attachment=True,
        download_name=f"farm_data_backup_{stamp}.db",
        mimetype="application/octet-stream",
    )


@app.route("/restore", methods=["POST"])
def restore_db():
    """백업한 .db 파일을 올려 현재 데이터를 통째로 교체(복원)한다."""
    f = request.files.get("dbfile")
    if not f or not f.filename:
        flash("복원할 .db 파일을 선택하세요.", "error")
        return redirect(url_for("dashboard"))
    data = f.read()
    if not data.startswith(b"SQLite format 3\x00"):
        flash("올바른 SQLite(.db) 파일이 아닙니다. 백업으로 받은 파일인지 확인하세요.", "error")
        return redirect(url_for("dashboard"))
    global db
    try:
        db.close()
    except Exception:
        pass
    import shutil
    try:                                   # 만일을 위해 기존 DB 백업
        shutil.copy(DB_PATH, DB_PATH + ".bak")
    except Exception:
        pass
    with open(DB_PATH, "wb") as out:
        out.write(data)
    db = Database(DB_PATH)
    flash("데이터를 복원했습니다. (직전 데이터는 farm_data.db.bak 로 보관)", "ok")
    return redirect(url_for("dashboard"))


@app.route("/seed", methods=["POST"])
def seed_sample():
    _seed(db)
    flash("예시 데이터를 채웠습니다. 각 화면을 둘러보세요!", "ok")
    return redirect(url_for("dashboard"))


@app.route("/reset", methods=["POST"])
def reset_all():
    for table in ("farm_log", "livestock", "solar_log", "finance",
                  "support_program", "reminder", "facility",
                  "feed_purchase", "payroll", "work_order"):
        db.conn.execute(f"DELETE FROM {table}")
    db.conn.commit()
    flash("모든 데이터를 초기화했습니다. (설비 설정·직원 계정은 유지)", "ok")
    return redirect(url_for("dashboard"))


# ── PWA(홈 화면 설치)용 라우트 ───────────────────────────────────────
@app.route("/manifest.webmanifest")
def manifest():
    return app.send_static_file("manifest.webmanifest")


@app.route("/.well-known/assetlinks.json")
def assetlinks():
    """안드로이드 TWA(APK) 검증용 Digital Asset Links.

    PWABuilder/Bubblewrap로 APK를 만들면 assetlinks.json 을 줍니다.
    그 내용을 static/.well-known/assetlinks.json 에 저장하면 이 주소
    (https://<도메인>/.well-known/assetlinks.json)로 제공되어, 앱 상단의
    주소창 없이 전체화면으로 실행됩니다.
    """
    path = os.path.join(RESOURCE_DIR, "static", ".well-known", "assetlinks.json")
    if not os.path.exists(path):
        abort(404)
    return send_file(path, mimetype="application/json")


@app.route("/sw.js")
def service_worker():
    # 서비스워커는 루트 스코프에서 제공해야 전체 사이트를 캐시할 수 있다.
    resp = app.send_static_file("sw.js")
    resp.headers["Content-Type"] = "application/javascript"
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


# ── 예시 데이터 (app.py의 seed_sample 로직 이식) ─────────────────────
def _days_ago(n):
    return (datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d")


def _days_ahead(n):
    return (datetime.now() + timedelta(days=n)).strftime("%Y-%m-%d")


def _seed(db):
    cow = db.add_livestock("가축", "한우", 32, "두", _days_ago(400), "진행중", "비육우", 280)
    db.add_livestock("작물", "벼", 2000, "㎡", _days_ago(120), "진행중", "친환경 재배")
    db.add_livestock("작물", "고추", 300, "주", _days_ago(80), "진행중", "")

    # 판매(출하) 완료된 가축 예시 — 성장 통계용 (입식 250kg → 출하 690kg)
    sold = db.add_livestock("가축", "한우(출하)", 1, "두", _days_ago(420), "진행중", "비육우", 250)
    db.sell_livestock(sold, _days_ago(8), 9_200_000, 690, "도매 출하",
                      add_to_finance=True, sold_grade="1++")

    db.add_farm_log(_days_ago(2), cow, "급여/관리", 240, "kg", "배합사료")
    db.add_farm_log(_days_ago(1), cow, "방역/병해충", 0, "", "구제역 백신 접종")

    for i in range(30, -1, -1):
        d = _days_ago(i)
        base = float(db.get_setting_float("capacity_kw", 100)) * 3.8
        kwh = round(base * random.uniform(0.55, 1.05), 1)
        db.add_or_update_solar(d, kwh, "")

    db.add_finance(_days_ago(20), "수입", "농축산", "한우 출하", 4_800_000, "2두")
    db.add_finance(_days_ago(15), "지출", "농축산", "사료 구입", 1_200_000, "")
    month_kwh = db.solar_month_total(datetime.now().year, datetime.now().month)
    db.add_finance(_days_ago(5), "수입", "태양광", "발전 정산금",
                   db.solar_revenue(month_kwh), "전월분")
    db.add_finance(_days_ago(10), "지출", "공통", "전기·수도료", 180_000, "")

    # 지원사업 예시 (수령 1건은 재무에 자동 반영됨)
    db.add_support("친환경농업 직불금", "서천군", _days_ago(60), 1_500_000, "수령", "")
    db.add_support("영농형 태양광 시설 융자", "에너지공단", _days_ago(30), 20_000_000, "선정", "이율 1.75%")

    # 시설 예시 (공사중 1동 + 준공 1동)
    db.add_facility("1동 우사", "축사", "공사중", _days_ago(40), None, None,
                    "660㎡ · 50두 규모", 180_000_000, "대한축산건설", "지붕 태양광 연계")
    db.add_facility("퇴비사", "퇴비사", "준공", _days_ago(400), _days_ago(330),
                    _days_ago(300), "200㎡", 45_000_000, "서천종합건설", "")

    # 일정/알림 예시 (다가오는 일정 + 반복)
    db.add_reminder("구제역 백신 접종", _days_ahead(5), "방역/백신", "매년", "전 두수")
    db.add_reminder("부가가치세 신고", _days_ahead(20), "세금신고", "매년", "1기 확정")
    db.add_reminder("태양광 패널 점검·청소", _days_ahead(12), "농작업", "매월", "")


def main():
    port = int(os.environ.get("PORT", "8000"))
    url = f"http://localhost:{port}"
    print("=" * 56)
    print("  영농형 태양광 관리 (웹) 가 실행되었습니다.")
    print(f"  이 컴퓨터:   {url}")
    print("  같은 와이파이의 휴대폰에서도 접속할 수 있습니다.")
    if APP_PASSWORD:
        print("  🔒 비밀번호 보호: 켜짐 (APP_PASSWORD)")
    else:
        print("  🔓 비밀번호 보호: 꺼짐 (로컬 모드)")
    print("  (종료하려면 이 창에서 Ctrl+C)")
    print("=" * 56)
    # host=0.0.0.0 : 같은 공유기(와이파이)의 휴대폰에서도 접속 가능
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
