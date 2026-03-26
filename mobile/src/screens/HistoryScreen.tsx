import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '../theme';
import { getSnapshotHistory, Snapshot } from '../lib/db';

const fmt = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function HistoryScreen() {
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSnapshotHistory(30).then((data) => { setRows(data); setLoading(false); });
  }, []);

  if (loading) return <ActivityIndicator color={COLORS.accent} style={{ flex: 1, backgroundColor: COLORS.bg }} />;

  if (!rows.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No snapshots yet.</Text>
        <Text style={styles.emptyHint}>Tap "Save Snapshot" on the Dashboard.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={(_, i) => String(i)}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.date}>{item.snapshot_date}</Text>
            <Text style={styles.gross}>Gross {fmt(item.gross_earned)}</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.bleed, { color: item.bleed > 0 ? COLORS.red : COLORS.green }]}>
              Bleed {fmt(item.bleed)}
            </Text>
            <Text style={[styles.safe, { color: item.safe_to_spend >= 0 ? COLORS.green : COLORS.red }]}>
              Safe {fmt(item.safe_to_spend)}
            </Text>
          </View>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16 },
  empty: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: COLORS.muted, fontSize: 13, marginTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  rowLeft: {},
  rowRight: { alignItems: 'flex-end' },
  date: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  gross: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  bleed: { fontSize: 13, fontWeight: '600' },
  safe: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  sep: { height: 1, backgroundColor: COLORS.border },
});
