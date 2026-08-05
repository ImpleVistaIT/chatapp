from __future__ import annotations


def get_po_status(po_number: str) -> dict[str, str]:
    return {"po": po_number, "status": "Approved", "vendor": "ABC Company"}


def get_invoice_status(invoice_number: str) -> dict[str, str]:
    return {"invoice": invoice_number, "status": "Posted", "company_code": "1000"}


def get_vendor_details(vendor_id: str) -> dict[str, str]:
    return {"vendor": vendor_id, "name": "ABC Company", "city": "Bangalore"}


def get_goods_receipt_status(gr_number: str) -> dict[str, str]:
    return {"goods_receipt": gr_number, "status": "Completed"}
