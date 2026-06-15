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
    send_file, abort, flash, Response, session,
)

import exporter
from database import (
    Database, today_str,
    LIVESTOCK_CATEGORIES, FARM_ACTIVITIES, FINANCE_TYPES, FINANCE_SECTORS,
    SUPPORT_STATUSES,
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


@app.before_request
def _require_login():
    if not APP_PASSWORD:
        return  # 비밀번호 미설정 = 로컬 모드, 인증 불필요
    if session.get("authed"):
        return
    # 로그인 화면과 정적/PWA 자원은 인증 없이 허용
    open_endpoints = {"login", "static", "manifest", "service_worker"}
    if request.endpoint in open_endpoints:
        return
    return redirect(url_for("login", next=request.path))


@app.route("/login", methods=["GET", "POST"])
def login():
    if not APP_PASSWORD or session.get("authed"):
        return redirect(url_for("dashboard"))
    error = None
    if request.method == "POST":
        if (request.form.get("password") or "") == APP_PASSWORD:
            session["authed"] = True
            session.permanent = True
            nxt = request.args.get("next") or url_for("dashboard")
            return redirect(nxt)
        error = "비밀번호가 올바르지 않습니다."
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


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
        CATEGORIES=LIVESTOCK_CATEGORIES, ACTIVITIES=FARM_ACTIVITIES,
        FIN_TYPES=FINANCE_TYPES, FIN_SECTORS=FINANCE_SECTORS,
        SUPPORT_STATUSES=SUPPORT_STATUSES,
        nav_active=request.endpoint or "",
        auth_on=bool(APP_PASSWORD),
    )


def _f(name, default=""):
    """폼 값 가져오기(공백 제거)."""
    return (request.form.get(name) or default).strip()


def _num(name, default=0.0):
    """폼 숫자값 — 비거나 잘못되면 default."""
    raw = (request.form.get(name) or "").replace(",", "").strip()
    try:
        return float(raw)
    except ValueError:
        return default


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

    return render_template(
        "dashboard.html", by_cat=by_cat, active=active,
        year=year, month=month, chart=chart,
        month_kwh=month_kwh, month_revenue=month_revenue,
        m_income=m_income, m_expense=m_expense, m_profit=m_profit,
        y_income=y_income, y_expense=y_expense, y_profit=y_profit,
    )


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

    return render_template(
        "livestock.html",
        items=db.list_livestock(),
        logs=logs,
        choices=db.livestock_choices(),
        edit_row=edit_row,
        logp=logp, log_pages=pages, total_logs=total_logs,
    )


