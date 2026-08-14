import { Injectable } from '@nestjs/common';
import { PaymentStatus, UserRole, UserStatus, WhatsappAccountStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 7);

    const [
      totalClients,
      activeClients,
      expiredClients,
      blockedClients,
      totalWhatsappAccounts,
      connectedWhatsappAccounts,
      monthlyRevenueAgg,
      activeSubscriptions,
      upcomingRenewals,
      newEnquiries,
      recentActivations,
      recentPayments,
      recentEnquiries,
    ] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.user.count({ where: { role: UserRole.CLIENT, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { role: UserRole.CLIENT, status: UserStatus.EXPIRED } }),
      this.prisma.user.count({ where: { role: UserRole.CLIENT, status: UserStatus.BLOCKED } }),
      this.prisma.whatsappAccount.count(),
      this.prisma.whatsappAccount.count({ where: { status: WhatsappAccountStatus.CONNECTED } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCESS, paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.client.count({ where: { subscriptionEnd: { gt: now } } }),
      this.prisma.client.count({ where: { subscriptionEnd: { gt: now, lte: soon } } }),
      this.prisma.enquiry.count({ where: { status: 'NEW' } }),
      this.prisma.activationHistory.findMany({
        take: 5,
        orderBy: { activatedAt: 'desc' },
        include: { client: { select: { businessName: true } } },
      }),
      this.prisma.payment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { client: { select: { businessName: true } } },
      }),
      this.prisma.enquiry.findMany({ take: 5, orderBy: { createdAt: 'desc' } }),
    ]);

    return {
      totalClients,
      activeClients,
      expiredClients,
      blockedClients,
      totalWhatsappAccounts,
      connectedWhatsappAccounts,
      monthlyRevenue: monthlyRevenueAgg._sum.amount ?? 0,
      activeSubscriptions,
      upcomingRenewals,
      newEnquiries,
      recentActivations,
      recentPayments,
      recentEnquiries,
    };
  }
}
