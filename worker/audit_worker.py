"""
Vibe-Juri audit worker (opsional).

Worker Playwright untuk mengukur metrik yang tidak bisa dibaca dari HTML saja:
error JS konsol, responsif 375px, hierarki tipografi hasil render, dan jumlah
kartu dengan shadow/radius/transition.

Jalankan:
    pip install fastapi uvicorn playwright
    playwright install chromium
    uvicorn worker.audit_worker:app --host 127.0.0.1 --port 8000

Lalu set di .env.local:
    AUDIT_WORKER_URL=http://127.0.0.1:8000/audit
"""

from __future__ import annotations

import re
import secrets
import time
from urllib.parse import quote, urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from playwright.async_api import async_playwright
from pydantic import BaseModel

app = FastAPI(title="Vibe-Juri Audit Worker")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MVP_KEYWORDS = [
    "rp", "stok", "keranjang", "beli", "pesan", "detail", "promo",
    "diskon", "harga", "kategori", "daftar", "masuk", "kontak",
]
DUMMY_PATTERNS = ["apalah", "data contoh", "lorem ipsum", "testing", "dummy", "qwerty", "asdf"]

PROBE_PATHS = ["/admin", "/api/admin", "/api/users", "/api/config"]

SECRET_PATTERNS = [
    ("Google API key", r"AIza[0-9A-Za-z_\-]{35}"),
    ("Stripe secret key", r"sk_(?:live|test)_[0-9A-Za-z]{16,}"),
    ("AWS access key", r"AKIA[0-9A-Z]{16}"),
    ("GitHub token", r"gh[pousr]_[0-9A-Za-z]{36,}"),
    ("Slack token", r"xox[baprs]-[0-9A-Za-z-]{10,}"),
    ("Private key block", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----"),
    ("Supabase service_role", r"service_role"),
    (
        "Kredensial hardcoded",
        r"(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*[\"'][A-Za-z0-9_\-]{16,}[\"']",
    ),
]


def _looks_like_env(body: str) -> bool:
    if "<html" in body[:300].lower():
        return False
    return len(body) < 20000 and bool(re.search(r"(?m)^[A-Z][A-Z0-9_]{2,}\s*=", body))


def _looks_like_git(body: str) -> bool:
    return bool(re.search(r"\[core\]|repositoryformatversion|\[remote\s", body, re.I))


def _scan_secrets(text: str, found: set[str]) -> None:
    for name, pattern in SECRET_PATTERNS:
        if name not in found and re.search(pattern, text):
            found.add(name)


async def run_security_probes(
    context,
    page_url: str,
    html: str,
    home_title: str | None,
) -> dict:
    parsed = urlparse(page_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    home_len = len(html)
    exposed_files: list[str] = []
    exposed_secrets: set[str] = set()

    async def get(url: str):
        try:
            resp = await context.request.get(
                url, timeout=6000, max_redirects=0, fail_on_status_code=False
            )
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, await resp.text()
        except Exception:  # noqa: BLE001
            return None, {}, ""

    for path, detector in (("/.env", _looks_like_env), ("/.git/config", _looks_like_git)):
        status, _headers, body = await get(origin + path)
        if status == 200 and detector(body):
            exposed_files.append(path)

    _scan_secrets(html, exposed_secrets)
    script_srcs = re.findall(r"""<script[^>]+src=["']([^"']+)["']""", html)
    for src in script_srcs:
        if src.startswith("//"):
            continue
        if src.startswith("http"):
            if urlparse(src).netloc != parsed.netloc:
                continue
            full = src
        else:
            full = origin + ("" if src.startswith("/") else "/") + src
        status, _headers, body = await get(full)
        if status == 200:
            _scan_secrets(body[:500000], exposed_secrets)
        if len(exposed_secrets) >= len(SECRET_PATTERNS):
            break

    marker = "vjPROBE" + secrets.token_hex(4)
    payload = f"{marker}<vj>"
    separator = "&" if parsed.query else "?"
    status, _headers, body = await get(page_url + separator + "__vibe_probe=" + quote(payload))
    xss_probes = 0 if status is None else 1
    xss_reflected = bool(status is not None and payload in body)

    paths_probed = 0
    paths_guarded = 0
    paths_open: list[str] = []
    for path in PROBE_PATHS:
        status, headers, body = await get(origin + path)
        if status is None:
            continue
        paths_probed += 1
        if status in (401, 403) or 300 <= status < 400:
            paths_guarded += 1
        elif status == 200:
            content_type = headers.get("content-type", "").lower()
            if "json" in content_type:
                paths_open.append(path)
                continue
            title_match = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
            title = title_match.group(1).strip() if title_match else None
            if title == home_title and abs(len(body) - home_len) < 300:
                continue
            paths_open.append(path)

    return {
        "exposedFiles": exposed_files,
        "exposedSecrets": sorted(exposed_secrets),
        "xssReflected": xss_reflected,
        "xssProbes": xss_probes,
        "pathsProbed": paths_probed,
        "pathsGuarded": paths_guarded,
        "pathsOpen": paths_open,
    }


MEASURE_JS = """
() => {
  let realRasterPhotos = 0;
  let svgIllustrations = document.querySelectorAll('svg').length;

  document.querySelectorAll('img').forEach((img) => {
    const rect = img.getBoundingClientRect();
    const src = (img.currentSrc || img.src || '').toLowerCase();
    const isVector = src.includes('.svg') || src.startsWith('data:image/svg');
    if (img.complete && img.naturalWidth > 80 && rect.width >= 80 && rect.height >= 80) {
      if (isVector) svgIllustrations += 1;
      else realRasterPhotos += 1;
    }
  });

  document.querySelectorAll('div, section, figure, article').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width >= 100 && rect.height >= 100) {
      const bg = window.getComputedStyle(el).backgroundImage || '';
      if (bg.includes('url(') && !bg.includes('.svg') && !bg.includes('data:image/svg')) {
        realRasterPhotos += 1;
      }
    }
  });

  const bodyFontSize = parseFloat(window.getComputedStyle(document.body).fontSize) || 16;
  let maxHeadingSize = 0;
  document.querySelectorAll('h1, h2, h3').forEach((h) => {
    const size = parseFloat(window.getComputedStyle(h).fontSize) || 0;
    if (size > maxHeadingSize) maxHeadingSize = size;
  });

  const hasNav = !!document.querySelector('nav, header, aside, [class*="nav"], [class*="sidebar"]');
  const hasFooter = !!document.querySelector('footer, [class*="footer"]');
  const hasSearchOrFilter =
    document.querySelectorAll('input[type="search"], input[type="text"], select').length > 0;

  let polishedCards = 0;
  document.querySelectorAll('div, article, section, button, a').forEach((el) => {
    const st = window.getComputedStyle(el);
    const hasShadow = st.boxShadow && st.boxShadow !== 'none';
    const hasRadius = parseFloat(st.borderRadius) >= 6;
    const hasTransition = st.transitionDuration && st.transitionDuration !== '0s';
    if ((hasShadow || hasRadius) && hasTransition) polishedCards += 1;
  });

  return {
    realRasterPhotos,
    svgIllustrations,
    hasGoodTypography: maxHeadingSize >= bodyFontSize * 1.35,
    hasNav,
    hasFooter,
    hasSearchOrFilter,
    polishedCards,
    interactiveCount: document.querySelectorAll(
      'button, a, input, select, textarea, form, [role="button"]'
    ).length,
    inputCount: document.querySelectorAll('input, select, textarea, form').length,
    hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
  };
}
"""


class AuditRequest(BaseModel):
    url: str


async def audit_url(url: str) -> dict:
    started = time.time()
    result: dict = {
        "url": url,
        "statusCode": None,
        "loadTimeSeconds": None,
        "rasterImages": None,
        "svgImages": None,
        "responsive": None,
        "securityHeaders": [],
        "consoleErrors": None,
        "testedAt": None,
        "title": None,
        "textLength": None,
        "mvpSignals": None,
        "priceMentions": None,
        "interactiveCount": None,
        "inputCount": None,
        "polishedCards": None,
        "hasNav": None,
        "hasFooter": None,
        "hasSearch": None,
        "hasViewportMeta": None,
        "typography": None,
        "hasDummyText": None,
        "httpsEnabled": None,
        "exposedFiles": None,
        "exposedSecrets": None,
        "xssReflected": None,
        "xssProbes": None,
        "pathsProbed": None,
        "pathsGuarded": None,
        "pathsOpen": None,
        "locked": None,
        "platformError": None,
        "error": None,
    }

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(ignore_https_errors=True)
        page = await context.new_page()
        console_errors: list[str] = []
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        try:
            await page.set_viewport_size({"width": 1366, "height": 768})
            response = await page.goto(url, wait_until="networkidle", timeout=25000)
            await page.wait_for_timeout(1200)
            result["loadTimeSeconds"] = round(time.time() - started, 2)

            status = response.status if response else 0
            result["statusCode"] = status
            result["securityHeaders"] = [
                header.lower()
                for header in (response.headers if response else {})
                if header.lower()
                in {
                    "content-security-policy",
                    "x-content-type-options",
                    "x-frame-options",
                    "strict-transport-security",
                    "referrer-policy",
                    "permissions-policy",
                }
            ]
            result["consoleErrors"] = len(console_errors)

            if status == 0 or status >= 400:
                result["error"] = f"HTTP Error {status} (halaman gagal dimuat)"
                return result

            title = await page.title()
            body_text = await page.evaluate("() => document.body.innerText.trim()")
            result["title"] = title or "(Tanpa Judul)"

            if "Login – Vercel" in title or "Authentication Required" in body_text:
                result["locked"] = True
                result["error"] = "Deployment terkunci autentikasi Vercel"
                return result

            if any(
                marker in body_text
                for marker in ("DEPLOYMENT_NOT_FOUND", "404: NOT_FOUND", "Application failed to respond")
            ):
                result["platformError"] = True
                result["error"] = "Deployment tidak aktif atau error di hosting"
                return result

            metrics = await page.evaluate(MEASURE_JS)
            text_lower = body_text.lower()

            result.update(
                {
                    "rasterImages": metrics["realRasterPhotos"],
                    "svgImages": metrics["svgIllustrations"],
                    "interactiveCount": metrics["interactiveCount"],
                    "inputCount": metrics["inputCount"],
                    "polishedCards": metrics["polishedCards"],
                    "hasNav": metrics["hasNav"],
                    "hasFooter": metrics["hasFooter"],
                    "hasSearch": metrics["hasSearchOrFilter"],
                    "hasViewportMeta": metrics["hasViewportMeta"],
                    "typography": "Baik" if metrics["hasGoodTypography"] else "Datar",
                    "textLength": len(body_text),
                    "mvpSignals": sum(1 for kw in MVP_KEYWORDS if kw in text_lower),
                    "priceMentions": text_lower.count("rp"),
                    "hasDummyText": any(pattern in text_lower for pattern in DUMMY_PATTERNS),
                    "locked": False,
                    "platformError": False,
                }
            )

            result["httpsEnabled"] = page.url.startswith("https://")
            try:
                html = await page.content()
                probes = await run_security_probes(context, page.url, html, title or None)
                result.update(probes)
            except Exception:  # noqa: BLE001
                # Audit inti tetap valid walau probe keamanan gagal.
                result["httpsEnabled"] = result.get("httpsEnabled")
                result.setdefault("exposedFiles", [])
                result.setdefault("exposedSecrets", [])
                result.setdefault("xssProbes", 0)
                result.setdefault("pathsProbed", 0)

            await page.set_viewport_size({"width": 375, "height": 812})
            await page.wait_for_timeout(400)
            result["responsive"] = await page.evaluate(
                "() => document.documentElement.scrollWidth <= window.innerWidth + 5"
            )
            return result
        except Exception as exc:  # noqa: BLE001
            result["error"] = f"Timeout / gagal diakses: {str(exc)[:120]}"
            result["consoleErrors"] = len(console_errors)
            return result
        finally:
            result["testedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            await page.close()
            await context.close()
            await browser.close()


@app.post("/audit")
async def audit(payload: AuditRequest):
    return {"ok": True, "audit": await audit_url(payload.url)}


@app.get("/")
async def health():
    return {"ok": True, "service": "vibe-juri-audit-worker"}
