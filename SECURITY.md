# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in RunHQ, please report it by opening a
[GitHub Security Advisory](https://github.com/erdembas/runhq/security/advisories/new).

Please **do not** report security vulnerabilities through public GitHub issues.

## What to Include

- A description of the vulnerability.
- Steps to reproduce the issue.
- The affected version(s).
- Any potential impact.

## Response Time

We aim to acknowledge reports within 48 hours and provide a fix or mitigation
within 7 days, depending on severity.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Scope

RunHQ is a local-only desktop application. It does not make network requests
(except for checking for updates) and does not collect any telemetry. Security
issues related to local privilege escalation, arbitrary command execution, or
filesystem access outside the configured working directories are in scope.
