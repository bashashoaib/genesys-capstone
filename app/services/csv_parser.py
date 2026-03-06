import csv
import io
from dataclasses import dataclass

import phonenumbers


@dataclass
class CSVParseResult:
    valid_rows: list[dict]
    invalid_rows: list[dict]


def parse_contacts_csv(file_bytes: bytes) -> CSVParseResult:
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    required = {"name", "phone"}
    if not reader.fieldnames or not required.issubset({f.strip().lower() for f in reader.fieldnames}):
        raise ValueError("CSV must include name and phone headers")

    valid_rows = []
    invalid_rows = []

    for idx, row in enumerate(reader, start=2):
        name = (row.get("name") or row.get("Name") or "").strip()
        raw_phone = (row.get("phone") or row.get("Phone") or "").strip()
        normalized = normalize_phone(raw_phone)

        if not name or not normalized:
            invalid_rows.append({"row": idx, "name": name, "phone": raw_phone})
            continue

        valid_rows.append({"name": name, "phone": normalized})

    return CSVParseResult(valid_rows=valid_rows, invalid_rows=invalid_rows)


def normalize_phone(value: str) -> str | None:
    if not value:
        return None

    try:
        parsed = phonenumbers.parse(value, "US")
        if not phonenumbers.is_valid_number(parsed):
            return None
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        return None