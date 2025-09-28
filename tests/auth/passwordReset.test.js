import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

process.env.RESET_TOKEN_TTL_MINUTES = '45';
process.env.FRONTEND_RESET_URL = 'https://frontend.example/reset-password';

const mockMailer = {
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
};

const prismaMock = {
  app_user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  password_reset_token: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async handler => handler(prismaMock)),
};

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn(() => prismaMock),
  };
});

vi.mock('../../src/lib/mailer.js', () => mockMailer);

const authModule = await import('../../src/modules/auth/auth.controller.js');
const { requestPasswordReset, resetPassword } = authModule;

const createMockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

const resetPrismaMocks = () => {
  prismaMock.app_user.findUnique.mockReset();
  prismaMock.app_user.update.mockReset();
  prismaMock.password_reset_token.updateMany.mockReset();
  prismaMock.password_reset_token.create.mockReset();
  prismaMock.password_reset_token.findFirst.mockReset();
  prismaMock.password_reset_token.update.mockReset();
  prismaMock.$transaction.mockReset();
  prismaMock.$transaction.mockImplementation(async handler => handler(prismaMock));
  mockMailer.sendPasswordResetEmail.mockReset();
};

beforeEach(() => {
  resetPrismaMocks();
});

describe('requestPasswordReset', () => {
  it('creates a reset token and emails the user when the account exists', async () => {
    const user = {
      user_id: '11111111-1111-1111-1111-111111111111',
      email: '12345678@mynwu.ac.za',
    };

    prismaMock.app_user.findUnique.mockResolvedValue(user);
    prismaMock.password_reset_token.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.password_reset_token.create.mockResolvedValue({ token_id: 'token-123' });

    const req = {
      body: { identifier: '12345678' },
      ip: '127.0.0.1',
      get: vi.fn(() => 'vitest-agent'),
    };
    const res = createMockRes();

    await requestPasswordReset(req, res);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      message: 'If an account exists for the provided details, a password reset email has been sent.',
    });
    expect(prismaMock.password_reset_token.updateMany).toHaveBeenCalledWith({
      where: { user_id: user.user_id, consumed_at: null },
      data: { consumed_at: expect.any(Date) },
    });
    expect(prismaMock.password_reset_token.create).toHaveBeenCalled();

    const createdData = prismaMock.password_reset_token.create.mock.calls[0][0].data;
    expect(createdData.user_id).toBe(user.user_id);
    expect(createdData.expires_at.getTime()).toBeGreaterThan(Date.now());
    const ttlMs = Number(process.env.RESET_TOKEN_TTL_MINUTES) * 60 * 1000;
    expect(createdData.expires_at.getTime()).toBeLessThan(Date.now() + ttlMs + 1000);

    expect(mockMailer.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const emailArgs = mockMailer.sendPasswordResetEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe(user.email);
    expect(emailArgs.link).toContain(`uid=${encodeURIComponent(user.user_id)}`);
  });

  it('returns success message without leaking account existence when the user is missing', async () => {
    prismaMock.app_user.findUnique.mockResolvedValue(null);

    const req = {
      body: { identifier: 'notfound@example.com' },
      ip: '127.0.0.1',
      get: vi.fn(() => 'vitest-agent'),
    };
    const res = createMockRes();

    await requestPasswordReset(req, res);

    expect(res.json).toHaveBeenCalledWith({
      message: 'If an account exists for the provided details, a password reset email has been sent.',
    });
    expect(mockMailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('resetPassword', () => {
  it('updates the password and consumes active tokens when provided token matches', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    const rawToken = 'test-reset-token';
    const hashedToken = await bcrypt.hash(rawToken, 12);

    prismaMock.password_reset_token.findFirst.mockResolvedValue({
      token_id: 'reset-token-1',
      user_id: userId,
      token_hash: hashedToken,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
      consumed_at: null,
    });

    prismaMock.password_reset_token.update.mockResolvedValue({});
    prismaMock.password_reset_token.updateMany.mockResolvedValue({});
    prismaMock.app_user.update.mockResolvedValue({});

    const req = {
      body: { userId, token: rawToken, newPassword: 'NewStrongPass1!' },
    };
    const res = createMockRes();

    await resetPassword(req, res);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledTimes(1);

    expect(prismaMock.app_user.update).toHaveBeenCalledWith({
      where: { user_id: userId },
      data: { password_hash: expect.any(String) },
    });

    const storedHash = prismaMock.app_user.update.mock.calls[0][0].data.password_hash;
    expect(storedHash).not.toBe(req.body.newPassword);

    expect(prismaMock.password_reset_token.update).toHaveBeenCalledWith({
      where: { token_id: 'reset-token-1' },
      data: { consumed_at: expect.any(Date) },
    });

    expect(prismaMock.password_reset_token.updateMany).toHaveBeenCalledWith({
      where: {
        user_id: userId,
        consumed_at: null,
        token_id: { not: 'reset-token-1' },
      },
      data: { consumed_at: expect.any(Date) },
    });
  });

  it('rejects requests when the token lookup fails', async () => {
    prismaMock.password_reset_token.findFirst.mockResolvedValue(null);

    const req = {
      body: { userId: 'missing', token: 'bad', newPassword: 'Example123!' },
    };
    const res = createMockRes();

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired reset token' });
    expect(prismaMock.app_user.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
