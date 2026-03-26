import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { COLORS } from '../theme';
import { KPICard } from '../components/KPICard';
import { computeSnapshot, firstOfMonth, today, Settings } from '../lib/reconciliation';
import { saveSnapshot, Snapshot, getUpcomingBills, LiabilityRow } from '../lib/db';
import { syncTransactions, syncAccounts, syncLiabilities } from '../lib/plaid';
import { syncGoogleSheet } from '../lib/sheets';

const fmt = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DashboardScreen() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [bills, setBills] = useState<LiabilityRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    try {
      const cashOnHand      = parseFloat((await SecureStore.getItemAsync('cash_on_hand')) ?? '0');
      const savingsGoal     = parseFloat((await SecureStore.getItemAsync('savings_goal')) ?? '0');
      const essentialBudget = parseFloat((await SecureStore.getItemAsync('essential_budget')) ?? '0');
      const settings: Settings = { cashOnHand, savingsGoalMonthly: savingsGoal, essentialBudgetWeekly: essentialBudget };

      const [s, b] = await Promise.all([
        computeSnapshot(firstOfMonth(), today(), settings),
        getUpcomingBills(),
      ]);
      setSnap(s);
      setBills(b);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const syncAll = async () => {
    setSyncing(true);
    try {
      const [clientId, secret, accessToken, plaidEnv] = await Promise.all([
        SecureStore.getItemAsync('plaid_client_id'),
        SecureStore.getItemAsync('plaid_secret'),
        SecureStore.getItemAsync('plaid_access_token'),
        SecureStore.getItemAsync('plaid_env'),
      ]);

      if (!clientId || !secret || !accessToken) {
        Alert.alert('Plaid not configured', 'Add your Plaid credentials in Settings.');
        return;
      }

      const cfg = { clientId, secret, accessToken, env: (plaidEnv ?? 'sandbox') as any };

      setStatus('Syncing transactions…');
      const n = await syncTransactions(cfg);
      setStatus('Syncing accounts…');
      await syncAccounts(cfg);
      setStatus('Syncing liabilities…');
      await syncLiabilities(cfg);

      // Try Google Sheet too
      const sheetId  = await SecureStore.getItemAsync('sheet_id');
      const sheetKey = await SecureStore.getItemAsync('sheets_api_key');
      const sheetRange = (await SecureStore.getItemAsync('sheet_range')) ?? 'Sheet1!A:F';
      if (sheetId && sheetKey) {
        setStatus('Syncing work log…');
        await syncGoogleSheet({ sheetId, apiKey: sheetKey, range: sheetRange });
      }

      await load();
      setStatus(`Synced — ${n} new transactions`);
      setTimeout(() => setStatus(''), 3000);
    } catch (e: any) {
      Alert.alert('Sync failed', e.message);
      setStatus('');
    } finally {
      setSyncing(false);
    }
  };

  const onSave = async () => {
    if (!snap) return;
    await saveSnapshot(snap);
    Alert.alert('Saved', 'Snapshot saved.');
  };

  const bleedColor = snap ? (snap.bleed > 0 ? COLORS.red : COLORS.green) : COLORS.muted;
  const safeColor  = snap ? (snap.safe_to_spend >= 0 ? COLORS.green : COLORS.red) : COLORS.muted;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
    >
      <Text style={styles.title}>💵 The Grayson Ledger</Text>
      <Text style={styles.subtitle}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>

      {/* KPI Grid */}
      {snap ? (
        <>
          <View style={styles.kpiRow}>
            <KPICard label="Gross Earned"  value={snap.gross_earned}  color={COLORS.blue} />
            <KPICard label="Bank Deposits" value={snap.bank_deposits} color={COLORS.blue} />
          </View>
          <View style={styles.kpiRow}>
            <KPICard label="The Bleed"     value={snap.bleed}         color={bleedColor} hint="Gross − (Deposits + Cash)" />
            <KPICard label="Safe-to-Spend" value={snap.safe_to_spend} color={safeColor}  hint="Balance − Bills − Goals" />
          </View>

          {/* Bar Breakdown */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reconciliation</Text>
            {[
              { label: 'Gross Earned',  value: snap.gross_earned,  color: COLORS.blue   },
              { label: 'Bank Deposits', value: snap.bank_deposits, color: COLORS.green  },
              { label: 'Cash on Hand',  value: snap.cash_on_hand,  color: COLORS.yellow },
              { label: 'The Bleed',     value: Math.max(snap.bleed, 0), color: COLORS.red },
            ].map((item) => {
              const max = Math.max(snap.gross_earned, snap.bank_deposits, snap.cash_on_hand, snap.bleed, 1);
              const pct = Math.min((item.value / max) * 100, 100);
              return (
                <View key={item.label} style={styles.barRow}>
                  <Text style={styles.barLabel}>{item.label}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: item.color }]} />
                  </View>
                  <Text style={[styles.barAmount, { color: item.color }]}>{fmt(item.value)}</Text>
                </View>
              );
            })}
          </View>

          {/* Safe-to-Spend waterfall */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Safe-to-Spend Breakdown</Text>
            {[
              { label: 'Current Balance',  value: snap.current_balance,  color: COLORS.blue   },
              { label: '− Upcoming Bills', value: -snap.upcoming_bills,  color: COLORS.red    },
              { label: '− Savings Goal',   value: -snap.savings_goal,    color: COLORS.red    },
              { label: '− Ess. Budget',    value: -snap.essential_budget, color: COLORS.yellow },
              { label: '= Safe-to-Spend',  value: snap.safe_to_spend,    color: safeColor     },
            ].map((item, i) => (
              <View key={item.label} style={[styles.waterfallRow, i === 4 && styles.waterfallTotal]}>
                <Text style={styles.waterfallLabel}>{item.label}</Text>
                <Text style={[styles.waterfallValue, { color: item.color }]}>{fmt(item.value)}</Text>
              </View>
            ))}
          </View>

          {/* Upcoming Bills */}
          {bills.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Upcoming Bills</Text>
              {bills.map((b, i) => (
                <View key={i} style={styles.billRow}>
                  <Text style={styles.billCategory}>{b.category.replace('_', ' ')}</Text>
                  <Text style={styles.billAmount}>{fmt(b.amount)}</Text>
                  {b.due_date ? <Text style={styles.billDate}>due {b.due_date}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
      )}

      {/* Action buttons */}
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={syncAll} disabled={syncing}>
        {syncing ? <ActivityIndicator color={COLORS.bg} /> : <Text style={styles.btnText}>🔄 Sync All</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onSave}>
        <Text style={styles.btnText}>💾 Save Snapshot</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>🔒 Zero-Cloud · Data stays on this device</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 32 },
  title: { color: COLORS.text, fontSize: 22, fontWeight: '700', marginBottom: 2 },
  subtitle: { color: COLORS.muted, fontSize: 13, marginBottom: 16 },
  kpiRow: { flexDirection: 'row', marginHorizontal: -5, marginBottom: 2 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { color: COLORS.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  barLabel: { color: COLORS.muted, fontSize: 12, width: 100 },
  barTrack: { flex: 1, height: 10, backgroundColor: COLORS.border, borderRadius: 5, overflow: 'hidden', marginHorizontal: 8 },
  barFill: { height: '100%', borderRadius: 5 },
  barAmount: { fontSize: 12, fontWeight: '600', width: 70, textAlign: 'right' },
  waterfallRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  waterfallTotal: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4, paddingTop: 10 },
  waterfallLabel: { color: COLORS.text, fontSize: 13 },
  waterfallValue: { fontSize: 13, fontWeight: '600' },
  billRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  billCategory: { color: COLORS.text, fontSize: 13, flex: 1, textTransform: 'capitalize' },
  billAmount: { color: COLORS.red, fontSize: 13, fontWeight: '600', marginRight: 8 },
  billDate: { color: COLORS.muted, fontSize: 11 },
  status: { color: COLORS.accent, textAlign: 'center', marginBottom: 8, fontSize: 13 },
  btn: { borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 8 },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnSecondary: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  btnText: { fontWeight: '600', fontSize: 15, color: COLORS.bg },
  footer: { color: COLORS.muted, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
