import io
import unittest
from pathlib import Path

from brent_hedge.bootstrap_devops import BootstrapError
from brent_hedge.remove_user import count_active_devops, describe, find_profile, main, remove_account

UID = "11111111-1111-1111-1111-111111111111"


def profile(role="member", status="pending", email="p@example.com"):
    return {"id": UID, "email": email, "role": role, "status": status, "created_at": "2026-01-02T03:04:05Z"}


class FakeHttp:
    """Returns scripted responses in order and records every call."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, path, body=None, prefer=None):
        self.calls.append((method, path, body))
        return self.responses.pop(0)


class Lookup(unittest.TestCase):
    def test_finds_the_profile_and_encodes_the_email(self):
        http = FakeHttp([(200, [profile()])])
        self.assertEqual(find_profile(http, "a+b@example.com")["id"], UID)
        self.assertIn("email=eq.a%2Bb%40example.com", http.calls[0][1])

    def test_unknown_email(self):
        with self.assertRaises(BootstrapError) as ctx:
            find_profile(FakeHttp([(200, [])]), "nobody@example.com")
        self.assertIn("No account found", str(ctx.exception))

    def test_lookup_failure_is_reported(self):
        with self.assertRaises(BootstrapError) as ctx:
            find_profile(FakeHttp([(401, {"message": "bad key"})]), "p@example.com")
        self.assertIn("bad key", str(ctx.exception))

    def test_counts_active_devops(self):
        self.assertEqual(count_active_devops(FakeHttp([(200, [{"id": "a"}, {"id": "b"}])])), 2)

    def test_describe_is_readable(self):
        self.assertEqual(describe(profile("admin", "active")), "p@example.com (admin, active, created 2026-01-02)")


class Remove(unittest.TestCase):
    def test_delete_goes_through_the_auth_admin_api(self):
        http = FakeHttp([(200, {})])
        remove_account(http, profile(), disable=False)
        self.assertEqual(http.calls, [("DELETE", f"/auth/v1/admin/users/{UID}", None)])

    def test_delete_failure_is_reported(self):
        with self.assertRaises(BootstrapError) as ctx:
            remove_account(FakeHttp([(500, {"msg": "Database error deleting user"})]), profile(), disable=False)
        self.assertIn("not deleted", str(ctx.exception))
        self.assertIn("Database error", str(ctx.exception))

    def test_disable_sets_only_the_status(self):
        http = FakeHttp([(200, [{"id": UID}])])
        remove_account(http, profile("member", "active"), disable=True)
        self.assertEqual(http.calls[0][0], "PATCH")
        self.assertEqual(http.calls[0][2], {"status": "disabled"})

    def test_disable_with_no_row_changed_is_an_error(self):
        with self.assertRaises(BootstrapError):
            remove_account(FakeHttp([(200, [])]), profile("member", "active"), disable=True)

    def test_disable_of_a_disabled_account_is_refused_without_a_request(self):
        http = FakeHttp([])
        with self.assertRaises(BootstrapError) as ctx:
            remove_account(http, profile("member", "disabled"), disable=True)
        self.assertIn("already disabled", str(ctx.exception))
        self.assertEqual(http.calls, [])

    def test_the_last_active_devops_is_never_touched(self):
        for disable in (False, True):
            http = FakeHttp([(200, [{"id": UID}])])
            with self.assertRaises(BootstrapError) as ctx:
                remove_account(http, profile("devops", "active"), disable=disable)
            self.assertIn("only active devops", str(ctx.exception))
            self.assertEqual([c[0] for c in http.calls], ["GET"])

    def test_one_of_two_devops_can_be_removed(self):
        http = FakeHttp([(200, [{"id": "a"}, {"id": UID}]), (200, {})])
        remove_account(http, profile("devops", "active"), disable=False)
        self.assertEqual([c[0] for c in http.calls], ["GET", "DELETE"])

    def test_a_disabled_devops_needs_no_headcount_check(self):
        http = FakeHttp([(200, {})])
        remove_account(http, profile("devops", "disabled"), disable=False)
        self.assertEqual([c[0] for c in http.calls], ["DELETE"])


class Main(unittest.TestCase):
    ENV = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SECRET_KEY": "secret"}

    def run_main(self, argv, environ, responses=(), answers=()):
        http = FakeHttp(responses)
        answers = list(answers)
        out = io.StringIO()
        code = main(argv + ["--env-file", str(Path("does-not-exist.env"))], environ=environ,
                    http_factory=lambda url, key: http, prompt=lambda _: answers.pop(0), out=out)
        return code, http, out.getvalue()

    def test_missing_credentials_stop_before_any_request(self):
        code, http, _ = self.run_main(["--email", "p@example.com", "--yes"], {})
        self.assertEqual(code, 1)
        self.assertEqual(http.calls, [])

    def test_declining_changes_nothing_and_shows_the_target(self):
        code, http, out = self.run_main(["--email", "P@Example.com"], self.ENV, responses=[(200, [profile()])], answers=["n"])
        self.assertEqual(code, 1)
        self.assertEqual([c[0] for c in http.calls], ["GET"])
        self.assertIn("https://x.supabase.co", out)
        self.assertIn("p@example.com (member, pending", out)

    def test_delete_with_yes(self):
        code, http, out = self.run_main(["--email", "p@example.com", "--yes"], self.ENV, responses=[(200, [profile()]), (200, {})])
        self.assertEqual(code, 0)
        self.assertEqual([c[0] for c in http.calls], ["GET", "DELETE"])
        self.assertIn("Deleted p@example.com", out)
        self.assertNotIn("secret", out)

    def test_disable_with_prompt(self):
        code, http, out = self.run_main(["--email", "p@example.com", "--disable"], self.ENV,
                                        responses=[(200, [profile("member", "active")]), (200, [{"id": UID}])], answers=["y"])
        self.assertEqual(code, 0)
        self.assertEqual([c[0] for c in http.calls], ["GET", "PATCH"])
        self.assertIn("Disabled p@example.com", out)

    def test_unknown_email_is_an_error(self):
        code, http, _ = self.run_main(["--email", "nobody@example.com", "--yes"], self.ENV, responses=[(200, [])])
        self.assertEqual(code, 1)
        self.assertEqual([c[0] for c in http.calls], ["GET"])


if __name__ == "__main__":
    unittest.main()
