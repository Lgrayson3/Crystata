import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

interface Props {
  label: string;
  value: number;
  color?: string;
  hint?: string;
}

export function KPICard({ label, value, color, hint }: Props) {
  const displayColor = color ?? (value >= 0 ? COLORS.green : COLORS.red);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: displayColor }]}>
        {value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    margin: 5,
    alignItems: 'center',
  },
  label: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
    textAlign: 'center',
  },
});
