"""
shop_db.py — '한우의 기준' 쇼핑몰 데이터 계층 (SQLite)

농장 관리 프로그램(farm_data.db)과 분리된 별도 파일(shop_data.db)을 쓴다.
"""
import json
import random
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta

CATEGORIES = ["구이", "스테이크", "불고기·국거리", "갈비·찜", "사골·곰탕", "선물세트"]
CUTS = ["등심", "안심", "채끝", "살치살", "갈비", "양지", "사태", "우둔",
        "설도", "목심", "앞다리", "불고기", "국거리", "사골·잡뼈", "선물세트", "기타"]
CUT_CATEGORY = {
    "등심": "구이", "채끝": "구이", "살치살": "구이", "안심": "스테이크", "갈비": "갈비·찜",
    "양지": "불고기·국거리", "사태": "불고기·국거리", "우둔": "불고기·국거리",
    "설도": "불고기·국거리", "목심": "불고기·국거리", "앞다리": "불고기·국거리",
    "불고기": "불고기·국거리", "국거리": "불고기·국거리", "사골·잡뼈": "사골·곰탕",
    "선물세트": "선물세트", "기타": "구이",
}
GRADES = ["1++", "1+", "1", "2", "3", "등급없음"]
STORAGES = ["냉장", "냉동"]
PRODUCT_STATUSES = ["판매중", "품절", "숨김"]
ORDER_STATUSES = ["입금대기", "결제완료", "상품준비", "배송중", "배송완료", "취소"]
PAID = "('결제완료','상품준비','배송중','배송완료')"
BANNER_THEMES = ["red", "black", "paper"]
SORTS = {
    "rec": ("추천순", "p.sort, p.id DESC"),
    "best": ("판매량순", "sold DESC, p.id DESC"),
    "new": ("신상품순", "p.id DESC"),
    "low": ("낮은 가격순", "p.price, p.id DESC"),
    "high": ("높은 가격순", "p.price DESC, p.id DESC"),
    "review": ("후기 많은순", "rv_cnt DESC, p.id DESC"),
}

DEFAULT_SETTINGS = {
    "sales_open": "0",          # "1"이면 판매 중, 아니면 미리보기(주문·가입을 받지 않음)
    "shop_name": "한우의 기준",
    "tagline": "키운 사람이 직접 보내는 한우",
    "intro": "유통 단계를 거치지 않고, 농장에서 기른 한우를 주문받은 만큼만 손질해 보내드립니다.",
    "points": "농장 직송|중간 유통 없이 농장에서 바로 보냅니다\n"
              "이력번호 공개|상품마다 축산물 이력번호를 적어 둡니다\n"
              "주문 후 손질|주문받은 만큼만 손질해 포장합니다\n"
              "냉장 배송|아이스박스에 담아 냉장 상태로 보냅니다",
    "farm_name": "", "farm_addr": "", "owner": "", "biz_no": "",
    "mail_order_no": "", "phone": "", "email": "", "cs_hours": "평일 09:00 ~ 18:00",
    "kakao_url": "",
    "bank_name": "", "bank_account": "", "bank_holder": "",
    "shipping_fee": "4000", "free_ship_over": "100000",
    "ship_days": "월~목 출고 (금·토·일, 공휴일 전날은 출고하지 않습니다)",
    "notice": "", "about": "",
    "terms_text": "", "privacy_text": "", "guide_text": "",
}

