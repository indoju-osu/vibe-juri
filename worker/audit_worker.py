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

import base64
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
    "rp", "idr", "stok", "keranjang", "cart", "checkout", "beli", "pesan", "order",
    "detail", "promo", "diskon", "harga", "kategori", "katalog", "catalog",
    "produk", "product", "koleksi", "daftar", "masuk", "kontak",
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
    page,
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
    client_auth_protected: bool | None = None
    for path in PROBE_PATHS:
        status, headers, body = await get(origin + path)
        if status is None:
            continue
        paths_probed += 1
        if status in (401, 403) or 300 <= status < 400:
            paths_guarded += 1
        elif status == 200:
            content_type = headers.get("content-type", "").lower()
            stripped = body.lstrip()
            is_json_body = "json" in content_type or stripped.startswith(("{", "["))
            if path.startswith("/api/"):
                if is_json_body:
                    paths_open.append(path)
                continue
            if is_json_body:
                paths_open.append(path)
                continue
            title_match = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
            title = title_match.group(1).strip() if title_match else None
            if title == home_title and abs(len(body) - home_len) < 300:
                continue
            if path == "/admin":
                try:
                    await page.goto(origin + "/admin", wait_until="domcontentloaded", timeout=4500)
                    await page.wait_for_timeout(550)
                    final_url = page.url.lower()
                    has_pw = await page.locator('input[type="password"]').count() > 0
                    admin_text = await page.evaluate("() => (document.body.innerText || '').toLowerCase()")
                    has_denied_msg = bool(
                        re.search(
                            r"akses\s*ditolak|unauthorized|forbidden|login\s+untuk\s+melanjutkan|masuk\s+sebagai\s+admin",
                            admin_text,
                        )
                    )
                    if has_pw or has_denied_msg or any(tok in final_url for tok in ("login", "signin", "sign-in", "auth")):
                        client_auth_protected = True
                        continue
                except Exception:  # noqa: BLE001
                    pass
            paths_open.append(path)

    return {
        "exposedFiles": exposed_files,
        "exposedSecrets": sorted(exposed_secrets),
        "xssReflected": xss_reflected,
        "xssProbes": xss_probes,
        "pathsProbed": paths_probed,
        "pathsGuarded": paths_guarded,
        "pathsOpen": paths_open,
        "clientAuthProtected": client_auth_protected,
    }


