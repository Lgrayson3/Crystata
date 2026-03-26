import { getRecentTransactions, getUpcomingBills, TxnRow, LiabilityRow } from './db';

const MODEL = 'gemini-1.5-flash';

function scrubTxns(txns: TxnRow[]): string {
  return txns
    .slice(0, 40)
    .map((t) => `  ${t.txn_date} | ${t.direction.toUpperCase()} | $${t.amount.toFixed(2)} | ${t.category}`)
    .join('\n') || '  No recent transactions.';
}

function scrubBills(bills: LiabilityRow[]): string {
  return bills
    .map((b) => `  ${b.category} | $${b.amount.toFixed(2)} | due ${b.due_date || 'recurring'}`)
    .join('\n') || '  No upcoming bills.';
}

function nextFriday(): string {
  const d = new Date();
  const daysUntil = ((5 - d.getDay()) + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntil);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function buildPrompt(
  txnText: string,
  billText: string,
  safeToSpend: number,
  bleed: number
): string {
  return `You are a private financial coach for a tipped professional.
All merchant names have been replaced with category labels to protect privacy.

## Current Situation
- Safe-to-Spend (after bills + savings): $${safeToSpend.toFixed(2)}
- Untracked Cash (The Bleed): $${bleed.toFixed(2)}

## Recent Transactions (scrubbed)
${txnText}

## Upcoming Bills
${billText}

## Your Task
Provide a concise Weekend Spend Forecast for the upcoming weekend (starting ${nextFriday()}).

Include:
1. A recommended daily spend ceiling for the weekend
2. The top 2 spending categories to watch
3. One actionable tip to reduce The Bleed
4. A plain-English risk assessment: LOW / MODERATE / HIGH

Keep the response under 200 words. Be direct and practical.`;
}

export async function generateForecast(
  apiKey: string,
  safeToSpend: number,
  bleed: number
): Promise<string> {
  if (!apiKey) {
    return `AI Advisor unavailable — add your Gemini API key in Settings.\n\nSnapshot: Safe-to-Spend $${safeToSpend.toFixed(2)} | The Bleed $${bleed.toFixed(2)}`;
  }

  const [txns, bills] = await Promise.all([
    getRecentTransactions(30),
    getUpcomingBills(),
  ]);

  const prompt = buildPrompt(scrubTxns(txns), scrubBills(bills), safeToSpend, bleed);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response from Gemini.';
}
