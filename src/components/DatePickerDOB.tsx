import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DatePickerDOBProps {
  value: string; // Format "YYYY-MM-DD" or ""
  onChange: (val: string) => void;
  label?: string;
}

const MONTHS = [
  { value: '01', label: '01 - Janvier' },
  { value: '02', label: '02 - Février' },
  { value: '03', label: '03 - Mars' },
  { value: '04', label: '04 - Avril' },
  { value: '05', label: '05 - Mai' },
  { value: '06', label: '06 - Juin' },
  { value: '07', label: '07 - Juillet' },
  { value: '08', label: '08 - Août' },
  { value: '09', label: '09 - Septembre' },
  { value: '10', label: '10 - Octobre' },
  { value: '11', label: '11 - Novembre' },
  { value: '12', label: '12 - Décembre' },
];

// Generate years 2026 down to 1920
const currentYear = new Date().getFullYear();
const YEARS: string[] = [];
for (let y = currentYear; y >= 1920; y--) {
  YEARS.push(String(y));
}

// Generate days 01 to 31
const DAYS: string[] = [];
for (let d = 1; d <= 31; d++) {
  DAYS.push(d < 10 ? `0${d}` : String(d));
}

export default function DatePickerDOB({ value, onChange, label = 'Date de naissance (facultatif)' }: DatePickerDOBProps) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [mode, setMode] = useState<'dropdown' | 'manual'>('dropdown');
  const [manualText, setManualText] = useState('');

  // Sync internal state when value prop changes
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      setYear(y);
      setMonth(m);
      setDay(d);
      setManualText(`${d}/${m}/${y}`);
    } else if (!value) {
      setYear('');
      setMonth('');
      setDay('');
      setManualText('');
    }
  }, [value]);

  const updateDate = (newDay: string, newMonth: string, newYear: string) => {
    setDay(newDay);
    setMonth(newMonth);
    setYear(newYear);

    if (newDay && newMonth && newYear) {
      const formatted = `${newYear}-${newMonth}-${newDay}`;
      onChange(formatted);
    } else if (!newDay && !newMonth && !newYear) {
      onChange('');
    }
  };

  const handleManualTextChange = (text: string) => {
    setManualText(text);
    const clean = text.replace(/[^\d]/g, '');
    if (clean.length === 8) {
      let d = '', m = '', y = '';
      if (parseInt(clean.substring(0, 2), 10) <= 31 && parseInt(clean.substring(2, 4), 10) <= 12) {
        // Format JJMMAAAA
        d = clean.substring(0, 2);
        m = clean.substring(2, 4);
        y = clean.substring(4, 8);
      } else if (parseInt(clean.substring(0, 4), 10) >= 1900) {
        // Format AAAAMMJJ
        y = clean.substring(0, 4);
        m = clean.substring(4, 6);
        d = clean.substring(6, 8);
      }

      if (y && m && d) {
        setDay(d);
        setMonth(m);
        setYear(y);
        onChange(`${y}-${m}-${d}`);
      }
    } else if (clean.length === 0) {
      setDay('');
      setMonth('');
      setYear('');
      onChange('');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          onPress={() => setMode(mode === 'dropdown' ? 'manual' : 'dropdown')}
          style={styles.toggleBtn}
        >
          <Ionicons
            name={mode === 'dropdown' ? 'create-outline' : 'list-outline'}
            size={14}
            color="#28C2FF"
          />
          <Text style={styles.toggleText}>
            {mode === 'dropdown' ? 'Saisie clavier' : 'Sélecteurs Jour/Mois/Année'}
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'dropdown' ? (
        Platform.OS === 'web' ? (
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            {/* Jour */}
            <select
              value={day}
              onChange={(e) => updateDate(e.target.value, month, year)}
              style={{
                flex: 1,
                backgroundColor: '#1E3E52',
                color: '#FFFFFF',
                borderRadius: '10px',
                padding: '12px 8px',
                fontSize: '15px',
                border: '1px solid #2F5C77',
                colorScheme: 'dark',
                outline: 'none',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              <option value="">Jour</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {/* Mois */}
            <select
              value={month}
              onChange={(e) => updateDate(day, e.target.value, year)}
              style={{
                flex: 1.5,
                backgroundColor: '#1E3E52',
                color: '#FFFFFF',
                borderRadius: '10px',
                padding: '12px 8px',
                fontSize: '15px',
                border: '1px solid #2F5C77',
                colorScheme: 'dark',
                outline: 'none',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              <option value="">Mois</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            {/* Année */}
            <select
              value={year}
              onChange={(e) => updateDate(day, month, e.target.value)}
              style={{
                flex: 1.3,
                backgroundColor: '#1E3E52',
                color: '#FFFFFF',
                borderRadius: '10px',
                padding: '12px 8px',
                fontSize: '15px',
                border: '1px solid #2F5C77',
                colorScheme: 'dark',
                outline: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              <option value="">Année</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <View style={styles.dropdownRowNative}>
            <TextInput
              style={[styles.inputNative, { flex: 1 }]}
              placeholder="JJ"
              placeholderTextColor="#9ca3af"
              value={day}
              onChangeText={(d) => updateDate(d, month, year)}
              keyboardType="numeric"
              maxLength={2}
            />
            <TextInput
              style={[styles.inputNative, { flex: 1 }]}
              placeholder="MM"
              placeholderTextColor="#9ca3af"
              value={month}
              onChangeText={(m) => updateDate(day, m, year)}
              keyboardType="numeric"
              maxLength={2}
            />
            <TextInput
              style={[styles.inputNative, { flex: 1.5 }]}
              placeholder="AAAA (Année)"
              placeholderTextColor="#9ca3af"
              value={year}
              onChangeText={(y) => updateDate(day, month, y)}
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
        )
      ) : (
        <View style={styles.manualInputWrapper}>
          <TextInput
            style={styles.manualInput}
            placeholder="Ex: 15/05/1980 ou 1980-05-15"
            placeholderTextColor="#9ca3af"
            value={manualText}
            onChangeText={handleManualTextChange}
            keyboardType="numeric"
          />
          <Ionicons name="calendar-outline" size={20} color="#28C2FF" style={{ marginLeft: 8 }} />
        </View>
      )}

      {Boolean(day && month && year) && (
        <Text style={styles.selectedDateBadge}>
          ✓ Date sélectionnée : {day}/{month}/{year}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8AC8F9',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  toggleText: {
    fontSize: 12,
    color: '#28C2FF',
    fontWeight: '500',
  },
  dropdownRowNative: {
    flexDirection: 'row',
    gap: 8,
  },
  inputNative: {
    backgroundColor: '#1E3E52',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2F5C77',
    textAlign: 'center',
  },
  manualInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3E52',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F5C77',
    paddingRight: 12,
  },
  manualInput: {
    flex: 1,
    color: '#FFFFFF',
    padding: 12,
    fontSize: 15,
  },
  selectedDateBadge: {
    fontSize: 12,
    color: '#28C2FF',
    fontWeight: '600',
    marginTop: 6,
  },
});
