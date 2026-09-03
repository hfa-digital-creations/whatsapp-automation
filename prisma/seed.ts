import { PrismaClient, UserRole, UserStatus, DurationType, PlanStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const FEATURES = [
  { code: 'WHATSAPP_AUTOMATION', name: 'WhatsApp Automation' },
  { code: 'MULTIPLE_WHATSAPP_ACCOUNTS', name: 'Multiple WhatsApp Accounts' },
  { code: 'TRAINING', name: 'Business Training' },
  { code: 'AUTO_REPLY', name: 'Auto Reply' },
  { code: 'PAYMENT_LINK', name: 'Payment Link' },
  { code: 'AUTO_QUOTATION', name: 'Automatic Quotation' },
  { code: 'FOLLOW_UP', name: 'Sales Follow-up' },
  { code: 'RENEWAL_MESSAGES', name: 'Renewal Messages' },
  { code: 'OFFER_MESSAGES', name: 'Offer Messages' },
  { code: 'ENQUIRY_AUTOMATION', name: 'Enquiry Automation' },
  { code: 'DRAFT_APPROVAL', name: 'Draft Approval Mode' },
  { code: 'FULL_AUTONOMOUS_MODE', name: 'Full Autonomous Mode' },
  { code: 'ANALYTICS', name: 'Analytics' },
  { code: 'WHATSAPP_ACCOUNT_REMOVAL', name: 'Client Can Remove WhatsApp Accounts' },
  { code: 'DAILY_DIGEST', name: 'Daily Digest' },
  { code: 'CONTACT_AUTOMATION_TOGGLE', name: 'Per-Contact Automation Toggle' },
];

async function main() {
  // Checked by role, not by a specific seed email — once any SUPER_ADMIN exists
  // (including one whose email/password was later changed), seeding must never
  // create another one. No hardcoded fallback credentials either: both env vars
  // must be explicitly set to create the very first admin, so re-running this
  // script can never silently produce a guessable-password backdoor account.
  const anyAdmin = await prisma.user.findFirst({ where: { role: UserRole.SUPER_ADMIN } });
  if (!anyAdmin) {
    const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL;
    const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;
    if (!superAdminEmail || !superAdminPassword) {
      console.log(
        'No SUPER_ADMIN exists yet and SEED_SUPER_ADMIN_EMAIL/SEED_SUPER_ADMIN_PASSWORD are not set — skipping admin creation.',
      );
    } else {
      await prisma.user.create({
        data: {
          email: superAdminEmail,
          role: UserRole.SUPER_ADMIN,
          status: UserStatus.ACTIVE,
          passwordHash: await bcrypt.hash(superAdminPassword, 12),
          mustChangePassword: true,
        },
      });
      console.log(`Created super admin ${superAdminEmail}.`);
    }
  } else {
    console.log('A SUPER_ADMIN already exists — skipping admin creation.');
  }

  for (const feature of FEATURES) {
    await prisma.feature.upsert({ where: { code: feature.code }, update: {}, create: feature });
  }
  console.log(`Ensured ${FEATURES.length} features exist.`);

  const starter = await prisma.plan.upsert({
    where: { id: 'seed-plan-starter' },
    update: {},
    create: {
      id: 'seed-plan-starter',
      name: 'Starter',
      title: 'Starter',
      shortDescription: 'For small businesses getting started with WhatsApp automation.',
      price: 2999,
      currency: 'INR',
      durationValue: 30,
      durationType: DurationType.DAYS,
      whatsappAccountLimit: 1,
      additionalAccountPrice: 999,
      status: PlanStatus.ACTIVE,
      displayOrder: 1,
    },
  });

  const business = await prisma.plan.upsert({
    where: { id: 'seed-plan-business' },
    update: {},
    create: {
      id: 'seed-plan-business',
      name: 'Business',
      title: 'Business',
      shortDescription: 'For growing teams that need multiple WhatsApp accounts.',
      price: 9999,
      currency: 'INR',
      durationValue: 12,
      durationType: DurationType.MONTHS,
      whatsappAccountLimit: 5,
      additionalAccountPrice: 799,
      status: PlanStatus.ACTIVE,
      displayOrder: 2,
    },
  });

  const starterFeatureCodes = ['WHATSAPP_AUTOMATION', 'AUTO_REPLY', 'TRAINING', 'PAYMENT_LINK'];
  const businessFeatureCodes = [...starterFeatureCodes, 'MULTIPLE_WHATSAPP_ACCOUNTS', 'AUTO_QUOTATION', 'FOLLOW_UP', 'ANALYTICS'];

  for (const [plan, codes] of [
    [starter, starterFeatureCodes],
    [business, businessFeatureCodes],
  ] as const) {
    const features = await prisma.feature.findMany({ where: { code: { in: codes } } });
    await prisma.planFeature.deleteMany({ where: { planId: plan.id } });
    await prisma.planFeature.createMany({
      data: features.map((f) => ({ planId: plan.id, featureId: f.id, enabled: true })),
    });
  }

  console.log('Seeded Starter and Business plans.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
