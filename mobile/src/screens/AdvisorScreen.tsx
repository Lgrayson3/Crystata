import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { COLORS } from '../theme';
import { generateForecast } from '../lib/gemini';
import { computeSnapshot, firstOfMonth, today } from '../lib/reconciliation';

export function AdvisorScreen() {
  const [forecast, setForecast] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const apiKey = (await SecureStore.getItemAsync('gemini_api_key')) ?? '';
      const cashOnHand      = parseFloat((await SecureStore.getItemAsync('cash_on_hand')) ?? '0');
      const savingsGoal     = parseFloat((await SecureStore.getItemAsync('savings_goal')) ?? '0');
      const essentialBudget = parseFloat((await SecureStore.getItemAsync('essential_budget')) ?? '0');

      const snap = await computeSnapshot(firstOfMonth(), today(), {
        cashOnHand,
        savingsGoalMonthly: savingsGoal,
        essentialBudgetWeekly: essentialBudget,
      });

      const text = await generateForecast(apiKey, snap.safe_to_spend, snap.bleed);
      setForecast(text);
    } catch (e: any) {
      Alert.alert('Advisor error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🤖 Weekend Spend Forecast</Text>
      <Text style={styles.subtitle}>Powered by Gemini 1.5 Flash — merchant names are hashed before leaving your device.</Text>

      <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={run} disabled={loading}>
        {loading
          ? <ActivityIndicator color={COLORS.bg} />
          : <Text style={styles.btnText}>Generate Forecast</Text>
        }
      </TouchableOpacity>

      {forecast ? (
        <View style={styles.card}>
          <Text style={styles.forecastText}>{forecast}</Text>
        </View>
      ) : !loading ? (
        <Text style={styles.placeholder}>Tap Generate to get your AI-powered weekend spending forecast.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: COLORS.muted, fontSize: 12, marginBottom: 20, lineHeight: 18 },
  btn: { backgroundColor: COLORS.accent, borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16 },
  forecastText: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  placeholder: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginTop: 40, lineHeight: 22 },
});
