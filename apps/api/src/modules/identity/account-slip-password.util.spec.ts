import { generateAccountSlipPassword } from './account-slip-password.util';

describe('generateAccountSlipPassword', () => {
  it('generates a strong non-ambiguous password for account slips', () => {
    const password = generateAccountSlipPassword();

    expect(password).toHaveLength(14);
    expect(password).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/);
  });

  it('rejects unsafe custom lengths', () => {
    expect(() => generateAccountSlipPassword(8)).toThrow('12-32');
    expect(() => generateAccountSlipPassword(64)).toThrow('12-32');
  });
});
