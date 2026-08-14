import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DiscountType, Prisma, VoucherStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVoucherDto) {
    const existing = await this.prisma.voucher.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('A voucher with this code already exists.');
    return this.prisma.voucher.create({
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateVoucherDto) {
    await this.findById(id);
    return this.prisma.voucher.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      },
    });
  }

  async findById(id: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw new NotFoundException('Voucher not found.');
    return voucher;
  }

  list() {
    return this.prisma.voucher.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /**
   * Server-side voucher validation + discount calculation (spec §4).
   * The caller must NEVER pass a pre-computed discount amount from the frontend.
   */
  async validateAndCalculate(code: string, clientId: string, purchaseAmount: number) {
    const voucher = await this.prisma.voucher.findUnique({ where: { code } });
    if (!voucher) throw new BadRequestException('Voucher code is invalid.');
    if (voucher.status !== VoucherStatus.ACTIVE) throw new BadRequestException('Voucher is not active.');

    const now = new Date();
    if (voucher.startDate && voucher.startDate > now) throw new BadRequestException('Voucher is not yet valid.');
    if (voucher.expiryDate && voucher.expiryDate < now) throw new BadRequestException('Voucher has expired.');

    if (Number(voucher.minPurchaseAmount) > purchaseAmount) {
      throw new BadRequestException(
        `This voucher requires a minimum purchase of ${voucher.minPurchaseAmount}.`,
      );
    }

    if (voucher.maxUsage != null) {
      const totalUsage = await this.prisma.voucherUsage.count({ where: { voucherId: voucher.id } });
      if (totalUsage >= voucher.maxUsage) throw new BadRequestException('Voucher usage limit has been reached.');
    }

    const clientUsage = await this.prisma.voucherUsage.count({ where: { voucherId: voucher.id, clientId } });
    if (clientUsage >= voucher.perUserUsageLimit) {
      throw new BadRequestException('You have already used this voucher the maximum number of times.');
    }

    const discountAmount =
      voucher.discountType === DiscountType.PERCENTAGE
        ? (purchaseAmount * Number(voucher.discountValue)) / 100
        : Math.min(Number(voucher.discountValue), purchaseAmount);

    const finalAmount = Math.max(0, purchaseAmount - discountAmount);

    return { voucher, discountAmount, finalAmount };
  }

  async recordUsage(
    voucherId: string,
    clientId: string,
    amount: number,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.voucherUsage.create({ data: { voucherId, clientId, amount } });
  }
}
