# Security Policy

## Supported versions

`agent-ready` is pre-1.0. Security fixes are released on the latest `0.x` line
only.

| Version | Supported |
|---|---|
| 0.1.x | ✓ |
| < 0.1 | ✕ |

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through
[GitHub Security Advisories](https://github.com/kiyohara1021/agent-ready/security/advisories/new).
If that is not available to you, email **kiyohara@plan-k.co.jp** with `agent-ready`
in the subject line.

Useful details:

- affected version and platform
- what an attacker can achieve
- a minimal reproduction, ideally a repository fixture
- whether the issue is already public

## What to expect

- acknowledgement of the report
- an assessment of severity and affected versions
- a fix or a documented mitigation on the latest `0.x` line
- credit in the release notes if you want it

Because this is a volunteer-maintained project, response times are best effort
rather than contractual. Please allow a reasonable disclosure window before
publishing details.

## Threat model

`agent-ready check` is a local, read-only analysis of a directory you point it
at. It does not:

- send repository content anywhere
- call an LLM or any other network API
- write to, or execute code from, the analyzed repository
- require an account, credential, or telemetry opt-out

Findings therefore stay on the machine that produced them.

### Analyzing untrusted repositories

Analyzing a repository you do not trust is still parsing untrusted input.
Reports that are especially welcome:

- a crafted repository that makes the analyzer hang, exhaust memory, or escape
  the analyzed directory (path traversal, symlink escape, symlink cycles)
- any output that leaks a secret **value** rather than a file path — detectors
  such as `safety.secrets` report locations and labels only, and printing a
  credential would be a bug
- any code path that executes a script, manifest, or binary from the analyzed
  repository

### Out of scope

- a readiness score you disagree with — that is a detector or scoring issue, so
  open a normal issue
- vulnerabilities in the repository *being analyzed*; `agent-ready` is not a
  security scanner for your project's dependencies or code
