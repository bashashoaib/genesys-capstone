import pytest

from app.services.csv_parser import normalize_phone, parse_contacts_csv


def test_normalize_phone_valid_us_number():
    assert normalize_phone("(415) 555-2671") == "+14155552671"


def test_parse_contacts_csv_rejects_bad_header():
    with pytest.raises(ValueError):
        parse_contacts_csv(b"fullname,number\nA,+14155552671")


def test_parse_contacts_csv_splits_valid_and_invalid():
    csv_data = b"name,phone\nAlice,+14155552671\nBob,invalid"
    result = parse_contacts_csv(csv_data)
    assert len(result.valid_rows) == 1
    assert len(result.invalid_rows) == 1