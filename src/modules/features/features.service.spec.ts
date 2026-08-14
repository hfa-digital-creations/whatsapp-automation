import { NotFoundException } from '@nestjs/common';
import { FeaturesService } from './features.service';

function makeClient(planFeatures: Array<{ code: string; enabled: boolean }>, overrides: Array<{ code: string; enabled: boolean }>) {
  return {
    plan: {
      planFeatures: planFeatures.map((f) => ({ enabled: f.enabled, feature: { code: f.code } })),
    },
    featureOverrides: overrides.map((o) => ({ enabled: o.enabled, feature: { code: o.code } })),
  };
}

describe('FeaturesService.computeEffectiveFeatures', () => {
  function makeService(client: unknown) {
    const prisma = { client: { findUnique: jest.fn().mockResolvedValue(client) } };
    return new FeaturesService(prisma as any);
  }

  it('uses the plan default when there is no override', async () => {
    const service = makeService(makeClient([{ code: 'WHATSAPP_AUTOMATION', enabled: true }], []));
    const effective = await service.computeEffectiveFeatures('client-1');
    expect(effective.WHATSAPP_AUTOMATION).toBe(true);
  });

  it('lets a client-specific override win over the plan default (spec §46)', async () => {
    const service = makeService(
      makeClient(
        [{ code: 'AUTO_QUOTATION', enabled: false }],
        [{ code: 'AUTO_QUOTATION', enabled: true }],
      ),
    );
    const effective = await service.computeEffectiveFeatures('client-1');
    expect(effective.AUTO_QUOTATION).toBe(true);
  });

  it('can also use an override to explicitly disable a plan-enabled feature', async () => {
    const service = makeService(
      makeClient(
        [{ code: 'ANALYTICS', enabled: true }],
        [{ code: 'ANALYTICS', enabled: false }],
      ),
    );
    const effective = await service.computeEffectiveFeatures('client-1');
    expect(effective.ANALYTICS).toBe(false);
  });

  it('treats a feature absent from both plan and overrides as disabled', async () => {
    const service = makeService(makeClient([], []));
    expect(await service.isFeatureEnabled('client-1', 'SOME_UNCONFIGURED_FEATURE')).toBe(false);
  });

  it('throws NotFoundException for an unknown client', async () => {
    const service = makeService(null);
    await expect(service.computeEffectiveFeatures('missing-client')).rejects.toThrow(NotFoundException);
  });
});
