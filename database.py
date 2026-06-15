"""
database.py — 영농형 태양광 관리 프로그램의 데이터 계층

모든 데이터는 SQLite 파일 하나(farm_data.db)에 저장된다.
UI 코드(tab_*.py)는 이 Database 클래스의 메서드만 호출하며,
SQL 문은 전부 이 파일 안에만 존재한다.
"""

import os
import sqlite3
from datetime import datetime


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
    "vat_rate": "10",         # 부가가치세율(%) — 태양광 매출 기준 추정
    "income_tax_rate": "0",   # 종합소득세 실효세율(%) — 순이익 기준 추정(0이면 미계산)
}

# 분류 선택지 (UI 콤보박스에서 공통 사용)
LIVESTOCK_CATEGORIES = ["가축", "작물"]
FARM_ACTIVITIES = ["급여/관리", "방역/병해충", "생산/수확", "출하/판매", "기타"]
FINANCE_TYPES = ["수입", "지출"]
FINANCE_SECTORS = ["농축산", "태양광", "공통"]
SUPPORT_STATUSES = ["신청", "선정", "수령", "반려"]   # 지원사업 진행 상태


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
                sold_weight_kg REAL                     -- 판매(출하) 시 체중 kg
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

            -- 설정 (key-value): 태양광 단가, 농장명 등
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
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
        ):
            if col not in ls_cols:
                self.conn.execute(ddl)
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

    # ── 태양광 수익 계산 ──────────────────────────────────────────
    def solar_unit_revenue(self):
        """1kWh당 예상 정산 단가(원). = SMP + REC단가 × REC가중치"""
        smp = self.get_setting_float("smp_price")
        rec = self.get_setting_float("rec_price")
        weight = self.get_setting_float("rec_weight")
        return smp + rec * weight

    def solar_revenue(self, kwh):
        """발전량(kWh)에 대한 예상 수익(원, 정수)."""
        return int(round(kwh * self.solar_unit_revenue()))

    # ── 농축산: 품목 ─────────────────────────────────────────────
    def add_livestock(self, category, name, quantity, unit, start_date, status, note,
                      weight_kg=None):
        cur = self.conn.execute(
            "INSERT INTO livestock(category, name, quantity, unit, start_date, status, note, weight_kg) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (category, name, quantity, unit, start_date, status, note, weight_kg),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_livestock(self, row_id, category, name, quantity, unit, start_date, status, note,
                         weight_kg=None):
        self.conn.execute(
            "UPDATE livestock SET category=?, name=?, quantity=?, unit=?, "
            "start_date=?, status=?, note=?, weight_kg=? WHERE id=?",
            (category, name, quantity, unit, start_date, status, note, weight_kg, row_id),
        )
        self.conn.commit()

    def delete_livestock(self, row_id):
        self.conn.execute("DELETE FROM livestock WHERE id=?", (row_id,))
        self.conn.commit()

    def get_livestock(self, row_id):
        return self.conn.execute(
            "SELECT * FROM livestock WHERE id=?", (row_id,)
        ).fetchone()

    def sell_livestock(self, row_id, sold_date, sold_amount, sold_weight_kg,
                       note="", add_to_finance=True):
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
            "sold_weight_kg=?, note=? WHERE id=?",
            (sold_date, sold_amount, sold_weight_kg, new_note, row_id),
        )
        if add_to_finance and sold_amount and sold_amount > 0:
            auto_key = f"sale-{row_id}"
            item = f"{row['name']} 판매"
            parts = []
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
    def add_farm_log(self, log_date, livestock_id, activity, quantity, unit, note):
        cur = self.conn.execute(
            "INSERT INTO farm_log(log_date, livestock_id, activity, quantity, unit, note) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (log_date, livestock_id, activity, quantity, unit, note),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_farm_log(self, row_id, log_date, livestock_id, activity, quantity, unit, note):
        self.conn.execute(
            "UPDATE farm_log SET log_date=?, livestock_id=?, activity=?, "
            "quantity=?, unit=?, note=? WHERE id=?",
            (log_date, livestock_id, activity, quantity, unit, note, row_id),
        )
        self.conn.commit()

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

        - 부가가치세 = (태양광 부문 연 수입) × vat_rate%
        - 종합소득세 = max(연 순이익, 0) × income_tax_rate%
          (순이익 = 연 수입 − 연 지출, 단 자동 세금 거래는 제외)
        """
        y = str(year)
        solar_income = self.conn.execute(
            "SELECT COALESCE(SUM(amount),0) AS s FROM finance "
            "WHERE tx_type='수입' AND sector='태양광' AND strftime('%Y',tx_date)=?",
            (y,),
        ).fetchone()["s"]
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

        vat_rate = self.get_setting_float("vat_rate", 0)
        inc_rate = self.get_setting_float("income_tax_rate", 0)
        profit = income - expense
        vat = int(round(solar_income * vat_rate / 100))
        income_tax = int(round(max(profit, 0) * inc_rate / 100))
        return dict(
            year=int(year), solar_income=solar_income, income=income,
            expense=expense, profit=profit,
            vat_rate=vat_rate, income_tax_rate=inc_rate,
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
            self._set_auto_finance(
                f"tax-vat-{y}", ym_date, "지출", "태양광",
                f"부가가치세(추정) {y}", est["vat"],
                f"태양광 매출 {est['solar_income']:,}원 × {est['vat_rate']:g}%",
            )
            self._set_auto_finance(
                f"tax-income-{y}", ym_date, "지출", "공통",
                f"종합소득세(추정) {y}", est["income_tax"],
                f"순이익 {est['profit']:,}원 × {est['income_tax_rate']:g}%",
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
