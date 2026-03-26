import {
  getGrossEarned,
  getBankDeposits,
  getCurrentBalance,
  getUpcomingBillsTotal,
  saveSnapshot,
  Snapshot,
} from './db';

export interface Settings {
  cashOnHand: number;
  savingsGoalMonthly: number;
  essentialBudgetWeekly: number;
}

export async function computeSnapshot(
  startDate: string,
  endDate: string,
  settings: Settings
): Promise<Snapshot> {
  const [grossEarned, bankDeposits, currentBalance, upcomingBills] = await Promise.all([
    getGrossEarned(startDate, endDate),
    getBankDeposits(startDate, endDate),
    getCurrentBalance(),
    getUpcomingBillsTotal(30),
  ]);

  const { cashOnHand, savingsGoalMonthly, essentialBudgetWeekly } = settings;
  const essentialBudgetMonthly = essentialBudgetWeekly * 4;

  const bleed = grossEarned - (bankDeposits + cashOnHand);
  const safeToSpend = currentBalance - (upcomingBills + savingsGoalMonthly + essentialBudgetMonthly);

  return {
    snapshot_date: new Date().toISOString().slice(0, 10),
    gross_earned: grossEarned,
    bank_deposits: bankDeposits,
    cash_on_hand: cashOnHand,
    current_balance: currentBalance,
    upcoming_bills: upcomingBills,
    savings_goal: savingsGoalMonthly,
    essential_budget: essentialBudgetMonthly,
    bleed,
    safe_to_spend: safeToSpend,
  };
}

export async function computeAndSave(
  startDate: string,
  endDate: string,
  settings: Settings
): Promise<Snapshot> {
  const snap = await computeSnapshot(startDate, endDate, settings);
  await saveSnapshot(snap);
  return snap;
}

export function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
