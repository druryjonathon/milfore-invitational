"""Low-level cell-grid helpers shared by the per-year extractors."""


def col_letter_to_index(letter):
    idx = 0
    for ch in letter:
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx


def read_row_values(ws, row, start_col, n_cols):
    """start_col: 1-based column index. Returns list of n_cols raw cell values."""
    return [ws.cell(row=row, column=start_col + i).value for i in range(n_cols)]


def read_numeric_row(ws, row, start_col, n_cols):
    """Like read_row_values but coerces to int/float, None for anything non-numeric
    (blank, text labels, #REF!/#NAME? error strings, etc)."""
    out = []
    for v in read_row_values(ws, row, start_col, n_cols):
        if isinstance(v, (int, float)):
            out.append(v)
        else:
            out.append(None)
    return out


def is_numeric(v):
    return isinstance(v, (int, float))
