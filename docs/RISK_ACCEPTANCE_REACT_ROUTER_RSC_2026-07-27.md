# Time-limited risk acceptance: React Router RSC advisory

Status: Accepted until 2026-09-14
Owner: MAN 1 Rokan Hulu SchoolHub maintainer
Review date: 2026-08-14
Expiry: 2026-09-14

## Advisory

Trivy reports `GHSA-qwww-vcr4-c8h2` against React Router in both identity-card generator lockfiles. The upstream fixed version is React Router 8.3.0.

## Exposure and controls

- Both generators are client-only Vite SPAs using `HashRouter`.
- Neither generator uses React Server Components, SSR, loaders, actions, or server request handlers.
- The vulnerable RSC action path is absent from both applications.
- The production generator remains protected by SIAB2 authentication and role authorization.
- The ignore is limited to the two generator lockfiles and expires automatically.

## Decision

Accept this non-applicable RSC-only risk temporarily. React Router 8 removes `react-router-dom` and requires Node 22.22+, while repository CI currently uses Node 20.20.2; a safe major migration requires separate review.

## Required follow-up

- Re-check upstream React Router and repository Node support by 2026-08-14.
- Migrate imports from `react-router-dom` and upgrade both generators before 2026-09-14.
- Remove `.trivyignore.yaml` entry when the upgrade lands.
