# WeasyPrint PDF Server

A lightweight Flask server that converts HTML to PDF using WeasyPrint.

## Deploy to Railway

1. Push this folder to a GitHub repo (or use Railway CLI)
2. Create a new Railway project → "Deploy from GitHub"
3. Set environment variable `PDF_SECRET` to a random string (optional but recommended)
4. Railway auto-detects the Dockerfile and deploys
5. Copy the public URL (e.g. `https://your-app.up.railway.app`)

## Deploy to Render

1. Create a new "Web Service" on Render
2. Point to the repo/folder containing this Dockerfile
3. Set `PDF_SECRET` env var
4. Copy the public URL

## Deploy to Fly.io

```bash
cd weasyprint-server
fly launch
fly secrets set PDF_SECRET=your-secret-here
fly deploy
```

## Usage

```bash
curl -X POST https://your-server/pdf \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-here" \
  -d '{"html": "<h1>Hello World</h1>"}' \
  --output test.pdf
```
