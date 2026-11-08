#!/usr/bin/env python3
"""ProcureFlow AI: Claude Code PreToolUse hook that guards Git and other risky commands.

Claude Code runs this script before every Bash or PowerShell tool call and sends the call as
JSON on stdin. The script prints one decision:

  deny  -> destructive operations (force push, reset --hard, clean -fd, rm -rf, deleting .git,
           git config changes that add aliases or run programs, docker system prune ...).
           The command is blocked.
  ask   -> anything that could upload code, rewrite history, discard work or change the outside
           world, and anything this script cannot read with confidence. Claude Code shows a
           permission prompt and the human decides.
  none  -> everything else (git status, git diff, reading files ...). Normal permissions apply.

How it works (and why): a shell has a huge grammar (quotes, escapes, line continuations, wrappers
like env/sudo, keywords like then/do, eval, xargs ...). Parsing it exactly is not possible here,
so the script does NOT try to find "the program" of each segment. Instead it scans the whole
command text twice and looks for `git`, `rm`, `gh` ... anywhere:

  pass A: quote-aware (understands '...', "..." and backslash escapes);
  pass B: quote-blind (ignores quoting, so a quote trick cannot hide a command).

A deny seen by both passes is a deny. A deny seen only by pass B (for example inside a quoted
commit message, or behind an escaped quote) is downgraded to ask, so any disagreement between the
passes ends in a human decision and never in a silent allow.

Fail-closed: any problem (bad JSON, missing field, internal error) exits with code 2, which
Claude Code treats as "block". Exit code 1 and timeouts would NOT block, so settings.json also
sets onFailure=block.

IMPORTANT: this is NOT a sandbox and NOT a security boundary. It cannot see aliases defined
elsewhere, scripts written to disk and run later, commands built from variables, or anything
you type outside Claude Code. The real protection for remote history is a GitHub branch ruleset.
Standard library only; no network; no file writes.
"""

import json
import re
import sys

DENY, ASK = "deny", "ask"
MAX_COMMAND_LENGTH = 50000  # longer commands are not analysed; a human looks at them

DELETERS = {"rm", "del", "erase", "rmdir", "rd", "remove-item", "ri"}

# gh: first word -> second words that change GitHub and need approval
GH_ASK = {
    "pr": {"create", "merge", "close", "reopen", "review", "edit", "ready", "comment"},
    "repo": {"create", "delete", "edit", "rename", "archive"},
    "release": {"create", "delete", "upload", "edit"},
    "secret": {"set", "delete"},
    "variable": {"set", "delete"},
    "workflow": {"run", "enable", "disable"},
}

# program -> subcommand words that need approval (None = any use needs approval)
UPLOAD_RULES = {
    "vercel": None, "scp": None, "sftp": None, "rsync": None,
    "netlify": {"deploy"}, "fly": {"deploy"}, "flyctl": {"deploy"},
    "railway": {"up", "deploy"}, "wrangler": {"deploy", "publish"},
    "firebase": {"deploy"}, "serverless": {"deploy"}, "sls": {"deploy"},
    "terraform": {"apply", "destroy"}, "tofu": {"apply", "destroy"},
    "pulumi": {"up", "destroy"}, "kubectl": {"apply", "create", "delete"},
    "helm": {"install", "upgrade"}, "twine": {"upload"}, "cargo": {"publish"},
    "npm": {"publish", "deploy"}, "pnpm": {"publish", "deploy"},
    "yarn": {"publish", "deploy"},
    "gcloud": {"deploy"}, "aws": {"deploy"}, "az": {"deploy"},
}

