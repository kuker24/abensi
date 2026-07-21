import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { CreateAcademicYearDto, CreateSemesterDto, UpdateAcademicYearDto, UpdateSemesterDto } from './academic.dto';

function dtoIsValid<T extends object>(Type: new () => T, values: Partial<T>) {
  return validateSync(Object.assign(new Type(), values)).length === 0;
}

describe('academic date-only DTOs', () => {
  it.each([
    [CreateAcademicYearDto, { code: '2026', name: '2026/2027', startsAt: '2026-02-29', endsAt: '2027-06-30' }],
    [UpdateAcademicYearDto, { startsAt: '2026-02-29' }],
    [CreateSemesterDto, { academicYearId: 'year-1', code: 'GANJIL', name: 'Ganjil', startsAt: '2026-04-31', endsAt: '2026-12-31' }],
    [UpdateSemesterDto, { endsAt: '2026-13-01' }]
  ])('rejects impossible academic date-only literals', (Type, values) => {
    expect(dtoIsValid(Type as new () => object, values as object)).toBe(false);
  });

  it.each([
    [CreateAcademicYearDto, { code: '2026', name: '2026/2027', startsAt: '2026-02-28', endsAt: '2027-06-30' }],
    [UpdateAcademicYearDto, { startsAt: '2026-02-28' }],
    [CreateSemesterDto, { academicYearId: 'year-1', code: 'GANJIL', name: 'Ganjil', startsAt: '2026-07-01', endsAt: '2026-12-31' }],
    [UpdateSemesterDto, { endsAt: '2026-12-31' }]
  ])('accepts valid date-only literals', (Type, values) => {
    expect(dtoIsValid(Type as new () => object, values as object)).toBe(true);
  });
});