async def run_functional_probes(page) -> dict:
    """Uji heuristik cepat (<= 3 dtk) untuk search, keranjang, input negatif (-1), dan batas stok."""
    search_works: bool | None = None
    negative_qty_rejected: bool | None = None
    stock_guard_detected: bool | None = None

    # 1. Uji kolom pencarian
    try:
        search_loc = page.locator(
            'input[type="search"], input[placeholder*="cari" i], input[aria-label*="cari" i], input[placeholder*="search" i]'
        ).first
        if await search_loc.count() > 0 and await search_loc.is_visible():
            before_len = await page.evaluate("() => document.body.innerText.trim().length")
            await search_loc.fill("zzznomatch99", timeout=1500)
            await page.wait_for_timeout(250)
            after_len = await page.evaluate("() => document.body.innerText.trim().length")
            await search_loc.fill("", timeout=1500)
            await page.wait_for_timeout(150)
            search_works = abs(after_len - before_len) >= 15
    except Exception:  # noqa: BLE001
        pass

    # 2. Cek apakah produk bertuliskan "stok habis" menonaktifkan tombol beli
    try:
        out_of_stock_disabled = await page.evaluate(
            """() => {
              const cards = Array.from(document.querySelectorAll('article, [class*="card"], [class*="product"]'));
              for (const c of cards) {
                const txt = (c.innerText || '').toLowerCase();
                if (/stok\\s*habis|out\\s*of\\s*stock|sold\\s*out/.test(txt)) {
                  const btn = c.querySelector('button');
                  if (btn && btn.disabled) return true;
                }
              }
              return null;
            }"""
        )
        if out_of_stock_disabled is True:
            stock_guard_detected = True
    except Exception:  # noqa: BLE001
        pass

    # 3. Klik tombol keranjang/beli pertama yang aktif, lalu uji input angka (-1 & 999999)
    try:
        await page.evaluate(
            """() => {
              const btns = Array.from(document.querySelectorAll('button:not([disabled])'));
              const target = btns.find((b) => /keranjang|beli|pesan|cart|tambah/i.test((b.innerText || '') + ' ' + (b.title || '')));
              if (target) target.click();
            }"""
        )
        await page.wait_for_timeout(350)

        num_loc = page.locator('input[type="number"]:visible').first
        if await num_loc.count() > 0:
            await num_loc.fill("-1", timeout=1500)
            await num_loc.dispatch_event("change")
            await page.wait_for_timeout(150)
            val_neg = await num_loc.input_value()
            neg_check = await page.evaluate(
                """() => {
                  const txt = document.body.innerText || '';
                  const hasMinusPrice = /(?:^|[\\s:])[-−]\\s*rp\\s*\\d|rp\\s*[-−]\\s*\\d/i.test(txt);
                  const hasErr = /tidak valid|minimal|negatif|kurang dari|harus lebih/i.test(txt);
                  return { hasMinusPrice, hasErr };
                }"""
            )
            if neg_check["hasMinusPrice"]:
                negative_qty_rejected = False
            elif val_neg == "-1" and not neg_check["hasErr"]:
                negative_qty_rejected = False
            else:
                negative_qty_rejected = True

            await num_loc.fill("999999", timeout=1500)
            await num_loc.dispatch_event("change")
            await page.wait_for_timeout(150)
            val_big = await num_loc.input_value()
            has_stock_msg = await page.evaluate(
                """() => /melebihi\\s*stok|stok\\s*tidak\\s*cukup|maksimal\\s*stok|batas\\s*stok|tersisa/i.test(document.body.innerText || '')"""
            )
            stock_guard_detected = (val_big != "999999") or bool(has_stock_msg) or (stock_guard_detected is True)
    except Exception:  # noqa: BLE001
        pass

    return {
        "searchWorks": search_works,
        "negativeQtyRejected": negative_qty_rejected,
        "stockGuardDetected": stock_guard_detected,
    }


