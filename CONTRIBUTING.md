# Contributing

Thanks for helping improve Engineering Career Hub.

## Before you start

- Use an existing issue, or open one, before a large change.
- Keep the application offline-first and preserve the read-only knowledge-base
  boundary.
- Use synthetic fixtures in tests, screenshots, and bug reports. Never commit a
  personal knowledge base or local learning-state file.
- Keep the Electron renderer sandboxed and expose filesystem operations only
  through narrow, validated IPC handlers.

## Local setup

Requirements: Windows 10/11, Node.js 24 or newer, and Corepack.

    corepack enable
    corepack pnpm install --frozen-lockfile
    corepack pnpm typecheck
    corepack pnpm test
    corepack pnpm test:e2e

Build the current-user Windows installer with:

    corepack pnpm package:win

## Pull requests

- Keep changes focused and explain user-visible behavior.
- Add or update tests for behavior changes.
- Run type checking, unit tests, and Electron E2E tests before requesting
  review.
- Confirm git status contains no generated installer, private screenshot,
  environment file, or learning-state data.
- Update the README, user guide, or changelog when behavior changes.

By contributing, you agree that your contribution is licensed under the MIT
License.