# Git sub-commands we know. An unknown one might be an alias (for example `git pf` meaning
# `git push --force`), so it needs approval.
KNOWN_SUBCOMMANDS = {
    "add", "am", "annotate", "apply", "archive", "bisect", "blame", "branch", "bundle", "cat-file",
    "check-attr", "check-ignore", "checkout", "cherry", "cherry-pick", "clean", "clone", "commit",
    "commit-tree", "config", "count-objects", "describe", "diff", "diff-files", "diff-index",
    "diff-tree", "difftool", "fetch", "filter-branch", "filter-repo", "for-each-ref",
    "format-patch", "fsck", "gc", "grep", "hash-object", "help", "http-push", "init", "log",
    "ls-files", "ls-remote", "ls-tree", "maintenance", "merge", "merge-base", "mergetool", "mktree",
    "mv", "name-rev", "notes", "pack-refs", "prune", "pull", "push", "range-diff", "rebase",
    "reflog", "remote", "repack", "replace", "request-pull", "reset", "restore", "rev-list",
    "rev-parse", "revert", "rm", "send-pack", "shortlog", "show", "show-branch", "show-ref",
    "sparse-checkout", "stash", "status", "submodule", "switch", "symbolic-ref", "tag",
    "update-index", "update-ref", "var", "verify-commit", "verify-tag", "version", "whatchanged",
    "worktree", "write-tree",
}

# Sub-commands that always need approval, with the reason shown to the human.
ASK_SUBCOMMANDS = {
    "commit": "git commit records changes in history",
    "commit-tree": "git commit-tree creates a commit",
    "rebase": "git rebase rewrites history",
    "update-ref": "git update-ref moves or deletes branches and tags directly",
    "merge": "git merge creates commits",
    "pull": "git pull downloads code and creates commits",
    "cherry-pick": "git cherry-pick creates commits",
    "revert": "git revert creates commits",
    "am": "git am creates commits",
    "filter-branch": "rewriting history needs a human decision",
    "filter-repo": "rewriting history needs a human decision",
}

# Config keys that can add aliases, redirect pushes or make git run programs.
DANGEROUS_CONFIG_KEY = re.compile(
    r"^(alias\.|core\.(sshcommand|hookspath|fsmonitor|pager|editor|askpass|gitproxy)$"
    r"|credential\.|url\.|remote\.|push\.|receive\.|include|filter\.|sequence\.editor$"
    r"|gpg\.program$|diff\.external$|diff\..*\.(command|textconv)$|merge\..*\.driver$"
    r"|difftool\.|mergetool\.|http\.(proxy|sslverify)$|safe\.|init\.templatedir$)")

# Environment variables that change how git behaves or runs programs.
DANGEROUS_GIT_ENV = re.compile(
    r"^(?:\$env:)?git_(?:config\w*|ssh\w*|askpass|external_diff|editor|sequence_editor|pager"
    r"|exec_path|template_dir|proxy_command|dir|work_tree)(?:=|$)", re.IGNORECASE)

HAS_GIT = re.compile(r"(?<![a-z0-9_])git(?![a-z0-9_])", re.IGNORECASE)
DYNAMIC_TEXT = re.compile(
    r"\$|%[a-z_][a-z0-9_]+%|\beval\b|\biex\b|invoke-expression|\bxargs\b|base64"
    r"|\balias\b|\bset-alias\b|\bnew-alias\b", re.IGNORECASE)  # aliases hide the real command
ENCODED_TEXT = re.compile(
    r"(?<![a-z0-9])-(?:enc|ec|encodedcommand)(?![a-z0-9])|frombase64string"
    r"|base64\s+(?:-d|--decode)|certutil\s+-decode", re.IGNORECASE)

ESCAPABLE = set("\"'`$ \\;&|()<>-+#{}")  # a backslash before these makes them literal


# --------------------------------------------------------------------------------------
# Turning the command text into tokens
# --------------------------------------------------------------------------------------