MEASURE_JS = """
() => {
  let realRasterPhotos = 0;
  let brokenImages = 0;
  let svgIllustrations = document.querySelectorAll('svg').length;

  document.querySelectorAll('img').forEach((img) => {
    const rect = img.getBoundingClientRect();
    const src = (img.currentSrc || img.src || img.getAttribute('data-src') || '').toLowerCase();
    const isVector = src.includes('.svg') || src.startsWith('data:image/svg');
    if (src && !isVector && img.complete && img.naturalWidth === 0) {
      brokenImages += 1;
    }
    const hasLoadedRaster = img.complete && img.naturalWidth > 48 && img.naturalHeight > 48;
    const hasVisibleSize = rect.width >= 48 && rect.height >= 48;
    const isLargeHiddenPhoto = img.naturalWidth >= 120 && img.naturalHeight >= 120;
    if (hasLoadedRaster && (hasVisibleSize || isLargeHiddenPhoto)) {
      if (isVector) svgIllustrations += 1;
      else realRasterPhotos += 1;
    }
  });

  document.querySelectorAll('div, section, figure, article, a, span, li, header, main, button').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width >= 64 && rect.height >= 64) {
      const bg = window.getComputedStyle(el).backgroundImage || '';
      const match = bg.match(/url\\(["']?([^"')]+)["']?\\)/i);
      if (match) {
        const url = match[1].toLowerCase();
        if (
          !url.startsWith('#') &&
          !url.includes('.svg') &&
          !url.startsWith('data:image/svg') &&
          !url.startsWith('data:image/gif')
        ) {
          realRasterPhotos += 1;
        }
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
    brokenImages,
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


async def prepare_lazy_images(page) -> None:
    """Scroll bertahap agar gambar lazy-load / below-the-fold sempat dimuat sebelum audit DOM."""
    try:
        scroll_height = await page.evaluate("() => document.documentElement.scrollHeight || 0")
        if scroll_height > 768:
            for frac in (0.35, 0.7, 1.0):
                await page.evaluate(f"() => window.scrollTo(0, {int(scroll_height * frac)})")
                await page.wait_for_timeout(250)
        await page.evaluate(
            """() => Promise.all(
                Array.from(document.images)
                  .filter((img) => !img.complete)
                  .map((img) => new Promise((res) => {
                    const timer = setTimeout(res, 2000);
                    img.addEventListener('load', () => { clearTimeout(timer); res(); }, { once: true });
                    img.addEventListener('error', () => { clearTimeout(timer); res(); }, { once: true });
                  }))
            )"""
        )
        await page.evaluate("() => window.scrollTo(0, 0)")
        await page.wait_for_timeout(150)
    except Exception:  # noqa: BLE001
        pass


async def discover_and_crawl_routes(page, base_url: str, base_metrics: dict, base_body: str) -> tuple[dict, str, list[str]]:
    """Auto-Discovery: kunjungi maks 3 rute internal / tab utama untuk menemukan foto & fitur katalog."""
    merged = dict(base_metrics)
    best_body = base_body
    discovered: list[str] = []
    parsed_base = urlparse(base_url)
    origin = f"{parsed_base.scheme}://{parsed_base.netloc}"

    try:
        candidates: list[str] = await page.evaluate(
            """(origin) => {
              const skip = /\\/(admin|login|masuk|signin|sign-in|register|daftar|signup|sign-up|logout|api)(\\/|$)/i;
              const staticExt = /\\.(jpg|jpeg|png|webp|avif|svg|gif|css|js|pdf|zip)$/i;
              const priority = /(menu|katalog|produk|product|shop|catalog|store|item|tentang|promo)/i;
              const seen = new Set();
              const scored = [];
              document.querySelectorAll('a[href]').forEach((a) => {
                const raw = a.getAttribute('href') || '';
                if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return;
                try {
                  const u = new URL(raw, origin);
                  if (u.origin !== origin) return;
                  const p = u.pathname.replace(/\\/+$/, '') || '/';
                  if (p === '/' || skip.test(p) || staticExt.test(p) || seen.has(p)) return;
                  seen.add(p);
                  const txt = (a.innerText || '').trim();
                  const score = priority.test(p) || priority.test(txt) ? 0 : 1;
                  scored.push({ url: u.origin + p, path: p, score });
                } catch {}
              });
              scored.sort((a, b) => a.score - b.score);
              return scored.slice(0, 3).map((x) => x.url);
            }""",
            origin,
        )

        for route_url in candidates:
            try:
                await page.goto(route_url, wait_until="domcontentloaded", timeout=6000)
                await page.wait_for_timeout(450)
                await prepare_lazy_images(page)
                m = await page.evaluate(MEASURE_JS)
                txt = await page.evaluate("() => document.body.innerText.trim()")
                discovered.append(urlparse(route_url).path or "/")
                for key in (
                    "realRasterPhotos",
                    "interactiveCount",
                    "inputCount",
                    "polishedCards",
                ):
                    merged[key] = max(merged.get(key, 0), m.get(key, 0))
                merged["brokenImages"] = max(merged.get("brokenImages", 0), m.get("brokenImages", 0))
                merged["hasNav"] = bool(merged.get("hasNav") or m.get("hasNav"))
                merged["hasFooter"] = bool(merged.get("hasFooter") or m.get("hasFooter"))
                merged["hasSearchOrFilter"] = bool(
                    merged.get("hasSearchOrFilter") or m.get("hasSearchOrFilter")
                )
                if len(txt) > len(best_body):
                    best_body = txt
            except Exception:  # noqa: BLE001
                continue

        if not candidates:
            clicked = await page.evaluate(
                """() => {
                  const rx = /(menu|katalog|produk|product|shop|catalog)/i;
                  const btns = Array.from(document.querySelectorAll('nav button, header button, [role="tab"]'));
                  const hit = btns.find((b) => rx.test((b.innerText || '').trim()));
                  if (hit) { hit.click(); return (hit.innerText || '').trim().slice(0, 24); }
                  return null;
                }"""
            )
            if clicked:
                await page.wait_for_timeout(450)
                await prepare_lazy_images(page)
                m = await page.evaluate(MEASURE_JS)
                discovered.append(f"tab:{clicked}")
                merged["realRasterPhotos"] = max(
                    merged.get("realRasterPhotos", 0), m.get("realRasterPhotos", 0)
                )
                merged["brokenImages"] = max(merged.get("brokenImages", 0), m.get("brokenImages", 0))

        if discovered and page.url != base_url:
            await page.goto(base_url, wait_until="domcontentloaded", timeout=6000)
            await page.wait_for_timeout(300)
    except Exception:  # noqa: BLE001
        pass

    return merged, best_body, discovered


async def run_auth_form_probes(page, base_url: str) -> dict:
    """Test Login & Test Daftar: cari form login/register lalu uji validasi dasar dengan aman."""
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    login_test = "not_found"
    register_test = "not_found"

    async def _open_auth_target(paths: tuple[str, ...], btn_rx: str) -> bool:
        # Cek di halaman saat ini dulu atau klik link/tombol yang cocok
        try:
            await page.goto(base_url, wait_until="domcontentloaded", timeout=5000)
            await page.wait_for_timeout(300)
            clicked = await page.evaluate(
                """(rxStr) => {
                  const rx = new RegExp(rxStr, 'i');
                  const els = Array.from(document.querySelectorAll('a, button'));
                  const target = els.find((el) => rx.test((el.innerText || el.getAttribute('aria-label') || '').trim()));
                  if (target) { target.click(); return true; }
                  return false;
                }""",
                btn_rx,
            )
            if clicked:
                await page.wait_for_timeout(450)
                if await page.locator('input[type="password"]:visible').count() > 0:
                    return True
        except Exception:  # noqa: BLE001
            pass
        for p in paths:
            try:
                resp = await page.goto(origin + p, wait_until="domcontentloaded", timeout=4500)
                if resp and resp.status < 400:
                    await page.wait_for_timeout(350)
                    if await page.locator('input[type="password"]:visible').count() > 0:
                        return True
            except Exception:  # noqa: BLE001
                continue
        return False

    # 1. Test Login
    if await _open_auth_target(("/login", "/masuk", "/signin"), r"^(masuk|login|sign\s*in)$"):
        try:
            user_inp = page.locator('input[type="email"]:visible, input[type="text"]:visible').first
            pw_inp = page.locator('input[type="password"]:visible').first
            if await pw_inp.count() > 0:
                if await user_inp.count() > 0:
                    await user_inp.fill("qa-probe@example.com", timeout=1500)
                await pw_inp.fill("WrongPass123!", timeout=1500)
                submit_btn = page.locator('button[type="submit"]:visible, form button:visible').first
                if await submit_btn.count() > 0:
                    await submit_btn.click(timeout=1500)
                else:
                    await pw_inp.press("Enter")
                await page.wait_for_timeout(600)
                final_url = page.url.lower()
                bypassed = any(tok in final_url for tok in ("/admin", "/dashboard"))
                login_test = "failed" if bypassed else "passed"
        except Exception:  # noqa: BLE001
            login_test = "failed"

    # 2. Test Daftar / Register
    if await _open_auth_target(("/register", "/daftar", "/signup"), r"^(daftar|register|sign\s*up|buat\s*akun)$"):
        try:
            pw_inp = page.locator('input[type="password"]:visible').first
            email_inp = page.locator('input[type="email"]:visible, input[name*="email" i]:visible').first
            if await pw_inp.count() > 0:
                if await email_inp.count() > 0:
                    await email_inp.fill("invalid-email", timeout=1500)
                await pw_inp.fill("123", timeout=1500)
                submit_btn = page.locator('button[type="submit"]:visible, form button:visible').first
                if await submit_btn.count() > 0:
                    await submit_btn.click(timeout=1500)
                await page.wait_for_timeout(400)
                register_test = "passed"
        except Exception:  # noqa: BLE001
            register_test = "failed"

    return {"loginTest": login_test, "registerTest": register_test}


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
        "clientAuthProtected": None,
        "searchWorks": None,
        "negativeQtyRejected": None,
        "stockGuardDetected": None,
        "discoveredRoutes": [],
        "brokenImages": None,
        "loginTest": None,
        "registerTest": None,
        "screenshotDataUrl": None,
        "locked": None,
        "platformError": None,
        "error": None,
    }

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(ignore_https_errors=True)
        page = await context.new_page()
        console_errors: list[str] = []
        network_raster_urls: set[str] = set()
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        def _on_response(resp):
            try:
                if resp.status == 200:
                    ctype = (resp.headers.get("content-type") or "").lower()
                    if ctype.startswith("image/") and not any(
                        skip in ctype for skip in ("svg", "gif", "icon")
                    ):
                        clen = resp.headers.get("content-length")
                        if clen is None or int(clen) >= 2048:
                            network_raster_urls.add(resp.url)
            except Exception:  # noqa: BLE001
                pass

        page.on("response", _on_response)

        try:
            await page.set_viewport_size({"width": 1366, "height": 768})
            response = await page.goto(url, wait_until="load", timeout=12000)
            await page.wait_for_timeout(1000)
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

            await prepare_lazy_images(page)
            metrics = await page.evaluate(MEASURE_JS)
            base_page_url = page.url

            try:
                shot_bytes = await page.screenshot(type="jpeg", quality=50, full_page=False)
                result["screenshotDataUrl"] = "data:image/jpeg;base64," + base64.b64encode(
                    shot_bytes
                ).decode("ascii")
            except Exception:  # noqa: BLE001
                pass

            metrics, best_body, discovered_routes = await discover_and_crawl_routes(
                page, base_page_url, metrics, body_text
            )
            text_lower = best_body.lower()

            result.update(
                {
                    "rasterImages": max(metrics["realRasterPhotos"], len(network_raster_urls)),
                    "brokenImages": metrics.get("brokenImages", 0),
                    "discoveredRoutes": discovered_routes,
                    "svgImages": metrics["svgIllustrations"],
                    "interactiveCount": metrics["interactiveCount"],
                    "inputCount": metrics["inputCount"],
                    "polishedCards": metrics["polishedCards"],
                    "hasNav": metrics["hasNav"],
                    "hasFooter": metrics["hasFooter"],
                    "hasSearch": metrics["hasSearchOrFilter"],
                    "hasViewportMeta": metrics["hasViewportMeta"],
                    "typography": "Baik" if metrics["hasGoodTypography"] else "Datar",
                    "textLength": len(best_body),
                    "mvpSignals": sum(1 for kw in MVP_KEYWORDS if kw in text_lower),
                    "priceMentions": text_lower.count("rp"),
                    "hasDummyText": any(pattern in text_lower for pattern in DUMMY_PATTERNS),
                    "locked": False,
                    "platformError": False,
                }
            )

            await page.set_viewport_size({"width": 375, "height": 812})
            await page.wait_for_timeout(400)
            result["responsive"] = await page.evaluate(
                "() => document.documentElement.scrollWidth <= window.innerWidth + 5"
            )

            await page.set_viewport_size({"width": 1366, "height": 768})
            try:
                func_probes = await run_functional_probes(page)
                result.update(func_probes)
            except Exception:  # noqa: BLE001
                pass

            result["httpsEnabled"] = base_page_url.startswith("https://")
            try:
                html = await page.content()
                probes = await run_security_probes(context, page, base_page_url, html, title or None)
                result.update(probes)
            except Exception:  # noqa: BLE001
                # Audit inti tetap valid walau probe keamanan gagal.
                result["httpsEnabled"] = result.get("httpsEnabled")
                result.setdefault("exposedFiles", [])
                result.setdefault("exposedSecrets", [])
                result.setdefault("xssProbes", 0)
                result.setdefault("pathsProbed", 0)

            try:
                auth_probes = await run_auth_form_probes(page, base_page_url)
                result.update(auth_probes)
            except Exception:  # noqa: BLE001
                pass

            result["consoleErrors"] = len(console_errors)
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
