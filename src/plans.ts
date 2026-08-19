export type PlanId = 'free' | 'builder' | 'pro' | 'agency';

export type Entitlements = {
  plan: PlanId;
  sites: number;
  monitoredUrls: number;
  deepChecksPerMonth: number;
  historyDays: number;
  frequencyMinutes: number;
  emailAlerts: boolean;
  webhooks: boolean;
  slack: boolean;
  gsc: boolean;
  github: boolean;
  api: boolean;
  teamMembers: number;
  brandedReports: boolean;
  ciGuard: boolean;
};

export const PLANS: Record<PlanId, Entitlements> = {
  free: {
    plan: 'free',
    sites: 1,
    monitoredUrls: 2_000,
    deepChecksPerMonth: 2_000,
    historyDays: 14,
    frequencyMinutes: 1440,
    emailAlerts: false,
    webhooks: false,
    slack: false,
    gsc: false,
    github: false,
    api: false,
    teamMembers: 1,
    brandedReports: false,
    ciGuard: false,
  },
  builder: {
    plan: 'builder',
    sites: 5,
    monitoredUrls: 10_000,
    deepChecksPerMonth: 20_000,
    historyDays: 90,
    frequencyMinutes: 1440,
    emailAlerts: true,
    webhooks: false,
    slack: false,
    gsc: false,
    github: false,
    api: false,
    teamMembers: 1,
    brandedReports: false,
    ciGuard: true,
  },
  pro: {
    plan: 'pro',
    sites: 20,
    monitoredUrls: 50_000,
    deepChecksPerMonth: 80_000,
    historyDays: 365,
    frequencyMinutes: 360,
    emailAlerts: true,
    webhooks: true,
    slack: true,
    gsc: true,
    github: true,
    api: true,
    teamMembers: 5,
    brandedReports: false,
    ciGuard: true,
  },
  agency: {
    plan: 'agency',
    sites: 100,
    monitoredUrls: 200_000,
    deepChecksPerMonth: 400_000,
    historyDays: 730,
    frequencyMinutes: 60,
    emailAlerts: true,
    webhooks: true,
    slack: true,
    gsc: true,
    github: true,
    api: true,
    teamMembers: 25,
    brandedReports: true,
    ciGuard: true,
  },
};

export const PLAN_PRICES_USD: Record<PlanId, { monthly: number; annual: number; label: string }> = {
  free: { monthly: 0, annual: 0, label: 'Free' },
  builder: { monthly: 19, annual: 190, label: 'Builder' },
  pro: { monthly: 49, annual: 490, label: 'Pro' },
  agency: { monthly: 149, annual: 1490, label: 'Agency' },
};

export function entitlementsFor(plan: string, stripeStatus?: string): Entitlements {
  const id = (['free', 'builder', 'pro', 'agency'] as PlanId[]).includes(plan as PlanId) ? (plan as PlanId) : 'free';
  if (id !== 'free' && stripeStatus && !['active', 'trialing'].includes(stripeStatus)) {
    return PLANS.free;
  }
  return PLANS[id];
}

export function canAddSite(ent: Entitlements, currentSites: number): boolean {
  return currentSites < ent.sites;
}

export function canMonitorUrls(ent: Entitlements, currentUrls: number): boolean {
  return currentUrls <= ent.monitoredUrls;
}

export function canDeepCheck(ent: Entitlements, usedThisMonth: number, additional: number): boolean {
  return usedThisMonth + additional <= ent.deepChecksPerMonth;
}
