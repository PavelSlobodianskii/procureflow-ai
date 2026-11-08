"""Tests for .claude/hooks/protect-git.py (standard library only, no network).

Run from the project root:

    py -3 -I -m unittest discover -s .claude/hooks -p "test_*.py"

The hook file name has a hyphen, so it cannot be imported normally. We load it by path.
Every command below is only ever passed to the analyser as text. Nothing is executed.
"""

import importlib.util
import json
import pathlib
import subprocess
import sys
import unittest

HOOK_PATH = pathlib.Path(__file__).with_name("protect-git.py")
_spec = importlib.util.spec_from_file_location("protect_git", HOOK_PATH)
hook = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hook)


def levels(command):
    """Set of decision levels the hook would produce for this command text."""
    return {level for level, _reason in hook.analyse(command)}


def payload(command, tool="Bash"):
    return json.dumps({"tool_name": tool, "tool_input": {"command": command}}).encode()


class Decisions(unittest.TestCase):
    """Table-driven checks of what the hook decides."""

    MUST_DENY = [
        "git push -f",
        "git push --force",
        "git push --forc origin main",
        "git push --force-with-lease",
        "git push origin +main",
        "git push origin :main",
        "git push --delete origin main",
        "git push --mirror",
        "git -C . push -f",
        "git.exe push -f",
        "C:\\Tools\\Git\\cmd\\git.exe push -f",
        "git reset --hard",
        "git reset --hard HEAD~1",
        "git clean -fdx",
        "rm -rf .git",
        "rm -rf .GIT",
        "Remove-Item .git -Recurse",
        "Remove-Item -Path:.git -Recurse",
        # Bypasses reported by the reviews:
        "echo \\\" ; git push --force origin main ; echo \\\"",
        "git reset \\\n--hard",
        "git push `\n--force",
        "git push \\\n--force",
        "git reset @{1} --hard",
        "git push origin {main,dev} -f",
        "env -i git push -f",
        "sudo -u x git push -f",
        "nice -n 5 git push -f",
        "if true; then git reset --hard; fi",
        "for b in a b; do git push -f origin $b; done",
        "2>&1 git push -f",
        ">/dev/null git push -f",
        "xargs git push -f",
        "timeout 5 git push -f",
        "(git push -f)",
        "git push $(echo origin) --force",
        # Config, alias and environment bypasses:
        "git -c alias.p='push --force' p",
        "git config alias.pf 'push --force'",
        "git config alias.x '!git push -f'",
        "git config remote.origin.push '+refs/heads/*:refs/heads/*'",
        "git config core.hooksPath /tmp/x",
        "git config --global user.name x",
        "GIT_CONFIG_COUNT=1 git status",
        "GIT_SSH_COMMAND=evil git status",
        "$env:GIT_CONFIG_COUNT = 1; git status",
        # AGENTS.md "never run" list:
        "rm -rf build",
        "rm -fr build",
        "rm -r -f build",
        "rm --recursive --force build",
        "Remove-Item -Recurse -Force build",
        "rmdir /s /q build",
        "docker system prune",
        "docker system prune -af",
    ]

    MUST_NOT_ALLOW_SILENTLY = [
        'eval "git push -f"',
        'Invoke-Expression "git push -f"',
        "Start-Process git -ArgumentList 'push','--force'",
        'bash -ec "git push -f"',
        'bash -c "git push -f"',
        'powershell -Command "git push --force"',
        'cmd /c "git push -f"',
        "powershell -enc ZwBpAHQAIABwAHUAcwBoACAALQBmAA==",
        "echo Z2l0IHB1c2ggLWY= | base64 -d | sh",
        'bash -c "bash -c \\"bash -c \'git push -f\'\\""',
        "g=git; $g push -f",
        "Set-Alias gp git; gp push -f",
        "alias gp='git push -f'; gp",
        "git pf",
        "git unknowncmd",
        "git --exec-path=/x status",
    ]

    MUST_ASK = [
        "git push",
        "git push origin main",
        "git commit -m x",
        'git commit -m "fix; git push -f"',
        "git commit --amend",
        "git rebase main",
        "git pull",
        "git merge x",
        "git cherry-pick abc",
        "git revert abc",
        "git branch -D x",
        "git tag -d x",
        "git stash drop",
        "git stash clear",
        "git checkout .",
        "git checkout -f",
        "git restore .",
        "git switch -f x",
        "git reset --keep",
        "git gc --prune=now",
        "git reflog expire --all",
        "git update-ref -d refs/heads/x",
        "git remote add x y",
        "git filter-branch --all",
        "git config user.name x",
        "git -c user.name=x commit -m y",
        "rm -r build",
        "rm .git/index.lock",
        "gh pr create",
        "gh -R owner/repo pr create",
        "gh pr close 1",
        "gh api -X DELETE repos/o/r",
        "gh api repos/o/r -f title=x",
        "gh secret set X",
        "docker push img",
        "docker image prune -a",
        "vercel deploy",
        "kubectl apply -f x.yaml",
    ]

    MUST_ALLOW = [
        "git status",
        "git status -sb",
        "git diff",
        "git diff --staged",
        "git log --grep=push",
        "git log --oneline -5",
        "git log --format=%H",
        "git show HEAD",
        "git branch",
        "git branch --merged",
        "git stash",
        "git restore --staged .",
        "git config --get remote.origin.url",
        "git config --list",
        "git rm -rf --cached x",
        "git --version",
        "git status; ls",
        "ls",
        "ls -la docs",
        "cat README.md",
        "py -3 -m unittest",
        "rm file.txt",
        "docker ps",
        "gh pr view 1",
        "gh api repos/o/r",
        "echo hello",
    ]

    def test_must_deny(self):
        for cmd in self.MUST_DENY:
            with self.subTest(cmd=cmd):
                self.assertIn("deny", levels(cmd))

    def test_must_not_allow_silently(self):
        for cmd in self.MUST_NOT_ALLOW_SILENTLY:
            with self.subTest(cmd=cmd):
                self.assertTrue(levels(cmd), "no finding at all")

    def test_must_ask(self):
        for cmd in self.MUST_ASK:
            with self.subTest(cmd=cmd):
                found = levels(cmd)
                self.assertIn("ask", found)
                self.assertNotIn("deny", found)

    def test_must_allow(self):
        for cmd in self.MUST_ALLOW:
            with self.subTest(cmd=cmd):
                self.assertEqual(set(), levels(cmd))

    def test_text_only_in_quotes_is_ask_not_deny(self):
        # The text is inside a quoted commit message: a human must look, but it is not a real push.
        found = levels('git commit -m "fix; git push -f"')
        self.assertIn("ask", found)
        self.assertNotIn("deny", found)