P_SELECT = f"""SELECT p.*,
  (SELECT COUNT(*) FROM review r WHERE r.product_id=p.id AND r.hidden=0) AS rv_cnt,
  (SELECT ROUND(AVG(r.rating),1) FROM review r WHERE r.product_id=p.id AND r.hidden=0) AS rv_avg,
  (SELECT COALESCE(SUM(i.qty),0) FROM order_item i JOIN orders o ON o.id=i.order_id
    WHERE i.product_id=p.id AND o.status IN {PAID}) AS sold
  FROM product p"""


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class ShopDB:
    def __init__(self, path):
        self.path = path
        self._init()

    @contextmanager
    def conn(self):
        c = sqlite3.connect(self.path, timeout=15)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys=ON")
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    def _all(self, sql, args=()):
        with self.conn() as c:
            return c.execute(sql, args).fetchall()

    def _one(self, sql, args=()):
        with self.conn() as c:
            return c.execute(sql, args).fetchone()

    def _run(self, sql, args=()):
        with self.conn() as c:
            return c.execute(sql, args).lastrowid

    def _init(self):
        with self.conn() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS product (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                cut TEXT NOT NULL DEFAULT '기타',
                grade TEXT NOT NULL DEFAULT '등급없음',
                weight_g INTEGER NOT NULL DEFAULT 0,
                price INTEGER NOT NULL DEFAULT 0,
                stock INTEGER NOT NULL DEFAULT 0,
                trace_no TEXT,
                storage TEXT NOT NULL DEFAULT '냉장',
                summary TEXT, description TEXT, image TEXT,
                status TEXT NOT NULL DEFAULT '판매중',
                sort INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_no TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                name TEXT NOT NULL, phone TEXT NOT NULL,
                zipcode TEXT, addr1 TEXT NOT NULL, addr2 TEXT,
                memo TEXT, wish_date TEXT, depositor TEXT,
                items_total INTEGER NOT NULL, shipping_fee INTEGER NOT NULL,
                total INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT '입금대기',
                tracking_co TEXT, tracking_no TEXT, admin_memo TEXT,
                paid_at TEXT, shipped_at TEXT
            );
            CREATE TABLE IF NOT EXISTS order_item (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id INTEGER,
                name TEXT NOT NULL, spec TEXT,
                price INTEGER NOT NULL, qty INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS member (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                pw_hash TEXT NOT NULL,
                name TEXT NOT NULL, phone TEXT NOT NULL,
                zipcode TEXT, addr1 TEXT, addr2 TEXT,
                marketing INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS review (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                order_item_id INTEGER UNIQUE,
                member_id INTEGER,
                author TEXT NOT NULL,
                rating INTEGER NOT NULL,
                content TEXT NOT NULL,
                image TEXT,
                created_at TEXT NOT NULL,
                hidden INTEGER NOT NULL DEFAULT 0,
                reply TEXT, reply_at TEXT
            );
            CREATE TABLE IF NOT EXISTS qna (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                member_id INTEGER,
                author TEXT NOT NULL,
                content TEXT NOT NULL,
                secret INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                answer TEXT, answered_at TEXT
            );
            CREATE TABLE IF NOT EXISTS wishlist (
                member_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (member_id, product_id)
            );
            CREATE TABLE IF NOT EXISTS banner (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL, subtitle TEXT,
                link TEXT, link_label TEXT, image TEXT,
                theme TEXT NOT NULL DEFAULT 'red',
                sort INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS notice (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL, content TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS faq (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                q TEXT NOT NULL, a TEXT NOT NULL,
                sort INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS ix_orders_created ON orders(created_at);
            CREATE INDEX IF NOT EXISTS ix_orders_phone ON orders(phone);
            CREATE INDEX IF NOT EXISTS ix_review_product ON review(product_id);
            CREATE INDEX IF NOT EXISTS ix_qna_product ON qna(product_id);
            """)
            # 이전 버전 DB에 새 열 추가
            def add(table, col, ddl):
                have = {r[1] for r in c.execute(f"PRAGMA table_info({table})")}
                if col not in have:
                    c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
                    return True
                return False
            new_cat = add("product", "category", "TEXT NOT NULL DEFAULT '구이'")
            add("product", "list_price", "INTEGER NOT NULL DEFAULT 0")
            add("product", "images", "TEXT")
            add("product", "is_best", "INTEGER NOT NULL DEFAULT 0")
            add("product", "is_new", "INTEGER NOT NULL DEFAULT 0")
            add("product", "origin", "TEXT NOT NULL DEFAULT '국내산 한우'")
            add("orders", "member_id", "INTEGER")
            add("orders", "is_dummy", "INTEGER NOT NULL DEFAULT 0")
            c.execute("CREATE INDEX IF NOT EXISTS ix_orders_member ON orders(member_id)")
            if new_cat:
                for cut, cat in CUT_CATEGORY.items():
                    c.execute("UPDATE product SET category=? WHERE cut=?", (cat, cut))
            if not c.execute("SELECT 1 FROM setting WHERE key='_defaults_v2'").fetchone():
                self._seed_defaults(c)
                c.execute("INSERT INTO setting(key,value) VALUES('_defaults_v2','1')")

    @staticmethod
    def _seed_defaults(c):
        """처음 한 번만 넣는 기본 배너·자주 묻는 질문. 백오피스에서 고치거나 지울 수 있다."""
        if not c.execute("SELECT 1 FROM banner").fetchone():
            c.executemany(
                "INSERT INTO banner(title,subtitle,link,link_label,theme,sort) VALUES(?,?,?,?,?,?)",
                [("키운 사람이\n직접 보냅니다", "중간 유통 없이, 농장에서 식탁까지", "/shop", "한우 보러 가기", "red", 0),
                 ("이력번호부터\n보여드립니다", "어느 소인지, 몇 등급인지 직접 조회해 보세요", "/about", "농장 이야기", "black", 1),
                 ("마음을 전하는\n한우 선물세트", "받는 날을 정해 주시면 맞춰서 보냅니다", "/shop?cat=선물세트", "선물세트 보기", "paper", 2)])
        if not c.execute("SELECT 1 FROM faq").fetchone():
            c.executemany("INSERT INTO faq(q,a,sort) VALUES(?,?,?)", [
                ("주문하면 언제 받을 수 있나요?", "입금이 확인되면 출고 요일에 맞춰 보내 드립니다. 주문할 때 받고 싶은 날을 고를 수 있습니다.", 0),
                ("어떤 방법으로 결제하나요?", "지금은 무통장 입금으로만 결제할 수 있습니다. 주문을 마치면 입금 계좌가 안내됩니다.", 1),
                ("받은 고기는 어떻게 보관하나요?", "냉장 상품은 받은 날부터 2~3일 안에 드시고, 바로 드시지 않을 때는 받은 즉시 냉동 보관해 주세요.", 2),
                ("이력번호는 어디서 확인하나요?", "상품 화면에 적힌 12자리 이력번호를 축산물이력제(mtrace.go.kr)에서 조회하면 출생·사육·도축·등급 정보를 볼 수 있습니다.", 3),
                ("교환이나 환불이 되나요?", "신선식품이라 단순 변심으로는 반품이 어렵습니다. 상품에 문제가 있으면 받은 날 사진과 함께 연락해 주세요. 확인 후 다시 보내 드리거나 환불해 드립니다.", 4),
            ])

    # ── 설정 ────────────────────────────────────────────
    def settings(self):
        rows = {r["key"]: r["value"] for r in self._all("SELECT * FROM setting")}
        out = dict(DEFAULT_SETTINGS)
        out.update(rows)
        return out

    def get_setting(self, key, default=""):
        r = self._one("SELECT value FROM setting WHERE key=?", (key,))
        return r["value"] if r else DEFAULT_SETTINGS.get(key, default)

    def set_settings(self, data):
        with self.conn() as c:
            for k, v in data.items():
                c.execute("INSERT INTO setting(key,value) VALUES(?,?) "
                          "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, v))

    # ── 상품 ────────────────────────────────────────────
    def product_list(self, public=True, cat=None, q=None, sort="rec", flag=None,
                     limit=None, offset=0, exclude=None):
        """(상품 목록, 전체 개수). 품절 상품은 항상 뒤로 보낸다."""
        cond, args = [], []
        if public:
            cond.append("p.status != '숨김'")
        if cat:
            cond.append("p.category = ?"); args.append(cat)
        if q:
            cond.append("(p.name LIKE ? OR p.cut LIKE ? OR p.summary LIKE ?)")
            args += [f"%{q}%"] * 3
        if flag == "best":
            cond.append("p.is_best = 1")
        elif flag == "new":
            cond.append("p.is_new = 1")
        if exclude:
            cond.append("p.id != ?"); args.append(exclude)
        where = (" WHERE " + " AND ".join(cond)) if cond else ""
        order = SORTS.get(sort, SORTS["rec"])[1]
        sql = P_SELECT + where + f" ORDER BY (p.status='품절' OR p.stock<=0), {order}"
        with self.conn() as c:
            total = c.execute("SELECT COUNT(*) FROM product p" + where, args).fetchone()[0]
            if limit:
                sql += " LIMIT ? OFFSET ?"
                args = args + [limit, offset]
            return c.execute(sql, args).fetchall(), total

    def product(self, pid):
        return self._one(P_SELECT + " WHERE p.id=?", (pid,))

    def category_counts(self):
        rows = self._all("SELECT category, COUNT(*) AS n FROM product WHERE status!='숨김' GROUP BY category")
        return {r["category"]: r["n"] for r in rows}

    def save_product(self, pid, d):
        cols = ["name", "category", "cut", "grade", "weight_g", "price", "list_price", "stock",
                "trace_no", "storage", "origin", "summary", "description", "status", "sort",
                "is_best", "is_new", "images"]
        vals = [d[k] for k in cols]
        with self.conn() as c:
            if pid:
                c.execute("UPDATE product SET " + ",".join(f"{k}=?" for k in cols)
                          + " WHERE id=?", vals + [pid])
            else:
                cur = c.execute(
                    "INSERT INTO product(" + ",".join(cols) + ",created_at) VALUES("
                    + ",".join("?" * len(cols)) + ",?)", vals + [now_str()])
                pid = cur.lastrowid
            if "image" in d:
                c.execute("UPDATE product SET image=? WHERE id=?", (d["image"], pid))
        return pid

    def quick_update_product(self, pid, stock, status):
        self._run("UPDATE product SET stock=?, status=? WHERE id=?", (stock, status, pid))

    def delete_product(self, pid):
        with self.conn() as c:
            c.execute("DELETE FROM product WHERE id=?", (pid,))
            c.execute("DELETE FROM wishlist WHERE product_id=?", (pid,))
            c.execute("DELETE FROM qna WHERE product_id=?", (pid,))
            c.execute("DELETE FROM review WHERE product_id=?", (pid,))

    def product_count(self):
        return self._one("SELECT COUNT(*) FROM product")[0]

    # ── 회원 ────────────────────────────────────────────
    def create_member(self, email, pw_hash, name, phone, marketing):
        try:
            return self._run("INSERT INTO member(email,pw_hash,name,phone,marketing,created_at) "
                             "VALUES(?,?,?,?,?,?)", (email, pw_hash, name, phone, marketing, now_str()))
        except sqlite3.IntegrityError:
            return None

    def member(self, mid):
        return self._one("SELECT * FROM member WHERE id=?", (mid,))

    def member_by_email(self, email):
        return self._one("SELECT * FROM member WHERE email=?", (email,))

    def update_member(self, mid, name, phone, zipcode, addr1, addr2, marketing):
        self._run("UPDATE member SET name=?, phone=?, zipcode=?, addr1=?, addr2=?, marketing=? "
                  "WHERE id=?", (name, phone, zipcode, addr1, addr2, marketing, mid))

    def set_member_address(self, mid, zipcode, addr1, addr2):
        self._run("UPDATE member SET zipcode=?, addr1=?, addr2=? WHERE id=?",
                  (zipcode, addr1, addr2, mid))

    def set_member_pw(self, mid, pw_hash):
        self._run("UPDATE member SET pw_hash=? WHERE id=?", (pw_hash, mid))

    def delete_member(self, mid):
        """탈퇴: 회원 정보·찜을 지운다. 주문 기록은 법정 보관 대상이라 남기고 연결만 끊는다."""
        with self.conn() as c:
            c.execute("UPDATE orders SET member_id=NULL WHERE member_id=?", (mid,))
            c.execute("UPDATE review SET member_id=NULL WHERE member_id=?", (mid,))
            c.execute("UPDATE qna SET member_id=NULL WHERE member_id=?", (mid,))
            c.execute("DELETE FROM wishlist WHERE member_id=?", (mid,))
            c.execute("DELETE FROM member WHERE id=?", (mid,))

    def members(self):
        return self._all(f"""
            SELECT m.*, (SELECT COUNT(*) FROM orders o WHERE o.member_id=m.id AND o.status!='취소') AS cnt,
              (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.member_id=m.id AND o.status IN {PAID}) AS paid
            FROM member m ORDER BY m.id DESC""")

    # ── 찜 ──────────────────────────────────────────────
    def wish_ids(self, mid):
        return {r[0] for r in self._all("SELECT product_id FROM wishlist WHERE member_id=?", (mid,))}

    def toggle_wish(self, mid, pid):
        with self.conn() as c:
            cur = c.execute("DELETE FROM wishlist WHERE member_id=? AND product_id=?", (mid, pid))
            if cur.rowcount:
                return False
            c.execute("INSERT INTO wishlist(member_id,product_id,created_at) VALUES(?,?,?)",
                      (mid, pid, now_str()))
            return True

    def wish_products(self, mid):
        return self._all(P_SELECT + " JOIN wishlist w ON w.product_id=p.id "
                         "WHERE w.member_id=? AND p.status!='숨김' ORDER BY w.created_at DESC", (mid,))

    # ── 주문 ────────────────────────────────────────────
    def create_order(self, info, cart, shipping_fee, member_id=None):
        """cart: [(product_id, qty)]. 재고를 한 트랜잭션에서 차감한다.
        성공 시 (order_no, None), 실패 시 (None, 오류메시지)."""
        with self.conn() as c:
            c.execute("BEGIN IMMEDIATE")
            lines, total = [], 0
            for pid, qty in cart:
                p = c.execute("SELECT * FROM product WHERE id=?", (pid,)).fetchone()
                if not p or p["status"] != "판매중":
                    c.rollback()
                    return None, "판매가 끝난 상품이 있습니다. 장바구니를 확인해 주세요."
                cur = c.execute("UPDATE product SET stock=stock-? WHERE id=? AND stock>=?",
                                (qty, pid, qty))
                if cur.rowcount == 0:
                    c.rollback()
                    return None, f"'{p['name']}' 재고가 부족합니다. (남은 수량 {p['stock']}개)"
                spec = f"{p['cut']} / {p['grade']} / {p['weight_g']}g / {p['storage']}"
                lines.append((pid, p["name"], spec, p["price"], qty))
                total += p["price"] * qty
            for _ in range(30):
                order_no = "HW" + datetime.now().strftime("%y%m%d") + f"{random.randint(0, 99999):05d}"
                if not c.execute("SELECT 1 FROM orders WHERE order_no=?", (order_no,)).fetchone():
                    break
            cur = c.execute(
                "INSERT INTO orders(order_no,created_at,name,phone,zipcode,addr1,addr2,memo,"
                "wish_date,depositor,items_total,shipping_fee,total,member_id) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (order_no, now_str(), info["name"], info["phone"], info["zipcode"],
                 info["addr1"], info["addr2"], info["memo"], info["wish_date"],
                 info["depositor"], total, shipping_fee, total + shipping_fee, member_id))
            oid = cur.lastrowid
            c.executemany("INSERT INTO order_item(order_id,product_id,name,spec,price,qty) "
                          "VALUES(?,?,?,?,?,?)", [(oid,) + l for l in lines])
        return order_no, None

    def order_by_no(self, order_no):
        return self._one("SELECT * FROM orders WHERE order_no=?", (order_no,))

    def order(self, oid):
        return self._one("SELECT * FROM orders WHERE id=?", (oid,))

    def order_items(self, oid):
        return self._all("""
            SELECT i.*, r.id AS review_id, p.image AS p_image, p.cut AS p_cut, p.grade AS p_grade,
                   p.id AS p_id
            FROM order_item i LEFT JOIN review r ON r.order_item_id=i.id
            LEFT JOIN product p ON p.id=i.product_id
            WHERE i.order_id=? ORDER BY i.id""", (oid,))

    def order_item(self, item_id):
        return self._one("SELECT * FROM order_item WHERE id=?", (item_id,))

    def orders(self, status=None, q=None, limit=300, member_id=None):
        sql = ("SELECT o.*, (SELECT GROUP_CONCAT(name||' x'||qty, ', ') "
               "FROM order_item WHERE order_id=o.id) AS items, "
               "(SELECT COUNT(*) FROM order_item WHERE order_id=o.id) AS item_cnt FROM orders o")
        args, cond = [], []
        if status:
            cond.append("o.status=?"); args.append(status)
        if member_id:
            cond.append("o.member_id=?"); args.append(member_id)
        if q:
            cond.append("(o.order_no LIKE ? OR o.name LIKE ? OR o.phone LIKE ?)")
            args += [f"%{q}%"] * 3
        if cond:
            sql += " WHERE " + " AND ".join(cond)
        sql += " ORDER BY o.created_at DESC, o.id DESC LIMIT ?"
        return self._all(sql, args + [limit])

    def order_status_counts(self):
        return {r[0]: r[1] for r in self._all("SELECT status, COUNT(*) FROM orders GROUP BY status")}

    def set_order_status(self, oid, status):
        """상태 변경. 취소로 바꾸면 재고 복원, 취소에서 되돌리면 다시 차감."""
        with self.conn() as c:
            o = c.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
            if not o or o["status"] == status:
                return
            items = c.execute("SELECT * FROM order_item WHERE order_id=?", (oid,)).fetchall()
            if status == "취소":
                for it in items:
                    c.execute("UPDATE product SET stock=stock+? WHERE id=?",
                              (it["qty"], it["product_id"]))
            elif o["status"] == "취소":
                for it in items:
                    c.execute("UPDATE product SET stock=MAX(stock-?,0) WHERE id=?",
                              (it["qty"], it["product_id"]))
            sets, args = ["status=?"], [status]
            if status not in ("입금대기", "취소") and not o["paid_at"]:
                sets.append("paid_at=?"); args.append(now_str())
            if status == "배송중" and not o["shipped_at"]:
                sets.append("shipped_at=?"); args.append(now_str())
            c.execute("UPDATE orders SET " + ",".join(sets) + " WHERE id=?", args + [oid])

    def update_order_admin(self, oid, tracking_co, tracking_no, admin_memo):
        self._run("UPDATE orders SET tracking_co=?, tracking_no=?, admin_memo=? WHERE id=?",
                  (tracking_co, tracking_no, admin_memo, oid))

    def customers(self):
        return self._all(f"""
            SELECT phone, MAX(name) AS name, COUNT(*) AS cnt,
                   SUM(CASE WHEN status IN {PAID} THEN total ELSE 0 END) AS paid,
                   MAX(created_at) AS last_at, MAX(member_id) AS member_id,
                   (SELECT addr1||' '||COALESCE(addr2,'') FROM orders o2
                     WHERE o2.phone=o.phone ORDER BY id DESC LIMIT 1) AS addr
            FROM orders o WHERE status!='취소'
            GROUP BY phone ORDER BY paid DESC, last_at DESC""")

    # ── 더미 주문 (화면 확인용) ─────────────────────────
    def dummy_count(self):
        return self._one("SELECT COUNT(*) FROM orders WHERE is_dummy=1")[0]

    def seed_dummy_orders(self, shipping_fee, free_over):
        """최근 2주에 걸친 더미 주문 20건을 만든다. 실제 주문과 같은 구조라 백오피스의
        모든 화면에서 그대로 보이고, is_dummy 표시가 있어 한 번에 지울 수 있다."""
        rnd = random.Random()
        names = ["홍길동", "김철수", "이영희", "박민수", "최지은", "정하늘", "강바다", "윤가람", "임나래", "한솔"]
        areas = ["서울 예시구", "경기 예시시", "부산 예시구", "대전 예시구", "충남 예시군", "전북 예시시"]
        # (며칠 전, 상태) — 오래된 주문일수록 처리 단계가 뒤쪽
        plan = [(0, "입금대기"), (0, "입금대기"), (0, "결제완료"), (0, "결제완료"), (1, "입금대기"),
                (1, "결제완료"), (1, "상품준비"), (2, "상품준비"), (2, "배송중"), (3, "배송중"),
                (3, "배송중"), (4, "배송완료"), (5, "배송완료"), (6, "취소"), (7, "배송완료"),
                (8, "배송완료"), (9, "배송완료"), (10, "배송완료"), (12, "배송완료"), (13, "배송완료")]
        made = 0
        with self.conn() as c:
            prods = c.execute("SELECT * FROM product WHERE status='판매중' AND stock>0").fetchall()
            stock = {p["id"]: p["stock"] for p in prods}
            base = c.execute("SELECT COUNT(*) FROM orders WHERE is_dummy=1").fetchone()[0]
            for n, (days, status) in enumerate(plan):
                pool = [p for p in prods if stock[p["id"]] > 0]
                if not pool:
                    break
                when = datetime.now() - timedelta(days=days)
                when = (when - timedelta(minutes=rnd.randint(5, 240)) if days == 0
                        else when.replace(hour=rnd.randint(9, 21), minute=rnd.randint(0, 59), second=rnd.randint(0, 59)))
                lines, total = [], 0
                for p in rnd.sample(pool, min(len(pool), rnd.choice([1, 1, 2, 2, 3]))):
                    qty = min(rnd.choice([1, 1, 1, 2]), stock[p["id"]])
                    if status != "취소":
                        stock[p["id"]] -= qty
                        c.execute("UPDATE product SET stock=stock-? WHERE id=?", (qty, p["id"]))
                    lines.append((p["id"], p["name"], f"{p['cut']} / {p['grade']} / {p['weight_g']}g / {p['storage']}",
                                  p["price"], qty))
                    total += p["price"] * qty
                fee = 0 if (free_over and total >= free_over) else shipping_fee
                for _ in range(30):
                    order_no = "HW" + when.strftime("%y%m%d") + f"{rnd.randint(0, 99999):05d}"
                    if not c.execute("SELECT 1 FROM orders WHERE order_no=?", (order_no,)).fetchone():
                        break
                seq = base + n + 1
                name = names[(seq - 1) % len(names)]
                paid = status not in ("입금대기", "취소")
                shipped = status in ("배송중", "배송완료")
                fmt = lambda d: d.strftime("%Y-%m-%d %H:%M:%S")
                cur = c.execute(
                    "INSERT INTO orders(order_no,created_at,name,phone,zipcode,addr1,addr2,memo,wish_date,"
                    "depositor,items_total,shipping_fee,total,status,tracking_co,tracking_no,admin_memo,"
                    "paid_at,shipped_at,is_dummy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
                    (order_no, fmt(when), name, f"0100000{seq % 10000:04d}", "00000",
                     f"{rnd.choice(areas)} 더미로 {seq}", f"{rnd.randint(101, 120)}동 {rnd.randint(1, 15)}0{rnd.randint(1, 4)}호",
                     "[더미 주문] 화면 확인용입니다", "", name, total, fee, total + fee, status,
                     "우체국택배" if shipped else None, f"DUMMY-{seq:04d}" if shipped else None,
                     "더미 주문", fmt(when + timedelta(hours=rnd.randint(1, 5))) if paid else None,
                     fmt(when + timedelta(days=1)) if shipped else None))
                c.executemany("INSERT INTO order_item(order_id,product_id,name,spec,price,qty) "
                              "VALUES(?,?,?,?,?,?)", [(cur.lastrowid,) + l for l in lines])
                made += 1
        return made

    def clear_dummy_orders(self):
        """더미 주문을 모두 지우고, 더미 주문이 가져간 재고를 되돌린다."""
        with self.conn() as c:
            rows = c.execute("""SELECT i.product_id, i.qty FROM order_item i JOIN orders o ON o.id=i.order_id
                                WHERE o.is_dummy=1 AND o.status!='취소'""").fetchall()
            for r in rows:
                c.execute("UPDATE product SET stock=stock+? WHERE id=?", (r["qty"], r["product_id"]))
            c.execute("DELETE FROM review WHERE order_item_id IN (SELECT i.id FROM order_item i "
                      "JOIN orders o ON o.id=i.order_id WHERE o.is_dummy=1)")
            n = c.execute("DELETE FROM orders WHERE is_dummy=1").rowcount
        return n

    # ── 후기 ────────────────────────────────────────────
    def add_review(self, product_id, order_item_id, member_id, author, rating, content, image):
        try:
            return self._run(
                "INSERT INTO review(product_id,order_item_id,member_id,author,rating,content,image,"
                "created_at) VALUES(?,?,?,?,?,?,?,?)",
                (product_id, order_item_id, member_id, author, rating, content, image, now_str()))
        except sqlite3.IntegrityError:
            return None

    def reviews(self, product_id, limit=50):
        return self._all("SELECT * FROM review WHERE product_id=? AND hidden=0 "
                         "ORDER BY id DESC LIMIT ?", (product_id, limit))

    def review_dist(self, product_id):
        d = {r[0]: r[1] for r in self._all(
            "SELECT rating, COUNT(*) FROM review WHERE product_id=? AND hidden=0 GROUP BY rating",
            (product_id,))}
        return [(n, d.get(n, 0)) for n in (5, 4, 3, 2, 1)]

    def recent_reviews(self, limit=6):
        return self._all("""SELECT r.*, p.name AS p_name, p.weight_g AS p_weight FROM review r
            JOIN product p ON p.id=r.product_id
            WHERE r.hidden=0 AND p.status!='숨김' ORDER BY r.id DESC LIMIT ?""", (limit,))

    def all_reviews(self):
        return self._all("""SELECT r.*, p.name AS p_name FROM review r
            LEFT JOIN product p ON p.id=r.product_id ORDER BY r.id DESC LIMIT 500""")

    def member_reviews(self, mid):
        return self._all("""SELECT r.*, p.name AS p_name FROM review r
            LEFT JOIN product p ON p.id=r.product_id WHERE r.member_id=? ORDER BY r.id DESC""", (mid,))

    def update_review(self, rid, reply, hidden):
        with self.conn() as c:
            old = c.execute("SELECT reply FROM review WHERE id=?", (rid,)).fetchone()
            if not old:
                return
            reply_at = now_str() if reply and reply != (old["reply"] or "") else None
            c.execute("UPDATE review SET reply=?, hidden=?, reply_at=COALESCE(?, reply_at) WHERE id=?",
                      (reply or None, 1 if hidden else 0, reply_at, rid))

    def delete_review(self, rid):
        self._run("DELETE FROM review WHERE id=?", (rid,))

    # ── 상품 문의 ───────────────────────────────────────
    def add_qna(self, product_id, member_id, author, content, secret):
        return self._run("INSERT INTO qna(product_id,member_id,author,content,secret,created_at) "
                         "VALUES(?,?,?,?,?,?)", (product_id, member_id, author, content, secret, now_str()))

    def qnas(self, product_id, limit=50):
        return self._all("SELECT * FROM qna WHERE product_id=? ORDER BY id DESC LIMIT ?",
                         (product_id, limit))

    def all_qnas(self, open_only=False):
        sql = ("SELECT q.*, p.name AS p_name FROM qna q LEFT JOIN product p ON p.id=q.product_id"
               + (" WHERE q.answer IS NULL" if open_only else "") + " ORDER BY q.id DESC LIMIT 500")
        return self._all(sql)

    def member_qnas(self, mid):
        return self._all("""SELECT q.*, p.name AS p_name FROM qna q
            LEFT JOIN product p ON p.id=q.product_id WHERE q.member_id=? ORDER BY q.id DESC""", (mid,))

    def answer_qna(self, qid, answer):
        self._run("UPDATE qna SET answer=?, answered_at=? WHERE id=?",
                  (answer or None, now_str() if answer else None, qid))

    def delete_qna(self, qid):
        self._run("DELETE FROM qna WHERE id=?", (qid,))

    # ── 배너 · 공지 · FAQ ───────────────────────────────
    def banners(self, active_only=False):
        return self._all("SELECT * FROM banner" + (" WHERE active=1" if active_only else "")
                         + " ORDER BY sort, id")

    def banner(self, bid):
        return self._one("SELECT * FROM banner WHERE id=?", (bid,))

    def save_banner(self, bid, d):
        cols = ["title", "subtitle", "link", "link_label", "theme", "sort", "active"]
        vals = [d[k] for k in cols]
        with self.conn() as c:
            if bid:
                c.execute("UPDATE banner SET " + ",".join(f"{k}=?" for k in cols) + " WHERE id=?",
                          vals + [bid])
            else:
                bid = c.execute("INSERT INTO banner(" + ",".join(cols) + ") VALUES(?,?,?,?,?,?,?)",
                                vals).lastrowid
            if "image" in d:
                c.execute("UPDATE banner SET image=? WHERE id=?", (d["image"], bid))

    def delete_banner(self, bid):
        self._run("DELETE FROM banner WHERE id=?", (bid,))

    def notices(self, limit=100):
        return self._all("SELECT * FROM notice ORDER BY pinned DESC, id DESC LIMIT ?", (limit,))

    def notice(self, nid):
        return self._one("SELECT * FROM notice WHERE id=?", (nid,))

    def save_notice(self, nid, title, content, pinned):
        if nid:
            self._run("UPDATE notice SET title=?, content=?, pinned=? WHERE id=?",
                      (title, content, pinned, nid))
        else:
            self._run("INSERT INTO notice(title,content,pinned,created_at) VALUES(?,?,?,?)",
                      (title, content, pinned, now_str()))

    def delete_notice(self, nid):
        self._run("DELETE FROM notice WHERE id=?", (nid,))

    def faqs(self):
        return self._all("SELECT * FROM faq ORDER BY sort, id")

    def save_faq(self, fid, q, a, sort):
        if fid:
            self._run("UPDATE faq SET q=?, a=?, sort=? WHERE id=?", (q, a, sort, fid))
        else:
            self._run("INSERT INTO faq(q,a,sort) VALUES(?,?,?)", (q, a, sort))

    def delete_faq(self, fid):
        self._run("DELETE FROM faq WHERE id=?", (fid,))

    # ── 대시보드 ────────────────────────────────────────
    def dashboard(self):
        today = datetime.now().strftime("%Y-%m-%d")
        month = today[:7]
        with self.conn() as c:
            one = lambda sql, *a: c.execute(sql, a).fetchone()[0] or 0
            d = {
                "today_orders": one("SELECT COUNT(*) FROM orders WHERE created_at LIKE ? AND status!='취소'", today + "%"),
                "wait_pay": one("SELECT COUNT(*) FROM orders WHERE status='입금대기'"),
                "to_ship": one("SELECT COUNT(*) FROM orders WHERE status IN ('결제완료','상품준비')"),
                "month_sales": one(f"SELECT SUM(total) FROM orders WHERE created_at LIKE ? AND status IN {PAID}", month + "%"),
                "month_orders": one(f"SELECT COUNT(*) FROM orders WHERE created_at LIKE ? AND status IN {PAID}", month + "%"),
                "open_qna": one("SELECT COUNT(*) FROM qna WHERE answer IS NULL"),
                "no_reply_reviews": one("SELECT COUNT(*) FROM review WHERE reply IS NULL AND hidden=0"),
                "members": one("SELECT COUNT(*) FROM member"),
                "low_stock": c.execute("SELECT * FROM product WHERE status!='숨김' AND stock<=3 ORDER BY stock").fetchall(),
            }
            days = []
            for i in range(13, -1, -1):
                day = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
                days.append((day, one(f"SELECT SUM(total) FROM orders WHERE created_at LIKE ? AND status IN {PAID}", day + "%")))
            d["days"] = days
            d["best"] = c.execute(f"""
                SELECT i.name, SUM(i.qty) AS qty, SUM(i.qty*i.price) AS amt
                FROM order_item i JOIN orders o ON o.id=i.order_id
                WHERE o.status IN {PAID} AND o.created_at LIKE ?
                GROUP BY i.name ORDER BY amt DESC LIMIT 5""", (month + "%",)).fetchall()
        return d

    # ── 예시 상품 ───────────────────────────────────────
    def seed_samples(self):
        # (이름, 부위, 등급, g, 판매가, 정가, 재고, 베스트, 신상품, 한 줄 소개)
        samples = [
            ("등심 구이용", "등심", "1++", 300, 45000, 0, 12, 1, 0, "1.5cm 두께로 썬 구이용 등심"),
            ("채끝 구이용", "채끝", "1+", 300, 39000, 0, 8, 1, 0, "등심보다 담백하고 결이 고운 부위"),
            ("살치살", "살치살", "1++", 200, 38000, 0, 4, 0, 1, "한 마리에서 조금만 나오는 부위"),
            ("안심 스테이크용", "안심", "1++", 200, 42000, 0, 6, 1, 0, "3cm 두께로 썬 스테이크용 안심"),
            ("찜갈비", "갈비", "1+", 1000, 79000, 88000, 5, 0, 0, "명절과 잔치에 쓰는 찜용 갈비 (뼈 포함 중량)"),
            ("불고기용", "불고기", "1+", 500, 26000, 0, 20, 1, 0, "얇게 썬 불고기용 앞다리·설도"),
            ("국거리 (양지)", "양지", "1", 500, 24000, 0, 18, 0, 0, "국과 탕에 넣기 좋게 깍둑 썬 양지"),
            ("사골 · 잡뼈", "사골·잡뼈", "등급없음", 2000, 30000, 0, 7, 0, 0, "곰탕용 사골과 잡뼈 (냉동 발송)"),
            ("구이 선물세트 1호", "선물세트", "1++", 1200, 168000, 185000, 5, 0, 1, "등심 600g, 채끝 300g, 안심 300g"),
            ("정육 선물세트 2호", "선물세트", "1+", 1500, 98000, 0, 6, 0, 0, "불고기 500g, 국거리 500g, 산적 500g"),
        ]
        with self.conn() as c:
            for i, (name, cut, grade, w, price, lp, stock, best, new, summ) in enumerate(samples):
                c.execute(
                    "INSERT INTO product(name,category,cut,grade,weight_g,price,list_price,stock,storage,"
                    "summary,description,status,sort,is_best,is_new,created_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (name, CUT_CATEGORY[cut], cut, grade, w, price, lp, stock,
                     "냉동" if cut == "사골·잡뼈" else "냉장", summ,
                     "[예시 상품] 백오피스 > 상품 · 재고에서 실제 내용과 사진으로 바꿔 주세요.",
                     "판매중", i, best, new, now_str()))
