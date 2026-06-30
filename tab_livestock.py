"""
tab_livestock.py — 🐄 농축산 탭

상단: 사육/재배 품목 관리 (가축·작물)
하단: 영농 일지 (급여/수확/출하 등 일별 활동)
두 영역은 위/아래로 나뉘며 각각 추가·수정·삭제할 수 있다.
"""

from datetime import date, datetime

import tkinter as tk
from tkinter import ttk, messagebox

from database import (
    LIVESTOCK_CATEGORIES, FARM_ACTIVITIES, CATTLE_TYPES, today_str,
)
from charts import KFONT
from ui_helpers import parse_float, valid_date, build_tree, selected_id

NO_ITEM = "(품목 미지정)"


class LivestockTab(ttk.Frame):
    def __init__(self, parent, db, app):
        super().__init__(parent, padding=10)
        self.db = db
        self.app = app
        self._item_cache = {}     # 품목 id -> Row
        self._log_cache = {}      # 일지 id -> Row
        self._combo_map = {}      # 콤보 라벨 -> 품목 id

        # 위/아래 크기 조절 가능한 분할
        paned = ttk.PanedWindow(self, orient="vertical")
        paned.pack(fill="both", expand=True)

        item_frame = ttk.LabelFrame(paned, text=" 사육 / 재배 품목 ", padding=8)
        log_frame = ttk.LabelFrame(paned, text=" 영농 일지 ", padding=8)
        paned.add(item_frame, weight=1)
        paned.add(log_frame, weight=1)

        self._build_item_section(item_frame)
        self._build_log_section(log_frame)
        self.refresh()

    # ── 품목 영역 ────────────────────────────────────────────────
    def _build_item_section(self, root):
        form = ttk.Frame(root)
        form.pack(fill="x")

        ttk.Label(form, text="구분").grid(row=0, column=0, padx=3, pady=3, sticky="e")
        self.i_category = ttk.Combobox(form, values=LIVESTOCK_CATEGORIES,
                                       width=8, state="readonly")
        self.i_category.current(0)
        self.i_category.grid(row=0, column=1, padx=3, pady=3)

        ttk.Label(form, text="품목명").grid(row=0, column=2, padx=3, pady=3, sticky="e")
        self.i_name = ttk.Entry(form, width=14)
        self.i_name.grid(row=0, column=3, padx=3, pady=3)

        ttk.Label(form, text="수량").grid(row=0, column=4, padx=3, pady=3, sticky="e")
        self.i_qty = ttk.Entry(form, width=8)
        self.i_qty.grid(row=0, column=5, padx=3, pady=3)

        ttk.Label(form, text="단위").grid(row=0, column=6, padx=3, pady=3, sticky="e")
        self.i_unit = ttk.Entry(form, width=6)
        self.i_unit.grid(row=0, column=7, padx=3, pady=3)

        ttk.Label(form, text="시작일").grid(row=1, column=0, padx=3, pady=3, sticky="e")
        self.i_date = ttk.Entry(form, width=12)
        self.i_date.insert(0, today_str())
        self.i_date.grid(row=1, column=1, padx=3, pady=3)

        ttk.Label(form, text="상태").grid(row=1, column=2, padx=3, pady=3, sticky="e")
        self.i_status = ttk.Combobox(form, values=["진행중", "완료"],
                                     width=8, state="readonly")
        self.i_status.current(0)
        self.i_status.grid(row=1, column=3, padx=3, pady=3)

        ttk.Label(form, text="메모").grid(row=1, column=4, padx=3, pady=3, sticky="e")
        self.i_note = ttk.Entry(form, width=28)
        self.i_note.grid(row=1, column=5, columnspan=3, padx=3, pady=3, sticky="we")

        btns = ttk.Frame(root)
        btns.pack(fill="x", pady=4)
        ttk.Button(btns, text="추가", command=self.add_item).pack(side="left", padx=2)
        ttk.Button(btns, text="수정", command=self.update_item).pack(side="left", padx=2)
        ttk.Button(btns, text="삭제", command=self.delete_item).pack(side="left", padx=2)
        ttk.Button(btns, text="입력 초기화", command=self.clear_item_form).pack(side="left", padx=2)
        ttk.Separator(btns, orient="vertical").pack(side="left", fill="y", padx=8)
        ttk.Button(btns, text="🐄 소 정보", command=self.open_cow_info).pack(side="left", padx=2)

        cols = [
            ("category", "구분", 60, "center"),
            ("name", "품목명", 120, "w"),
            ("quantity", "수량", 70, "e"),
            ("unit", "단위", 50, "center"),
            ("start_date", "시작일", 90, "center"),
            ("status", "상태", 60, "center"),
            ("note", "메모", 180, "w"),
        ]
        tree_frame, self.item_tree = build_tree(root, cols, height=6)
        tree_frame.pack(fill="both", expand=True)
        self.item_tree.bind("<<TreeviewSelect>>", self.on_item_select)
        # 가축 행을 더블클릭하면 개체 정보 팝업을 연다.
        self.item_tree.bind("<Double-1>", self.open_cow_info)

    # ── 일지 영역 ────────────────────────────────────────────────
    def _build_log_section(self, root):
        form = ttk.Frame(root)
        form.pack(fill="x")

        ttk.Label(form, text="날짜").grid(row=0, column=0, padx=3, pady=3, sticky="e")
        self.l_date = ttk.Entry(form, width=12)
        self.l_date.insert(0, today_str())
        self.l_date.grid(row=0, column=1, padx=3, pady=3)

        ttk.Label(form, text="품목").grid(row=0, column=2, padx=3, pady=3, sticky="e")
        self.l_item = ttk.Combobox(form, values=[NO_ITEM], width=16, state="readonly")
        self.l_item.current(0)
        self.l_item.grid(row=0, column=3, padx=3, pady=3)

        ttk.Label(form, text="활동").grid(row=0, column=4, padx=3, pady=3, sticky="e")
        self.l_activity = ttk.Combobox(form, values=FARM_ACTIVITIES,
                                       width=12, state="readonly")
        self.l_activity.current(0)
        self.l_activity.grid(row=0, column=5, padx=3, pady=3)

        ttk.Label(form, text="수량").grid(row=1, column=0, padx=3, pady=3, sticky="e")
        self.l_qty = ttk.Entry(form, width=10)
        self.l_qty.grid(row=1, column=1, padx=3, pady=3)

        ttk.Label(form, text="단위").grid(row=1, column=2, padx=3, pady=3, sticky="e")
        self.l_unit = ttk.Entry(form, width=8)
        self.l_unit.grid(row=1, column=3, padx=3, pady=3)

        ttk.Label(form, text="메모").grid(row=1, column=4, padx=3, pady=3, sticky="e")
        self.l_note = ttk.Entry(form, width=28)
        self.l_note.grid(row=1, column=5, padx=3, pady=3, sticky="we")

        btns = ttk.Frame(root)
        btns.pack(fill="x", pady=4)
        ttk.Button(btns, text="추가", command=self.add_log).pack(side="left", padx=2)
        ttk.Button(btns, text="수정", command=self.update_log).pack(side="left", padx=2)
        ttk.Button(btns, text="삭제", command=self.delete_log).pack(side="left", padx=2)
        ttk.Button(btns, text="입력 초기화", command=self.clear_log_form).pack(side="left", padx=2)

        cols = [
            ("log_date", "날짜", 90, "center"),
            ("item", "품목", 130, "w"),
            ("activity", "활동", 90, "center"),
            ("quantity", "수량", 70, "e"),
            ("unit", "단위", 50, "center"),
            ("note", "메모", 200, "w"),
        ]
        tree_frame, self.log_tree = build_tree(root, cols, height=6)
        tree_frame.pack(fill="both", expand=True)
        self.log_tree.bind("<<TreeviewSelect>>", self.on_log_select)

    # ── 데이터 새로고침 ──────────────────────────────────────────
    def refresh(self):
        self._refresh_items()
        self._refresh_log()

    def _refresh_items(self):
        self.item_tree.delete(*self.item_tree.get_children())
        self._item_cache.clear()
        for r in self.db.list_livestock():
            self._item_cache[r["id"]] = r
            qty = f"{r['quantity']:g}" if r["quantity"] else ""
            self.item_tree.insert(
                "", "end", iid=str(r["id"]),
                values=(r["category"], r["name"], qty, r["unit"] or "",
                        r["start_date"] or "", r["status"], r["note"] or ""),
            )
        # 일지 품목 콤보 동기화
        choices = self.db.livestock_choices()
        self._combo_map = {label: cid for cid, label in choices}
        values = [NO_ITEM] + [label for _, label in choices]
        self.l_item["values"] = values
        if self.l_item.get() not in values:
            self.l_item.current(0)

    def _refresh_log(self):
        self.log_tree.delete(*self.log_tree.get_children())
        self._log_cache.clear()
        for r in self.db.list_farm_log():
            self._log_cache[r["id"]] = r
            if r["livestock_name"]:
                item_label = f"{r['livestock_category']} · {r['livestock_name']}"
            else:
                item_label = "-"
            qty = f"{r['quantity']:g}" if r["quantity"] else ""
            self.log_tree.insert(
                "", "end", iid=str(r["id"]),
                values=(r["log_date"], item_label, r["activity"], qty,
                        r["unit"] or "", r["note"] or ""),
            )

    # ── 품목 CRUD ────────────────────────────────────────────────
    def _read_item_form(self):
        name = self.i_name.get().strip()
        if not name:
            messagebox.showwarning("입력 확인", "품목명을 입력하세요.")
            return None
        date = self.i_date.get().strip()
        if date and not valid_date(date):
            messagebox.showwarning("입력 확인", "시작일은 YYYY-MM-DD 형식이어야 합니다.")
            return None
        return dict(
            category=self.i_category.get(),
            name=name,
            quantity=parse_float(self.i_qty.get()),
            unit=self.i_unit.get().strip(),
            start_date=date,
            status=self.i_status.get(),
            note=self.i_note.get().strip(),
        )

    def add_item(self):
        data = self._read_item_form()
        if not data:
            return
        self.db.add_livestock(**data)
        self.clear_item_form()
        self.refresh()

    def update_item(self):
        row_id = selected_id(self.item_tree)
        if row_id is None:
            messagebox.showinfo("안내", "수정할 품목을 목록에서 선택하세요.")
            return
        data = self._read_item_form()
        if not data:
            return
        self.db.update_livestock(row_id, **data)
        self.refresh()

    def delete_item(self):
        row_id = selected_id(self.item_tree)
        if row_id is None:
            messagebox.showinfo("안내", "삭제할 품목을 목록에서 선택하세요.")
            return
        if messagebox.askyesno("삭제 확인", "선택한 품목을 삭제할까요?\n(연결된 일지는 '품목 미지정'으로 남습니다.)"):
            self.db.delete_livestock(row_id)
            self.clear_item_form()
            self.refresh()

    def clear_item_form(self):
        self.i_category.current(0)
        self.i_name.delete(0, "end")
        self.i_qty.delete(0, "end")
        self.i_unit.delete(0, "end")
        self.i_date.delete(0, "end")
        self.i_date.insert(0, today_str())
        self.i_status.current(0)
        self.i_note.delete(0, "end")
        if self.item_tree.selection():
            self.item_tree.selection_remove(self.item_tree.selection())

    def on_item_select(self, _event):
        row_id = selected_id(self.item_tree)
        if row_id is None or row_id not in self._item_cache:
            return
        r = self._item_cache[row_id]
        self.i_category.set(r["category"])
        self.i_name.delete(0, "end"); self.i_name.insert(0, r["name"])
        self.i_qty.delete(0, "end")
        self.i_qty.insert(0, f"{r['quantity']:g}" if r["quantity"] else "")
        self.i_unit.delete(0, "end"); self.i_unit.insert(0, r["unit"] or "")
        self.i_date.delete(0, "end"); self.i_date.insert(0, r["start_date"] or "")
        self.i_status.set(r["status"])
        self.i_note.delete(0, "end"); self.i_note.insert(0, r["note"] or "")

    def open_cow_info(self, event=None):
        """선택한 가축(소) 한 마리의 개체 정보 입력 팝업을 연다."""
        row_id = selected_id(self.item_tree)
        if row_id is None or row_id not in self._item_cache:
            if event is None:   # 버튼으로 눌렀을 때만 안내(더블클릭 빈 곳은 조용히)
                messagebox.showinfo("안내", "정보를 입력할 소(가축)를 목록에서 선택하세요.")
            return
        r = self._item_cache[row_id]
        if r["category"] != "가축":
            if event is None:
                messagebox.showinfo("안내", "‘가축’ 품목만 소 개체 정보를 입력할 수 있습니다.")
            return
        CowInfoDialog(self.app, self.db, r, on_saved=self.refresh)

    # ── 일지 CRUD ────────────────────────────────────────────────
    def _read_log_form(self):
        date = self.l_date.get().strip()
        if not valid_date(date):
            messagebox.showwarning("입력 확인", "날짜는 YYYY-MM-DD 형식으로 입력하세요.")
            return None
        label = self.l_item.get()
        livestock_id = self._combo_map.get(label)   # NO_ITEM이면 None
        return dict(
            log_date=date,
            livestock_id=livestock_id,
            activity=self.l_activity.get(),
            quantity=parse_float(self.l_qty.get()),
            unit=self.l_unit.get().strip(),
            note=self.l_note.get().strip(),
        )

    def add_log(self):
        data = self._read_log_form()
        if not data:
            return
        self.db.add_farm_log(**data)
        self.clear_log_form()
        self._refresh_log()

    def update_log(self):
        row_id = selected_id(self.log_tree)
        if row_id is None:
            messagebox.showinfo("안내", "수정할 일지를 목록에서 선택하세요.")
            return
        data = self._read_log_form()
        if not data:
            return
        self.db.update_farm_log(row_id, **data)
        self._refresh_log()

    def delete_log(self):
        row_id = selected_id(self.log_tree)
        if row_id is None:
            messagebox.showinfo("안내", "삭제할 일지를 목록에서 선택하세요.")
            return
        if messagebox.askyesno("삭제 확인", "선택한 일지를 삭제할까요?"):
            self.db.delete_farm_log(row_id)
            self.clear_log_form()
            self._refresh_log()

    def clear_log_form(self):
        self.l_date.delete(0, "end")
        self.l_date.insert(0, today_str())
        self.l_item.current(0)
        self.l_activity.current(0)
        self.l_qty.delete(0, "end")
        self.l_unit.delete(0, "end")
        self.l_note.delete(0, "end")
        if self.log_tree.selection():
            self.log_tree.selection_remove(self.log_tree.selection())

    def on_log_select(self, _event):
        row_id = selected_id(self.log_tree)
        if row_id is None or row_id not in self._log_cache:
            return
        r = self._log_cache[row_id]
        self.l_date.delete(0, "end"); self.l_date.insert(0, r["log_date"])
        if r["livestock_name"]:
            label = f"{r['livestock_category']} · {r['livestock_name']}"
            self.l_item.set(label if label in self.l_item["values"] else NO_ITEM)
        else:
            self.l_item.set(NO_ITEM)
        self.l_activity.set(r["activity"])
        self.l_qty.delete(0, "end")
        self.l_qty.insert(0, f"{r['quantity']:g}" if r["quantity"] else "")
        self.l_unit.delete(0, "end"); self.l_unit.insert(0, r["unit"] or "")
        self.l_note.delete(0, "end"); self.l_note.insert(0, r["note"] or "")


