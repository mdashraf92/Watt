/**
 * MapFilterSheet — the map's filter bottom sheet.
 *
 * Connector options are driven by what the fleet actually has (passed in as
 * `availableConnectors`) rather than a hardcoded list of every plug standard on
 * earth: offering a filter that always returns zero results is worse than not
 * offering it.
 *
 * Edits are held locally and only handed back on "Apply", so backing out with
 * the X leaves the map exactly as it was.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import type { OSMMapType } from './OSMMap';
import { LayersIcon, MapIcon, XIcon, ZapIcon } from './icons';

export type ChargeSpeed  = 'any' | 'fast' | 'standard';
export type CurrentKind  = 'any' | 'ac' | 'dc';

export interface MapFilters {
  mapType:    OSMMapType;
  speed:      ChargeSpeed;
  current:    CurrentKind;
  connectors: string[];
  hideOffline: boolean;
  favouritesOnly: boolean;
  packageVenuesOnly: boolean;
}

export const DEFAULT_FILTERS: MapFilters = {
  mapType: 'streets',
  speed: 'any',
  current: 'any',
  connectors: [],
  hideOffline: false,
  favouritesOnly: false,
  packageVenuesOnly: false,
};

/** Anything at or above this is treated as DC fast charging. */
export const FAST_KW = 50;

/** How many filters differ from the default — drives the badge on the button. */
export function activeFilterCount(f: MapFilters): number {
  let n = 0;
  if (f.speed !== 'any') n++;
  if (f.current !== 'any') n++;
  if (f.connectors.length) n++;
  if (f.hideOffline) n++;
  if (f.favouritesOnly) n++;
  if (f.packageVenuesOnly) n++;
  return n;
}

interface Props {
  visible: boolean;
  filters: MapFilters;
  availableConnectors: string[];
  resultCount: number;
  onClose: () => void;
  onApply: (f: MapFilters) => void;
}

