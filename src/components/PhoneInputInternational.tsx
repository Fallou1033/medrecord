import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface CountryCode {
  code: string;
  flag: string;
  country: string;
  iso: string;
  digits: number;
  placeholder: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: '+221', flag: '🇸🇳', country: 'Sénégal', iso: 'SN', digits: 9, placeholder: '77 123 45 67' },
  { code: '+33', flag: '🇫🇷', country: 'France', iso: 'FR', digits: 9, placeholder: '6 12 34 56 78' },
  { code: '+1', flag: '🇺🇸', country: 'États-Unis / Canada', iso: 'US', digits: 10, placeholder: '202 555 0123' },
  { code: '+225', flag: '🇨🇮', country: 'Côte d\'Ivoire', iso: 'CI', digits: 10, placeholder: '07 01 02 03 04' },
  { code: '+223', flag: '🇲🇱', country: 'Mali', iso: 'ML', digits: 8, placeholder: '70 12 34 56' },
  { code: '+224', flag: '🇬🇳', country: 'Guinée', iso: 'GN', digits: 9, placeholder: '620 12 34 56' },
  { code: '+212', flag: '🇲🇦', country: 'Maroc', iso: 'MA', digits: 9, placeholder: '6 12 34 56 78' },
  { code: '+222', flag: '🇲🇷', country: 'Mauritanie', iso: 'MR', digits: 8, placeholder: '45 12 34 56' },
  { code: '+226', flag: '🇧🇫', country: 'Burkina Faso', iso: 'BF', digits: 8, placeholder: '70 12 34 56' },
  { code: '+228', flag: '🇹🇬', country: 'Togo', iso: 'TG', digits: 8, placeholder: '90 12 34 56' },
  { code: '+229', flag: '🇧BJ', country: 'Bénin', iso: 'BJ', digits: 8, placeholder: '97 12 34 56' },
  { code: '+237', flag: '🇨🇲', country: 'Cameroun', iso: 'CM', digits: 9, placeholder: '6 70 12 34 56' },
  { code: '+241', flag: '🇬🇦', country: 'Gabon', iso: 'GA', digits: 8, placeholder: '06 12 34 56' },
  { code: '+243', flag: '🇨🇩', country: 'RDC', iso: 'CD', digits: 9, placeholder: '81 234 5678' },
  { code: '+242', flag: '🇨🇬', country: 'Congo', iso: 'CG', digits: 9, placeholder: '06 123 4567' },
  { code: '+44', flag: '🇬🇧', country: 'Royaume-Uni', iso: 'GB', digits: 10, placeholder: '7123 456789' },
  { code: '+49', flag: '🇩🇪', country: 'Allemagne', iso: 'DE', digits: 11, placeholder: '151 23456789' },
  { code: '+34', flag: '🇪🇸', country: 'Espagne', iso: 'ES', digits: 9, placeholder: '612 34 56 78' },
  { code: '+39', flag: '🇮🇹', country: 'Italie', iso: 'IT', digits: 10, placeholder: '312 345 6789' },
];

interface PhoneInputProps {
  value: string; // Full E.164 (ex: "+221771234567") or local number
  onChange: (fullE164: string) => void;
  label?: string;
}

export default function PhoneInputInternational({ value, onChange, label = 'Numéro de Téléphone' }: PhoneInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(COUNTRY_CODES[0]); // Default Sénégal +221
  const [localNumber, setLocalNumber] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Extract country code & local digits from incoming value prop
  useEffect(() => {
    if (!value) {
      setLocalNumber('');
      return;
    }

    const clean = value.replace(/\s+/g, '');
    let matchedCountry = COUNTRY_CODES.find((c) => clean.startsWith(c.code));
    if (matchedCountry) {
      setSelectedCountry(matchedCountry);
      const digits = clean.slice(matchedCountry.code.length).replace(/\D/g, '');
      setLocalNumber(digits.slice(0, matchedCountry.digits));
    } else {
      // Legacy or no code format (ex: "771234567") -> Default to +221
      const digits = clean.replace(/\D/g, '');
      setLocalNumber(digits.slice(0, selectedCountry.digits));
    }
  }, [value]);

  const handleCountrySelect = (country: CountryCode) => {
    setSelectedCountry(country);
    setModalVisible(false);
    const trimmedDigits = localNumber.slice(0, country.digits);
    setLocalNumber(trimmedDigits);
    onChange(trimmedDigits ? `${country.code}${trimmedDigits}` : '');
  };

  const handleNumberChange = (txt: string) => {
    const onlyDigits = txt.replace(/\D/g, '').slice(0, selectedCountry.digits);
    setLocalNumber(onlyDigits);
    onChange(onlyDigits ? `${selectedCountry.code}${onlyDigits}` : '');
  };

  const filteredCountries = COUNTRY_CODES.filter(
    (c) =>
      c.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.includes(searchQuery) ||
      c.iso.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isComplete = localNumber.length === selectedCountry.digits;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {localNumber.length > 0 && (
          <Text style={[styles.counterText, isComplete && styles.counterTextComplete]}>
            {isComplete
              ? `✓ ${localNumber.length}/${selectedCountry.digits} (Complet)`
              : `${localNumber.length}/${selectedCountry.digits} chiffres`}
          </Text>
        )}
      </View>

      <View style={[styles.inputRow, isComplete && styles.inputRowComplete]}>
        {/* Country Code Picker Button */}
        <TouchableOpacity style={styles.countryPickerBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.flagText}>{selectedCountry.flag}</Text>
          <Text style={styles.codeText}>{selectedCountry.code}</Text>
          <Ionicons name="chevron-down" size={14} color="#8AC8F9" />
        </TouchableOpacity>

        {/* Local Number Input */}
        <TextInput
          style={styles.numberInput}
          placeholder={`ex: ${selectedCountry.placeholder}`}
          placeholderTextColor="#94A3B8"
          value={localNumber}
          onChangeText={handleNumberChange}
          keyboardType="number-pad"
          maxLength={selectedCountry.digits}
        />
      </View>

      {/* Country Selection Modal */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner un Indicatif</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color="#8AC8F9" />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un pays ou un code (+221, France...)"
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Country List */}
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code + item.iso}
              renderItem={({ item }) => {
                const isSelected = item.code === selectedCountry.code;
                return (
                  <TouchableOpacity
                    style={[styles.countryItem, isSelected && styles.countryItemActive]}
                    onPress={() => handleCountrySelect(item)}
                  >
                    <Text style={styles.countryFlag}>{item.flag}</Text>
                    <Text style={styles.countryName}>{item.country}</Text>
                    <Text style={styles.countryCodeBadge}>{item.code}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: 'bold',
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8AC8F9',
  },
  counterTextComplete: {
    color: '#2ECC71',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 8,
    overflow: 'hidden',
  },
  inputRowComplete: {
    borderColor: '#2ECC71',
    borderWidth: 1.5,
  },
  countryPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E3E52',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#2F5C77',
  },
  flagText: {
    fontSize: 18,
  },
  codeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  numberInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E3E52',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    padding: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    paddingVertical: 8,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
    gap: 12,
  },
  countryItemActive: {
    backgroundColor: '#0F2C3D',
  },
  countryFlag: {
    fontSize: 20,
  },
  countryName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  countryCodeBadge: {
    color: '#28C2FF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