def _days_since(start, end=None):
    """start(YYYY-MM-DD)부터 end(없으면 오늘)까지의 일수. 잘못된 값이면 None."""
    try:
        s = datetime.strptime(str(start).strip(), "%Y-%m-%d").date()
    except (ValueError, TypeError, AttributeError):
        return None
    e = date.today()
    if end:
        try:
            e = datetime.strptime(str(end).strip(), "%Y-%m-%d").date()
        except ValueError:
            pass
    return (e - s).days


class CowInfoDialog(tk.Toplevel):
    """소 한 마리(가축 품목)의 개체 정보를 보고 입력하는 팝업 창.

    요약(읽기 전용) + 입력 폼(이표번호·출생일·성별·어미소·명의·소품목·입식체중·건강메모).
    저장은 db.update_cow_detail()을 호출하며 품목 기본정보는 건드리지 않는다.
    """

    SEX_VALUES = ["", "암", "수", "거세"]

    def __init__(self, parent, db, row, on_saved=None):
        super().__init__(parent)
        self.db = db
        self.row = row
        self.row_id = row["id"]
        self.on_saved = on_saved

        self.title(f"소 개체 정보 — {row['name']}")
        self.resizable(False, False)
        self.transient(parent)

        body = ttk.Frame(self, padding=14)
        body.pack(fill="both", expand=True)

        # ── 요약(읽기 전용) ──
        summ = ttk.LabelFrame(body, text=" 요약 ", padding=10)
        summ.grid(row=0, column=0, columnspan=4, sticky="we", pady=(0, 12))
        ttk.Label(summ, text=self._summary_text(), justify="left",
                  font=(KFONT, 10)).pack(anchor="w")

        def lab(text, r, c):
            ttk.Label(body, text=text).grid(row=r, column=c, sticky="e",
                                            padx=(0, 6), pady=5)

        # ── 입력 폼 ──
        lab("이표번호", 1, 0)
        self.e_ear = ttk.Entry(body, width=20)
        self.e_ear.grid(row=1, column=1, pady=5, sticky="w")
        lab("출생일", 1, 2)
        self.e_birth = ttk.Entry(body, width=14)
        self.e_birth.grid(row=1, column=3, pady=5, sticky="w")

        lab("성별", 2, 0)
        self.c_sex = ttk.Combobox(body, values=self.SEX_VALUES, width=8,
                                  state="readonly")
        self.c_sex.grid(row=2, column=1, pady=5, sticky="w")
        lab("어미소 이표번호", 2, 2)
        self.e_dam = ttk.Entry(body, width=14)
        self.e_dam.grid(row=2, column=3, pady=5, sticky="w")

        lab("명의(소유주)", 3, 0)
        self.e_owner = ttk.Entry(body, width=20)
        self.e_owner.grid(row=3, column=1, pady=5, sticky="w")
        lab("소 품목", 3, 2)
        self.c_type = ttk.Combobox(body, values=[""] + list(CATTLE_TYPES),
                                   width=12, state="readonly")
        self.c_type.grid(row=3, column=3, pady=5, sticky="w")

        lab("입식 체중(kg)", 4, 0)
        self.e_weight = ttk.Entry(body, width=12)
        self.e_weight.grid(row=4, column=1, pady=5, sticky="w")

        ttk.Label(body, text="건강·진료·방역 메모").grid(
            row=5, column=0, columnspan=4, sticky="w", pady=(8, 2))
        self.t_health = tk.Text(body, width=46, height=4, font=(KFONT, 10),
                                relief="solid", borderwidth=1)
        self.t_health.grid(row=6, column=0, columnspan=4, sticky="we")

        btns = ttk.Frame(body)
        btns.grid(row=7, column=0, columnspan=4, sticky="e", pady=(14, 0))
        ttk.Button(btns, text="저장", command=self.save).pack(side="left", padx=3)
        ttk.Button(btns, text="닫기", command=self.destroy).pack(side="left", padx=3)

        self._fill()

        # 모달 + 부모 가운데 정렬
        self.grab_set()
        self.e_ear.focus_set()
        self.bind("<Escape>", lambda _e: self.destroy())
        self.update_idletasks()
        try:
            px, py = parent.winfo_rootx(), parent.winfo_rooty()
            pw, ph = parent.winfo_width(), parent.winfo_height()
            w, h = self.winfo_width(), self.winfo_height()
            self.geometry(f"+{px + max((pw - w) // 2, 0)}+{py + max((ph - h) // 3, 0)}")
        except Exception:
            pass

    def _summary_text(self):
        r = self.row
        qty = f"{r['quantity']:g}{r['unit'] or ''}" if r["quantity"] else "-"
        raise_s = r["start_date"] or "-"
        days = _days_since(r["start_date"], r["sold_date"])
        if days is not None:
            raise_s += f"   (사육 {days}일째)"
        lines = [
            f"구분 : {r['category']}        수량 : {qty}",
            f"시작일 : {raise_s}",
            f"상태 : {r['status']}",
        ]
        if r["sold_date"]:
            parts = [r["sold_date"]]
            if r["sold_grade"]:
                parts.append(f"{r['sold_grade']}등급")
            if r["sold_amount"]:
                parts.append(f"{int(r['sold_amount']):,}원")
            if r["sold_weight_kg"]:
                w = f"출하 {r['sold_weight_kg']:g}kg"
                if r["weight_kg"]:
                    w += f" (성장 +{r['sold_weight_kg'] - r['weight_kg']:g}kg)"
                parts.append(w)
            lines.append("판매 : " + " · ".join(parts))
        return "\n".join(lines)

    def _fill(self):
        r = self.row
        self.e_ear.insert(0, r["ear_tag"] or "")
        self.e_birth.insert(0, r["birth_date"] or "")
        self.c_sex.set(r["sex"] or "")
        self.e_dam.insert(0, r["dam_tag"] or "")
        self.e_owner.insert(0, r["owner"] or "")
        self.c_type.set(r["cattle_type"] or "")
        if r["weight_kg"]:
            self.e_weight.insert(0, f"{r['weight_kg']:g}")
        self.t_health.insert("1.0", r["health_note"] or "")

    def save(self):
        birth = self.e_birth.get().strip()
        if birth and not valid_date(birth):
            messagebox.showwarning("입력 확인",
                                   "출생일은 YYYY-MM-DD 형식이어야 합니다.", parent=self)
            return
        weight = parse_float(self.e_weight.get())
        self.db.update_cow_detail(
            self.row_id,
            owner=self.e_owner.get().strip() or None,
            cattle_type=self.c_type.get().strip() or None,
            weight_kg=weight if weight > 0 else None,
            ear_tag=self.e_ear.get().strip() or None,
            birth_date=birth or None,
            sex=self.c_sex.get().strip() or None,
            dam_tag=self.e_dam.get().strip() or None,
            health_note=self.t_health.get("1.0", "end").strip() or None,
        )
        if callable(self.on_saved):
            self.on_saved()
        messagebox.showinfo("저장", f"‘{self.row['name']}’ 개체 정보를 저장했습니다.",
                            parent=self)
        self.destroy()
