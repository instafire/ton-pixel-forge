#!/usr/bin/env python3
"""Populate the Cloudflare KV namespace with the app assets.

The worker serves the app from KV under `asset:*` keys:
  asset:index.html, asset:styles.css, asset:app.js, asset:art.js  -> {"body": "<text>", "type": "<mime>"}
  asset:icon.png, asset:mock.jpg                                  -> {"body": "<base64>", "type": "<mime>"}

Usage:
  export CLOUDFLARE_API_TOKEN=...      # token with Workers KV edit permission
  export CF_ACCOUNT_ID=...             # your Cloudflare account id
  export CF_NAMESPACE_ID=...           # the FORGE_KV namespace id from wrangler.toml
  python3 scripts/populate_kv.py [app_dir]

app_dir defaults to the repo root. icon.png (256x256, shown by wallets) and
mock.jpg (square image used by the AI Studio demo preset) are optional —
provide your own or skip them.
"""
import base64
import json
import os
import sys
import urllib.request

API = "https://api.cloudflare.com/client/v4"

TEXT_ASSETS = [
    ("index.html", "text/html; charset=utf-8"),
    ("styles.css", "text/css; charset=utf-8"),
    ("app.js", "application/javascript; charset=utf-8"),
    ("art.js", "application/javascript; charset=utf-8"),
]
BIN_ASSETS = [
    ("icon.png", "image/png"),
    ("mock.jpg", "image/jpeg"),
]


def put(token, account_id, namespace_id, key, record):
    url = f"{API}/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}"
    data = json.dumps(record).encode()
    req = urllib.request.Request(url, data=data, method="PUT",
                                 headers={"Authorization": f"Bearer {token}",
                                          "Content-Type": "text/plain"})
    with urllib.request.urlopen(req) as resp:
        return resp.status


def main():
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    account = os.environ.get("CF_ACCOUNT_ID")
    namespace = os.environ.get("CF_NAMESPACE_ID")
    if not (token and account and namespace):
        sys.exit("Set CLOUDFLARE_API_TOKEN, CF_ACCOUNT_ID and CF_NAMESPACE_ID first.")

    base = sys.argv[1] if len(sys.argv) > 1 else "."
    for name, mime in TEXT_ASSETS:
        try:
            with open(f"{base}/{name}", encoding="utf-8") as f:
                body = f.read()
        except FileNotFoundError:
            print(f"skip {name} (not found)")
            continue
        status = put(token, account, namespace, f"asset:{name}", {"body": body, "type": mime})
        print(f"asset:{name}  HTTP {status}")

    for name, mime in BIN_ASSETS:
        try:
            with open(f"{base}/{name}", "rb") as f:
                body = base64.b64encode(f.read()).decode()
        except FileNotFoundError:
            print(f"skip {name} (not found)")
            continue
        status = put(token, account, namespace, f"asset:{name}", {"body": body, "type": mime})
        print(f"asset:{name}  HTTP {status}")

    print("Done. Deploy the worker with `wrangler deploy` if you haven't already.")


if __name__ == "__main__":
    main()