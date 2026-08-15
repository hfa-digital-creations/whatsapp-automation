import { BadRequestException } from '@nestjs/common';
import { DiscountType, VoucherStatus } from '@prisma/client';
import { VouchersService } from './vouchers.service';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

const BASE_VOUCHER = {
  id: 'voucher-1',
  code: 'TEST20',
  discountType: DiscountType.PERCENTAGE as DiscountType,
  discountValue: 20 as number,
  maxUsage: null as number | null,
  perUserUsageLimit: 1,
  startDate: null as Date | null,
  expiryDate: null as Date | null,
  minPurchaseAmount: 0 as number,
  status: VoucherStatus.ACTIVE as VoucherStatus,
};

describe('VouchersService.validateAndCalculate', () => {
  function makeService(voucher: typeof BASE_VOUCHER | null, usageCount = 0) {
    const prisma = {
      voucher: { findUnique: jest.fn().mockResolvedValue(voucher) },
      voucherUsage: { count: jest.fn().mockResolvedValue(usageCount) },
    };
    return { service: new VouchersService(prisma as any), prisma };
  }

  it('calculates a percentage discount correctly', async () => {
    const { service } = makeService({ ...BASE_VOUCHER, discountType: DiscountType.PERCENTAGE, discountValue: 20 as any });
    const result = await service.validateAndCalculate('TEST20', 'client-1', 1000);
    expect(result.discountAmount).toBe(200);
    expect(result.finalAmount).toBe(800);
  });

  it('caps a fixed discount at the purchase amount instead of going negative', async () => {
    const { service } = makeService({ ...BASE_VOUCHER, discountType: DiscountType.FIXED_AMOUNT, discountValue: 500 as any });
    const result = await service.validateAndCalculate('TEST20', 'client-1', 300);
    expect(result.discountAmount).toBe(300);
    expect(result.finalAmount).toBe(0);
  });

  it('rejects an unknown voucher code', async () => {
    const { service } = makeService(null);
    await expect(service.validateAndCalculate('NOPE', 'client-1', 1000)).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive voucher', async () => {
    const { service } = makeService({ ...BASE_VOUCHER, status: VoucherStatus.INACTIVE });
    await expect(service.validateAndCalculate('TEST20', 'client-1', 1000)).rejects.toThrow(BadRequestException);
  });

  it('rejects a voucher that has not started yet', async () => {
    const { service } = makeService({ ...BASE_VOUCHER, startDate: daysFromNow(5) });
    await expect(service.validateAndCalculate('TEST20', 'client-1', 1000)).rejects.toThrow('Voucher is not yet valid.');
  });

  it('rejects an expired voucher', async () => {
    const { service } = makeService({ ...BASE_VOUCHER, expiryDate: daysFromNow(-1) });
    await expect(service.validateAndCalculate('TEST20', 'client-1', 1000)).rejects.toThrow('Voucher has expired.');
  });

  it('rejects a purchase below the minimum amount', async () => {
    const { service } = makeService({ ...BASE_VOUCHER, minPurchaseAmount: 2000 as any });
    await expect(service.validateAndCalculate('TEST20', 'client-1', 1000)).rejects.toThrow(BadRequestException);
  });

  it('rejects once the total usage limit is reached', async () => {
    const { service } = makeService({ ...BASE_VOUCHER, maxUsage: 5 }, 5);
    await expect(service.validateAndCalculate('TEST20', 'client-1', 1000)).rejects.toThrow('usage limit has been reached');
  });

  it('rejects once a specific client has used it the maximum number of times', async () => {
    const { service } = makeService({ ...BASE_VOUCHER, perUserUsageLimit: 1 }, 1);
    await expect(service.validateAndCalculate('TEST20', 'client-1', 1000)).rejects.toThrow('maximum number of times');
  });
});
