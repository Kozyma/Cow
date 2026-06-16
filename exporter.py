"""
exporter.py — 데이터를 CSV 파일로 내보낸다.

엑셀에서 한글이 깨지지 않도록 'utf-8-sig'(BOM 포함)로 저장한다.
지정한 폴더에 raw 데이터 4종 + 월별 요약 1종, 총 5개의 CSV를 만든다.
(.xlsx 가 아니라 CSV 인 이유: 추가 라이브러리 설치 없이 엑셀에서 바로 열기 위함)
"""

import csv
import os


def _write_csv(folder, filename, header, rows):
    path = os.path.join(folder, filename)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)
    return path


def export_all(db, folder):
    """db의 모든 데이터를 folder 안의 CSV로 저장하고, 만든 파일 경로 목록을 반환."""
    written = []

    # 1) 농축산 품목
    written.append(_write_csv(
        folder, "농축산_품목.csv",
        ["구분", "품목명", "수량", "단위", "입식체중(kg)", "시작일", "상태", "메모",
         "판매일", "판매금액(원)", "출하체중(kg)", "성장(kg)", "등급"],
        [(r["category"], r["name"], r["quantity"], r["unit"] or "",
          r["weight_kg"] if r["weight_kg"] is not None else "",
          r["start_date"] or "", r["status"], r["note"] or "",
          r["sold_date"] or "",
          r["sold_amount"] if r["sold_amount"] is not None else "",
          r["sold_weight_kg"] if r["sold_weight_kg"] is not None else "",
          (r["sold_weight_kg"] - r["weight_kg"])
          if (r["sold_weight_kg"] is not None and r["weight_kg"] is not None) else "",
          r["sold_grade"] or "")
         for r in db.list_livestock()],
    ))

    # 2) 영농 일지
    written.append(_write_csv(
        folder, "영농_일지.csv",
        ["날짜", "품목", "활동", "수량", "단위", "메모"],
        [(r["log_date"],
          (f"{r['livestock_category']} · {r['livestock_name']}"
           if r["livestock_name"] else "-"),
          r["activity"], r["quantity"], r["unit"] or "", r["note"] or "")
         for r in db.list_farm_log(limit=1000000)],
    ))

    # 3) 태양광 발전 기록 (예상수익 포함)
    written.append(_write_csv(
        folder, "태양광_발전기록.csv",
        ["날짜", "발전량(kWh)", "예상수익(원)", "메모"],
        [(r["log_date"], r["generation_kwh"],
          db.solar_revenue(r["generation_kwh"]), r["note"] or "")
         for r in db.list_solar(limit=1000000)],
    ))

    # 4) 재무 거래내역
    written.append(_write_csv(
        folder, "재무_거래내역.csv",
        ["날짜", "구분", "부문", "항목", "금액(원)", "메모", "자동반영"],
        [(r["tx_date"], r["tx_type"], r["sector"], r["item"], r["amount"],
          r["note"] or "", "자동" if r["auto_key"] else "")
         for r in db.list_finance(limit=1000000)],
    ))

    # 1-1) 시설 (축사 등)
    written.append(_write_csv(
        folder, "농축산_시설.csv",
        ["시설명", "종류", "상태", "착공일", "완공일", "준공일", "규모", "공사비(원)", "시공업체", "메모"],
        [(r["name"], r["ftype"], r["status"], r["start_date"] or "",
          r["done_date"] or "", r["approval_date"] or "", r["size"] or "",
          r["cost"] if r["cost"] is not None else "", r["contractor"] or "", r["note"] or "")
         for r in db.list_facility()],
    ))

    # 4-1) 지원사업
    written.append(_write_csv(
        folder, "지원사업.csv",
        ["사업명", "지원기관", "신청일", "지원금액(원)", "상태", "메모"],
        [(r["name"], r["agency"] or "", r["apply_date"] or "",
          r["amount"], r["status"], r["note"] or "")
         for r in db.list_support()],
    ))

    # 5) 월별 요약 (데이터가 있는 모든 연·월)
    summary = []
    for year in db.finance_years():
        fm = db.finance_monthly(year)
        sm = db.solar_monthly(year)
        for m in range(1, 13):
            income, expense = fm[m]
            kwh = sm[m]
            if income == 0 and expense == 0 and kwh == 0:
                continue
            summary.append((
                f"{year}-{m:02d}", income, expense, income - expense,
                round(kwh, 1), db.solar_revenue(kwh),
            ))
    summary.sort()
    written.append(_write_csv(
        folder, "월별_요약.csv",
        ["연월", "수입(원)", "지출(원)", "순이익(원)", "발전량(kWh)", "발전수익(원)"],
        summary,
    ))

    return written
