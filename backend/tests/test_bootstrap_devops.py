import io
import unittest
from pathlib import Path

from brent_hedge.bootstrap_devops import (
    BootstrapError,
    check_password,
    create_first_devops,
    main,
    normalize_email,
    parse_env,
    read_settings,
)

USER_ID = "11111111-1111-1111-1111-111111111111"


class FakeHttp:
    """Returns scripted responses in order and records every call."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, path, body=None, prefer=None):
        self.calls.append((method, path, body))
        return self.responses.pop(0)


HAPPY = [(200, []), (200, {"id": USER_ID}), (201, None)]


class Settings(unittest.TestCase):
    def test_missing_settings_are_named(self):
        with self.assertRaises(BootstrapError) as ctx:
            read_settings({}, {})
        self.assertIn("SUPABASE_URL", str(ctx.exception))
        self.assertIn("SUPABASE_SECRET_KEY", str(ctx.exception))

    def test_only_the_missing_one_is_named(self):
        with self.assertRaises(BootstrapError) as ctx:
            read_settings({"SUPABASE_URL": "https://x.supabase.co"}, {})
        self.assertNotIn("SUPABASE_URL", str(ctx.exception))
        self.assertIn("SUPABASE_SECRET_KEY", str(ctx.exception))

    def test_environment_overrides_file(self):
        url, key = read_settings({"SUPABASE_URL": "https://a.supabase.co", "SUPABASE_SECRET_KEY": "file"},
                                 {"SUPABASE_SECRET_KEY": "env"})
        self.assertEqual((url, key), ("https://a.supabase.co", "env"))

    def test_plain_http_is_refused_except_for_localhost(self):
        with self.assertRaises(BootstrapError):
            read_settings({"SUPABASE_URL": "http://example.com", "SUPABASE_SECRET_KEY": "k"}, {})
        url, _ = read_settings({"SUPABASE_URL": "http://127.0.0.1:54321/", "SUPABASE_SECRET_KEY": "k"}, {})
        self.assertEqual(url, "http://127.0.0.1:54321")

    def test_parse_env(self):
        text = "# comment\n\nA=1\nB = 'two'\nC=\"three\"\nnot a line\n"
        self.assertEqual(parse_env(text), {"A": "1", "B": "two", "C": "three"})


class Inputs(unittest.TestCase):
    def test_email_is_lowercased_and_checked(self):
        self.assertEqual(normalize_email("  Me@Example.COM "), "me@example.com")
        for bad in ("nope", "@x.com", "me@", "a b@x.com"):
            with self.assertRaises(BootstrapError):
                normalize_email(bad)

    def test_short_password_is_refused_before_any_request(self):
        http = FakeHttp([])
        with self.assertRaises(BootstrapError):
            create_first_devops(http, "me@example.com", "short")
        self.assertEqual(http.calls, [])


class Create(unittest.TestCase):
    def test_happy_path_creates_user_then_active_devops_profile(self):
        http = FakeHttp(HAPPY)
        self.assertEqual(create_first_devops(http, "me@example.com", "long-enough-pw"), USER_ID)
        self.assertEqual([c[0] for c in http.calls], ["GET", "POST", "POST"])
        self.assertEqual(http.calls[1][2]["email_confirm"], True)
        self.assertEqual(http.calls[2][2], {"id": USER_ID, "email": "me@example.com", "role": "devops", "status": "active"})

    def test_stops_at_the_cap_without_creating_anything(self):
        http = FakeHttp([(200, [{"id": "a"}, {"id": "b"}])])
        with self.assertRaises(BootstrapError) as ctx:
            create_first_devops(http, "me@example.com", "long-enough-pw")
        self.assertIn("limit is 2", str(ctx.exception))
        self.assertEqual([c[0] for c in http.calls], ["GET"])

    def test_profile_failure_deletes_the_new_user(self):
        http = FakeHttp([(200, []), (200, {"id": USER_ID}),
                         (400, {"message": "There must always be at least 1 active devops account."}), (200, {})])
        with self.assertRaises(BootstrapError) as ctx:
            create_first_devops(http, "me@example.com", "long-enough-pw")
        self.assertEqual(http.calls[-1][:2], ("DELETE", f"/auth/v1/admin/users/{USER_ID}"))
        self.assertIn("removed again", str(ctx.exception))

    def test_failed_cleanup_is_reported_loudly(self):
        http = FakeHttp([(200, []), (200, {"id": USER_ID}), (500, "boom"), (500, {})])
        with self.assertRaises(BootstrapError) as ctx:
            create_first_devops(http, "me@example.com", "long-enough-pw")
        self.assertIn("WARNING", str(ctx.exception))
        self.assertIn(USER_ID, str(ctx.exception))

    def test_user_creation_failure_creates_no_profile(self):
        http = FakeHttp([(200, []), (422, {"msg": "A user with this email address has already been registered"})])
        with self.assertRaises(BootstrapError) as ctx:
            create_first_devops(http, "me@example.com", "long-enough-pw")
        self.assertIn("already been registered", str(ctx.exception))
        self.assertEqual([c[0] for c in http.calls], ["GET", "POST"])

    def test_missing_tables_hint_at_migrations(self):
        http = FakeHttp([(404, {"message": "relation does not exist"})])
        with self.assertRaises(BootstrapError) as ctx:
            create_first_devops(http, "me@example.com", "long-enough-pw")
        self.assertIn("migrations", str(ctx.exception))


class Main(unittest.TestCase):
    def run_main(self, argv, environ, responses=(), answers=()):
        http = FakeHttp(responses)
        answers = list(answers)
        out = io.StringIO()
        code = main(argv + ["--env-file", str(Path("does-not-exist.env"))], environ=environ,
                    http_factory=lambda url, key: http, prompt=lambda _: answers.pop(0),
                    ask_password=lambda _: "long-enough-pw", out=out)
        return code, http, out.getvalue()

    ENV = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SECRET_KEY": "secret"}

    def test_missing_credentials_stop_with_an_error_and_no_requests(self):
        code, http, _ = self.run_main(["--email", "me@example.com", "--yes"], {})
        self.assertEqual(code, 1)
        self.assertEqual(http.calls, [])

    def test_declining_the_prompt_creates_nothing(self):
        code, http, out = self.run_main(["--email", "me@example.com"], self.ENV, answers=["n"])
        self.assertEqual(code, 1)
        self.assertEqual(http.calls, [])
        self.assertIn("https://x.supabase.co", out)  # the target is shown before asking

    def test_success_with_yes(self):
        code, http, out = self.run_main(["--email", "me@example.com", "--yes"], self.ENV, responses=HAPPY)
        self.assertEqual(code, 0)
        self.assertIn("Created devops account", out)
        self.assertNotIn("secret", out)


if __name__ == "__main__":
    unittest.main()
