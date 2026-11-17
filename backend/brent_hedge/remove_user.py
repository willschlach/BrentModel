"""Remove or disable a web app account.

Run from backend/:

    python -m brent_hedge.remove_user --email person@example.com            # delete the account
    python -m brent_hedge.remove_user --email person@example.com --disable  # keep it, block access

Delete is permanent: the account, its profile, and the invite for that email are gone, and the
person can sign up again. Use it
to reject a pending request or to clear a test account. Disable keeps the account and everything
attached to it but stops it signing in, and it can be restored later: use it for a real person.

Reads SUPABASE_URL and SUPABASE_SECRET_KEY from the repo-root .env (or the environment, which wins).
The secret key bypasses row level security, so this runs only on a trusted machine and never in the
browser or on Vercel. It shows which project it is talking to and asks before it changes anything.

The database still enforces its own rules: the last active devops account cannot be removed.
Invites the person created for others are kept. Disabling keeps the invite, and its status shows "disabled".
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import quote

from .bootstrap_devops import (
    DEFAULT_ENV,
    BootstrapError,
    Http,
    _error_text,
    normalize_email,
    parse_env,
    read_settings,
)


def find_profile(http, email: str) -> dict:
    """Return the profile row for an email, or raise if there is none."""
    status, rows = http.request(
        "GET", f"/rest/v1/profiles?select=id,email,role,status,created_at&email=eq.{quote(email, safe='')}")
    if status != 200 or not isinstance(rows, list):
        raise BootstrapError(f"Could not look up {email} (HTTP {status}): {_error_text(rows)}")
    if not rows:
        raise BootstrapError(f"No account found for {email}.")
    return rows[0]


def count_active_devops(http) -> int:
    status, rows = http.request("GET", "/rest/v1/profiles?select=id&role=eq.devops&status=eq.active")
    if status != 200 or not isinstance(rows, list):
        raise BootstrapError(f"Could not check the devops accounts (HTTP {status}): {_error_text(rows)}")
    return len(rows)


def describe(profile: dict) -> str:
    return f"{profile['email']} ({profile['role']}, {profile['status']}, created {str(profile.get('created_at', ''))[:10]})"


def remove_account(http, profile: dict, *, disable: bool) -> None:
    """Delete the account, or disable it. Raises BootstrapError with a reason when it cannot."""
    if profile["role"] == "devops" and profile["status"] == "active" and count_active_devops(http) <= 1:
        raise BootstrapError("That is the only active devops account. There must always be at least one, so it was not changed.")

    if disable:
        if profile["status"] == "disabled":
            raise BootstrapError("That account is already disabled.")
        status, payload = http.request(
            "PATCH", f"/rest/v1/profiles?id=eq.{quote(str(profile['id']), safe='')}",
            {"status": "disabled"}, prefer="return=representation")
        if status != 200 or not isinstance(payload, list) or len(payload) != 1:
            raise BootstrapError(f"Could not disable the account (HTTP {status}): {_error_text(payload)}")
        return

    status, payload = http.request("DELETE", f"/auth/v1/admin/users/{quote(str(profile['id']), safe='')}")
    if status not in (200, 204):
        raise BootstrapError(f"The account was not deleted (HTTP {status}): {_error_text(payload)}")


def main(argv: list[str] | None = None, *, environ=None, http_factory=Http, prompt=input, out=sys.stdout) -> int:
    parser = argparse.ArgumentParser(description="Delete or disable a web app account.")
    parser.add_argument("--email", help="Email of the account (prompted if omitted).")
    parser.add_argument("--disable", action="store_true", help="Disable instead of deleting. Reversible.")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV, help="Path to the .env file.")
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt.")
    args = parser.parse_args(argv)
    environ = os.environ if environ is None else environ

    try:
        file_values = parse_env(args.env_file.read_text(encoding="utf-8")) if args.env_file.exists() else {}
        url, key = read_settings(file_values, dict(environ))
        email = normalize_email(args.email or prompt("Email of the account: "))
        http = http_factory(url, key)
        profile = find_profile(http, email)

        print(f"Target: {url}", file=out)
        print(f"Account: {describe(profile)}", file=out)
        if args.disable:
            question = "Disable this account? It keeps its data but cannot sign in, and can be restored. [y/N] "
        else:
            question = "Permanently delete this account and its invite? This cannot be undone. [y/N] "
        if not args.yes and prompt(question).strip().lower() != "y":
            print("Cancelled. Nothing was changed.", file=out)
            return 1

        remove_account(http, profile, disable=args.disable)
    except BootstrapError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    print(f"{'Disabled' if args.disable else 'Deleted'} {email}.", file=out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
