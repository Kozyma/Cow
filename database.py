"""
database.py — 영농형 태양광 관리 프로그램의 데이터 계층

모든 데이터는 SQLite 파일 하나(farm_data.db)에 저장된다.
UI 코드(tab_*.py)는 이 Database 클래스의 메서드만 호출하며,
SQL 문은 전부 이 파일 안에만 존재한다.
"""

import json
import os
import sqlite3
from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash


# ──────────────────────────────────────────────────────────────────
# 태양광 정산 기본 단가 (settings 테이블 초기값)
#   - SMP: 계통한계가격(원/kWh)
#   - REC 단가: 원/kWh 로 환산한 값
#   - REC 가중치: 영농형 태양광 가중치(예시값)
# 모두 [태양광] 탭의 "발전 설비 설정"에서 수정할 수 있다.
# ──────────────────────────────────────────────────────────────────
DEFAULT_SETTINGS = {
    "capacity_kw": "100",     # 설비 용량(kW)
    "smp_price": "130",       # SMP 단가(원/kWh)
    "rec_price": "70",        # REC 단가(원/kWh)
    "rec_weight": "1.2",      # REC 가중치
    "farm_name": "우리 영농형 태양광 농장",
    # ── 세금 설정 ──
    "vat_rate_solar": "10",      # 태양광 부가세율(%) — 전력판매 10% 과세
    "vat_rate_farm": "0",        # 농축산 부가세율(%) — 미가공 농축산물 면세(0)
    "income_tax_rate": "0",      # 종합소득세 실효세율(%) — 순이익 기준(0이면 미계산)
    "farm_taxfree_limit": "30000000",  # 농가부업소득 비과세 한도(원) — 연 3천만원
    "daily_yield_hours": "3.5",  # 일일 일사시간(h) — 이론 발전 = 용량×이 값
    "loss_rate": "15",           # 시스템 손실률(%) — 인버터·온도·음영·오염·선로 등
}

# 분류 선택지 (UI 콤보박스에서 공통 사용)
LIVESTOCK_CATEGORIES = ["가축", "작물"]
CATTLE_TYPES = ["임신우", "육성", "송아지"]   # 소 품목(가축) 구분
DEFAULT_FEED_UNITS = ["포", "kg", "톤", "두", "袋"]   # 사료 단위 기본값(설정에서 변경)
DEFAULT_FEED_PRICES = {"임신우": 19200, "육성": 19100, "송아지": 18500}  # 품목별 사료 단가 기본값
FARM_ACTIVITIES = ["급여/관리", "방역/병해충", "생산/수확", "출하/판매", "기타"]
FINANCE_TYPES = ["수입", "지출"]
FINANCE_SECTORS = ["농축산", "태양광", "공통"]
SUPPORT_STATUSES = ["신청", "선정", "수령", "반려"]   # 지원사업 진행 상태
REMINDER_CATEGORIES = ["방역/백신", "출하/판매", "세금신고", "지원사업", "농작업", "기타"]
REMINDER_REPEATS = ["없음", "매주", "매월", "매년"]
FACILITY_TYPES = ["축사", "퇴비사", "사료창고", "착유실", "창고", "기타"]
FACILITY_STATUSES = ["계획", "인허가", "공사중", "완공", "준공"]


def today_str():
    """오늘 날짜를 'YYYY-MM-DD' 문자열로 반환."""
    return datetime.now().strftime("%Y-%m-%d")


