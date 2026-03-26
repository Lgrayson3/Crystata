import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS } from '../theme';
import { parseCSV } from '../lib/sheets';
import { insertWorkLogs } from '../lib/db';

const FIELDS: { key: string; label: string; placeholder: string; secure?: boolean; numeric?: boolean }[] = [
  // Plaid
  { key: 'plaid_client_id',    label: 'Plaid Client ID',    placeholder: 'client_id...' },
  { key: 'plaid_secret',       label: 'Plaid Secret',       placeholder: 'secret...',    secure: true },
  { key: 'plaid_access_token', label: 'Plaid Access Token', placeholder: 'access-sandbox-...', secure: true },
  { key: 'plaid_env',          label: 'Plaid Environment',  placeholder: 'sandbox / development / production' },
  // Google Sheets
  { key: 'sheet_id',           label: 'Google Sheet ID',    placeholder: 'Sheet ID from URL' },
  { key: 'sheets_api_key',     label: 'Sheets API Key',     placeholder: 'AIza...', secure: true },
  { key: 'sheet_range',        label: 'Sheet Range',        placeholder: 'Sheet1!A:F' },
  // Gemini
  { key: 'gemini_api_key',     label: 'Gemini API Key',     placeholder: 'AIza...', secure: true },
  // Overrides
  { key: 'cash_on_hand',       label: 'Cash on Hand ($)',   placeholder: '0', numeric: true },
  { key: 'savings_goal',       label: 'Savings Goal / Mo ($)', placeholder: '0', numeric: true },
  { key: 'essential_budget',   label: 'Essential Budget / Wk ($)', placeholder: '0', numeric: true },
];

export function SettingsScreen() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded: Record<string, string> = {};
      for (const f of FIELDS) {
        loaded[f.key] = (await SecureStore.getItemAsync(f.key)) ?? '';
      }
      setValues(loaded);
    })();
  }, []);

  const saveAll = async () => {
    setSaving(true);
    for (const f of FIELDS) {
      await SecureStore.setItemAsync(f.key, values[f.key] ?? '');
    }
    setSaving(false);
    Alert.alert('Saved', 'Settings saved.');
  };

  const uploadCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
      if (result.canceled) return;
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const rows = parseCSV(text);
      const n = await insertWorkLogs(rows);
      Alert.alert('Imported', `${n} new work log rows added.`);
    } catch (e: any) {
      Alert.alert('Import failed', e.message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Credentials & Overrides</Text>
      <Text style={styles.hint}>All values are stored encrypted on this device only.</Text>

      {FIELDS.map((f) => (
        <View key={f.key} style={styles.field}>
          <Text style={styles.label}>{f.label}</Text>
          <TextInput
            style={styles.input}
            value={values[f.key] ?? ''}
            onChangeText={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            placeholder={f.placeholder}
            placeholderTextColor={COLORS.muted}
            secureTextEntry={f.secure}
            keyboardType={f.numeric ? 'decimal-pad' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ))}

      <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveAll} disabled={saving}>
        {saving ? <ActivityIndicator color={COLORS.bg} /> : <Text style={styles.btnText}>Save Settings</Text>}
      </TouchableOpacity>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Work Log CSV</Text>
      <Text style={styles.hint}>Upload a CSV with Date, Name, Tips, Hourly Rate, Hours Worked columns. Rows for "Grayson" will be imported.</Text>
      <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={uploadCSV}>
        <Text style={[styles.btnText, { color: COLORS.text }]}>📊 Upload CSV</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  hint: { color: COLORS.muted, fontSize: 12, marginBottom: 16, lineHeight: 18 },
  field: { marginBottom: 12 },
  label: { color: COLORS.muted, fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    color: COLORS.text,
    padding: 12,
    fontSize: 14,
  },
  btn: { borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 8 },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnSecondary: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  btnText: { fontWeight: '700', fontSize: 15, color: COLORS.bg },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 24 },
});
