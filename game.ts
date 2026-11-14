export const TAP_REWARD = 1;
export const DAILY_REWARD = 25;
export const PASSIVE_CAP_HOURS = 12;
export const OIL_PER_RIG_PER_HOUR = 5;
export const upgradeCost = (level: number) => Math.floor(100 * Math.pow(1.65, Math.max(0, level - 1)));
export function accrue(user: { oil:number; rigLevel:number; lastActiveAt:Date }) {
  const elapsed = Math.max(0, Date.now() - user.lastActiveAt.getTime());
  const hours = Math.min(elapsed / 3_600_000, PASSIVE_CAP_HOURS);
  return Math.floor(hours * user.rigLevel * OIL_PER_RIG_PER_HOUR * 100) / 100;
}