def join_continuations(text):
    """Join lines ended by \\ (bash), ` (PowerShell) or ^ (cmd), as the shell would."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"[\\`^]\n", "", text)


def split_quoted(text):
    """Pass A: split into segments of tokens, understanding quotes and backslash escapes."""
    segments, tokens, buf = [], [], []
    state = {"quote": None, "in_token": False}

    def flush_token():
        if state["in_token"]:
            tokens.append("".join(buf))
        buf.clear()
        state["in_token"] = False

    def flush_segment():
        flush_token()
        if tokens:
            segments.append(list(tokens))
        tokens.clear()

    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        i += 1
        quote = state["quote"]
        if quote:
            if ch == quote:
                state["quote"] = None
            elif ch == "\\" and quote == '"' and i < n and text[i] in '"\\$`':
                buf.append(text[i])
                i += 1
            else:
                buf.append(ch)
            continue
        if ch == "\\" and i < n and text[i] in ESCAPABLE:
            buf.append(text[i])  # escaped character is literal: it cannot open a quote
            i += 1
            state["in_token"] = True
        elif ch in "'\"":
            state["quote"] = ch
            state["in_token"] = True
        elif ch == "`":
            continue  # PowerShell escape / old-style substitution marker: drop it
        elif ch in ";&|\n":
            flush_segment()
        elif ch.isspace() or ch in "(){}":
            flush_token()
        else:
            buf.append(ch)
            state["in_token"] = True
    flush_segment()  # an unterminated quote keeps what we have
    return segments


def blind_views(text):
    """Pass B: ignore quoting completely. Returns two views of the segments:
    one where \\ becomes / (paths such as C:\\x\\git.exe) and one where \\ is removed
    (so g\\it and pu`sh become git and push)."""
    text = re.sub(r"\$(?=['\"])", "", text)  # $'...' and $"..." quoting
    for ch in "'\"`^":
        text = text.replace(ch, "")
    views = []
    for flat in (text.replace("\\", "/"), text.replace("\\", "")):
        segments = []
        for part in re.split(r"[;&|\n]", flat):
            tokens = [t for t in re.split(r"[\s(){},]+", part) if t]
            if tokens:
                segments.append(tokens)
        views.append(segments)
    return views


def base(token):
    """Program name without folder and .exe, lower-case. Options are never programs."""
    if token.startswith("-"):
        return ""
    name = token.replace("\\", "/").rsplit("/", 1)[-1].lower()
    return name[:-4] if name.endswith(".exe") else name


def is_long(arg, full, min_len):
    """True if arg is --full or an unambiguous abbreviation (git allows these)."""
    head = arg.split("=", 1)[0].lower()
    return head.startswith("--") and len(head) >= min_len and full.startswith(head)


def is_cluster(arg):
    return re.fullmatch(r"-[A-Za-z]+", arg) is not None


# --------------------------------------------------------------------------------------
# Rules per program
# --------------------------------------------------------------------------------------

def check_config_value(option, value):
    key = value.split("=", 1)[0].lower()
    if DANGEROUS_CONFIG_KEY.match(key):
        return [(DENY, "git %s sets a config key that can add aliases, redirect pushes or "
                       "run programs" % option)]
    return [(ASK, "git %s changes configuration for one command" % option)]


def check_git_config(rest):
    opts = {a.lower() for a in rest if a.startswith("-")}
    pos = [a for a in rest if not a.startswith("-")]
    if pos and pos[0].lower() in ("get", "list"):
        return []
    if opts & {"--get", "--get-all", "--get-regexp", "--get-urlmatch", "--get-color",
               "--get-colorbool", "-l", "--list"}:
        return []
    write_word = bool(pos) and pos[0].lower() in {"set", "unset", "edit", "rename-section",
                                                  "remove-section"}
    if write_word:
        pos = pos[1:]
    writes = (write_word or len(pos) >= 2 or bool(opts & {
        "--add", "--unset", "--unset-all", "--replace-all", "--rename-section",
        "--remove-section", "-e", "--edit", "--file", "-f"}))
    if not writes:
        return []
    if opts & {"--global", "--system", "-e", "--edit"}:
        return [(DENY, "git config --global/--system/--edit changes settings outside this "
                       "repository")]
    key = pos[0].lower() if pos else ""
    if DANGEROUS_CONFIG_KEY.match(key):
        return [(DENY, "git config key '%s' can add aliases, redirect pushes or run "
                       "programs" % key)]
    return [(ASK, "git config changes repository settings")]


def check_push(rest):
    for a in rest:
        low = a.lower()
        short_cluster = is_cluster(a) and ("f" in a or "d" in a)
        if (is_long(a, "--force", 5) or low.startswith("--force-")
                or is_long(a, "--mirror", 4) or is_long(a, "--delete", 4)
                or is_long(a, "--prune", 4) or short_cluster
                or a.startswith("+") or (a.startswith(":") and len(a) > 1)):
            return [(DENY, "git push that forces, mirrors, prunes or deletes rewrites or "
                           "destroys remote history")]
    return [(ASK, "git push uploads code to a remote")]


def check_git(args):
    findings = []
    i = 0
    while i < len(args):  # skip global options such as -C <dir>, -c k=v
        a = args[i]
        if a in ("-C", "--git-dir", "--work-tree", "--namespace", "--super-prefix"):
            i += 2
        elif a in ("-c", "--config-env"):
            findings += check_config_value(a, args[i + 1] if i + 1 < len(args) else "")
            i += 2
        elif a.startswith("-"):
            if a.lower().startswith("--config-env="):
                findings += check_config_value("--config-env", a.split("=", 1)[1])
            elif a.lower().startswith("--exec-path"):
                findings.append((ASK, "git --exec-path changes which programs git runs"))
            i += 1
        else:
            break
    if i >= len(args):
        return findings
    sub, rest = args[i].lower(), args[i + 1:]
    words = [a.lower() for a in rest if not a.startswith("-")]

    if sub in ASK_SUBCOMMANDS:
        findings.append((ASK, ASK_SUBCOMMANDS[sub]))
    if sub in ("push", "send-pack", "http-push"):
        findings += check_push(rest)
    elif sub == "reset":
        if any(is_long(a, "--hard", 4) for a in rest):
            findings.append((DENY, "git reset --hard throws away uncommitted work"))
        elif any(is_long(a, "--keep", 4) or is_long(a, "--merge", 4) for a in rest):
            findings.append((ASK, "git reset can discard uncommitted work"))
    elif sub == "clean":
        letters = "".join(a[1:] for a in rest if is_cluster(a))
        force = "f" in letters or any(is_long(a, "--force", 4) for a in rest)
        dry = "n" in letters or any(is_long(a, "--dry-run", 4) for a in rest)
        if force and not dry:
            if any(c in letters for c in "dxX"):
                findings.append((DENY, "git clean -fd/-fdx permanently deletes untracked "
                                       "files and folders"))
            else:
                findings.append((ASK, "git clean -f permanently deletes untracked files"))
    elif sub == "commit":
        if any(is_long(a, "--amend", 4) for a in rest):
            findings.append((ASK, "git commit --amend rewrites the last commit"))
    elif sub == "remote":
        if words and words[0] in {"add", "remove", "rm", "rename", "set-url"}:
            findings.append((ASK, "git remote changes where code can be uploaded"))
    elif sub == "config":
        findings += check_git_config(rest)
    elif sub == "reflog":
        if words and words[0] in {"expire", "delete"}:
            findings.append((ASK, "git reflog expire/delete removes the safety net for history"))
    elif sub == "gc":
        if any(is_long(a, "--prune", 4) for a in rest):
            findings.append((ASK, "git gc --prune permanently removes unreachable commits"))
    elif sub == "branch":
        if any((is_cluster(a) and any(c in a for c in "dDfmM"))
               or any(is_long(a, full, 4) for full in ("--delete", "--force", "--move"))
               for a in rest):
            findings.append((ASK, "git branch delete, force or move can lose commits"))
    elif sub == "tag":
        if any((is_cluster(a) and ("d" in a or "f" in a))
               or is_long(a, "--delete", 4) or is_long(a, "--force", 4) for a in rest):
            findings.append((ASK, "git tag delete or force can lose a release marker"))
    elif sub == "stash":
        if words and words[0] in {"drop", "clear"}:
            findings.append((ASK, "git stash drop/clear permanently discards saved work"))
    elif sub == "checkout":
        if "." in rest or any((is_cluster(a) and "f" in a) or is_long(a, "--force", 4)
                              for a in rest):
            findings.append((ASK, "git checkout . or -f throws away uncommitted work"))
    elif sub == "restore":
        staged_only = (any(is_long(a, "--staged", 4) or a == "-S" for a in rest)
                       and not any(is_long(a, "--worktree", 4) or a == "-W" for a in rest))
        if "." in rest and not staged_only:
            findings.append((ASK, "git restore . throws away uncommitted work"))
    elif sub == "switch":
        if any((is_cluster(a) and "f" in a) or is_long(a, "--force", 4)
               or is_long(a, "--discard-changes", 4) for a in rest):
            findings.append((ASK, "git switch -f throws away uncommitted work"))
    if sub not in KNOWN_SUBCOMMANDS:
        findings.append((ASK, "git sub-command '%s' is not a known git command; it may be an "
                              "alias that hides another command" % args[i][:40]))
    return findings


def delete_flags(args):
    """(recursive, force) for rm, Remove-Item, rmdir, del. Understands -rf, -Recurse, /s /q."""
    recursive = force = False
    for a in args:
        low = a.lower().split(":", 1)[0]
        if low == "/s":
            recursive = True
        elif low in ("/q", "/f"):
            force = True
        elif re.fullmatch(r"-[a-z]+", low):
            if "-recurse".startswith(low) and len(low) >= 2:
                recursive = True
            elif "-force".startswith(low) and len(low) >= 2:
                force = True
            else:
                letters = a[1:].split(":", 1)[0]
                if len(letters) <= 4:  # unix style cluster such as -rf, -fr, -Rf
                    recursive = recursive or "r" in letters or "R" in letters
                    force = force or "f" in letters
        elif is_long(a, "--recursive", 4):
            recursive = True
        elif is_long(a, "--force", 4):
            force = True
    return recursive, force


def check_delete(args):
    findings = []
    recursive, force = delete_flags(args)
    if recursive and force:
        findings.append((DENY, "recursive forced delete (rm -rf) is on the project's never-run "
                               "list"))
    elif recursive:
        findings.append((ASK, "recursive delete removes whole folders"))
    for a in args:
        target = re.sub(r"^-[a-z]+:", "", a.lower())  # -Path:.git -> .git
        parts = [p.rstrip(". ") for p in re.split(r"[/\\,]", target)]  # NTFS ignores . and space
        parts = [p for p in parts if p]
        if ".git" in parts or "git~1" in parts:
            if recursive or parts[-1] in (".git", "git~1"):
                findings.append((DENY, "deleting the .git folder destroys the whole repository "
                                       "history"))
            else:
                findings.append((ASK, "deleting a file inside .git can corrupt the repository"))
            break
    return findings


def check_gh(args):
    words, i = [], 0
    while i < len(args):
        a = args[i]
        if a.lower() in ("-r", "--repo", "--hostname"):
            i += 2  # these options take a value; it is not a sub-command word
        else:
            if not a.startswith("-"):
                words.append(a.lower())
            i += 1
    if words[:1] == ["api"]:
        method = None
        for j, a in enumerate(args):
            low = a.lower()
            if low in ("-x", "--method") and j + 1 < len(args):
                method = args[j + 1].lower()
            elif low.startswith("--method="):
                method = low.split("=", 1)[1]
            elif low.startswith("-x") and len(low) > 2:
                method = low[2:]
        sends_data = any(a in ("-f", "-F", "--field", "--raw-field", "--input")
                         or a.startswith(("--field=", "--raw-field=", "--input="))
                         for a in args)
        if sends_data or method not in (None, "get"):
            return [(ASK, "gh api with a write method or data changes GitHub")]
    elif len(words) >= 2 and words[1] in GH_ASK.get(words[0], ()):
        return [(ASK, "gh %s %s changes GitHub" % (words[0], words[1]))]
    return []


def check_docker(args):
    words = [a.lower() for a in args if not a.startswith("-")]
    findings = []
    if "system" in words and "prune" in words:
        findings.append((DENY, "docker system prune is on the project's never-run list"))
    elif "prune" in words:
        findings.append((ASK, "docker prune permanently removes images, containers or volumes"))
    if any(a.lower() == "push" or a.lower().startswith("--push") for a in args):
        findings.append((ASK, "pushing a container image uploads code"))
    return findings


def scan_tokens(tokens):
    """Look at every token as a possible program name, wherever it sits in the segment."""
    findings = []
    seen_git = False
    for i, tok in enumerate(tokens):
        if DANGEROUS_GIT_ENV.match(tok):
            findings.append((DENY, "setting GIT_CONFIG*, GIT_SSH*, GIT_DIR, GIT_ASKPASS ... can "
                                   "change what git does or run programs"))
        prog, args = base(tok), tokens[i + 1:]
        if prog == "git":
            seen_git = True
            findings += check_git(args)
        elif prog in DELETERS and not seen_git:  # after `git`, "rm" is a git sub-command
            findings += check_delete(args)
        elif prog == "gh":
            findings += check_gh(args)
        elif prog in ("docker", "podman"):
            findings += check_docker(args)
        elif prog in UPLOAD_RULES:
            subs = UPLOAD_RULES[prog]
            words = [a.lower() for a in args if not a.startswith("-")]
            if subs is None or any(w in subs for w in words):
                findings.append((ASK, prog + " can deploy or upload code"))
    return findings


def scan(segments):
    findings = []
    for tokens in segments:
        findings += scan_tokens(tokens)
    return findings


# --------------------------------------------------------------------------------------
# Putting it together
# --------------------------------------------------------------------------------------

def opacity_findings(text):
    """Text the scan cannot read with confidence needs a human."""
    flat = text.replace("'", "").replace('"', "")
    findings = []
    if ENCODED_TEXT.search(flat):
        findings.append((ASK, "the command contains encoded or hidden command text"))
    if HAS_GIT.search(flat) and DYNAMIC_TEXT.search(flat):
        findings.append((ASK, "a git command mixed with variables or dynamic text the hook "
                              "cannot read"))
    return findings


def combine(pass_a, pass_b):
    """Deny only when both passes agree; a deny seen only by pass B becomes ask."""
    findings = list(pass_a)
    for level, reason in pass_b:
        if (level, reason) in pass_a:
            continue
        if level == DENY:
            findings.append((ASK, reason + " (seen only in quoted or escaped text)"))
        else:
            findings.append((level, reason))
    return findings


def analyse(command):
    if len(command) > MAX_COMMAND_LENGTH:
        return [(ASK, "the command is too long for the hook to check")]
    text = join_continuations(command)
    pass_a = scan(split_quoted(text))
    pass_b = []
    for view in blind_views(text):
        pass_b += scan(view)
    return combine(pass_a, pass_b) + opacity_findings(text)


def decision(findings, command):
    """The JSON to print for Claude Code, or an empty string for 'no opinion'."""
    for level in (DENY, ASK):
        reasons = sorted({r for lv, r in findings if lv == level})
        if not reasons:
            continue
        if level == DENY:
            text = ("Blocked by .claude/hooks/protect-git.py: " + "; ".join(reasons)
                    + ". Do not retry or work around this. Ask the project owner.")
        else:
            shown = " ".join(command.split())[:200]
            text = ("Needs human approval (.claude/hooks/protect-git.py): "
                    + "; ".join(reasons) + ". Command: " + shown)
        return json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": level,
            "permissionDecisionReason": text}})
    return ""


