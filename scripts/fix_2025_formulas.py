import shutil
import openpyxl
from openpyxl.worksheet.formula import ArrayFormula

SRC = "ARCHIVED - Milfore Invitational 2025.xlsx"
DST = "ARCHIVED - Milfore Invitational 2025 - FIXED.xlsx"

shutil.copy(SRC, DST)

wb = openpyxl.load_workbook(DST, data_only=False)
fixed_count = 0
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for cell in row:
            v = cell.value
            if isinstance(v, ArrayFormula):
                if "_xludf." in v.text:
                    new_text = v.text.replace("_xludf.", "_xlfn.")
                    cell.value = ArrayFormula(ref=v.ref, text=new_text)
                    fixed_count += 1
            elif isinstance(v, str) and v.startswith("=") and "_xludf." in v:
                cell.value = v.replace("_xludf.", "_xlfn.")
                fixed_count += 1

print(f"Fixed {fixed_count} formulas")
wb.save(DST)
print(f"Saved {DST}")
