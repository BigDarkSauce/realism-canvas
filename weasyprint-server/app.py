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

import os
import io
from flask import Flask, request, jsonify, send_file
from weasyprint import HTML

app = Flask(__name__)

PDF_SECRET = os.environ.get("PDF_SECRET", "")


@app.before_request
def _check_auth():
    if not PDF_SECRET:
        return  # no secret configured → open access
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {PDF_SECRET}":
        return jsonify({"error": "Unauthorized"}), 401


@app.route("/health")
def health():
    return "ok"


@app.route("/pdf", methods=["POST"])
def make_pdf():
    data = request.get_json(silent=True) or {}
    html = data.get("html", "")
    if not html:
        return jsonify({"error": "Missing 'html' field"}), 400

    try:
        pdf_bytes = HTML(string=html).write_pdf()
        buf = io.BytesIO(pdf_bytes)
        return send_file(buf, mimetype="application/pdf", download_name="export.pdf")
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
