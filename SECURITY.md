# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Blackbox BOM, please report it privately. **Do not disclose the vulnerability publicly until it has been addressed.**

- **Email**: security@blackbox-bom.com (replace with actual address)
- **PGP Key**: Available on request

### What to include

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Any suggested fix (if known)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix deployment**: Depends on severity (critical: 7 days, high: 14 days, medium: 30 days, low: 90 days)
- **Public disclosure**: After fix is deployed and tested

## Security Measures

This project implements the following security controls:

- JWT-based authentication with RS256 signing
- Rate limiting (IP-based and per-user)
- CORS origin restriction
- Input sanitization (XSS prevention)
- SQL injection prevention (parameterized queries)
- WebSocket channel authorization
- CSRF token validation
- Audit logging for auth events
- Encrypted secrets at rest
- Environment-based configuration (no hardcoded credentials)

## Responsible Disclosure

We follow a coordinated disclosure process. Researchers who report valid vulnerabilities will be credited in release notes (if desired).