class Database:
    def __init__(self, path):
        """path: SQLite 파일 경로. 없으면 새로 만든다."""
        self.path = path
        # check_same_thread=False: Tkinter 콜백에서 안전하게 쓰기 위함
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row          # 결과를 dict처럼 접근
        self.conn.execute("PRAGMA foreign_keys = ON")
        self._create_tables()
        self._migrate()
        self._init_settings()
        self._init_admin()

    # ── 초기화 ───────────────────────────────────────────────────
    def _create_tables(self):
        self.conn.executescript(
            """
            -- 사육/재배 품목 (현재 농장에서 키우거나 기르는 대상)
            CREATE TABLE IF NOT EXISTS livestock (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                category    TEXT NOT NULL,              -- 가축 / 작물
                name        TEXT NOT NULL,              -- 한우, 돼지, 벼, 고추 ...
                quantity    REAL NOT NULL DEFAULT 0,    -- 수량
                unit        TEXT,                       -- 두, 마리, ㎡, 주 ...
                start_date  TEXT,                       -- 입식/파종일 (YYYY-MM-DD)
                status      TEXT NOT NULL DEFAULT '진행중',
                note        TEXT,
                weight_kg      REAL,                    -- 입식(등록) 시 체중 kg (가축)
                sold_date      TEXT,                    -- 판매(출하)일
                sold_amount    INTEGER,                 -- 판매 금액(원)
                sold_weight_kg REAL,                    -- 판매(출하) 시 체중 kg
                sold_grade     TEXT                     -- 판매(출하) 등급 (1++, 1+, ...)
            );

            -- 영농 일지 (사료 급여 / 수확 / 출하 등 일별 활동)
            CREATE TABLE IF NOT EXISTS farm_log (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date     TEXT NOT NULL,
                livestock_id INTEGER,                   -- livestock.id (없으면 전체)
                activity     TEXT NOT NULL,             -- 급여/관리, 생산/수확 ...
                quantity     REAL NOT NULL DEFAULT 0,   -- 생산량/사료량 등
                unit         TEXT,
                note         TEXT,
                FOREIGN KEY (livestock_id)
                    REFERENCES livestock(id) ON DELETE SET NULL
            );

            -- 사료 구매 내역 (명의별 구매 내역서용)
            CREATE TABLE IF NOT EXISTS feed_purchase (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                purchase_date TEXT NOT NULL,             -- 구매일 (YYYY-MM-DD)
                owner         TEXT NOT NULL DEFAULT '',  -- 명의 (소 소유주)
                cattle_type   TEXT,                      -- 대상 소 품목 (임신우/육성/송아지)
                feed_name     TEXT NOT NULL,             -- 사료명/품목
                quantity      REAL NOT NULL DEFAULT 0,   -- 구매 수량
                unit          TEXT,                      -- 단위 (포 / kg ...)
                unit_price    INTEGER NOT NULL DEFAULT 0,-- 사료 단가(원)
                amount        INTEGER NOT NULL DEFAULT 0,-- 사료값=금액(원) = 수량×단가
                supplier      TEXT,                      -- 구매처
                note          TEXT,
                auto_key      TEXT                       -- 재무 자동반영 식별키
            );

            -- 태양광 일별 발전량 (하루 1건)
            CREATE TABLE IF NOT EXISTS solar_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date        TEXT NOT NULL UNIQUE,
                generation_kwh  REAL NOT NULL DEFAULT 0,
                note            TEXT
            );

            -- 수입/지출 거래
            CREATE TABLE IF NOT EXISTS finance (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                tx_date  TEXT NOT NULL,
                tx_type  TEXT NOT NULL,                 -- 수입 / 지출
                sector   TEXT NOT NULL,                 -- 농축산 / 태양광 / 공통
                item     TEXT NOT NULL,                 -- 항목명
                amount   INTEGER NOT NULL DEFAULT 0,    -- 금액(원)
                note     TEXT,
                auto_key TEXT                           -- 자동반영 식별키(수동입력은 NULL)
            );

            -- 지원사업 (보조금/지원금 신청 관리)
            CREATE TABLE IF NOT EXISTS support_program (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,              -- 사업명
                agency      TEXT,                       -- 지원기관(시군/공단 등)
                apply_date  TEXT,                       -- 신청일 (YYYY-MM-DD)
                amount      INTEGER NOT NULL DEFAULT 0, -- 지원(예정/확정) 금액(원)
                status      TEXT NOT NULL DEFAULT '신청',-- 신청/선정/수령/반려
                note        TEXT
            );

            -- 시설 (축사·퇴비사 등 공사/준공 관리)
            CREATE TABLE IF NOT EXISTS facility (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT NOT NULL,              -- 시설명 (1동 축사 등)
                ftype         TEXT NOT NULL DEFAULT '축사',-- 축사/퇴비사/창고 ...
                status        TEXT NOT NULL DEFAULT '계획',-- 계획/인허가/공사중/완공/준공
                start_date    TEXT,                       -- 착공일
                done_date     TEXT,                       -- 완공일
                approval_date TEXT,                       -- 준공(사용승인)일
                size          TEXT,                       -- 규모(면적/수용두수 등)
                cost          INTEGER,                    -- 공사비(원)
                contractor    TEXT,                       -- 시공업체
                note          TEXT
            );

            -- 일정/알림 (백신·출하·세금신고·지원마감 등)
            CREATE TABLE IF NOT EXISTS reminder (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                title     TEXT NOT NULL,
                due_date  TEXT NOT NULL,              -- YYYY-MM-DD
                category  TEXT NOT NULL DEFAULT '기타',
                repeat    TEXT NOT NULL DEFAULT '없음',-- 없음/매주/매월/매년
                done      INTEGER NOT NULL DEFAULT 0,
                note      TEXT
            );

            -- 설정 (key-value): 태양광 단가, 농장명 등
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            );

            -- 사용자(직원) 계정 — 관리자/직원 로그인
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,       -- 로그인 아이디
                password_hash TEXT NOT NULL,
                name          TEXT NOT NULL,              -- 표시 이름
                role          TEXT NOT NULL DEFAULT 'staff', -- admin / staff
                phone         TEXT,
                active        INTEGER NOT NULL DEFAULT 1,
                created       TEXT
            );

            -- 급여 (직원별 월 급여) — 간단/상세 겸용
            CREATE TABLE IF NOT EXISTS payroll (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                pay_month  TEXT NOT NULL,                 -- 귀속 월 (YYYY-MM)
                base_pay   INTEGER NOT NULL DEFAULT 0,    -- 기본급
                allowance  INTEGER NOT NULL DEFAULT 0,    -- 수당 합계
                deduction  INTEGER NOT NULL DEFAULT 0,    -- 공제 합계(4대보험/세금 등)
                net_pay    INTEGER NOT NULL DEFAULT 0,    -- 실수령액 = 기본급+수당-공제
                paid       INTEGER NOT NULL DEFAULT 0,    -- 지급 완료 여부
                paid_date  TEXT,                          -- 지급일
                note       TEXT,
                auto_key   TEXT,                          -- 재무 자동반영 식별키
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- 작업지시 (관리자 → 직원)
            CREATE TABLE IF NOT EXISTS work_order (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                assignee_id  INTEGER NOT NULL,            -- 담당 직원(users.id)
                title        TEXT NOT NULL,
                detail       TEXT,
                due_date     TEXT,                        -- 마감일
                status       TEXT NOT NULL DEFAULT '지시',-- 지시 / 진행중 / 완료
                created_by   INTEGER,                     -- 지시한 관리자(users.id)
                created_at   TEXT,
                completed_at TEXT,
                ack          INTEGER NOT NULL DEFAULT 0,  -- 관리자 완료확인 여부(알림용)
                note         TEXT,
                FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        self.conn.commit()

    def _init_settings(self):
        """설정 테이블에 기본값이 없으면 채운다."""
        for key, value in DEFAULT_SETTINGS.items():
            self.conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
                (key, value),
            )
        self.conn.commit()

    def _init_admin(self):
        """사용자가 한 명도 없으면 기본 관리자 계정을 만든다(admin/admin1234)."""
        n = self.conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if n == 0:
            self.add_user("admin", "admin1234", "관리자", role="admin")

    def _migrate(self):
        """구버전 DB와의 호환: 빠진 컬럼을 안전하게 추가한다."""
        fin_cols = [r["name"] for r in self.conn.execute("PRAGMA table_info(finance)")]
        if "auto_key" not in fin_cols:
            self.conn.execute("ALTER TABLE finance ADD COLUMN auto_key TEXT")

        # 품목: 체중·판매(출하) 정보 컬럼 (가축 성장/판매 통계용)
        ls_cols = [r["name"] for r in self.conn.execute("PRAGMA table_info(livestock)")]
        for col, ddl in (
            ("weight_kg", "ALTER TABLE livestock ADD COLUMN weight_kg REAL"),          # 입식(등록) 체중
            ("sold_date", "ALTER TABLE livestock ADD COLUMN sold_date TEXT"),          # 판매일
            ("sold_amount", "ALTER TABLE livestock ADD COLUMN sold_amount INTEGER"),   # 판매 금액(원)
            ("sold_weight_kg", "ALTER TABLE livestock ADD COLUMN sold_weight_kg REAL"),# 판매(출하) 체중
            ("sold_grade", "ALTER TABLE livestock ADD COLUMN sold_grade TEXT"),       # 판매 등급
            ("owner", "ALTER TABLE livestock ADD COLUMN owner TEXT"),                 # 명의(소유주)
            ("cattle_type", "ALTER TABLE livestock ADD COLUMN cattle_type TEXT"),     # 소 품목(임신우/육성/송아지)
            ("ear_tag", "ALTER TABLE livestock ADD COLUMN ear_tag TEXT"),             # 이표번호(개체식별번호)
            ("birth_date", "ALTER TABLE livestock ADD COLUMN birth_date TEXT"),       # 출생일
            ("sex", "ALTER TABLE livestock ADD COLUMN sex TEXT"),                     # 성별(암/수/거세)
            ("dam_tag", "ALTER TABLE livestock ADD COLUMN dam_tag TEXT"),             # 어미소 이표번호
            ("health_note", "ALTER TABLE livestock ADD COLUMN health_note TEXT"),     # 건강·진료·방역 메모
            ("barn", "ALTER TABLE livestock ADD COLUMN barn TEXT"),                   # 축사(시설명)
        ):
            if col not in ls_cols:
                self.conn.execute(ddl)

        # 사료 구매: 구버전(테이블만 있던 경우) 대비 컬럼 보강
        fp_cols = [r["name"] for r in self.conn.execute("PRAGMA table_info(feed_purchase)")]
        if fp_cols:  # 테이블이 존재할 때만
            for col, ddl in (
                ("supplier", "ALTER TABLE feed_purchase ADD COLUMN supplier TEXT"),
                ("auto_key", "ALTER TABLE feed_purchase ADD COLUMN auto_key TEXT"),
            ):
                if col not in fp_cols:
                    self.conn.execute(ddl)

        # 영농일지: 자유 입력 품목명(가축/작물에 묶이지 않는 텍스트)
        fl_cols = [r["name"] for r in self.conn.execute("PRAGMA table_info(farm_log)")]
        if "item_label" not in fl_cols:
            self.conn.execute("ALTER TABLE farm_log ADD COLUMN item_label TEXT")
        self.conn.commit()

    # ── 설정 ─────────────────────────────────────────────────────
    def get_setting(self, key, default=None):
        row = self.conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ).fetchone()
        return row["value"] if row else default

    def get_setting_float(self, key, default=0.0):
        try:
            return float(self.get_setting(key))
        except (TypeError, ValueError):
            return default

    def set_setting(self, key, value):
        self.conn.execute(
            "INSERT INTO settings(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )
        self.conn.commit()

    # ── 농축산: 시설 (축사 등 공사/준공 관리) ────────────────────
    def add_facility(self, name, ftype, status, start_date, done_date,
                     approval_date, size, cost, contractor, note):
        cur = self.conn.execute(
            "INSERT INTO facility(name, ftype, status, start_date, done_date, "
            "approval_date, size, cost, contractor, note) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, ftype, status, start_date, done_date, approval_date,
             size, cost, contractor, note),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_facility(self, row_id, name, ftype, status, start_date, done_date,
                        approval_date, size, cost, contractor, note):
        self.conn.execute(
            "UPDATE facility SET name=?, ftype=?, status=?, start_date=?, done_date=?, "
            "approval_date=?, size=?, cost=?, contractor=?, note=? WHERE id=?",
            (name, ftype, status, start_date, done_date, approval_date,
             size, cost, contractor, note, row_id),
        )
        self.conn.commit()

    def delete_facility(self, row_id):
        self.conn.execute("DELETE FROM facility WHERE id=?", (row_id,))
        self.conn.commit()

    def get_facility(self, row_id):
        return self.conn.execute(
            "SELECT * FROM facility WHERE id=?", (row_id,)
        ).fetchone()

    def list_facility(self):
        return self.conn.execute(
            "SELECT * FROM facility "
            "ORDER BY CASE status WHEN '공사중' THEN 0 WHEN '인허가' THEN 1 "
            "WHEN '계획' THEN 2 WHEN '완공' THEN 3 ELSE 4 END, "
            "COALESCE(start_date,'') DESC, id DESC"
        ).fetchall()

    # ── 일정/알림 (리마인더) ─────────────────────────────────────
    def add_reminder(self, title, due_date, category, repeat, note):
        cur = self.conn.execute(
            "INSERT INTO reminder(title, due_date, category, repeat, note) "
            "VALUES (?, ?, ?, ?, ?)",
            (title, due_date, category, repeat, note),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_reminder(self, row_id, title, due_date, category, repeat, note):
        self.conn.execute(
            "UPDATE reminder SET title=?, due_date=?, category=?, repeat=?, note=? WHERE id=?",
            (title, due_date, category, repeat, note, row_id),
        )
        self.conn.commit()

    def set_reminder_date(self, row_id, due_date):
        self.conn.execute(
            "UPDATE reminder SET due_date=? WHERE id=?", (due_date, row_id)
        )
        self.conn.commit()

    def delete_reminder(self, row_id):
        self.conn.execute("DELETE FROM reminder WHERE id=?", (row_id,))
        self.conn.commit()

    def get_reminder(self, row_id):
        return self.conn.execute(
            "SELECT * FROM reminder WHERE id=?", (row_id,)
        ).fetchone()

    def list_reminders(self, only_active=True):
        where = "WHERE done=0" if only_active else ""
        return self.conn.execute(
            f"SELECT * FROM reminder {where} ORDER BY due_date ASC, id ASC"
        ).fetchall()

    # ── 태양광 수익 계산 ──────────────────────────────────────────
    def solar_unit_revenue(self):
        """1kWh당 예상 정산 단가(원). = SMP + REC단가 × REC가중치"""
        smp = self.get_setting_float("smp_price")
        rec = self.get_setting_float("rec_price")
        weight = self.get_setting_float("rec_weight")
        return smp + rec * weight

    def solar_loss_rate(self):
        """시스템 손실률(%) — 인버터·온도·음영·오염·선로 등."""
        return self.get_setting_float("loss_rate", 0)

    def solar_net_kwh(self, kwh):
        """손실률을 반영한 실(정산) 발전량 = 입력 발전량 × (1 − 손실률)."""
        return kwh * (1 - self.solar_loss_rate() / 100.0)

    def solar_revenue(self, kwh):
        """발전량(kWh)에 대한 예상 수익(원, 정수). 손실률을 반영해 계산한다."""
        return int(round(self.solar_net_kwh(kwh) * self.solar_unit_revenue()))

    def solar_expected_daily(self):
        """하루 예상 발전량(kWh) = 용량(kW) × 일사시간(h) × (1 − 손실률).

        손실률은 인버터·온도·음영·오염·선로 등 시스템 손실(보통 약 15%).
        """
        cap = self.get_setting_float("capacity_kw", 0)
        hours = self.get_setting_float("daily_yield_hours", 3.5)
        loss = self.get_setting_float("loss_rate", 0)
        return cap * hours * (1 - loss / 100.0)

    def solar_month_progress(self, year, month, days_elapsed=None):
        """이번(특정) 달 발전 목표 대비 실적.

        days_elapsed 를 주면 '오늘까지'의 예상치와 비교(진행 중인 달용),
        주지 않으면 그 달 전체(일수) 기준으로 비교한다.
        반환 dict: expected, actual, ratio(%), status, shortfall(목표대비 부족%),
                   capacity_factor(설비이용률%), loss_rate(설정 손실률%).
        """
        import calendar
        actual = self.solar_month_total(year, month)
        per_day = self.solar_expected_daily()
        total_days = calendar.monthrange(year, month)[1]
        days = total_days if days_elapsed is None else max(1, min(days_elapsed, total_days))
        expected = per_day * days
        ratio = (actual / expected * 100) if expected > 0 else 0
        shortfall = max(0.0, 100 - ratio) if expected > 0 else 0
        cap = self.get_setting_float("capacity_kw", 0)
        theoretical = cap * 24 * days                      # 24h 풀가동 이론치
        capacity_factor = (actual / theoretical * 100) if theoretical > 0 else 0
        if expected <= 0:
            status = "설정필요"
        elif ratio >= 95:
            status = "정상"
        elif ratio >= 80:
            status = "주의"
        else:
            status = "저조"
        return dict(expected=expected, actual=actual, ratio=ratio,
                    status=status, days=days, total_days=total_days,
                    shortfall=shortfall, capacity_factor=capacity_factor,
                    loss_rate=self.get_setting_float("loss_rate", 0))

    # ── 농축산: 품목 ─────────────────────────────────────────────
    def add_livestock(self, category, name, quantity, unit, start_date, status, note,
                      weight_kg=None, owner=None, cattle_type=None):
        cur = self.conn.execute(
            "INSERT INTO livestock(category, name, quantity, unit, start_date, status, note, "
            "weight_kg, owner, cattle_type) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (category, name, quantity, unit, start_date, status, note,
             weight_kg, owner, cattle_type),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_livestock(self, row_id, category, name, quantity, unit, start_date, status, note,
                         weight_kg=None, owner=None, cattle_type=None):
        self.conn.execute(
            "UPDATE livestock SET category=?, name=?, quantity=?, unit=?, "
            "start_date=?, status=?, note=?, weight_kg=?, owner=?, cattle_type=? WHERE id=?",
            (category, name, quantity, unit, start_date, status, note,
             weight_kg, owner, cattle_type, row_id),
        )
        self.conn.commit()

    def delete_livestock(self, row_id):
        self.conn.execute("DELETE FROM livestock WHERE id=?", (row_id,))
        self.conn.commit()

    def get_livestock(self, row_id):
        return self.conn.execute(
            "SELECT * FROM livestock WHERE id=?", (row_id,)
        ).fetchone()

    def update_cow_info(self, row_id, ear_tag=None, birth_date=None, sex=None,
                        dam_tag=None, health_note=None, barn=None, owner=None,
                        cattle_type=None):
        """소 개체 정보 갱신 — 이표·출생·성별·어미소·건강메모 + 명의·소품목·축사.

        정보 팝업에서 축사 이동·명의/구분 수정까지 할 수 있게 한다. 수량·품목명 등
        나머지 품목정보는 건드리지 않으므로 '수정' 폼과 충돌하지 않는다.
        """
        self.conn.execute(
            "UPDATE livestock SET ear_tag=?, birth_date=?, sex=?, dam_tag=?, "
            "health_note=?, barn=?, owner=?, cattle_type=? WHERE id=?",
            (ear_tag, birth_date, sex, dam_tag, health_note, barn, owner,
             cattle_type, row_id),
        )
        self.conn.commit()

    def set_cow_basics(self, row_id, sex=None, ear_tag=None, birth_date=None, barn=None):
        """등록/수정 폼의 개체 기본값(성별·이표번호·출생일·축사)만 갱신.

        어미소·건강메모 등(정보 팝업에서 입력하는) 다른 컬럼은 건드리지 않으므로
        update_livestock(데스크톱 포함)·정보 팝업과 충돌하지 않는다.
        """
        self.conn.execute(
            "UPDATE livestock SET sex=?, ear_tag=?, birth_date=?, barn=? WHERE id=?",
            (sex, ear_tag, birth_date, barn, row_id),
        )
        self.conn.commit()

    def cattle_counts(self, owner=None, barn=None):
        """진행중 가축을 구분(임신우/육성/송아지)별 두수로 집계. owner·barn(축사)로 필터.

        개체별 등록(1두)·묶음 등록 모두 대응하도록 수량(quantity)을 합산한다.
        반환 예: {'임신우': 5, '육성': 3, '송아지': 2}
        """
        # 각 등록 건을 최소 1두로 센다(수량 미입력=0 이어도 1두로 파악).
        q = ("SELECT cattle_type, "
             "CAST(SUM(CASE WHEN quantity >= 1 THEN quantity ELSE 1 END) AS INTEGER) AS c "
             "FROM livestock WHERE category='가축' AND status='진행중' "
             "AND cattle_type IS NOT NULL AND cattle_type<>''")
        params = []
        if owner:
            q += " AND owner=?"
            params.append(owner)
        if barn:
            q += " AND barn=?"
            params.append(barn)
        q += " GROUP BY cattle_type"
        return {r["cattle_type"]: (r["c"] or 0)
                for r in self.conn.execute(q, params).fetchall()}

    def update_cow_detail(self, row_id, owner=None, cattle_type=None, weight_kg=None,
                          ear_tag=None, birth_date=None, sex=None, dam_tag=None,
                          health_note=None):
        """소 개체 상세정보 갱신 — 명의·소품목·입식체중 + 이표/출생/성별/어미/건강.

        품목 기본정보(구분·품목명·수량·단위·시작일·상태·메모)는 건드리지 않는다.
        데스크톱 농축산 탭의 '소 정보' 팝업에서 사용한다.
        """
        self.conn.execute(
            "UPDATE livestock SET owner=?, cattle_type=?, weight_kg=?, ear_tag=?, "
            "birth_date=?, sex=?, dam_tag=?, health_note=? WHERE id=?",
            (owner, cattle_type, weight_kg, ear_tag, birth_date, sex, dam_tag,
             health_note, row_id),
        )
        self.conn.commit()

    def sell_livestock(self, row_id, sold_date, sold_amount, sold_weight_kg,
                       note="", add_to_finance=True, sold_grade=None):
        """품목 판매(출하) 처리: 판매 정보 기록 + 상태를 '종료'로.

        add_to_finance=True 면 판매 금액을 재무에 '수입'으로 자동 반영한다.
        같은 품목을 다시 판매하면 auto_key(sale-<id>)로 중복 없이 갱신한다.
        """
        row = self.get_livestock(row_id)
        if not row:
            return
        new_note = note if note else row["note"]
        self.conn.execute(
            "UPDATE livestock SET status='종료', sold_date=?, sold_amount=?, "
            "sold_weight_kg=?, sold_grade=?, note=? WHERE id=?",
            (sold_date, sold_amount, sold_weight_kg, sold_grade, new_note, row_id),
        )
        if add_to_finance and sold_amount and sold_amount > 0:
            auto_key = f"sale-{row_id}"
            item = f"{row['name']} 판매"
            parts = []
            if sold_grade:
                parts.append(f"{sold_grade}등급")
            if sold_weight_kg:
                parts.append(f"{sold_weight_kg:g}kg")
            if note:
                parts.append(note)
            fnote = " · ".join(parts)
            existing = self.conn.execute(
                "SELECT id FROM finance WHERE auto_key=?", (auto_key,)
            ).fetchone()
            if existing:
                self.conn.execute(
                    "UPDATE finance SET tx_date=?, tx_type='수입', sector='농축산', "
                    "item=?, amount=?, note=? WHERE id=?",
                    (sold_date, item, int(sold_amount), fnote, existing["id"]),
                )
            else:
                self.conn.execute(
                    "INSERT INTO finance(tx_date, tx_type, sector, item, amount, note, auto_key) "
                    "VALUES (?, '수입', '농축산', ?, ?, ?, ?)",
                    (sold_date, item, int(sold_amount), fnote, auto_key),
                )
        self.conn.commit()

    def list_livestock(self):
        return self.conn.execute(
            "SELECT * FROM livestock ORDER BY status, category, name"
        ).fetchall()

    def livestock_choices(self):
        """일지 입력용: [(id, '가축 · 한우'), ...]"""
        rows = self.conn.execute(
            "SELECT id, category, name FROM livestock ORDER BY category, name"
        ).fetchall()
        return [(r["id"], f"{r['category']} · {r['name']}") for r in rows]

    # ── 농축산: 영농 일지 ────────────────────────────────────────
    def add_farm_log(self, log_date, livestock_id, activity, quantity, unit, note,
                     item_label=None):
        cur = self.conn.execute(
            "INSERT INTO farm_log(log_date, livestock_id, activity, quantity, unit, note, item_label) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (log_date, livestock_id, activity, quantity, unit, note, item_label),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_farm_log(self, row_id, log_date, livestock_id, activity, quantity, unit, note,
                        item_label=None):
        self.conn.execute(
            "UPDATE farm_log SET log_date=?, livestock_id=?, activity=?, "
            "quantity=?, unit=?, note=?, item_label=? WHERE id=?",
            (log_date, livestock_id, activity, quantity, unit, note, item_label, row_id),
        )
        self.conn.commit()

    def farmlog_activities(self):
        """일지에 이미 쓰인 활동명(자동완성용)."""
        rows = self.conn.execute(
            "SELECT DISTINCT activity FROM farm_log WHERE activity IS NOT NULL AND activity<>'' "
            "ORDER BY activity"
        ).fetchall()
        return [r["activity"] for r in rows]

    def delete_farm_log(self, row_id):
        self.conn.execute("DELETE FROM farm_log WHERE id=?", (row_id,))
        self.conn.commit()

    def list_farm_log(self, limit=500, offset=0):
        """일지 + 품목명(LEFT JOIN)을 최신순으로(페이지네이션 지원)."""
        return self.conn.execute(
            """
            SELECT f.*, l.name AS livestock_name, l.category AS livestock_category
            FROM farm_log f
            LEFT JOIN livestock l ON f.livestock_id = l.id
            ORDER BY f.log_date DESC, f.id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()

    def count_farm_log(self):
        return self.conn.execute("SELECT COUNT(*) AS c FROM farm_log").fetchone()["c"]

    # ── 농축산: 사료 구매 내역 ───────────────────────────────────
    def add_feed_purchase(self, purchase_date, owner, cattle_type, feed_name,
                          quantity, unit, unit_price, amount,
                          supplier=None, note=None, add_to_finance=False):
        cur = self.conn.execute(
            "INSERT INTO feed_purchase(purchase_date, owner, cattle_type, feed_name, "
            "quantity, unit, unit_price, amount, supplier, note) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (purchase_date, owner, cattle_type, feed_name,
             quantity, unit, unit_price, amount, supplier, note),
        )
        row_id = cur.lastrowid
        if add_to_finance:
            self._sync_feed_finance(row_id, purchase_date, owner, feed_name, amount)
        self.conn.commit()
        return row_id

    def update_feed_purchase(self, row_id, purchase_date, owner, cattle_type, feed_name,
                             quantity, unit, unit_price, amount,
                             supplier=None, note=None, add_to_finance=False):
        self.conn.execute(
            "UPDATE feed_purchase SET purchase_date=?, owner=?, cattle_type=?, feed_name=?, "
            "quantity=?, unit=?, unit_price=?, amount=?, supplier=?, note=? WHERE id=?",
            (purchase_date, owner, cattle_type, feed_name,
             quantity, unit, unit_price, amount, supplier, note, row_id),
        )
        if add_to_finance:
            self._sync_feed_finance(row_id, purchase_date, owner, feed_name, amount)
        else:
            self.conn.execute("DELETE FROM finance WHERE auto_key=?", (f"feed-{row_id}",))
        self.conn.commit()

    def _sync_feed_finance(self, row_id, purchase_date, owner, feed_name, amount):
        """사료 구매를 재무에 '지출(농축산)'로 자동 반영(중복 없이 갱신)."""
        auto_key = f"feed-{row_id}"
        item = f"{feed_name} 사료 구매"
        fnote = f"명의: {owner}" if owner else ""
        existing = self.conn.execute(
            "SELECT id FROM finance WHERE auto_key=?", (auto_key,)
        ).fetchone()
        if amount and amount > 0:
            if existing:
                self.conn.execute(
                    "UPDATE finance SET tx_date=?, tx_type='지출', sector='농축산', "
                    "item=?, amount=?, note=? WHERE id=?",
                    (purchase_date, item, int(amount), fnote, existing["id"]),
                )
            else:
                self.conn.execute(
                    "INSERT INTO finance(tx_date, tx_type, sector, item, amount, note, auto_key) "
                    "VALUES (?, '지출', '농축산', ?, ?, ?, ?)",
                    (purchase_date, item, int(amount), fnote, auto_key),
                )
        elif existing:
            self.conn.execute("DELETE FROM finance WHERE id=?", (existing["id"],))

    def delete_feed_purchase(self, row_id):
        self.conn.execute("DELETE FROM finance WHERE auto_key=?", (f"feed-{row_id}",))
        self.conn.execute("DELETE FROM feed_purchase WHERE id=?", (row_id,))
        self.conn.commit()

    def get_feed_purchase(self, row_id):
        return self.conn.execute(
            "SELECT * FROM feed_purchase WHERE id=?", (row_id,)
        ).fetchone()

    def list_feed_purchase(self, owner=None):
        """사료 구매 내역(최신순). owner 지정 시 해당 명의만."""
        if owner:
            return self.conn.execute(
                "SELECT * FROM feed_purchase WHERE owner=? "
                "ORDER BY purchase_date DESC, id DESC", (owner,)
            ).fetchall()
        return self.conn.execute(
            "SELECT * FROM feed_purchase ORDER BY purchase_date DESC, id DESC"
        ).fetchall()

    def feed_purchases_for(self, owner, cattle_type):
        """특정 소유주(명의)+소 구분(임신우/육성/송아지)에 해당하는 사료 구매 내역.

        소 정보 팝업의 '사료 급여 이력'에 쓰인다(그 소가 먹은 사료종류·금액).
        """
        return self.conn.execute(
            "SELECT * FROM feed_purchase WHERE owner=? AND cattle_type=? "
            "ORDER BY purchase_date DESC, id DESC", (owner, cattle_type)
        ).fetchall()

    def feed_owners(self):
        """사료 구매 또는 품목에 등록된 명의 목록(중복 제거)."""
        rows = self.conn.execute(
            "SELECT owner FROM feed_purchase WHERE owner IS NOT NULL AND owner<>'' "
            "UNION SELECT owner FROM livestock WHERE owner IS NOT NULL AND owner<>'' "
            "ORDER BY owner"
        ).fetchall()
        return [r["owner"] for r in rows]

    def feed_purchase_summary(self):
        """명의별 합계: [(owner, 건수, 총수량X, 총금액), ...] → 화면 요약용.

        수량은 단위가 섞일 수 있어 합산하지 않고 건수·금액만 집계한다.
        """
        return self.conn.execute(
            "SELECT owner, COUNT(*) AS cnt, SUM(amount) AS total "
            "FROM feed_purchase GROUP BY owner ORDER BY total DESC"
        ).fetchall()

    # ── 농축산: 사료 설정 (소유주·단위·품목별 단가) ──────────────
    def get_owner_list(self):
        """설정에 저장된 소유주(명의) 목록 + 실제 데이터에 쓰인 명의를 합쳐 반환."""
        raw = self.get_setting("feed_owner_list", "")
        managed = [s.strip() for s in raw.split(",") if s.strip()] if raw else []
        seen = list(managed)
        for o in self.feed_owners():        # 데이터에 이미 쓰인 명의도 포함(누락 방지)
            if o not in seen:
                seen.append(o)
        return seen

    def set_owner_list(self, owners):
        """owners: 문자열 리스트. 중복 제거 후 콤마로 저장."""
        clean, seen = [], set()
        for o in owners:
            o = (o or "").strip()
            if o and o not in seen:
                seen.add(o)
                clean.append(o)
        self.set_setting("feed_owner_list", ",".join(clean))

    def get_feed_units(self):
        raw = self.get_setting("feed_unit_list", "")
        units = [s.strip() for s in raw.split(",") if s.strip()] if raw else []
        return units or list(DEFAULT_FEED_UNITS)

    def set_feed_units(self, units):
        clean, seen = [], set()
        for u in units:
            u = (u or "").strip()
            if u and u not in seen:
                seen.add(u)
                clean.append(u)
        self.set_setting("feed_unit_list", ",".join(clean))

    def get_feed_prices(self):
        """품목별 사료 단가 dict. 설정값이 없으면 기본값."""
        raw = self.get_setting("feed_price_map", "")
        prices = dict(DEFAULT_FEED_PRICES)
        if raw:
            try:
                for k, v in json.loads(raw).items():
                    prices[k] = int(v)
            except (ValueError, TypeError):
                pass
        return prices

    def set_feed_prices(self, price_map):
        clean = {}
        for k, v in price_map.items():
            try:
                clean[k] = int(round(float(v)))
            except (ValueError, TypeError):
                clean[k] = 0
        self.set_setting("feed_price_map", json.dumps(clean, ensure_ascii=False))

    # ── 사용자(직원) 계정 ────────────────────────────────────────
    def add_user(self, username, password, name, role="staff", phone=None):
        cur = self.conn.execute(
            "INSERT INTO users(username, password_hash, name, role, phone, active, created) "
            "VALUES (?, ?, ?, ?, ?, 1, ?)",
            (username, generate_password_hash(password, method="pbkdf2:sha256"),
             name, role, phone, today_str()),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_user(self, user_id, name, role, phone, active):
        self.conn.execute(
            "UPDATE users SET name=?, role=?, phone=?, active=? WHERE id=?",
            (name, role, phone, 1 if active else 0, user_id),
        )
        self.conn.commit()

    def set_password(self, user_id, password):
        self.conn.execute(
            "UPDATE users SET password_hash=? WHERE id=?",
            (generate_password_hash(password, method="pbkdf2:sha256"), user_id),
        )
        self.conn.commit()

    def delete_user(self, user_id):
        self.conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        self.conn.commit()

    def get_user(self, user_id):
        return self.conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()

    def get_user_by_username(self, username):
        return self.conn.execute(
            "SELECT * FROM users WHERE username=?", (username,)
        ).fetchone()

    def verify_user(self, username, password):
        """아이디/비밀번호 확인 → 성공 시 user Row, 실패 시 None."""
        u = self.get_user_by_username(username)
        if u and u["active"] and check_password_hash(u["password_hash"], password):
            return u
        return None

    def username_exists(self, username):
        return self.get_user_by_username(username) is not None

    def list_users(self, role=None, only_active=False):
        sql = "SELECT * FROM users WHERE 1=1"
        params = []
        if role:
            sql += " AND role=?"
            params.append(role)
        if only_active:
            sql += " AND active=1"
        sql += " ORDER BY role, name"
        return self.conn.execute(sql, params).fetchall()

    # ── 급여(payroll) ────────────────────────────────────────────
    def add_payroll(self, user_id, pay_month, base_pay, allowance, deduction,
                    paid=False, paid_date=None, note=None, add_to_finance=True):
        net = int(base_pay) + int(allowance) - int(deduction)
        cur = self.conn.execute(
            "INSERT INTO payroll(user_id, pay_month, base_pay, allowance, deduction, "
            "net_pay, paid, paid_date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, pay_month, int(base_pay), int(allowance), int(deduction),
             net, 1 if paid else 0, paid_date, note),
        )
        row_id = cur.lastrowid
        self._sync_payroll_finance(row_id, user_id, pay_month, net,
                                   add_to_finance and paid, paid_date)
        self.conn.commit()
        return row_id

    def update_payroll(self, row_id, user_id, pay_month, base_pay, allowance, deduction,
                       paid=False, paid_date=None, note=None, add_to_finance=True):
        net = int(base_pay) + int(allowance) - int(deduction)
        self.conn.execute(
            "UPDATE payroll SET user_id=?, pay_month=?, base_pay=?, allowance=?, "
            "deduction=?, net_pay=?, paid=?, paid_date=?, note=? WHERE id=?",
            (user_id, pay_month, int(base_pay), int(allowance), int(deduction),
             net, 1 if paid else 0, paid_date, note, row_id),
        )
        self._sync_payroll_finance(row_id, user_id, pay_month, net,
                                   add_to_finance and paid, paid_date)
        self.conn.commit()

    def _sync_payroll_finance(self, row_id, user_id, pay_month, net, reflect, paid_date):
        """지급 완료한 급여를 재무에 '지출(농축산)'로 자동 반영."""
        auto_key = f"salary-{row_id}"
        existing = self.conn.execute(
            "SELECT id FROM finance WHERE auto_key=?", (auto_key,)
        ).fetchone()
        if reflect and net > 0:
            u = self.get_user(user_id)
            item = f"{u['name'] if u else '직원'} 급여({pay_month})"
            tx_date = paid_date or (pay_month + "-25" if pay_month else today_str())
            if existing:
                self.conn.execute(
                    "UPDATE finance SET tx_date=?, tx_type='지출', sector='농축산', "
                    "item=?, amount=?, note='급여 자동반영' WHERE id=?",
                    (tx_date, item, int(net), existing["id"]),
                )
            else:
                self.conn.execute(
                    "INSERT INTO finance(tx_date, tx_type, sector, item, amount, note, auto_key) "
                    "VALUES (?, '지출', '농축산', ?, ?, '급여 자동반영', ?)",
                    (tx_date, item, int(net), auto_key),
                )
        elif existing:
            self.conn.execute("DELETE FROM finance WHERE id=?", (existing["id"],))

    def delete_payroll(self, row_id):
        self.conn.execute("DELETE FROM finance WHERE auto_key=?", (f"salary-{row_id}",))
        self.conn.execute("DELETE FROM payroll WHERE id=?", (row_id,))
        self.conn.commit()

    def get_payroll(self, row_id):
        return self.conn.execute("SELECT * FROM payroll WHERE id=?", (row_id,)).fetchone()

    def list_payroll(self, user_id=None):
        sql = ("SELECT p.*, u.name AS user_name FROM payroll p "
               "JOIN users u ON p.user_id = u.id")
        params = []
        if user_id:
            sql += " WHERE p.user_id=?"
            params.append(user_id)
        sql += " ORDER BY p.pay_month DESC, u.name"
        return self.conn.execute(sql, params).fetchall()

    # ── 작업지시(work_order) ─────────────────────────────────────
    def add_work_order(self, assignee_id, title, detail, due_date, created_by, note=None):
        cur = self.conn.execute(
            "INSERT INTO work_order(assignee_id, title, detail, due_date, status, "
            "created_by, created_at, note) VALUES (?, ?, ?, ?, '지시', ?, ?, ?)",
            (assignee_id, title, detail, due_date, created_by,
             datetime.now().strftime("%Y-%m-%d %H:%M"), note),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_work_order(self, row_id, assignee_id, title, detail, due_date, note=None):
        self.conn.execute(
            "UPDATE work_order SET assignee_id=?, title=?, detail=?, due_date=?, note=? "
            "WHERE id=?",
            (assignee_id, title, detail, due_date, note, row_id),
        )
        self.conn.commit()

    def complete_work_order(self, row_id, user_id):
        """직원이 완료 처리. 본인 작업만 가능. ack=0 으로 관리자 알림 대상이 됨."""
        self.conn.execute(
            "UPDATE work_order SET status='완료', completed_at=?, ack=0 "
            "WHERE id=? AND assignee_id=?",
            (datetime.now().strftime("%Y-%m-%d %H:%M"), row_id, user_id),
        )
        self.conn.commit()

    def reopen_work_order(self, row_id):
        self.conn.execute(
            "UPDATE work_order SET status='지시', completed_at=NULL, ack=0 WHERE id=?",
            (row_id,),
        )
        self.conn.commit()

    def ack_work_order(self, row_id):
        """관리자가 완료 알림을 확인."""
        self.conn.execute("UPDATE work_order SET ack=1 WHERE id=?", (row_id,))
        self.conn.commit()

    def ack_all_work_orders(self):
        self.conn.execute("UPDATE work_order SET ack=1 WHERE status='완료' AND ack=0")
        self.conn.commit()

    def delete_work_order(self, row_id):
        self.conn.execute("DELETE FROM work_order WHERE id=?", (row_id,))
        self.conn.commit()

    def get_work_order(self, row_id):
        return self.conn.execute(
            "SELECT * FROM work_order WHERE id=?", (row_id,)
        ).fetchone()

    def list_work_orders(self, assignee_id=None, status=None):
        sql = ("SELECT w.*, u.name AS assignee_name FROM work_order w "
               "JOIN users u ON w.assignee_id = u.id WHERE 1=1")
        params = []
        if assignee_id:
            sql += " AND w.assignee_id=?"
            params.append(assignee_id)
        if status:
            sql += " AND w.status=?"
            params.append(status)
        sql += (" ORDER BY CASE w.status WHEN '완료' THEN 1 ELSE 0 END, "
                "w.due_date IS NULL, w.due_date, w.id DESC")
        return self.conn.execute(sql, params).fetchall()

    def list_completed_unacked(self):
        """관리자 알림용: 완료됐지만 아직 확인 안 한 작업."""
        return self.conn.execute(
            "SELECT w.*, u.name AS assignee_name FROM work_order w "
            "JOIN users u ON w.assignee_id = u.id "
            "WHERE w.status='완료' AND w.ack=0 ORDER BY w.completed_at DESC"
        ).fetchall()

    def count_completed_unacked(self):
        return self.conn.execute(
            "SELECT COUNT(*) AS c FROM work_order WHERE status='완료' AND ack=0"
        ).fetchone()["c"]

    # ── 태양광: 발전 일지 ────────────────────────────────────────
    def add_or_update_solar(self, log_date, kwh, note):
        """같은 날짜가 있으면 덮어쓴다(하루 1건 원칙)."""
        self.conn.execute(
            "INSERT INTO solar_log(log_date, generation_kwh, note) VALUES (?, ?, ?) "
            "ON CONFLICT(log_date) DO UPDATE SET "
            "generation_kwh=excluded.generation_kwh, note=excluded.note",
            (log_date, kwh, note),
        )
        self.conn.commit()

    def delete_solar(self, row_id):
        self.conn.execute("DELETE FROM solar_log WHERE id=?", (row_id,))
        self.conn.commit()

    def get_solar(self, row_id):
        return self.conn.execute(
            "SELECT * FROM solar_log WHERE id=?", (row_id,)
        ).fetchone()

    def list_solar(self, limit=500):
        return self.conn.execute(
            "SELECT * FROM solar_log ORDER BY log_date DESC LIMIT ?", (limit,)
        ).fetchall()

    # ── 재무: 거래 ───────────────────────────────────────────────
    def add_finance(self, tx_date, tx_type, sector, item, amount, note):
        cur = self.conn.execute(
            "INSERT INTO finance(tx_date, tx_type, sector, item, amount, note) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (tx_date, tx_type, sector, item, amount, note),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_finance(self, row_id, tx_date, tx_type, sector, item, amount, note):
        self.conn.execute(
            "UPDATE finance SET tx_date=?, tx_type=?, sector=?, item=?, "
            "amount=?, note=? WHERE id=?",
            (tx_date, tx_type, sector, item, amount, note, row_id),
        )
        self.conn.commit()

    def delete_finance(self, row_id):
        self.conn.execute("DELETE FROM finance WHERE id=?", (row_id,))
        self.conn.commit()

    def list_finance(self, limit=1000):
        return self.conn.execute(
            "SELECT * FROM finance ORDER BY tx_date DESC, id DESC LIMIT ?", (limit,)
        ).fetchall()

    @staticmethod
    def _finance_filter(q, tx_type, sector, date_from, date_to):
        """검색/필터 조건 → (WHERE 절, 파라미터 리스트)."""
        where, params = [], []
        if q:
            where.append("(item LIKE ? OR note LIKE ?)")
            params += [f"%{q}%", f"%{q}%"]
        if tx_type:
            where.append("tx_type=?"); params.append(tx_type)
        if sector:
            where.append("sector=?"); params.append(sector)
        if date_from:
            where.append("tx_date>=?"); params.append(date_from)
        if date_to:
            where.append("tx_date<=?"); params.append(date_to)
        return (("WHERE " + " AND ".join(where)) if where else ""), params

    def list_finance_filtered(self, q="", tx_type="", sector="",
                              date_from="", date_to="", limit=10, offset=0):
        w, params = self._finance_filter(q, tx_type, sector, date_from, date_to)
        return self.conn.execute(
            f"SELECT * FROM finance {w} ORDER BY tx_date DESC, id DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        ).fetchall()

    def count_finance_filtered(self, q="", tx_type="", sector="",
                               date_from="", date_to=""):
        w, params = self._finance_filter(q, tx_type, sector, date_from, date_to)
        return self.conn.execute(
            f"SELECT COUNT(*) AS c FROM finance {w}", params
        ).fetchone()["c"]

    def _set_auto_finance(self, auto_key, tx_date, tx_type, sector, item, amount, note):
        """auto_key로 식별되는 '자동' 거래를 만들거나 갱신(중복 없이)한다.

        amount<=0 이면 기존 자동 거래를 삭제한다(예: 상태가 '수령'에서 바뀜).
        commit 은 호출하는 쪽에서 한다.
        """
        existing = self.conn.execute(
            "SELECT id FROM finance WHERE auto_key=?", (auto_key,)
        ).fetchone()
        if amount and amount > 0:
            if existing:
                self.conn.execute(
                    "UPDATE finance SET tx_date=?, tx_type=?, sector=?, item=?, "
                    "amount=?, note=? WHERE id=?",
                    (tx_date, tx_type, sector, item, int(amount), note, existing["id"]),
                )
            else:
                self.conn.execute(
                    "INSERT INTO finance(tx_date, tx_type, sector, item, amount, note, auto_key) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (tx_date, tx_type, sector, item, int(amount), note, auto_key),
                )
        elif existing:
            self.conn.execute("DELETE FROM finance WHERE id=?", (existing["id"],))

    # ── 지원사업 (보조금/지원금) ─────────────────────────────────
    def add_support(self, name, agency, apply_date, amount, status, note):
        cur = self.conn.execute(
            "INSERT INTO support_program(name, agency, apply_date, amount, status, note) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (name, agency, apply_date, amount, status, note),
        )
        self.conn.commit()
        self._reflect_support(cur.lastrowid)
        return cur.lastrowid

    def update_support(self, row_id, name, agency, apply_date, amount, status, note):
        self.conn.execute(
            "UPDATE support_program SET name=?, agency=?, apply_date=?, amount=?, "
            "status=?, note=? WHERE id=?",
            (name, agency, apply_date, amount, status, note, row_id),
        )
        self.conn.commit()
        self._reflect_support(row_id)

    def delete_support(self, row_id):
        self.conn.execute("DELETE FROM support_program WHERE id=?", (row_id,))
        self.conn.execute("DELETE FROM finance WHERE auto_key=?", (f"support-{row_id}",))
        self.conn.commit()

    def get_support(self, row_id):
        return self.conn.execute(
            "SELECT * FROM support_program WHERE id=?", (row_id,)
        ).fetchone()

    def list_support(self):
        return self.conn.execute(
            "SELECT * FROM support_program "
            "ORDER BY CASE status WHEN '수령' THEN 0 WHEN '선정' THEN 1 "
            "WHEN '신청' THEN 2 ELSE 3 END, apply_date DESC, id DESC"
        ).fetchall()

    def _reflect_support(self, row_id):
        """지원사업이 '수령' 상태면 재무에 수입으로 반영, 아니면 자동거래 제거."""
        row = self.get_support(row_id)
        if not row:
            return
        amount = row["amount"] if row["status"] == "수령" else 0
        self._set_auto_finance(
            f"support-{row_id}",
            row["apply_date"] or today_str(), "수입", "공통",
            f"{row['name']} 지원금",
            amount,
            row["agency"] or "",
        )
        self.conn.commit()

    def support_summary(self):
        """지원사업 요약: 상태별 건수·금액, 수령 합계."""
        rows = self.conn.execute(
            "SELECT status, COUNT(*) AS c, COALESCE(SUM(amount),0) AS s "
            "FROM support_program GROUP BY status"
        ).fetchall()
        by_status = {r["status"]: (r["c"], r["s"]) for r in rows}
        received = by_status.get("수령", (0, 0))[1]
        pending = sum(
            by_status.get(st, (0, 0))[1] for st in ("신청", "선정")
        )
        return dict(by_status=by_status, received=received, pending=pending)

    # ── 세금 자동계산 ────────────────────────────────────────────
    def tax_estimate(self, year):
        """해당 연도의 세금 추정(부가세·소득세)을 계산만 해서 dict 로 반환.

        - 부가가치세 = 태양광 수입×태양광세율 + 농축산 수입×농축산세율
          (농축산은 미가공 면세면 0%)
        - 종합소득세 = max(순이익 − 농가부업 비과세, 0) × income_tax_rate%
          (순이익 = 연 수입 − 연 지출, 자동 세금거래 제외)
          (농가부업 비과세 = min(농축산 수입, 비과세 한도))
        """
        y = str(year)

        def _income(sector):
            return self.conn.execute(
                "SELECT COALESCE(SUM(amount),0) AS s FROM finance "
                "WHERE tx_type='수입' AND sector=? AND strftime('%Y',tx_date)=?",
                (sector, y),
            ).fetchone()["s"]

        solar_income = _income("태양광")
        farm_income = _income("농축산")
        income = self.conn.execute(
            "SELECT COALESCE(SUM(amount),0) AS s FROM finance "
            "WHERE tx_type='수입' AND strftime('%Y',tx_date)=?",
            (y,),
        ).fetchone()["s"]
        expense = self.conn.execute(
            "SELECT COALESCE(SUM(amount),0) AS s FROM finance "
            "WHERE tx_type='지출' AND strftime('%Y',tx_date)=? "
            "AND (auto_key IS NULL OR auto_key NOT LIKE 'tax-%')",
            (y,),
        ).fetchone()["s"]

        vat_rate_solar = self.get_setting_float("vat_rate_solar", 10)
        vat_rate_farm = self.get_setting_float("vat_rate_farm", 0)
        inc_rate = self.get_setting_float("income_tax_rate", 0)
        farm_limit = self.get_setting_float("farm_taxfree_limit", 30000000)

        vat_solar = int(round(solar_income * vat_rate_solar / 100))
        vat_farm = int(round(farm_income * vat_rate_farm / 100))
        vat = vat_solar + vat_farm

        profit = income - expense
        farm_exempt = min(max(farm_income, 0), farm_limit)
        taxable_profit = max(profit - farm_exempt, 0)
        income_tax = int(round(taxable_profit * inc_rate / 100))
        return dict(
            year=int(year), solar_income=solar_income, farm_income=farm_income,
            income=income, expense=expense, profit=profit,
            vat_rate_solar=vat_rate_solar, vat_rate_farm=vat_rate_farm,
            income_tax_rate=inc_rate, farm_limit=farm_limit,
            farm_exempt=farm_exempt, taxable_profit=taxable_profit,
            vat_solar=vat_solar, vat_farm=vat_farm,
            vat=vat, income_tax=income_tax, total=vat + income_tax,
        )

    def sync_tax_to_finance(self):
        """기록이 있는 모든 연도의 추정 세금을 재무에 '지출(자동)'로 반영한다.

        auto_key: tax-vat-YYYY / tax-income-YYYY (중복 없이 갱신, 0원이면 삭제).
        반환: (반영한 항목 수, 총 세액).
        """
        count = 0
        total = 0
        for y in self.finance_years():
            est = self.tax_estimate(y)
            ym_date = f"{y}-12-31"
            vat_note = (f"태양광 {est['solar_income']:,}×{est['vat_rate_solar']:g}%"
                        f" + 농축산 {est['farm_income']:,}×{est['vat_rate_farm']:g}%")
            self._set_auto_finance(
                f"tax-vat-{y}", ym_date, "지출", "공통",
                f"부가가치세(추정) {y}", est["vat"], vat_note,
            )
            inc_note = (f"과세소득 {est['taxable_profit']:,}원 × {est['income_tax_rate']:g}%"
                        f" (순이익 {est['profit']:,} − 농가부업비과세 {est['farm_exempt']:,})")
            self._set_auto_finance(
                f"tax-income-{y}", ym_date, "지출", "공통",
                f"종합소득세(추정) {y}", est["income_tax"], inc_note,
            )
            if est["vat"] > 0:
                count += 1
                total += est["vat"]
            if est["income_tax"] > 0:
                count += 1
                total += est["income_tax"]
        self.conn.commit()
        return count, total

    def sync_solar_revenue_to_finance(self):
        """
        발전 기록이 있는 모든 (연·월)의 예상 발전수익을 재무에
        '발전 정산금(자동)' 수입으로 반영한다.

        같은 달은 auto_key='solar-YYYY-MM' 로 식별해 중복 없이
        갱신(UPSERT)한다. 단가를 바꾼 뒤 다시 실행하면 금액이 새로 계산된다.
        반환값: (반영/갱신한 개월 수, 총 반영 금액).
        """
        rows = self.conn.execute(
            "SELECT strftime('%Y-%m', log_date) AS ym, "
            "       COALESCE(SUM(generation_kwh), 0) AS kwh "
            "FROM solar_log GROUP BY ym ORDER BY ym"
        ).fetchall()

        unit = self.solar_unit_revenue()
        months = 0
        total = 0
        for r in rows:
            ym = r["ym"]
            if not ym:
                continue
            kwh = r["kwh"]
            revenue = self.solar_revenue(kwh)
            if revenue <= 0:
                continue
            auto_key = f"solar-{ym}"
            tx_date = f"{ym}-01"
            item = f"발전 정산금(자동) {ym}"
            loss = self.solar_loss_rate()
            if loss > 0:
                note = f"{kwh:g}kWh × (1−{loss:g}%손실) × {unit:g}원/kWh"
            else:
                note = f"{kwh:g}kWh × {unit:g}원/kWh"

            existing = self.conn.execute(
                "SELECT id FROM finance WHERE auto_key = ?", (auto_key,)
            ).fetchone()
            if existing:
                self.conn.execute(
                    "UPDATE finance SET tx_date=?, tx_type='수입', sector='태양광', "
                    "item=?, amount=?, note=? WHERE id=?",
                    (tx_date, item, revenue, note, existing["id"]),
                )
            else:
                self.conn.execute(
                    "INSERT INTO finance(tx_date, tx_type, sector, item, amount, note, auto_key) "
                    "VALUES (?, '수입', '태양광', ?, ?, ?, ?)",
                    (tx_date, item, revenue, note, auto_key),
                )
            months += 1
            total += revenue

        self.conn.commit()
        return months, total

    # ── 집계: 대시보드 / 통계 ────────────────────────────────────
    def finance_totals(self, year=None):
        """(총수입, 총지출) 반환. year 지정 시 해당 연도만."""
        where = "WHERE strftime('%Y', tx_date) = ?" if year else ""
        params = (str(year),) if year else ()
        income = self.conn.execute(
            f"SELECT COALESCE(SUM(amount),0) AS s FROM finance "
            f"WHERE tx_type='수입' {('AND ' + where[6:]) if where else ''}",
            params,
        ).fetchone()["s"]
        expense = self.conn.execute(
            f"SELECT COALESCE(SUM(amount),0) AS s FROM finance "
            f"WHERE tx_type='지출' {('AND ' + where[6:]) if where else ''}",
            params,
        ).fetchone()["s"]
        return income, expense

    def finance_monthly(self, year):
        """해당 연도의 월별 (수입, 지출) → {1: (수입,지출), ... 12: ...}"""
        rows = self.conn.execute(
            """
            SELECT CAST(strftime('%m', tx_date) AS INTEGER) AS m,
                   tx_type,
                   COALESCE(SUM(amount), 0) AS s
            FROM finance
            WHERE strftime('%Y', tx_date) = ?
            GROUP BY m, tx_type
            """,
            (str(year),),
        ).fetchall()
        result = {m: [0, 0] for m in range(1, 13)}   # [수입, 지출]
        for r in rows:
            idx = 0 if r["tx_type"] == "수입" else 1
            result[r["m"]][idx] = r["s"]
        return result

    def solar_monthly(self, year):
        """해당 연도의 월별 발전량(kWh) → {1: kwh, ... 12: kwh}"""
        rows = self.conn.execute(
            """
            SELECT CAST(strftime('%m', log_date) AS INTEGER) AS m,
                   COALESCE(SUM(generation_kwh), 0) AS kwh
            FROM solar_log
            WHERE strftime('%Y', log_date) = ?
            GROUP BY m
            """,
            (str(year),),
        ).fetchall()
        result = {m: 0.0 for m in range(1, 13)}
        for r in rows:
            result[r["m"]] = r["kwh"]
        return result

    def solar_total(self, year=None):
        """발전량 합계(kWh). year 지정 시 해당 연도만."""
        if year:
            row = self.conn.execute(
                "SELECT COALESCE(SUM(generation_kwh),0) AS s FROM solar_log "
                "WHERE strftime('%Y', log_date)=?",
                (str(year),),
            ).fetchone()
        else:
            row = self.conn.execute(
                "SELECT COALESCE(SUM(generation_kwh),0) AS s FROM solar_log"
            ).fetchone()
        return row["s"]

    def solar_month_total(self, year, month):
        """특정 연·월 발전량 합계(kWh)."""
        row = self.conn.execute(
            "SELECT COALESCE(SUM(generation_kwh),0) AS s FROM solar_log "
            "WHERE strftime('%Y-%m', log_date)=?",
            (f"{year:04d}-{month:02d}",),
        ).fetchone()
        return row["s"]

    def livestock_summary(self):
        """진행중 품목 수, 카테고리별 건수 등 대시보드용 요약."""
        active = self.conn.execute(
            "SELECT COUNT(*) AS c FROM livestock WHERE status='진행중'"
        ).fetchone()["c"]
        by_cat = self.conn.execute(
            "SELECT category, COUNT(*) AS c, COALESCE(SUM(quantity),0) AS q "
            "FROM livestock WHERE status='진행중' GROUP BY category"
        ).fetchall()
        return active, by_cat

    def livestock_growth_stats(self):
        """판매(출하) 완료된 가축의 성장·판매 통계.

        반환 dict:
          sold_count        판매한 가축 품목 수
          avg_growth        평균 성장 kg (출하체중 - 입식체중)
          avg_start_weight  평균 입식 체중 kg
          avg_sold_weight   평균 출하 체중 kg
          total_amount      총 판매 금액(원)
          avg_price_per_kg  평균 단가(원/kg)
        """
        rows = self.conn.execute(
            "SELECT weight_kg, sold_weight_kg, sold_amount FROM livestock "
            "WHERE category='가축' AND sold_date IS NOT NULL"
        ).fetchall()

        def _avg(vals):
            vals = [v for v in vals if v is not None]
            return sum(vals) / len(vals) if vals else 0.0

        growths = [r["sold_weight_kg"] - r["weight_kg"] for r in rows
                   if r["sold_weight_kg"] is not None and r["weight_kg"] is not None]
        prices = [r["sold_amount"] / r["sold_weight_kg"] for r in rows
                  if r["sold_amount"] and r["sold_weight_kg"]]
        return dict(
            sold_count=len(rows),
            avg_growth=(sum(growths) / len(growths)) if growths else 0.0,
            avg_start_weight=_avg([r["weight_kg"] for r in rows]),
            avg_sold_weight=_avg([r["sold_weight_kg"] for r in rows]),
            total_amount=sum((r["sold_amount"] or 0) for r in rows),
            avg_price_per_kg=(sum(prices) / len(prices)) if prices else 0.0,
        )

    def finance_years(self):
        """거래/발전 기록이 있는 연도 목록(내림차순). 없으면 올해만."""
        rows = self.conn.execute(
            """
            SELECT DISTINCT y FROM (
                SELECT strftime('%Y', tx_date) AS y FROM finance
                UNION
                SELECT strftime('%Y', log_date) AS y FROM solar_log
            ) WHERE y IS NOT NULL ORDER BY y DESC
            """
        ).fetchall()
        years = [r["y"] for r in rows if r["y"]]
        this_year = datetime.now().strftime("%Y")
        if this_year not in years:
            years.insert(0, this_year)
        return years

    def close(self):
        self.conn.close()
