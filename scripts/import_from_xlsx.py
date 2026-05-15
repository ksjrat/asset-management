#!/usr/bin/env python3
"""구글 시트 xlsx → sej-ledger JSON (js/xlsx-import.js 와 동일 목적)"""
import calendar
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

YEAR = 2026
ROOT = Path(__file__).resolve().parent.parent
ORIGINAL_DATA_DIR = ROOT / "original data"
MONTH_RE = re.compile(r"^(\d{1,2})\s*월$")
SAVING_CATS = re.compile(r"저축|적금|IRP|퇴직연금|청약|투자|여행\s*적금")


def parse_amount(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0
    if isinstance(v, (int, float)):
        return int(v) if v else 0
    s = re.sub(r"[^\d.-]", "", str(v))
    try:
        return int(float(s))
    except ValueError:
        return 0


def cell_str(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def format_date(v, month):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = cell_str(v)
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    return f"{YEAR}-{month:02d}-01"


def find_tx_headers(df):
    found = []
    for i in range(len(df)):
        row = "|".join(cell_str(x) for x in df.iloc[i].tolist())
        if "날짜" in row and ("금액" in row or "결제금액" in row or "지출" in row):
            found.append(i)
    return found


def read_side(row, cols, month, is_income):
    amt = parse_amount(row.iloc[cols["amt"]] if cols["amt"] < len(row) else 0)
    if not amt:
        return None
    cat = cell_str(row.iloc[cols["cat"]]) if cols["cat"] < len(row) else ""
    sub = cell_str(row.iloc[cols["sub"]]) if cols["sub"] < len(row) else ""
    name = cell_str(row.iloc[cols["name"]]) if cols["name"] < len(row) else ""
    if not cat and not sub and not name:
        return None
    is_saving = bool(SAVING_CATS.search(cat + sub))
    return {
        "id": f"t-{month}-{len(cat)}",
        "date": format_date(row.iloc[cols["date"]] if cols["date"] < len(row) else None, month),
        "owner": "공동",
        "name": name or sub or cat,
        "category": cat or ("기타수입" if is_income else "기타"),
        "subCategory": sub,
        "amount": amt,
        "type": "saving" if is_saving else "consumption",
    }


def import_month(df, month):
    income, expenses = [], []
    inc_cols = {"date": 1, "cat": 2, "sub": 3, "name": 4, "amt": 7}
    exp_cols = {"date": 9, "cat": 11, "sub": 12, "name": 13, "amt": 15, "type": 10}

    for hr in find_tx_headers(df):
        for i in range(hr + 1, len(df)):
            row = df.iloc[i]
            first = cell_str(row.iloc[1]) if len(row) > 1 else ""
            if first and re.match(r"^(총|고정|변동|부가|MEMO)", first):
                break
            inc = read_side(row, inc_cols, month, True)
            if inc:
                income.append(inc)
            exp = read_side(row, exp_cols, month, False)
            if exp:
                expenses.append(exp)

    last_day = f"{YEAR}-{month:02d}-{calendar.monthrange(YEAR, month)[1]}"
    if not expenses:
        for i in range(8, min(28, len(df))):
            row = df.iloc[i]
            cat = cell_str(row.iloc[9]) if len(row) > 9 else ""
            if not cat or re.search(r"항목|분석|MEMO", cat):
                continue
            actual = parse_amount(row.iloc[12]) if len(row) > 12 else 0
            if not actual:
                actual = parse_amount(row.iloc[10]) if len(row) > 10 else 0
            if actual > 0:
                expenses.append({
                    "id": f"syn-{month}-{cat}",
                    "date": last_day,
                    "owner": "공동",
                    "name": "(시트 카테고리 합계)",
                    "category": cat,
                    "amount": actual,
                    "type": "saving" if SAVING_CATS.search(cat) else "consumption",
                })
    return income, expenses


def import_budget(df):
    budget = {}
    header_row = None
    month_cols = []
    for i in range(min(10, len(df))):
        for c in range(len(df.columns)):
            v = cell_str(df.iloc[i, c])
            m = re.match(r"^(\d{1,2})월$", v)
            if m:
                header_row = i
                for c2 in range(len(df.columns)):
                    mv = cell_str(df.iloc[i, c2])
                    mm = re.match(r"^(\d{1,2})월$", mv)
                    if mm:
                        month_cols.append((c2, int(mm.group(1))))
                break
        if header_row is not None:
            break
    if header_row is None:
        return budget

    for i in range(header_row + 1, len(df)):
        row = df.iloc[i]
        cat = ""
        for c in range(3):
            v = cell_str(row.iloc[c])
            if v:
                cat = v
                break
        if not cat or re.search(r"예산|총계", cat):
            continue
        budget[cat] = {}
        for col, m in month_cols:
            v = parse_amount(row.iloc[col])
            if v:
                budget[cat][m] = v
    return budget


def import_accounts(df):
    items = []
    hr = None
    for i in range(min(15, len(df))):
        line = "|".join(cell_str(x) for x in df.iloc[i].tolist())
        if "은행" in line and "계좌" in line:
            hr = i
            break
    if hr is None:
        return items
    headers = [cell_str(x) for x in df.iloc[hr].tolist()]
    i_bal = next(
        (i for i, h in enumerate(headers) if "연동금액" in h.replace(" ", "") or h in ("잔액", "금액")),
        10,
    )
    for i in range(hr + 1, len(df)):
        row = df.iloc[i]
        bank = cell_str(row.iloc[2]) if len(row) > 2 else ""
        name = cell_str(row.iloc[5]) if len(row) > 5 else ""
        if not bank and not name:
            continue
        bal = parse_amount(row.iloc[i_bal]) if len(row) > i_bal else 0
        owner = "은지" if "은지" in name else ("승재" if "승재" in name else "공동")
        items.append({
            "id": name or bank, "name": name or bank, "institution": bank,
            "owner": owner, "balance": bal,
        })
    return items


def import_asset_summary(df):
    summary = []
    for i in range(2, min(12, len(df))):
        label = cell_str(df.iloc[i, 3]) if len(df.columns) > 3 else ""
        if not label:
            label = cell_str(df.iloc[i, 1]) if len(df.columns) > 1 else ""
        bal = parse_amount(df.iloc[i, 4]) if len(df.columns) > 4 else 0
        if label and bal and "◀" not in label:
            summary.append({"id": label, "label": label.replace(" 계", "").strip(), "balance": bal})
    return summary


def import_savings(df):
    items = []
    hr = None
    for i in range(min(15, len(df))):
        line = "|".join(cell_str(x) for x in df.iloc[i].tolist())
        if "은행" in line and "적금" in line:
            hr = i
            break
    if hr is None:
        return items
    for i in range(hr + 1, len(df)):
        row = df.iloc[i]
        name = cell_str(row.iloc[3]) if len(row) > 3 else ""
        bank = cell_str(row.iloc[2]) if len(row) > 2 else ""
        if not name or name in ("No.", "No") or name.isdigit():
            continue
        items.append({
            "id": name, "name": name, "institution": bank, "owner": "공동",
            "balance": 0, "note": cell_str(row.iloc[4]) if len(row) > 4 else "",
        })
    return items


def import_investments(df):
    for i in range(min(12, len(df))):
        headers = [cell_str(x) for x in df.iloc[i].tolist()]
        if not any("평가금액" in h for h in headers):
            continue
        data_row = df.iloc[i + 1] if i + 1 < len(df) else df.iloc[i]
        for c, h in enumerate(headers):
            if "평가금액" in h.replace(" ", "") and "손익" not in h:
                v = parse_amount(data_row.iloc[c] if c < len(data_row) else 0)
                if v > 100000:
                    return [{
                        "id": "invest-total", "name": "투자 평가 합계 (시트)",
                        "institution": "투자관리", "owner": "공동", "balance": v,
                    }]
    return []


SETTLEMENT_SKIP = re.compile(r"^(소비성지출|수입\s*총|총계|합계|누계|총\s*예산)")


def import_settlement(df):
    months = {}
    header_row = None
    month_cols = []
    for i in range(min(8, len(df))):
        for c in range(len(df.columns)):
            v = cell_str(df.iloc[i, c])
            if re.match(r"^\d{1,2}월$", v):
                header_row = i
                for c2 in range(len(df.columns)):
                    mv = cell_str(df.iloc[i, c2])
                    mm = re.match(r"^(\d{1,2})월$", mv)
                    if mm:
                        month_cols.append((c2, int(mm.group(1))))
                break
        if header_row is not None:
            break
    if header_row is None:
        return months

    for i in range(header_row + 1, len(df)):
        row = df.iloc[i]
        cat = cell_str(row.iloc[1]) if len(row) > 1 else cell_str(row.iloc[0])
        if not cat or SETTLEMENT_SKIP.search(cat):
            continue
        for col, month in month_cols:
            amount = abs(parse_amount(row.iloc[col]))
            if not amount:
                continue
            key = f"{YEAR}-{month:02d}"
            last = f"{YEAR}-{month:02d}-{calendar.monthrange(YEAR, month)[1]}"
            if key not in months:
                months[key] = {"carryOver": 0, "income": [], "expenses": []}
            if cat == "수입" or cat.startswith("수입"):
                months[key]["income"].append({
                    "id": f"st-{month}-inc", "date": last, "owner": "공동",
                    "name": "(결산 시트)", "category": "수입", "amount": amount, "type": "consumption",
                })
            elif cat == "저축성지출" or cat.startswith("저축"):
                months[key]["expenses"].append({
                    "id": f"st-{month}-sav", "date": last, "owner": "공동",
                    "name": "(결산 시트)", "category": "저축성지출", "amount": amount, "type": "saving",
                })
            else:
                months[key]["expenses"].append({
                    "id": f"st-{month}-{cat}", "date": last, "owner": "공동",
                    "name": "(결산 시트)", "category": cat, "amount": amount,
                    "type": "saving" if SAVING_CATS.search(cat) else "consumption",
                })
    return months


def import_debts(df):
    items = []
    hr = None
    for i in range(min(15, len(df))):
        line = "|".join(cell_str(x) for x in df.iloc[i].tolist())
        if "기관" in line and "대출" in line:
            hr = i
            break
    if hr is None:
        return items
    headers = [cell_str(x) for x in df.iloc[hr].tolist()]
    i_bal = next((i for i, h in enumerate(headers) if "대출금액" in h.replace(" ", "") or h == "잔액"), 8)
    for i in range(hr + 1, len(df)):
        row = df.iloc[i]
        lender = cell_str(row.iloc[2]) if len(row) > 2 else ""
        name = cell_str(row.iloc[3]) if len(row) > 3 else ""
        bal = parse_amount(row.iloc[i_bal]) if len(row) > i_bal else 0
        if (lender or name) and bal:
            items.append({"id": name, "name": name or lender, "institution": lender, "balance": bal, "owner": "공동"})
    return items


def find_source_xlsx():
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    if ORIGINAL_DATA_DIR.is_dir():
        files = sorted(ORIGINAL_DATA_DIR.glob("*.xlsx"), key=lambda p: p.stat().st_mtime, reverse=True)
        if files:
            return files[0]
    fallback = ROOT / "import" / "source.xlsx"
    return fallback


def main():
    path = find_source_xlsx()
    if not path.exists():
        print(f"파일 없음: {path}")
        print(f"구글 시트 xlsx를 '{ORIGINAL_DATA_DIR.name}/' 폴더에 넣어 주세요.")
        sys.exit(1)
    print(f"입력: {path}")

    xl = pd.ExcelFile(path)
    data = {
        "year": YEAR,
        "version": 2,
        "months": {},
        "budget": {},
        "settings": {"title": "승재·은지 가계부", "names": ["승재", "은지"]},
        "assets": {
            "summary": [],
            **{k: [] for k in ["accounts", "emergency", "deposits", "savings", "investments", "trades"]},
        },
        "liabilities": {
            "debts": [],
            "loans": [{"name": f"대출{i}", "lender": "", "balance": 0} for i in range(1, 6)],
        },
    }

    settlement = {}
    for name in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=name, header=None)
        if "예산" in name:
            data["budget"].update(import_budget(df))
            print(f"예산: {len(data['budget'])} 항목")
        if "결산" in name:
            settlement = import_settlement(df)
            print(f"결산: {len(settlement)}개월")

    def synth_income(month):
        cats = ["급여", "상여", "투자수익", "이자", "부수익", "기타 수입"]
        last = f"{YEAR}-{month:02d}-{calendar.monthrange(YEAR, month)[1]}"
        out = []
        for cat in cats:
            amt = (data["budget"].get(cat) or {}).get(month)
            if amt and amt > 0:
                out.append({
                    "id": f"inc-{month}-{cat}",
                    "date": last,
                    "owner": "공동",
                    "name": "(예산 시트)",
                    "category": cat.replace(" ", ""),
                    "amount": amt,
                    "type": "consumption",
                })
        return out

    for name in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=name, header=None)
        m = MONTH_RE.match(name.strip())
        if m:
            month = int(m.group(1))
            key = f"{YEAR}-{month:02d}"
            inc, exp = import_month(df, month)
            real = [t for t in inc + exp if not str(t.get("name", "")).startswith("(")]
            if real:
                data["months"][key] = {"carryOver": 0, "income": inc, "expenses": exp}
            elif key in settlement:
                data["months"][key] = settlement[key]
            elif (inc := synth_income(month)) or exp:
                data["months"][key] = {"carryOver": 0, "income": inc, "expenses": exp}
            if key in data["months"]:
                mo = data["months"][key]
                print(f"{name}: 수입 {len(mo['income'])}, 지출 {len(mo['expenses'])}")
            continue
        if "자산현황" in name:
            data["assets"]["summary"] = import_asset_summary(df)
            print(f"자산현황: {len(data['assets']['summary'])}항목")
        if name == "계좌현황":
            data["assets"]["accounts"] = import_accounts(df)
            bal = sum(a.get("balance", 0) for a in data["assets"]["accounts"])
            print(f"계좌: {len(data['assets']['accounts'])}건 (연동잔액 합 {bal:,})")
        if name == "적금관리":
            data["assets"]["savings"] = import_savings(df)
            print(f"적금: {len(data['assets']['savings'])}건")
        if "투자" in name:
            inv = import_investments(df)
            if inv:
                data["assets"]["investments"] = inv
                print(f"투자: 평가 {inv[0]['balance']:,}")
        if name == "부채관리":
            debts = import_debts(df)
            data["liabilities"]["debts"] = debts
            if debts and data["liabilities"]["loans"]:
                data["liabilities"]["loans"][0].update(
                    {"name": debts[0]["name"], "lender": debts[0]["institution"], "balance": debts[0]["balance"]}
                )
            print(f"부채: {len(debts)}건")

    for key, mo in settlement.items():
        if key not in data["months"]:
            data["months"][key] = mo

    out = ROOT / "import" / "ledger-imported.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"저장: {out}")
    print("앱 → 설정 → JSON 가져오기 또는 import.html")


if __name__ == "__main__":
    main()
