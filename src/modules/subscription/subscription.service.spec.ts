import { DurationType } from '@prisma/client';
import { SubscriptionService } from './subscription.service';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

describe('SubscriptionService', () => {
  // Pure date-math methods don't touch Prisma/Payments/Razorpay, so real dependencies aren't needed.
  const service = new SubscriptionService({} as any, {} as any, {} as any);

  describe('computeStatus', () => {
    it('returns NOT_ACTIVATED when no subscription dates are set', () => {
      expect(service.computeStatus({ subscriptionStart: null, subscriptionEnd: null })).toBe('NOT_ACTIVATED');
    });

    it('returns EXPIRED when subscriptionEnd is in the past', () => {
      const status = service.computeStatus({ subscriptionStart: daysFromNow(-30), subscriptionEnd: daysFromNow(-1) });
      expect(status).toBe('EXPIRED');
    });

    it('returns EXPIRING_SOON within the 7-day window', () => {
      const status = service.computeStatus({ subscriptionStart: daysFromNow(-23), subscriptionEnd: daysFromNow(5) });
      expect(status).toBe('EXPIRING_SOON');
    });

    it('returns ACTIVE when well outside the expiring-soon window', () => {
      const status = service.computeStatus({ subscriptionStart: daysFromNow(-5), subscriptionEnd: daysFromNow(20) });
      expect(status).toBe('ACTIVE');
    });
  });

  describe('calculateEndDate', () => {
    const start = new Date('2026-01-15T00:00:00.000Z');

    it('adds days for a DAYS plan', () => {
      const end = service.calculateEndDate(start, { durationValue: 30, durationType: DurationType.DAYS });
      expect(end.toISOString().slice(0, 10)).toBe('2026-02-14');
    });

    it('adds months for a MONTHS plan', () => {
      const end = service.calculateEndDate(start, { durationValue: 12, durationType: DurationType.MONTHS });
      expect(end.toISOString().slice(0, 10)).toBe('2027-01-15');
    });

    it('adds years for a YEARS plan', () => {
      const end = service.calculateEndDate(start, { durationValue: 2, durationType: DurationType.YEARS });
      expect(end.toISOString().slice(0, 10)).toBe('2028-01-15');
    });
  });

  describe('calculateRenewalStart', () => {
    it('extends from the current expiry when still active (never resets the date)', () => {
      const currentExpiry = daysFromNow(10);
      const start = service.calculateRenewalStart({ subscriptionEnd: currentExpiry });
      expect(start.getTime()).toBe(currentExpiry.getTime());
    });

    it('starts from today when the subscription has already expired', () => {
      const before = Date.now();
      const start = service.calculateRenewalStart({ subscriptionEnd: daysFromNow(-5) });
      expect(start.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('starts from today when there is no prior subscription at all', () => {
      const before = Date.now();
      const start = service.calculateRenewalStart({ subscriptionEnd: null });
      expect(start.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('remainingDays', () => {
    it('returns null when there is no subscription end date', () => {
      expect(service.remainingDays({ subscriptionEnd: null })).toBeNull();
    });

    it('never returns negative days for an expired subscription', () => {
      expect(service.remainingDays({ subscriptionEnd: daysFromNow(-100) })).toBe(0);
    });

    it('rounds up partial days remaining', () => {
      const almostTwoDays = new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000);
      expect(service.remainingDays({ subscriptionEnd: almostTwoDays })).toBe(2);
    });
  });
});
