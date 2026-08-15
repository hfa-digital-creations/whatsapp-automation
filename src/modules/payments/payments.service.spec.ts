import { BadRequestException } from '@nestjs/common';
import { PaymentType } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService.recordPayment', () => {
  function makeService(opts: {
    client?: any;
    plan?: any;
    voucherResult?: { finalAmount: number; voucher: { id: string } };
  }) {
    const tx = { payment: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'payment-1', ...data })) } };
    const prisma = {
      client: { findUnique: jest.fn().mockResolvedValue(opts.client) },
      plan: { findUnique: jest.fn().mockResolvedValue(opts.plan) },
      $transaction: jest.fn().mockImplementation((cb: any) => cb(tx)),
    };
    const vouchersService = {
      validateAndCalculate: jest.fn().mockResolvedValue(opts.voucherResult),
      recordUsage: jest.fn().mockResolvedValue(undefined),
    };
    const events = { emit: jest.fn() };
    return {
      service: new PaymentsService(prisma as any, vouchersService as any, events as any),
      prisma,
      vouchersService,
      events,
      tx,
    };
  }

  it('derives the amount from the plan price for a subscription payment — never from the caller', async () => {
    const { service, tx } = makeService({
      client: { id: 'client-1', plan: null },
      plan: { id: 'plan-1', price: 2999, currency: 'INR' },
    });

    const result = await service.recordPayment('client-1', { type: PaymentType.SUBSCRIPTION, planId: 'plan-1' });

    expect(result.amount).toBe(2999);
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 2999, planId: 'plan-1' }) }),
    );
  });

  it('derives the amount from the client\'s current plan additionalAccountPrice for an add-on purchase', async () => {
    const { service } = makeService({
      client: { id: 'client-1', plan: { id: 'plan-1', additionalAccountPrice: 799, currency: 'INR' } },
    });

    const result = await service.recordPayment('client-1', { type: PaymentType.ADDITIONAL_ACCOUNT });
    expect(result.amount).toBe(799);
  });

  it('rejects an additional-account purchase when the client has no active plan', async () => {
    const { service } = makeService({ client: { id: 'client-1', plan: null } });
    await expect(service.recordPayment('client-1', { type: PaymentType.ADDITIONAL_ACCOUNT })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a subscription payment referencing a plan that does not exist', async () => {
    const { service } = makeService({ client: { id: 'client-1', plan: null }, plan: null });
    await expect(
      service.recordPayment('client-1', { type: PaymentType.SUBSCRIPTION, planId: 'bogus-plan' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('applies the voucher-calculated final amount, not the plan base price, when a voucher is supplied', async () => {
    const { service, vouchersService, tx } = makeService({
      client: { id: 'client-1', plan: null },
      plan: { id: 'plan-1', price: 2999, currency: 'INR' },
      voucherResult: { finalAmount: 2399, voucher: { id: 'voucher-1' } },
    });

    const result = await service.recordPayment('client-1', {
      type: PaymentType.SUBSCRIPTION,
      planId: 'plan-1',
      voucherCode: 'SAVE600',
    });

    expect(vouchersService.validateAndCalculate).toHaveBeenCalledWith('SAVE600', 'client-1', 2999);
    expect(result.amount).toBe(2399);
    expect(vouchersService.recordUsage).toHaveBeenCalledWith('voucher-1', 'client-1', 2399, tx);
  });

  it('does not touch voucher usage when no voucher code is supplied', async () => {
    const { service, vouchersService } = makeService({
      client: { id: 'client-1', plan: null },
      plan: { id: 'plan-1', price: 2999, currency: 'INR' },
    });

    await service.recordPayment('client-1', { type: PaymentType.SUBSCRIPTION, planId: 'plan-1' });
    expect(vouchersService.recordUsage).not.toHaveBeenCalled();
  });
});
