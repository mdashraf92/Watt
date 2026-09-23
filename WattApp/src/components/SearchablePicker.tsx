/**
 * SearchablePicker — a tappable field that opens a searchable list sheet.
 *
 * Replaces free-text entry wherever the set of valid answers is known (car
 * make, model, year, connector type). Typing a car name by hand is how you end
 * up with "Tesls" in the database and a trip plan built on a guess.
 *
 * `allowCustom` keeps the escape hatch: if their car is not listed they can
 * still enter their own value rather than being blocked.
 */
import React, { useMemo, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from './icons';

export interface PickerOption {
  value: string;
  label: string;
  /** Optional second line, e.g. "75 kWh · CCS". */
  sub?: string;
}

interface Props {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder: string;
  /** Search box appears once the list is longer than this. */
  searchThreshold?: number;
  allowCustom?: boolean;
  disabled?: boolean;
  disabledHint?: string;
}

export default function SearchablePicker({
  label, value, options, onChange, placeholder,
  searchThreshold = 8, allowCustom = false, disabled = false, disabledHint,
}: Props) {
  const { t, isRTL } = useLang();
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const [custom, setCustom] = useState('');

  const align = isRTL ? ('right' as const) : ('left' as const);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? value;

  const close = () => { setOpen(false); setQuery(''); setCustom(''); };

  const pick = (v: string) => { onChange(v); close(); };

  return (
    <>
      <Text style={[styles.fieldLabel, { textAlign: align }]}>{label}</Text>
      <TouchableOpacity
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text
          style={[
            styles.fieldValue,
            { textAlign: align },
            !value && styles.fieldPlaceholder,
          ]}
          numberOfLines={1}
        >
          {value ? selectedLabel : (disabled ? (disabledHint ?? placeholder) : placeholder)}
        </Text>
        <ChevronDownIcon size={18} color={COLORS.textTertiary} strokeWidth={2.2} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheet}>
              <View style={styles.handle} />

              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{label}</Text>
                <TouchableOpacity onPress={close} hitSlop={10}>
                  <XIcon size={20} color={COLORS.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {options.length > searchThreshold && (
                <View style={styles.searchWrap}>
                  <SearchIcon size={16} color={COLORS.textTertiary} strokeWidth={2} />
                  <TextInput
                    style={[styles.searchInput, { textAlign: align }]}
                    value={query}
                    onChangeText={setQuery}
                    placeholder={t.picker_search_ph}
                    placeholderTextColor={COLORS.textTertiary}
                    autoCorrect={false}
                  />
                  {!!query && (
                    <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                      <XIcon size={15} color={COLORS.textTertiary} strokeWidth={2.4} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <FlatList
                data={filtered}
                keyExtractor={o => o.value}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                ListEmptyComponent={
                  <Text style={styles.empty}>{t.picker_no_matches}</Text>
                }
                renderItem={({ item }) => {
                  const on = item.value === value;
                  return (
                    <TouchableOpacity
                      style={[styles.row, on && styles.rowOn]}
                      onPress={() => pick(item.value)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowLabel, { textAlign: align }, on && styles.rowLabelOn]}>
                          {item.label}
                        </Text>
                        {!!item.sub && (
                          <Text style={[styles.rowSub, { textAlign: align }]}>{item.sub}</Text>
                        )}
                      </View>
                      {on && <CheckIcon size={16} color={COLORS.primary} strokeWidth={3} />}
                    </TouchableOpacity>
                  );
                }}
              />

              {allowCustom && (
                <View style={styles.customWrap}>
                  <Text style={[styles.customLabel, { textAlign: align }]}>{t.picker_not_listed}</Text>
                  <View style={styles.customRow}>
                    <TextInput
                      style={[styles.customInput, { textAlign: align }]}
                      value={custom}
                      onChangeText={setCustom}
                      placeholder={t.picker_custom_ph}
                      placeholderTextColor={COLORS.textTertiary}
                    />
                    <TouchableOpacity
                      style={[styles.customBtn, !custom.trim() && styles.customBtnOff]}
                      disabled={!custom.trim()}
                      onPress={() => pick(custom.trim())}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.customBtnTxt}>{t.picker_use}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 6 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  fieldDisabled:    { opacity: 0.5 },
  fieldValue:       { flex: 1, fontFamily: FONTS.medium, fontSize: 14.5, color: COLORS.text },
  fieldPlaceholder: { fontFamily: FONTS.regular, color: COLORS.textTertiary },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22,
    maxHeight: '85%',
  },
  handle: {
    width: 44, height: 5, borderRadius: 3, alignSelf: 'center',
    backgroundColor: COLORS.border, marginBottom: 14,
  },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: COLORS.background, borderRadius: 13,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 13, marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text },

  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8,
    borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  rowOn:      { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  rowLabel:   { fontFamily: FONTS.medium, fontSize: 14.5, color: COLORS.text },
  rowLabelOn: { color: COLORS.primary },
  rowSub:     { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 },
  empty: {
    fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textTertiary,
    textAlign: 'center', paddingVertical: 26,
  },

  customWrap: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 14, marginTop: 4 },
  customLabel: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  customInput: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: 13,
    borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: 13, paddingVertical: 11,
    fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text,
  },
  customBtn: {
    backgroundColor: COLORS.primary, borderRadius: 13,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  customBtnOff: { opacity: 0.4 },
  customBtnTxt: { fontFamily: FONTS.bold, fontSize: 13.5, color: '#fff' },
});
