import io
import unittest
from pathlib import Path

from brent_hedge.bootstrap_devops import BootstrapError
from brent_hedge.set_password import main, set_account_password

UID = "11111111-1111-1111-1111-111111111111"


def profile(status="active"):
    return {"id": UID, "email": "p@example.com", "role": "member", "status": status, "created_at": "2026-01-02T03:04:05Z"}


class FakeHttp:
    """Returns scripted responses in order and records every call."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, path, body=None, prefer=None):
        self.calls.append((method, path, body))
        return self.responses.pop(0)


class SetPassword(unittest.TestCase):
    def test_puts_the_password_on_the_auth_user(self):
        http = FakeHttp([(200, {"id": UID})])
        set_account_password(http, profile(), "long-enough-pw")
        self.assertEqual(http.calls, [("PUT", f"/auth/v1/admin/users/{UID}", {"password": "long-enough-pw"})])

    def test_a_short_password_is_refused_before_any_request(self):
        http = FakeHttp([])
        with self.assertRaises(BootstrapError):
            set_account_password(http, profile(), "short")
        self.assertEqual(http.calls, [])

    def test_a_server_refusal_is_reported(self):
        with self.assertRaises(BootstrapError) as ctx:
            set_account_password(FakeHttp([(422, {"msg": "New password should be different from the old password."})]), profile(), "long-enough-pw")
        self.assertIn("different from the old", str(ctx.exception))
        self.assertIn("not changed", str(ctx.exception))


class Main(unittest.TestCase):
    ENV = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SECRET_KEY": "secret"}

    def run_main(self, argv, environ, responses=(), answers=(), passwords=("long-enough-pw", "long-enough-pw")):
        http = FakeHttp(responses)
        answers, passwords = list(answers), list(passwords)
        out = io.StringIO()
        code = main(argv + ["--env-file", str(Path("does-not-exist.env"))], environ=environ,
                    http_factory=lambda url, key: http, prompt=lambda _: answers.pop(0),
                    ask_password=lambda _: passwords.pop(0), out=out)
        return code, http, out.getvalue()

    def test_missing_credentials_stop_before_any_request(self):
        code, http, _ = self.run_main(["--email", "p@example.com", "--yes"], {})
        self.assertEqual(code, 1)
        self.assertEqual(http.calls, [])

    def test_unknown_email_changes_nothing_and_never_asks_for_a_password(self):
        asked = []
        http = FakeHttp([(200, [])])
        code = main(["--email", "nobody@example.com", "--yes", "--env-file", "does-not-exist.env"], environ=self.ENV,
                    http_factory=lambda u, k: http, prompt=lambda _: "y", ask_password=lambda p: asked.append(p) or "x", out=io.StringIO())
        self.assertEqual(code, 1)
        self.assertEqual(asked, [])
        self.assertEqual([c[0] for c in http.calls], ["GET"])

    def test_declining_changes_nothing_and_shows_the_target_and_account(self):
        code, http, out = self.run_main(["--email", "P@Example.com"], self.ENV, responses=[(200, [profile()])], answers=["n"])
        self.assertEqual(code, 1)
        self.assertEqual([c[0] for c in http.calls], ["GET"])
        self.assertIn("https://x.supabase.co", out)
        self.assertIn("p@example.com (member, active", out)
        self.assertIn("Nothing was changed", out)

    def test_a_short_password_stops_before_the_confirmation(self):
        code, http, _ = self.run_main(["--email", "p@example.com"], self.ENV, responses=[(200, [profile()])],
                                      answers=["y"], passwords=("short", "short"))
        self.assertEqual(code, 1)
        self.assertEqual([c[0] for c in http.calls], ["GET"])

    def test_mismatched_passwords_stop(self):
        code, http, _ = self.run_main(["--email", "p@example.com"], self.ENV, responses=[(200, [profile()])],
                                      answers=["y"], passwords=("long-enough-pw", "different-pw-1"))
        self.assertEqual(code, 1)
        self.assertEqual([c[0] for c in http.calls], ["GET"])

    def test_success(self):
        code, http, out = self.run_main(["--email", "p@example.com"], self.ENV, responses=[(200, [profile()]), (200, {"id": UID})], answers=["y"])
        self.assertEqual(code, 0)
        self.assertEqual([c[0] for c in http.calls], ["GET", "PUT"])
        self.assertIn("Password set for p@example.com", out)
        self.assertNotIn("long-enough-pw", out)
        self.assertNotIn("secret", out)

    def test_a_disabled_account_gets_the_password_but_no_status_change(self):
        code, http, out = self.run_main(["--email", "p@example.com", "--yes"], self.ENV, responses=[(200, [profile("disabled")]), (200, {"id": UID})])
        self.assertEqual(code, 0)
        self.assertIn("still disabled", out)
        self.assertNotIn("can sign in with it now", out)
        self.assertEqual([c[0] for c in http.calls], ["GET", "PUT"])
        self.assertEqual(http.calls[1][2], {"password": "long-enough-pw"})

    def test_new_password_variable_skips_the_prompts(self):
        environ = {**self.ENV, "NEW_PASSWORD": "from-the-env-1"}
        http = FakeHttp([(200, [profile()]), (200, {"id": UID})])
        code = main(["--email", "p@example.com", "--yes", "--env-file", "does-not-exist.env"], environ=environ,
                    http_factory=lambda u, k: http, prompt=lambda _: "y", ask_password=lambda p: self.fail("should not ask"), out=io.StringIO())
        self.assertEqual(code, 0)
        self.assertEqual(http.calls[1][2], {"password": "from-the-env-1"})


if __name__ == "__main__":
    unittest.main()
