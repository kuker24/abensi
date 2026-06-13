# Geolocation Policy

Business context: teacher class-session open/close may include browser geolocation evidence. The server never trusts client-calculated distance and never fabricates coordinates.

## Open Session

- Browser must send `latitude`, `longitude`, `accuracyMeter`, `capturedAt`, and `source: "browser_geolocation"`.
- API validates latitude/longitude, non-negative accuracy, freshness (`SESSION_GEO_MAX_AGE_SECONDS`, default 120), and maximum accuracy (`SESSION_GEO_MAX_ACCURACY_METER`, default 100).
- If geofence enforcement is enabled, API computes distance server-side from the configured school center and rejects outside-radius attempts.
- Audit metadata records latitude/longitude, accuracy, captured time, source, server-computed distance, geofence result, and gate-tap policy result.

## Close Session

- Current decision: close geofence is not mandatory server-side because a teacher may need to end a class when the browser cannot provide location, but the frontend still requests fresh browser location before submitting close.
- If close coordinates are supplied, the same server-side validation is applied before any coordinate is stored.
- If no valid coordinates are supplied, no coordinates are stored; the API does not use fallback/fixed coordinates.