export default function MapFilterSheet({
  visible, filters, availableConnectors, resultCount, onClose, onApply,
}: Props) {
  const { t, isRTL } = useLang();
  const [draft, setDraft] = useState<MapFilters>(filters);

  // Re-seed each time it opens so a cancelled edit never leaks into the next.
  useEffect(() => { if (visible) setDraft(filters); }, [visible, filters]);

  const align  = isRTL ? ('right' as const) : ('left' as const);
  const rowDir = isRTL ? ('row-reverse' as const) : ('row' as const);

  const toggleConnector = (c: string) => {
    setDraft(d => ({
      ...d,
      connectors: d.connectors.includes(c)
        ? d.connectors.filter(x => x !== c)
        : [...d.connectors, c],
    }));
  };

  const Segment = ({ options, value, onPick }: {
    options: { key: string; label: string; Icon?: any }[];
    value: string;
    onPick: (k: any) => void;
  }) => (
    <View style={[styles.segmentRow, { flexDirection: rowDir }]}>
      {options.map(o => {
        const on = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.segment, on && styles.segmentOn]}
            onPress={() => onPick(o.key)}
            activeOpacity={0.8}
          >
            {o.Icon && (
              <o.Icon size={16} color={on ? '#fff' : COLORS.textSecondary} strokeWidth={2.2} />
            )}
            <Text style={[styles.segmentTxt, on && styles.segmentTxtOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={[styles.head, { flexDirection: rowDir }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { textAlign: align }]}>{t.filters_title}</Text>
              <Text style={[styles.subtitle, { textAlign: align }]}>{t.filters_subtitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <XIcon size={18} color={COLORS.textSecondary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={[styles.section, { textAlign: align }]}>{t.filters_map_layer}</Text>
            <Segment
              value={draft.mapType}
              onPick={(k) => setDraft(d => ({ ...d, mapType: k }))}
              options={[
                { key: 'streets',   label: t.filters_layer_standard,  Icon: MapIcon },
                { key: 'satellite', label: t.filters_layer_satellite, Icon: LayersIcon },
              ]}
            />

            <Text style={[styles.section, { textAlign: align }]}>{t.filters_speed}</Text>
            <Segment
              value={draft.speed}
              onPick={(k) => setDraft(d => ({ ...d, speed: k }))}
              options={[
                { key: 'any',      label: t.filters_any },
                { key: 'fast',     label: t.filters_speed_fast },
                { key: 'standard', label: t.filters_speed_standard },
              ]}
            />

            <Text style={[styles.section, { textAlign: align }]}>{t.filters_current}</Text>
            <Segment
              value={draft.current}
              onPick={(k) => setDraft(d => ({ ...d, current: k }))}
              options={[
                { key: 'any', label: t.filters_any },
                { key: 'ac',  label: t.filters_current_ac },
                { key: 'dc',  label: t.filters_current_dc },
              ]}
            />

            {availableConnectors.length > 0 && (
              <>
                <Text style={[styles.section, { textAlign: align }]}>{t.filters_connector}</Text>
                <View style={[styles.connGrid, { flexDirection: rowDir }]}>
                  {availableConnectors.map(c => {
                    const on = draft.connectors.includes(c);
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[styles.connCard, on && styles.connCardOn]}
                        onPress={() => toggleConnector(c)}
                        activeOpacity={0.8}
                      >
                        <ZapIcon size={20} color={on ? COLORS.primary : COLORS.textTertiary} strokeWidth={2.2} />
                        <Text style={[styles.connTxt, on && styles.connTxtOn]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <View style={[styles.toggleRow, { flexDirection: rowDir }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleTitle, { textAlign: align }]}>{t.filters_hide_offline}</Text>
                <Text style={[styles.toggleSub, { textAlign: align }]}>{t.filters_hide_offline_sub}</Text>
              </View>
              <Switch
                value={draft.hideOffline}
                onValueChange={v => setDraft(d => ({ ...d, hideOffline: v }))}
                trackColor={{ false: COLORS.border, true: COLORS.primaryTint }}
                thumbColor={draft.hideOffline ? COLORS.primary : '#fff'}
              />
            </View>

            <View style={[styles.toggleRow, { flexDirection: rowDir }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleTitle, { textAlign: align }]}>{t.filters_favourites_only}</Text>
                <Text style={[styles.toggleSub, { textAlign: align }]}>{t.filters_favourites_only_sub}</Text>
              </View>
              <Switch
                value={draft.favouritesOnly}
                onValueChange={v => setDraft(d => ({ ...d, favouritesOnly: v }))}
                trackColor={{ false: COLORS.border, true: COLORS.primaryTint }}
                thumbColor={draft.favouritesOnly ? COLORS.primary : '#fff'}
              />
            </View>
            <View style={[styles.toggleRow, { flexDirection: rowDir }]}>
              <Text style={[styles.toggleTitle, { flex: 1, textAlign: align }]}>{t.vo_mode}</Text>
              <Switch accessibilityLabel={t.vo_mode} value={draft.packageVenuesOnly}
                onValueChange={v => setDraft(d => ({ ...d, packageVenuesOnly: v }))} />
            </View>
          </ScrollView>

          <View style={[styles.footer, { flexDirection: rowDir }]}>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => setDraft({ ...DEFAULT_FILTERS, mapType: draft.mapType })}
              activeOpacity={0.8}
            >
              <Text style={styles.resetTxt}>{t.filters_reset}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => onApply(draft)}
              activeOpacity={0.85}
            >
              <Text style={styles.applyTxt}>
                {t.filters_apply}{resultCount >= 0 ? ` (${resultCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18,
    maxHeight: '88%',
  },
  handle: {
    width: 44, height: 5, borderRadius: 3, alignSelf: 'center',
    backgroundColor: COLORS.border, marginBottom: 14,
  },
  head: { alignItems: 'flex-start', gap: 12, marginBottom: 6 },
  title:    { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text },
  subtitle: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textTertiary, marginTop: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },

  section: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.text, marginTop: 20, marginBottom: 10 },

  segmentRow: { gap: 10 },
  segment: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 14,
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border,
  },
  segmentOn:    { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  segmentTxt:   { fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.textSecondary },
  segmentTxtOn: { color: '#fff', fontFamily: FONTS.bold },

  connGrid: { flexWrap: 'wrap', gap: 10 },
  connCard: {
    width: '31%', alignItems: 'center', gap: 7, paddingVertical: 16,
    borderRadius: 16, backgroundColor: COLORS.background,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  connCardOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  connTxt:    { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textSecondary },
  connTxtOn:  { color: COLORS.primary, fontFamily: FONTS.bold },

  toggleRow: {
    alignItems: 'center', gap: 12, marginTop: 18,
    backgroundColor: COLORS.background, borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.border, padding: 14,
  },
  toggleTitle: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.text },
  toggleSub:   { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 },

  footer: {
    gap: 10, marginTop: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  resetBtn: {
    paddingHorizontal: 24, paddingVertical: 15, borderRadius: 18,
    backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center',
  },
  resetTxt: { fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.textSecondary },
  applyBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 18,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  applyTxt: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
});
