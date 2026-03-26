import { insertWorkLogs, WorkLogRow } from './db';

export interface SheetsConfig {
  sheetId: string;
  apiKey: string;
  range: string; // e.g. "Sheet1!A:F"
}

const COL_ALIASES: Record<string, string[]> = {
  date: ['date', 'Date', 'DATE', 'work date', 'Work Date'],
  name: ['name', 'Name', 'NAME', 'employee', 'Employee'],
  tips: ['tips', 'Tips', 'TIPS', 'tip', 'Tip'],
  hourly_rate: ['hourly rate', 'hourly_rate', 'Hourly Rate', 'rate', 'Rate', 'Hourly'],
  hours_worked: ['hours', 'hours worked', 'Hours', 'Hours Worked', 'hours_worked'],
};

function canonicalCol(header: string): string {
  const h = header.trim();
  for (const [canonical, variants] of Object.entries(COL_ALIASES)) {
    if (variants.includes(h)) return canonical;
  }
  return h;
}

function cleanNumber(val: unknown): number {
  const n = parseFloat(String(val).replace(/[$,]/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function parseDate(val: unknown): string {
  const s = String(val).trim();
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
  ];
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return '';
}

export async function fetchGraysonRows(cfg: SheetsConfig): Promise<WorkLogRow[]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}` +
    `/values/${encodeURIComponent(cfg.range)}?key=${cfg.apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Sheets error: ${res.status} ${await res.text()}`);

  const data = await res.json();
  const [headerRow, ...dataRows]: string[][] = data.values ?? [];
  if (!headerRow) return [];

  const headers = headerRow.map(canonicalCol);

  const rows: WorkLogRow[] = [];
  for (const row of dataRows) {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });

    if (obj.name?.trim().toLowerCase() !== 'grayson') continue;
    const date = parseDate(obj.date);
    if (!date) continue;

    rows.push({
      log_date: date,
      tips: cleanNumber(obj.tips),
      hourly_rate: cleanNumber(obj.hourly_rate),
      hours_worked: cleanNumber(obj.hours_worked),
      source: 'google_sheets',
    });
  }
  return rows;
}

export async function syncGoogleSheet(cfg: SheetsConfig): Promise<number> {
  const rows = await fetchGraysonRows(cfg);
  return insertWorkLogs(rows);
}

export function parseCSV(text: string): WorkLogRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => canonicalCol(h.trim().replace(/^"|"$/g, '')));
  const rows: WorkLogRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });

    if (obj.name?.trim().toLowerCase() !== 'grayson') continue;
    const date = parseDate(obj.date);
    if (!date) continue;

    rows.push({
      log_date: date,
      tips: cleanNumber(obj.tips),
      hourly_rate: cleanNumber(obj.hourly_rate),
      hours_worked: cleanNumber(obj.hours_worked),
      source: 'csv',
    });
  }
  return rows;
}
