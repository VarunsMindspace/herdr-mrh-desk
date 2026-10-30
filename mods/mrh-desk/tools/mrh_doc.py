# /// script
# requires-python = ">=3.11"
# dependencies = ["docxtpl>=0.17.1", "openpyxl>=3.1.5"]
# ///
"""MRH Desk's document generator.

    uv run --script mrh_doc.py build --mode deed --spec spec.json --out out/

Reads the desk's spec JSON and writes a real DOCX or XLSX. Prints one JSON
object. It never touches the network and never opens a user file for writing
outside --out.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime

from docx import Document
from docxtpl import DocxTemplate
from jinja2 import Environment
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter


def num(value):
    if value is None:
        return 0.0
    text = re.sub(r"[,\s\u20b9]", "", str(value))
    if text == "":
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def group_indian(whole):
    if len(whole) <= 3:
        return whole
    head, tail = whole[:-3], whole[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts) + "," + tail


def inr(value, decimals=0):
    n = num(value)
    text = f"{abs(n):.{decimals}f}"
    whole, _, frac = text.partition(".")
    return ("-" if n < 0 else "") + group_indian(whole) + ("." + frac if frac else "")


def rupees(value):
    return "\u20b9 " + inr(value)


def pct(value):
    n = num(value)
    decimals = 2 if n % 1 else 0
    return f"{inr(n, decimals)}%"


def out_path(out_dir, values, mode, extension):
    base = values.get("firm") or values.get("client") or values.get("entity") or mode
    slug = re.sub(r"[^A-Za-z0-9]+", "-", str(base)).strip("-")[:40] or mode
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return os.path.join(out_dir, f"{slug}-{stamp}.{extension}")


def page_setup(section):
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2.2)
    section.left_margin = Cm(2.4)
    section.right_margin = Cm(1.8)


def body(doc, text, justify=True, size=11, bold=False, italic=False, space_after=6):
    paragraph = doc.add_paragraph()
    if justify:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    paragraph.paragraph_format.space_after = Pt(space_after)
    run = paragraph.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.size = Pt(size)
    return paragraph


def heading(doc, text):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(12)
    paragraph.paragraph_format.space_after = Pt(6)
    run = paragraph.add_run(text.upper())
    run.bold = True
    run.font.size = Pt(11)
    return paragraph


def table(doc, headers, rows, widths=None):
    sheet = doc.add_table(rows=1, cols=len(headers))
    sheet.style = "Table Grid"
    for index, label in enumerate(headers):
        cell = sheet.rows[0].cells[index]
        cell.text = ""
        run = cell.paragraphs[0].add_run(label)
        run.bold = True
        run.font.size = Pt(9.5)
    for row in rows:
        cells = sheet.add_row().cells
        for index, value in enumerate(row):
            cells[index].text = ""
            run = cells[index].paragraphs[0].add_run(str(value))
            run.font.size = Pt(9.5)
    if widths:
        for row in sheet.rows:
            for index, width in enumerate(widths):
                row.cells[index].width = Cm(width)
    return sheet


def build_deed(values, out_dir, template=None):
    if template:
        partners = values.get("partners") or []
        context = dict(values)
        context["partners"] = partners
        context["clauses"] = values.get("clauses") or []
        context["total_capital"] = sum(num(p.get("capital")) for p in partners)
        context["total_share"] = sum(num(p.get("share")) for p in partners)
        environment = Environment()
        environment.filters["rupees"] = rupees
        environment.filters["inr"] = inr
        environment.filters["pct"] = pct
        tpl = DocxTemplate(template)
        tpl.render(context, environment, autoescape=True)
        path = out_path(out_dir, values, "deed", "docx")
        tpl.save(path)
        return path
    doc = Document()
    page_setup(doc.sections[0])
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(11)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(2)
    run = title.add_run("DEED OF PARTNERSHIP")
    run.bold = True
    run.font.size = Pt(16)

    firm = doc.add_paragraph()
    firm.alignment = WD_ALIGN_PARAGRAPH.CENTER
    firm.paragraph_format.space_after = Pt(14)
    run = firm.add_run(values.get("firm") or "Firm name")
    run.italic = True
    run.font.size = Pt(11.5)

    partners = values.get("partners") or []
    place = values.get("place") or "____________"
    date = values.get("execution_date") or "____________"
    body(doc, f"This Deed of Partnership is made at {place} on {date} between:")

    for index, partner in enumerate(partners, start=1):
        body(
            doc,
            f"{index}. {partner.get('name') or '____________'}, PAN {partner.get('pan') or '—'}, "
            f"contributing {rupees(partner.get('capital'))} as capital and sharing "
            f"{pct(partner.get('share'))} of the profit and loss.",
            space_after=4,
        )

    total_capital = sum(num(partner.get("capital")) for partner in partners)
    total_share = sum(num(partner.get("share")) for partner in partners)
    body(doc, f"Total capital: {rupees(total_capital)}. Profit share: {pct(total_share)}.")

    heading(doc, "1. Firm and business")
    body(doc, values.get("business") or "____________")
    interest = (values.get("interest") or "—").rstrip(".")
    body(
        doc,
        f"Duration: {values.get('duration') or 'At will'}. "
        f"Bank: {values.get('bank') or '—'}. "
        f"Interest on capital: {interest}.",
    )

    heading(doc, "2. Capital")
    table(
        doc,
        ["Partner", "PAN", "Capital", "Share"],
        [
            [
                partner.get("name") or "—",
                partner.get("pan") or "—",
                rupees(partner.get("capital")),
                pct(partner.get("share")),
            ]
            for partner in partners
        ],
        widths=[5.0, 3.6, 4.0, 3.0],
    )

    heading(doc, "3. Clauses")
    for index, clause in enumerate(values.get("clauses") or [], start=1):
        body(doc, f"{index}. {clause.get('text') or '____________'}", space_after=4)

    heading(doc, "4. Signatures")
    table(
        doc,
        ["Partner", "Signature", "Date"],
        [[partner.get("name") or "—", "________________", "____________"] for partner in partners],
        widths=[6.0, 6.0, 3.6],
    )
    body(doc, "Draft generated by MRH Desk. Review every clause before execution.", size=8.5, italic=True)

    footer = doc.sections[0].footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.text = f"{values.get('firm') or 'MRH'} · Draft"
    for run in footer.runs:
        run.font.size = Pt(8)

    path = out_path(out_dir, values, "deed", "docx")
    doc.save(path)
    return path


def sheet_heading(sheet, row, text):
    cell = sheet.cell(row=row, column=1, value=text)
    cell.font = Font(bold=True, size=12)


def build_projection(values, out_dir):
    workbook = Workbook()
    assumptions = workbook.active
    assumptions.title = "Assumptions"
    projection = workbook.create_sheet("Projection")

    years = int(max(1, min(10, round(num(values.get("years")) or 5))))

    assumptions["A1"] = "Assumption"
    assumptions["B1"] = "Value"
    assumptions["A1"].font = Font(bold=True)
    assumptions["B1"].font = Font(bold=True)
    rows = [
        ("Base revenue", num(values.get("base_revenue")), "#,##0"),
        ("Revenue growth", num(values.get("growth")) / 100, "0.0%"),
        ("EBITDA margin", num(values.get("ebitda_margin")) / 100, "0.0%"),
        ("Tax rate", num(values.get("tax_rate")) / 100, "0.00%"),
        ("Capex % of revenue", num(values.get("capex_pct")) / 100, "0.0%"),
        ("Depreciation % of revenue", num(values.get("depreciation_pct")) / 100, "0.0%"),
        ("Working capital days", num(values.get("wc_days")), "0"),
        ("Interest rate", num(values.get("interest_rate")) / 100, "0.0%"),
        ("Opening debt", num(values.get("debt")), "#,##0"),
        ("Years", years, "0"),
    ]
    for index, (label, value, fmt) in enumerate(rows, start=2):
        assumptions.cell(row=index, column=1, value=label)
        cell = assumptions.cell(row=index, column=2, value=value)
        cell.number_format = fmt
    assumptions.column_dimensions["A"].width = 32
    assumptions.column_dimensions["B"].width = 18

    labels = [
        "Revenue",
        "EBITDA",
        "Depreciation",
        "EBIT",
        "Interest",
        "Profit before tax",
        "Tax",
        "Profit after tax",
        "Capex",
        "Working capital",
        "Cash flow",
    ]
    projection["A1"] = "Particulars"
    projection["A1"].font = Font(bold=True)
    for column in range(2, years + 2):
        cell = projection.cell(row=1, column=column, value=f"Year {column - 1}")
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")
    for index, label in enumerate(labels, start=2):
        projection.cell(row=index, column=1, value=label)

    for column in range(2, years + 2):
        letter = get_column_letter(column)
        previous = get_column_letter(column - 1)
        if column == 2:
            projection[f"{letter}2"] = "=Assumptions!$B$2"
            projection[f"{letter}12"] = f"={letter}9+{letter}4-{letter}10-{letter}11"
        else:
            projection[f"{letter}2"] = f"={previous}2*(1+Assumptions!$B$3)"
            projection[f"{letter}12"] = f"={letter}9+{letter}4-{letter}10-({letter}11-{previous}11)"
        projection[f"{letter}3"] = f"={letter}2*Assumptions!$B$4"
        projection[f"{letter}4"] = f"={letter}2*Assumptions!$B$7"
        projection[f"{letter}5"] = f"={letter}3-{letter}4"
        projection[f"{letter}6"] = "=Assumptions!$B$9*Assumptions!$B$10"
        projection[f"{letter}7"] = f"={letter}5-{letter}6"
        projection[f"{letter}8"] = f"=MAX(0,{letter}7)*Assumptions!$B$5"
        projection[f"{letter}9"] = f"={letter}7-{letter}8"
        projection[f"{letter}10"] = f"={letter}2*Assumptions!$B$6"
        projection[f"{letter}11"] = f"={letter}2*Assumptions!$B$8/365"
        for row in range(2, 13):
            projection.cell(row=row, column=column).number_format = "#,##0;[Red](#,##0)"
            projection.cell(row=row, column=column).alignment = Alignment(horizontal="right")

    projection.column_dimensions["A"].width = 26
    for column in range(2, years + 2):
        projection.column_dimensions[get_column_letter(column)].width = 14
    projection.freeze_panes = "B2"
    projection.page_setup.orientation = "landscape"
    projection.page_setup.fitToWidth = 1
    projection.page_setup.fitToHeight = 0
    projection.sheet_properties.pageSetUpPr.fitToPage = True
    projection.print_area = f"A1:{get_column_letter(years + 1)}12"

    projection.cell(row=14, column=1, value=(
        "Working projection. Check the assumptions, tax treatment and opening balances before use."
    )).font = Font(italic=True, size=9)

    path = out_path(out_dir, values, "projection", "xlsx")
    workbook.save(path)
    return path


def build_provision(values, out_dir):
    workbook = Workbook()
    inputs = workbook.active
    inputs.title = "Inputs"
    computation = workbook.create_sheet("Computation")

    input_rows = [
        ("Entity", values.get("entity") or ""),
        ("Financial year", values.get("fy") or ""),
        ("Book profit", num(values.get("book_profit"))),
        ("Disallowed expenses", num(values.get("disallowed"))),
        ("Depreciation (books)", num(values.get("dep_book"))),
        ("Depreciation (income tax)", num(values.get("dep_tax"))),
        ("Tax rate %", num(values.get("tax_rate"))),
        ("Surcharge %", num(values.get("surcharge"))),
        ("Cess %", num(values.get("cess"))),
        ("MAT credit", num(values.get("mat_credit"))),
        ("Advance tax", num(values.get("advance_tax"))),
        ("TDS", num(values.get("tds"))),
    ]
    inputs["A1"] = "Input"
    inputs["B1"] = "Value"
    inputs["A1"].font = Font(bold=True)
    inputs["B1"].font = Font(bold=True)
    for index, (label, value) in enumerate(input_rows, start=2):
        inputs.cell(row=index, column=1, value=label)
        cell = inputs.cell(row=index, column=2, value=value)
        if isinstance(value, (int, float)) and label not in ("Tax rate %", "Surcharge %", "Cess %"):
            cell.number_format = "#,##0;[Red](#,##0)"
        if label in ("Tax rate %", "Surcharge %", "Cess %"):
            cell.number_format = "0.00"
    inputs.column_dimensions["A"].width = 32
    inputs.column_dimensions["B"].width = 20

    computation["A1"] = "Particulars"
    computation["B1"] = "Amount"
    computation["A1"].font = Font(bold=True)
    computation["B1"].font = Font(bold=True)
    lines = [
        ("Book profit", "=Inputs!B4"),
        ("Add: disallowed expenses", "=Inputs!B5"),
        ("Add: depreciation (books)", "=Inputs!B6"),
        ("Less: depreciation (income tax)", "=-Inputs!B7"),
        ("Taxable income", "=SUM(B2:B5)"),
        ("Normal tax (incl. surcharge and cess)", "=B6*(Inputs!B8/100)*(1+Inputs!B9/100)*(1+Inputs!B10/100)"),
        ("MAT (15% of book profit)", "=Inputs!B4*15%*(1+Inputs!B9/100)*(1+Inputs!B10/100)"),
        ("Tax payable (higher of the two)", "=MAX(B7,B8)"),
        ("Less: MAT credit, advance tax and TDS", "=Inputs!B11+Inputs!B12+Inputs!B13"),
        ("Net payable / (refund)", "=B9-B10"),
    ]
    for index, (label, formula) in enumerate(lines, start=2):
        computation.cell(row=index, column=1, value=label)
        cell = computation.cell(row=index, column=2, value=formula)
        cell.number_format = "#,##0;[Red](#,##0)"
    computation.column_dimensions["A"].width = 46
    computation.column_dimensions["B"].width = 20
    computation.cell(row=13, column=1, value=(
        "Working sheet only. Apply the entity's regime, surcharge thresholds and credits, and review the computation."
    )).font = Font(italic=True, size=9)

    path = out_path(out_dir, values, "provision", "xlsx")
    workbook.save(path)
    return path


def main():
    parser = argparse.ArgumentParser(description="MRH Desk document generator")
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("--mode", required=True, choices=["deed", "projection", "provision"])
    build.add_argument("--spec", required=True)
    build.add_argument("--out", required=True)
    build.add_argument("--template")
    args = parser.parse_args()

    try:
        with open(args.spec, encoding="utf-8") as handle:
            spec = json.load(handle)
        values = spec.get("values") or {}
        os.makedirs(args.out, exist_ok=True)
        if args.mode == "deed":
            path = build_deed(values, args.out, args.template)
        elif args.mode == "projection":
            path = build_projection(values, args.out)
        else:
            path = build_provision(values, args.out)
        print(json.dumps({"ok": True, "files": [os.path.abspath(path)]}))
        return 0
    except Exception as error:  # noqa: BLE001 - the desk shows this text
        print(json.dumps({"ok": False, "errors": [f"{type(error).__name__}: {error}"]}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
