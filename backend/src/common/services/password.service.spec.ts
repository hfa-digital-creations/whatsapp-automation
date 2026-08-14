import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes a password and verifies it correctly round-trips', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    await expect(service.compare('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password against a real hash', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.compare('wrong password', hash)).resolves.toBe(false);
  });

  it('never stores plaintext — each hash differs even for the same input (salted)', async () => {
    const [a, b] = await Promise.all([service.hash('same-password'), service.hash('same-password')]);
    expect(a).not.toBe(b);
  });

  it('generates temporary passwords of the expected length using only unambiguous characters', () => {
    const password = service.generateTemporaryPassword();
    expect(password).toHaveLength(10);
    expect(password).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]+$/);
    // O/0 and I/1/l are excluded so a human copying the password can't misread it.
    expect(password).not.toMatch(/[OIl01]/);
  });

  it('generates a different password on each call', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => service.generateTemporaryPassword()));
    expect(passwords.size).toBe(20);
  });
});
