# ADR: Effective-dated class enrollment

Status: Accepted

SchoolHub treats a student as belonging to exactly one primary class for any school business date. Historical class membership is represented by `ClassEnrollment.effectiveFrom` and optional `effectiveTo`; `effectiveTo` is inclusive. Adjacent periods are valid, overlapping periods for the same student are invalid.

Implementation notes:

- Future enrollment and transfer writes must set `effectiveFrom` explicitly from the Asia/Jakarta business date.
- `academicYearId` and `semesterId` are resolved from explicit input or the active academic period.
- Transfer closes the previous overlapping enrollment and creates the new enrollment in one serializable transaction.
- PostgreSQL exclusion constraint `ClassEnrollment_student_no_overlap_excl` enforces no overlapping periods for one student.
- The legacy permanent uniqueness on `(classId, studentId)` is removed so re-enrollment in a later non-overlapping period can succeed.
