"""
ui_helpers.py — 여러 탭에서 공통으로 쓰는 작은 UI 유틸.

입력값 파싱/검증과 스크롤 가능한 Treeview 생성 헬퍼를 모았다.
"""

from datetime import datetime
from tkinter import ttk


def parse_float(s, default=0.0):
    """문자열을 실수로. 콤마 허용, 빈 값/오류 시 default."""
    try:
        s = str(s).strip().replace(",", "")
        return float(s) if s else default
    except ValueError:
        return default


def parse_int(s, default=0):
    """문자열을 정수(원 단위)로. 콤마/'원' 허용."""
    try:
        s = str(s).strip().replace(",", "").replace("원", "")
        return int(round(float(s))) if s else default
    except ValueError:
        return default


def valid_date(s):
    """'YYYY-MM-DD' 형식인지 검사."""
    try:
        datetime.strptime(str(s).strip(), "%Y-%m-%d")
        return True
    except ValueError:
        return False


def build_tree(parent, columns, height=8):
    """
    스크롤바가 달린 Treeview를 만들어 (감싼 Frame, Treeview)를 반환.

    columns: [(key, heading, width, anchor), ...]
    행을 넣을 때 iid=str(db_id) 로 넣으면 선택된 DB id를 쉽게 알 수 있다.
    """
    frame = ttk.Frame(parent)
    keys = [c[0] for c in columns]
    tree = ttk.Treeview(frame, columns=keys, show="headings", height=height)
    for key, heading, width, anchor in columns:
        tree.heading(key, text=heading)
        tree.column(key, width=width, anchor=anchor, stretch=True)

    vsb = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
    tree.configure(yscrollcommand=vsb.set)
    tree.grid(row=0, column=0, sticky="nsew")
    vsb.grid(row=0, column=1, sticky="ns")
    frame.rowconfigure(0, weight=1)
    frame.columnconfigure(0, weight=1)
    return frame, tree


def selected_id(tree):
    """Treeview에서 선택된 행의 iid(=DB id)를 정수로. 없으면 None."""
    sel = tree.selection()
    if not sel:
        return None
    try:
        return int(sel[0])
    except ValueError:
        return None
