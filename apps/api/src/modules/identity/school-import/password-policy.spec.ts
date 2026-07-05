import { generateSchoolImportPassword } from './password-policy';

describe('generateSchoolImportPassword', () => {
  it('creates memorable 14-character passwords with required character classes', () => {
    for (let index = 0; index < 50; index += 1) {
      const password = generateSchoolImportPassword();
      expect(password).toHaveLength(14);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[#@!]/);
      expect(password).toMatch(/^[A-Z][a-z]{3}-[A-Z][a-z]{3}[#@!]\d{4}$/);
    }
  });
});
