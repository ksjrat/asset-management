#!/usr/bin/env python3
"""구글 시트에서 받은 xlsx → sej-ledger JSON 변환 (브라우저 import.html 과 동일 목적)"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

YEAR = 2026
MONTH_RE = re.compile(r"^(\d{1,2})\s*월$")
ASSET_MAP = {
    "계좌현황": "accounts", "계좌": "accounts",
    "비상금관리": "emergency", "비상금": "emergency",
    "예금관리": "deposits", "예금": "deposits",
    "적금관리": "savings", "적금": "savings",
    "투자관리": "investments", "투자": "investments",
    "매매": "trades", "부채관리": "debts", "부채": "debts",
}


def parse_amount(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    s = re.sub(r"[^\d.-]", "", str(v))
    try:
        return int(float(s))
    except ValueError:
        return 0


def find_header(df):
    keys = ["날짜", "일자", "항목", "금액", "구분"]
    for i in range(min(25, len(df))):
        row = "|".join(str(x) for x in df.iloc[i].tolist())
        if sum(1 for k in keys if k in row) >= 2:
            return i
    return None


def col_idx(headers, names):
    for i, h in enumerate(headers):
        hs = str(h).replace(" ", "")
        for n in names:
            if n in hs:
                return i
    return -1


def import_month(df, month):
    hr = find_header(df)
    if hr is None:
        return [], []
    headers = [str(x) for x in df.iloc[hr].tolist()]
    income, expenses = [], []
    i_amt = col_idx(headers, ["금액"])
    i_cat = col_idx(headers, ["항목", "카테고리"])
    i_type = col_idx(headers, ["구분"])
    i_date = col_idx(headers, ["날짜", "일자"])

    for _, row in df.iloc[hr + 1 :].iterrows():
        amt = parse_amount(row.iloc[i_amt] if i_amt >= 0 else 0)
        if not amt:
            continue
        cat = str(row.iloc[i_cat]) if i_cat >= 0 else "기타"
        typ = str(row.iloc[i_type]) if i_type >= 0 else ""
        is_income = "수입" in typ or "수입" in cat
        entry = {
            "id": f"m{month}-{len(income)+len(expenses)}",
            "date": f"{YEAR}-{month:02d}-01",
            "category": cat,
            "amount": amt,
            "owner": "공동",
            "type": "saving" if cat == "저축성" else "consumption",
        }
        (income if is_income else expenses).append(entry)
    return income, expenses


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "import/source.xlsx")
    if not path.exists():
        print(f"파일 없음: {path}")
        print("구글 시트 → 파일 → 다운로드 → Excel(.xlsx) 후")
        print(f"  {path.parent}/source.xlsx 로 저장하세요.")
        sys.exit(1)

    xl = pd.ExcelFile(path)
    data = {
        "year": YEAR,
        "months": {},
        "budget": {},
        "assets": {k: [] for k in ["accounts", "emergency", "deposits", "savings", "investments", "trades"]},
        "liabilities": {"debts": [], "loans": [{"name": f"대출{i}", "lender": "", "balance": 0} for i in range(1, 6)]},
    }

    for name in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=name, header=None)
        m = MONTH_RE.match(name.strip())
        if m:
            month = int(m.group(1))
            inc, exp = import_month(df, month)
            if inc or exp:
                key = f"{YEAR}-{month:02d}"
                data["months"][key] = {"carryOver": 0, "income": inc, "expenses": exp}
                print(f"{name}: 수입 {len(inc)}, 지출 {len(exp)}")
            continue
        if name in ASSET_MAP:
            # simple: col0 name, last numeric col balance
            key = ASSET_MAP[name]
            for _, row in df.iterrows():
                bal = parse_amount(row.iloc[-1])
                nm = str(row.iloc[0]) if pd.notna(row.iloc[0]) else ""
                if nm and bal and "합계" not in nm:
                    data["assets"][key].append({"id": nm, "name": nm, "balance": bal, "owner": "공동"})

    out = Path("import/ledger-imported.json")
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"저장: {out}")
    print("앱 → 설정 → JSON 가져오기")


if __name__ == "__main__":
    main()