@app.route("/livestock/save", methods=["POST"])
def livestock_save():
    row_id = request.form.get("id", type=int)
    weight = _num("weight_kg", 0)
    args = (
        _f("category", "작물"), _f("name"), _num("quantity"),
        _f("unit"), _f("start_date", today_str()),
        _f("status", "진행중"), _f("note"),
        weight if weight > 0 else None,
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
    lid = request.form.get("livestock_id", type=int)
    db.add_farm_log(
        _f("log_date", today_str()), lid or None,
        _f("activity", "급여/관리"), _num("quantity"), _f("unit"), _f("note"),
    )
    flash("영농 일지를 기록했습니다.", "ok")
    return redirect(url_for("livestock") + "#log")


@app.route("/farmlog/<int:row_id>/delete", methods=["POST"])
def farmlog_delete(row_id):
    db.delete_farm_log(row_id)
    flash("일지를 삭제했습니다.", "ok")
    return redirect(request.referrer or (url_for("livestock") + "#log"))


# ── ☀ 태양광 (설비 설정 + 발전 기록) ────────────────────────────────
@app.route("/solar")
def solar():
    rows = db.list_solar(limit=400)
    enriched = [
        dict(id=r["id"], log_date=r["log_date"],
             generation_kwh=r["generation_kwh"],
             revenue=db.solar_revenue(r["generation_kwh"]),
             note=r["note"] or "")
        for r in rows
    ]
    settings = dict(
        capacity_kw=db.get_setting("capacity_kw", "100"),
        smp_price=db.get_setting("smp_price", "130"),
        rec_price=db.get_setting("rec_price", "70"),
        rec_weight=db.get_setting("rec_weight", "1.2"),
        farm_name=db.get_setting("farm_name", ""),
    )
    return render_template(
        "solar.html", rows=enriched, settings=settings,
        unit_revenue=db.solar_unit_revenue(),
    )


@app.route("/solar/settings", methods=["POST"])
def solar_settings():
    db.set_setting("farm_name", _f("farm_name"))
    db.set_setting("capacity_kw", _num("capacity_kw", 100))
    db.set_setting("smp_price", _num("smp_price", 130))
    db.set_setting("rec_price", _num("rec_price", 70))
    db.set_setting("rec_weight", _num("rec_weight", 1.2))
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
@app.route("/finance")
def finance():
    edit_id = request.args.get("edit", type=int)
    edit_row = None
    rows = [dict(r) for r in db.list_finance(limit=1000)]   # groupby/렌더 편의
    if edit_id:
        for r in rows:
            if r["id"] == edit_id:
                edit_row = r
                break
    # 날짜별 그룹(최신순). rows 는 이미 날짜 DESC 정렬이라 연속 묶음이 곧 desc.
    from itertools import groupby
    groups = []
    for d, items in groupby(rows, key=lambda r: r["tx_date"]):
        items = list(items)
        net = sum((i["amount"] if i["tx_type"] == "수입" else -i["amount"])
                  for i in items)
        groups.append((d, items, net))

    income, expense = db.finance_totals()
    tax_settings = dict(
        vat_rate=db.get_setting("vat_rate", "10"),
        income_tax_rate=db.get_setting("income_tax_rate", "0"),
    )
    tax = db.tax_estimate(datetime.now().year)
    support_edit_id = request.args.get("support_edit", type=int)
    support_edit = db.get_support(support_edit_id) if support_edit_id else None
    return render_template(
        "finance.html", groups=groups, edit_row=edit_row,
        income=income, expense=expense, profit=income - expense,
        supports=db.list_support(), support_sum=db.support_summary(),
        tax_settings=tax_settings, tax=tax,
        support_edit=support_edit,
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
    db.set_setting("vat_rate", _num("vat_rate", 10))
    db.set_setting("income_tax_rate", _num("income_tax_rate", 0))
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


@app.route("/seed", methods=["POST"])
def seed_sample():
    _seed(db)
    flash("예시 데이터를 채웠습니다. 각 화면을 둘러보세요!", "ok")
    return redirect(url_for("dashboard"))


@app.route("/reset", methods=["POST"])
def reset_all():
    for table in ("farm_log", "livestock", "solar_log", "finance"):
        db.conn.execute(f"DELETE FROM {table}")
    db.conn.commit()
    flash("모든 데이터를 초기화했습니다. (설비 설정은 유지)", "ok")
    return redirect(url_for("dashboard"))


# ── PWA(홈 화면 설치)용 라우트 ───────────────────────────────────────
@app.route("/manifest.webmanifest")
def manifest():
    return app.send_static_file("manifest.webmanifest")


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


def _seed(db):
    cow = db.add_livestock("가축", "한우", 32, "두", _days_ago(400), "진행중", "비육우", 280)
    db.add_livestock("작물", "벼", 2000, "㎡", _days_ago(120), "진행중", "친환경 재배")
    db.add_livestock("작물", "고추", 300, "주", _days_ago(80), "진행중", "")

    # 판매(출하) 완료된 가축 예시 — 성장 통계용 (입식 250kg → 출하 690kg)
    sold = db.add_livestock("가축", "한우(출하)", 1, "두", _days_ago(420), "진행중", "비육우", 250)
    db.sell_livestock(sold, _days_ago(8), 9_200_000, 690, "도매 출하", add_to_finance=True)

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
