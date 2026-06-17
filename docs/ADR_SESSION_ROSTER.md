# ADR: Immutable SessionRoster

Status: Accepted

Historical attendance must not be reinterpreted through current mutable class enrollment. `SessionRoster` snapshots student and class identity at generation/open/backfill time and attendance writes/corrections validate against the snapshot. Default ALPA rows are `DEFAULTED` until teacher confirmation or explicit finalization.

Migration: `0028_session_roster_attendance_review`.
