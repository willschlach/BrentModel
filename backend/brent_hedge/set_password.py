"""Set a web app account's password from the command line.

Run from backend/:

    python -m brent_hedge.set_password --email person@example.com

The fallback for when the emailed reset code is not available (the hosted project's built-in mailer
only delivers to project team addresses). Works for an account in any status: setting a password
does not enable a disabled account or approve a pending one.

Reads SUPABASE_URL and SUPABASE_SECRET_KEY from the repo-root .env (or the environment, which wins).
The secret key bypasses row level security, so this runs only on a trusted machine and never in the
browser or on Vercel. It shows which project it is talking to and which account it found, and asks
before it changes anything. The password is prompted for twice and never taken as an argument (it
would land in shell history); NEW_PASSWORD may be set for automation.

Sessions the person already has stay signed in until they expire; this does not sign them out.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path
from urllib.parse import quote

from .bootstrap_devops import (
    DEFAULT_ENV,
    BootstrapError,
    Http,
    _error_text,
    check_password,
    normalize_email,
    parse_env,
    read_settings,
)
from .remove_user import describe, find_profile


def set_account_password(http, profile: dict, password: str) -> None:
    """Set the password of the account behind a profile row. Raises BootstrapError on failure."""
    check_password(password)
    status, payload = http.request("PUT", f"/auth/v1/admin/users/{quote(str(profile['id']), safe='')}",
                                   {"password": password})
    if status != 200:
        raise BootstrapError(f"The password was not changed (HTTP {status}): {_error_text(payload)}")


def main(argv: list[str] | None = None, *, environ=None, http_factory=Http, prompt=input,
         ask_password=getpass.getpass, out=sys.stdout) -> int:
    parser = argparse.ArgumentParser(description="Set an account's password.")
    parser.add_argument("--email", help="Email of the account (prompted if omitted).")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV, help="Path to the .env file.")
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt.")
    args = parser.parse_args(argv)
    environ = os.environ if environ is None else environ

    try:
        file_values = parse_env(args.env_file.read_text(encoding="utf-8")) if args.env_file.exists() else {}
        url, key = read_settings(file_values, dict(environ))
        email = normalize_email(args.email or prompt("Email of the account: "))
        http = http_factory(url, key)
        # Look the account up first, so nobody types a password for an account that does not exist.
        profile = find_profile(http, email)

        print(f"Target: {url}", file=out)
        print(f"Account: {describe(profile)}", file=out)

        password = environ.get("NEW_PASSWORD")
        if not password:
            password = ask_password("New password: ")
            if ask_password("Repeat new password: ") != password:
                raise BootstrapError("The passwords do not match.")
        check_password(password)

        if not args.yes and prompt("Set this account's password? [y/N] ").strip().lower() != "y":
            print("Cancelled. Nothing was changed.", file=out)
            return 1
        set_account_password(http, profile, password)
    except BootstrapError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    if profile["status"] == "active":
        print(f"Password set for {email}. It can sign in with it now.", file=out)
    else:
        print(f"Password set for {email}. The account is still {profile['status']}, so it cannot sign in until that changes.", file=out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
