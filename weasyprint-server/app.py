"""
Lightweight WeasyPrint PDF server.
Deploy on Railway / Render / Fly.io.

Endpoints:
  POST /pdf   — accepts JSON { "html": "<html>…</html>" }
               — returns the PDF as application/pdf bytes

Install:
  pip install flask weasyprint gunicorn

Run locally:
  gunicorn app:app -b 0.0.0.0:8080

Environment variables:
  PDF_SECRET  — optional shared secret; if set, requests must send
                Authorization: Bearer <PDF_SECRET>
"""

import hashlib
import hmac
import os
import time
from flask import Flask, request, jsonify, make_response, send_file
from weasyprint import HTML

app = Flask(__name__)

PDF_SECRET = os.environ.get("PDF_SECRET", "")


def _cors_headers(response):
    origin = request.headers.get("Origin")
    allow_origin = origin or "*"
    response.headers["Access-Control-Allow-Origin"] = allow_origin
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Lovable-Timestamp, X-Lovable-Signature"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Vary"] = "Origin"
    return response


def _verify_signature():
    if not PDF_SECRET:
        return None

    auth = request.headers.get("Authorization", "")
    if auth == f"Bearer {PDF_SECRET}":
        return None

    timestamp = request.headers.get("X-Lovable-Timestamp", "")
    signature = request.headers.get("X-Lovable-Signature", "")
    if not timestamp or not signature:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        ts = int(timestamp)
    except ValueError:
        return jsonify({"error": "Invalid timestamp"}), 401

    if abs(int(time.time()) - ts) > 300:
        return jsonify({"error": "Expired signature"}), 401

    body = request.get_data(cache=True) or b""
    payload = timestamp.encode("utf-8") + b"." + body
    expected = hmac.new(PDF_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return jsonify({"error": "Invalid signature"}), 401

    return None


@app.before_request
def _check_auth():
    if request.method == "OPTIONS":
        return _cors_headers(make_response("", 204))
    if request.path == "/health":
        return None
    auth_error = _verify_signature()
    if auth_error is not None:
        return _cors_headers(auth_error)


@app.route("/health")
def health():
    return _cors_headers(make_response("ok", 200))


@app.route("/pdf", methods=["POST"])
def make_pdf():
    data = request.get_json(silent=True) or {}
    html = data.get("html", "")
    if not html:
        return jsonify({"error": "Missing 'html' field"}), 400

    try:
        pdf_bytes = HTML(string=html).write_pdf()
        response = make_response(pdf_bytes)
        response.headers["Content-Type"] = "application/pdf"
        response.headers["Content-Disposition"] = 'attachment; filename="export.pdf"'
        return _cors_headers(response)
    except Exception as exc:
        return _cors_headers(jsonify({"error": str(exc)})), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
