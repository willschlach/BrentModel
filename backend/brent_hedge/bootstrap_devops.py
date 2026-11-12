"""Create the first devops account for the web app.

Run from backend/:

    python -m brent_hedge.bootstrap_devops --email you@example.com

Reads SUPABASE_URL and SUPABASE_SECRET_KEY from the repo-root .env (or the environment, which
wins). The secret key bypasses row level security, so this runs only on a trusted machine and
never in the browser or on Vercel. The password is prompted for (it is never taken as an
argument, which would land in shell history); BOOTSTRAP_PASSWORD may be set for automation.

Uses only the standard library. See openspec/changes/add-auth-foundation/design.md (D6).
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_ENV = Path(__file__).resolve().parents[2] / ".env"
MIN_PASSWORD_LENGTH = 8  # keep in step with minimum_password_length in supabase/config.toml
MAX_ACTIVE_DEVOPS = 2
LOCAL_HOSTS = ("localhost", "127.0.0.1", "[::1]")


class BootstrapError(Exception):
    """A problem the operator can fix. The message is shown as-is."""


def parse_env(text: str) -> dict[str, str]:
    """Parse KEY=VALUE lines. Ignores blanks and comments, strips matching quotes."""
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[key.strip()] = value
    return out


def read_settings(file_values: dict[str, str], environ: dict[str, str]) -> tuple[str, str]:
    """Return (url, secret_key). The environment overrides the file."""
    merged = {**file_values, **{k: v for k, v in environ.items() if k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY")}}
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY") if not merged.get(k)]
    if missing:
        raise BootstrapError("Missing setting(s): " + ", ".join(missing) + ". Set them in the repo-root .env.")
    url = merged["SUPABASE_URL"].rstrip("/")
    is_local = url.startswith("http://") and any(url[len("http://"):].startswith(h) for h in LOCAL_HOSTS)
    if not (url.startswith("https://") or is_local):
        raise BootstrapError("SUPABASE_URL must use https:// (plain http is allowed only for localhost).")
    return url, merged["SUPABASE_SECRET_KEY"]


def normalize_email(email: str) -> str:
    email = email.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@") or " " in email:
        raise BootstrapError(f"'{email}' does not look like an email address.")
    return email


def check_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise BootstrapError(f"The password must be at least {MIN_PASSWORD_LENGTH} characters.")


class Http:
    """Minimal JSON client for the Supabase REST and Auth admin endpoints."""

    def __init__(self, base_url: str, secret_key: str) -> None:
        self.base_url = base_url
        self.secret_key = secret_key

    def request(self, method: str, path: str, body: object | None = None, prefer: str | None = None):
        headers = {"apikey": self.secret_key, "Content-Type": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base_url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw, status = resp.read(), resp.status
        except urllib.error.HTTPError as err:
            raw, status = err.read(), err.code
        except urllib.error.URLError as err:
            raise BootstrapError(f"Could not reach {self.base_url}: {err.reason}") from err
        try:
            return status, (json.loads(raw) if raw else None)
        except ValueError:
            return status, raw.decode("utf-8", "replace")


def _error_text(payload: object) -> str:
    if isinstance(payload, dict):
        for key in ("msg", "message", "error_description", "error"):
            if payload.get(key):
                return str(payload[key])
    return str(payload)


def create_first_devops(http, email: str, password: str) -> str:
    """Create the confirmed auth user and its active devops profile. Returns the user id.

    If the profile cannot be created, the auth user is deleted again so nothing is left behind.
    """
    check_password(password)

    status, rows = http.request("GET", "/rest/v1/profiles?select=id&role=eq.devops&status=eq.active")
    if status != 200 or not isinstance(rows, list):
        raise BootstrapError(f"Could not check existing devops accounts (HTTP {status}): {_error_text(rows)}. "
                             "Have the database migrations been applied?")
    if len(rows) >= MAX_ACTIVE_DEVOPS:
        raise BootstrapError(f"There are already {len(rows)} active devops accounts (the limit is {MAX_ACTIVE_DEVOPS}).")

    status, user = http.request("POST", "/auth/v1/admin/users",
                                {"email": email, "password": password, "email_confirm": True})
    if status not in (200, 201) or not isinstance(user, dict) or "id" not in user:
        raise BootstrapError(f"Could not create the user (HTTP {status}): {_error_text(user)}")
    user_id = user["id"]

    status, payload = http.request("POST", "/rest/v1/profiles",
                                   {"id": user_id, "email": email, "role": "devops", "status": "active"},
                                   prefer="return=minimal")
    if status not in (200, 201, 204):
        del_status, _ = http.request("DELETE", f"/auth/v1/admin/users/{user_id}")
        cleanup = "The new user was removed again." if del_status in (200, 204) else (
            f"WARNING: the new user {user_id} could not be removed (HTTP {del_status}); delete it in the dashboard.")
        raise BootstrapError(f"Could not create the profile (HTTP {status}): {_error_text(payload)}. {cleanup}")
    return user_id


def main(argv: list[str] | None = None, *, environ=None, http_factory=Http, prompt=input,
         ask_password=getpass.getpass, out=sys.stdout) -> int:
    parser = argparse.ArgumentParser(description="Create the first devops account.")
    parser.add_argument("--email", help="Email for the new account (prompted if omitted).")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV, help="Path to the .env file.")
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt.")
    args = parser.parse_args(argv)
    environ = os.environ if environ is None else environ

    try:
        file_values = parse_env(args.env_file.read_text(encoding="utf-8")) if args.env_file.exists() else {}
        url, key = read_settings(file_values, dict(environ))
        email = normalize_email(args.email or prompt("Email for the devops account: "))

        password = environ.get("BOOTSTRAP_PASSWORD")
        if not password:
            password = ask_password("Password: ")
            if ask_password("Repeat password: ") != password:
                raise BootstrapError("The passwords do not match.")
        check_password(password)

        print(f"Target: {url}", file=out)
        if not args.yes and prompt(f"Create devops account {email} on this project? [y/N] ").strip().lower() != "y":
            print("Cancelled. Nothing was created.", file=out)
            return 1

        user_id = create_first_devops(http_factory(url, key), email, password)
    except BootstrapError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    print(f"Created devops account {email} (id {user_id}). It can sign in now.", file=out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
