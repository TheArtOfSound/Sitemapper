#!/usr/bin/env python3
"""Create Sitemapper Stripe prices and upload secrets. Never prints secret values."""

from __future__ import annotations

import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

KNOWN_OORT_PRICE = "price_1U0ln8GeDvPZG3ZHTspH5qnZ"
WORKER = "/Users/bry/Projects/01 Active Apps/sitemap"

CANDIDATES = [
    Path("/Users/bry/Projects/02 Business & Sites/sol-microedge-lab/.env"),
    Path("/Users/bry/Projects/02 Business & Sites/qira/command_center/.env"),
    Path("/Users/bry/Projects/01 Active Apps/groking/.env"),
]


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text().splitlines():
        if "=" not in line or line.strip().startswith("#"):
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def stripe(key: str, method: str, path: str, data: dict | None = None) -> tuple[int, dict]:
    body = urllib.parse.urlencode(data or {}, doseq=True).encode() if data is not None else None
    req = urllib.request.Request(
        f"https://api.stripe.com/v1{path}",
        data=body,
        method=method,
        headers={"Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            import json

            return res.status, json.load(res)
    except urllib.error.HTTPError as e:
        import json

        raw = e.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {"error": {"message": raw[:200]}}
        return e.code, parsed


def wrangler_secret(name: str, value: str) -> None:
    proc = subprocess.run(
        ["npx", "wrangler", "secret", "put", name],
        input=value.encode(),
        cwd=WORKER,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=120,
    )
    text = proc.stdout.decode("utf-8", "replace")
    for line in text.splitlines():
        if value and value in line:
            print(f"[redacted] {name}")
        else:
            print(line)
    if proc.returncode != 0:
        raise SystemExit(f"wrangler secret put {name} failed")


def main() -> None:
    key = None
    source = None
    webhook_from_file = None
    for path in CANDIDATES:
        env = load_env(path)
        candidate = env.get("STRIPE_SECRET_KEY", "")
        if not candidate.startswith("sk_"):
            continue
        status, body = stripe(candidate, "GET", f"/prices/{KNOWN_OORT_PRICE}")
        print(f"probe {path.name}: HTTP {status} id={body.get('id', body.get('error', {}).get('code', 'err'))}")
        if status == 200:
            key = candidate
            source = str(path)
            webhook_from_file = env.get("STRIPE_WEBHOOK_SECRET") or None
            break
    if not key:
        raise SystemExit("No local Stripe key belongs to the Oort account (GeDvPZG3ZH).")

    print(f"using Oort Stripe account from {source}")
    products = [
        ("builder", "Sitemapper Builder", 1900, 19000),
        ("pro", "Sitemapper Pro", 4900, 49000),
        ("agency", "Sitemapper Agency", 14900, 149000),
    ]
    ids: dict[str, str] = {}
    status, listing = stripe(key, "GET", "/products?limit=100&active=true")
    existing = {p.get("name"): p.get("id") for p in listing.get("data", [])} if status == 200 else {}

    for slug, name, monthly, annual in products:
        product_id = existing.get(name)
        if not product_id:
            st, created = stripe(key, "POST", "/products", {"name": name, "metadata[app]": "sitemapper", "metadata[plan]": slug})
            if st not in (200, 201):
                raise SystemExit(f"product create failed for {name}: {created}")
            product_id = created["id"]
            print(f"created product {name} {product_id}")
        else:
            print(f"reuse product {name} {product_id}")
        for interval, amount, suffix in (("month", monthly, "MONTHLY"), ("year", annual, "ANNUAL")):
            st, prices = stripe(key, "GET", f"/prices?product={product_id}&active=true&limit=20")
            found = None
            for price in prices.get("data", []) if st == 200 else []:
                rec = price.get("recurring") or {}
                if rec.get("interval") == interval and price.get("unit_amount") == amount:
                    found = price["id"]
                    break
            if not found:
                st, created = stripe(
                    key,
                    "POST",
                    "/prices",
                    {
                        "product": product_id,
                        "currency": "usd",
                        "unit_amount": str(amount),
                        "recurring[interval]": interval,
                        "metadata[app]": "sitemapper",
                        "metadata[plan]": slug,
                    },
                )
                if st not in (200, 201):
                    raise SystemExit(f"price create failed {name} {interval}: {created}")
                found = created["id"]
                print(f"created price {slug} {interval} {found}")
            else:
                print(f"reuse price {slug} {interval} {found}")
            ids[f"STRIPE_PRICE_{slug.upper()}_{suffix}"] = found

    st, hooks = stripe(key, "GET", "/webhook_endpoints?limit=100")
    hook_url = "https://sitemapper.oortstack.com/api/stripe/webhook"
    hook_id = None
    secret = None
    if st == 200:
        for hook in hooks.get("data", []):
            if hook.get("url") == hook_url:
                hook_id = hook.get("id")
                print(f"webhook already exists {hook_id}")
                break
    if hook_id and not secret:
        stripe(key, "DELETE", f"/webhook_endpoints/{hook_id}")
        print(f"rotated existing webhook {hook_id}")
        hook_id = None
    if not hook_id:
        st, created = stripe(
            key,
            "POST",
            "/webhook_endpoints",
            {
                "url": hook_url,
                "description": "Sitemapper subscriptions",
                "enabled_events[0]": "checkout.session.completed",
                "enabled_events[1]": "customer.subscription.updated",
                "enabled_events[2]": "customer.subscription.deleted",
                "enabled_events[3]": "invoice.payment_failed",
            },
        )
        if st not in (200, 201):
            raise SystemExit(f"webhook create failed: {created}")
        hook_id = created.get("id")
        secret = created.get("secret")
        print(f"created webhook {hook_id}")

    wrangler_secret("STRIPE_SECRET_KEY", key)
    if secret:
        wrangler_secret("STRIPE_WEBHOOK_SECRET", secret)
    elif webhook_from_file and webhook_from_file.startswith("whsec_"):
        print("existing webhook; using local STRIPE_WEBHOOK_SECRET only if it matches this endpoint is uncertain — leaving webhook secret unset unless newly created")

    vars_path = Path(WORKER) / "wrangler.jsonc"
    text = vars_path.read_text()
    for name, value in ids.items():
        pattern = rf'("{name}":\s*")[^"]*(")'
        if re.search(pattern, text):
            text = re.sub(pattern, rf"\1{value}\2", text)
        else:
            text = text.replace(
                '"RESEND_FROM": "Sitemapper <hello@oortstack.com>"',
                f'"RESEND_FROM": "Sitemapper <hello@oortstack.com>",\n    "{name}": "{value}"',
            )
    vars_path.write_text(text)
    print("wrote price ids into wrangler.jsonc vars")
    print("PRICE_IDS")
    for k, v in ids.items():
        print(f"  {k}={v}")


if __name__ == "__main__":
    main()
