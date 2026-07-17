# Contributing

Thank you for your interest in Blackbox BOM. This project is currently under active internal development and is not accepting external contributions.

## Code of Conduct

All contributors and maintainers are expected to adhere to the project's Code of Conduct. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Reporting Issues

- **Security vulnerabilities**: Report via [SECURITY.md](SECURITY.md) — do not file a public issue.
- **Bug reports**: Open a GitHub issue with steps to reproduce, expected vs actual behavior, and environment details.
- **Feature requests**: Open a GitHub issue describing the use case and proposed solution.

## Development Setup

1. Clone the repository.
2. Install backend dependencies: `pip install -r backend/requirements.txt`
3. Install frontend dependencies: `cd BOM\ and\ PRD && npm install`
4. Copy `.env.example` to `.env` and configure.
5. Run backend: `python backend/app/main.py`
6. Run frontend: `cd BOM\ and\ PRD && npm run dev`

## Pull Request Process

1. Ensure all tests pass: `python -m pytest backend/app/tests/`
2. Update CHANGELOG.md and RELEASE_NOTES.md with your changes.
3. Request review from a project maintainer.
4. Maintainers will merge after approval.

## Coding Standards

- **Python**: Follow PEP 8. Run `ruff check .` before committing.
- **TypeScript/React**: Follow existing component patterns. Use TypeScript strict mode.
- **Tests**: All new features must include tests. Existing tests must not regress.