def main(raw):
    """Returns (exit_code, stdout_text, stderr_text). Never prints, never raises."""
    try:
        data = json.loads(raw.decode("utf-8-sig"))
        if not isinstance(data, dict) or not isinstance(data.get("tool_name"), str):
            raise ValueError("input is not a tool-call object with a tool_name")
        if data["tool_name"] not in ("Bash", "PowerShell"):
            return 0, "", ""  # not our job; normal permissions apply
        tool_input = data.get("tool_input")
        command = tool_input.get("command") if isinstance(tool_input, dict) else None
        if not isinstance(command, str):
            raise ValueError("tool_input.command is missing or not text")
        return 0, decision(analyse(command), command), ""
    except Exception as exc:  # exit 2 blocks; exit 1 would silently allow
        # Only the error type is reported: never the command text.
        return 2, "", ("protect-git hook could not check this command (%s). "
                       "Blocking to be safe.\n" % type(exc).__name__)


def run(raw=None):
    """Entry point. Any failure at all, even outside main(), ends in exit code 2 (block)."""
    try:
        if raw is None:
            raw = sys.stdin.buffer.read()
        code, out, err = main(raw)
        if out:
            sys.stdout.write(out + "\n")
            sys.stdout.flush()
        if err:
            sys.stderr.write(err)
        return code
    except BaseException:  # noqa: BLE001 - fail closed on absolutely everything
        try:
            sys.stderr.write("protect-git hook failed internally. Blocking to be safe.\n")
        except BaseException:  # noqa: BLE001
            pass
        return 2


if __name__ == "__main__":
    sys.exit(run())