class EntryPoint(unittest.TestCase):
    """main() and run() must fail closed: exit 2 on anything unexpected."""

    def code(self, raw):
        return hook.main(raw)[0]

    def test_bad_input_blocks(self):
        for raw in (b"", b"   ", b"not json", b"[]", b"null", b"\xff\xfe\x00",
                    json.dumps({"tool_name": "Bash"}).encode(),
                    json.dumps({"tool_name": "Bash", "tool_input": []}).encode(),
                    json.dumps({"tool_name": "Bash", "tool_input": {"command": 5}}).encode(),
                    json.dumps({"tool_name": 5, "tool_input": {"command": "ls"}}).encode()):
            with self.subTest(raw=raw):
                self.assertEqual(2, self.code(raw))

    def test_other_tools_are_not_our_job(self):
        self.assertEqual(0, self.code(payload("git push -f", tool="Read")))

    def test_bom_is_accepted(self):
        self.assertEqual(0, self.code(b"\xef\xbb\xbf" + payload("ls")))

    def test_allow_prints_nothing(self):
        code, out, _err = hook.main(payload("git status"))
        self.assertEqual((0, ""), (code, out))

    def test_deny_and_ask_use_valid_json_and_exit_zero(self):
        for cmd, level in (("git push -f", "deny"), ("git push", "ask")):
            with self.subTest(cmd=cmd):
                code, out, _err = hook.main(payload(cmd))
                self.assertEqual(0, code)
                decision = json.loads(out)["hookSpecificOutput"]
                self.assertEqual("PreToolUse", decision["hookEventName"])
                self.assertEqual(level, decision["permissionDecision"])
                self.assertTrue(decision["permissionDecisionReason"])

    def test_ask_reason_names_the_command(self):
        _code, out, _err = hook.main(payload("git push origin main"))
        self.assertIn("git push origin main", json.loads(out)["hookSpecificOutput"]["permissionDecisionReason"])

    def test_output_is_ascii_even_for_unicode_commands(self):
        _code, out, _err = hook.main(payload("git push origin caf\u00e9"))
        out.encode("ascii")  # raises if not ASCII

    def test_internal_error_in_analysis_blocks(self):
        original = hook.analyse
        hook.analyse = lambda _command: 1 / 0
        try:
            self.assertEqual(2, self.code(payload("ls")))
        finally:
            hook.analyse = original

    def test_run_blocks_when_main_crashes_even_with_base_exception(self):
        original = hook.main
        try:
            for exc in (RuntimeError, KeyboardInterrupt, SystemExit, MemoryError):
                def boom(_raw, _exc=exc):
                    raise _exc()
                hook.main = boom
                with self.subTest(exc=exc.__name__):
                    self.assertEqual(2, hook.run(b"{}"))
        finally:
            hook.main = original

    def test_error_message_never_contains_the_command(self):
        secret = "SECRET-TOKEN-123"
        _code, _out, err = hook.main(json.dumps(
            {"tool_name": "Bash", "tool_input": {"command": secret, "extra": 1}, "x": secret}).encode()[:-5])
        self.assertNotIn(secret, err)


class EndToEnd(unittest.TestCase):
    """Run the real script in a child process the way Claude Code does (py -3 -I script)."""

    def run_hook(self, raw):
        return subprocess.run([sys.executable, "-I", str(HOOK_PATH)], input=raw,
                              capture_output=True, timeout=30)

    def test_deny_ask_allow_and_garbage(self):
        denied = self.run_hook(payload("git push --force"))
        self.assertEqual(0, denied.returncode)
        self.assertEqual("deny", json.loads(denied.stdout)["hookSpecificOutput"]["permissionDecision"])

        asked = self.run_hook(payload("git commit -m x"))
        self.assertEqual("ask", json.loads(asked.stdout)["hookSpecificOutput"]["permissionDecision"])

        allowed = self.run_hook(payload("git status"))
        self.assertEqual((0, b""), (allowed.returncode, allowed.stdout))

        self.assertEqual(2, self.run_hook(b"garbage").returncode)
        self.assertEqual(2, self.run_hook(b"").returncode)


if __name__ == "__main__":
    unittest.main()
