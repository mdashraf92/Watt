import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminCustomer, AdminTabParamList, AdminStackParamList } from '../../types';
import { api } from '../../lib/api';
import { COLORS } from '../../constants/colors';
import { useLang } from '../../context/LanguageContext';
import { useTabBarHeight } from '../../navigation/tabBarLayout';
import { SearchIcon, XIcon, UserIcon, ChevronRightIcon } from '../../components/icons';
import NotificationBell from '../../components/NotificationBell';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<AdminTabParamList, 'AdminCustomers'>,
  NativeStackNavigationProp<AdminStackParamList>
>;

const ACTIVE   = '#10B981';
const INACTIVE = '#F59E0B';

// ── Screen ────────────────────────────────────────────────────────

export default function AdminUsersScreen() {
  const { t, isRTL } = useLang();
  const navigation = useNavigation<Nav>();
  const tabBarHeight = useTabBarHeight();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');

  const fetchCustomers = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.admin.users();
      const customers = ((data ?? []) as AdminCustomer[]).filter(u => u.role === 'customer');
      setCustomers(customers);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  // Silently refresh when returning from the detail page so status/deletions reflect.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) { firstFocus.current = false; return; }
      fetchCustomers(true);
    }, []),
  );

  const filtered = search.trim()
    ? customers.filter(c =>
        (c.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (c.phone ?? '').includes(search),
      )
    : customers;

  const renderCustomer = useCallback(({ item }: { item: AdminCustomer }) => {
    const initial  = item.full_name ? item.full_name[0].toUpperCase() : '?';
    const inactive = !item.is_active;
    return (
      <TouchableOpacity
        style={[styles.card, inactive && styles.cardInactive, isRTL && styles.rowReverse]}
        onPress={() => navigation.navigate('AdminCustomerDetail', { customer: item })}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={[styles.presence, { backgroundColor: inactive ? INACTIVE : ACTIVE }]} />
        </View>

        <View style={styles.body}>
          <Text style={[styles.name, isRTL && styles.rtlText]} numberOfLines={1}>{item.full_name || '—'}</Text>
          <Text style={[styles.email, isRTL && styles.rtlText]} numberOfLines={1}>{item.email || '—'}</Text>
          <View style={[styles.metaRow, isRTL && styles.rowReverse]}>
            {inactive && (
              <View style={styles.tag}><Text style={styles.tagText}>{t.admin_deactivated}</Text></View>
            )}
            <Text style={styles.meta}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
        </View>

        <View style={[styles.right, isRTL && styles.rightRtl]}>
          <Text style={styles.balance}>{Number(item.wallet_balance).toFixed(3)}</Text>
          <Text style={styles.currency}>OMR</Text>
          <View style={isRTL && styles.flipX}>
            <ChevronRightIcon size={16} color={COLORS.textTertiary} strokeWidth={2} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [isRTL, t, navigation]);

  const activeCount   = customers.filter(c => c.is_active).length;
  const inactiveCount = customers.filter(c => !c.is_active).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.admin_customers_title}</Text>
          <Text style={styles.headerSub}>
            {activeCount} active · {inactiveCount} deactivated
          </Text>
        </View>
        <NotificationBell size={40} />
      </View>

      {/* ── Search ── */}
      <View style={styles.searchBar}>
        <SearchIcon size={15} color={COLORS.textSecondary} strokeWidth={2} />
        <TextInput
          style={[styles.searchInput, { textAlign: isRTL ? 'right' : 'left' }]}
          placeholder={t.admin_customers_search}
          placeholderTextColor={COLORS.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <XIcon size={14} color={COLORS.textSecondary} strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── List ── */}
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 48 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <UserIcon size={32} color={COLORS.textTertiary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>{t.admin_customers_empty}</Text>
          <Text style={styles.emptySub}>{t.admin_customers_empty_sub}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          renderItem={renderCustomer}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 16 }]}
          showsVerticalScrollIndicator={false}
          onRefresh={fetchCustomers}
          refreshing={loading}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  rtlText:    { textAlign: 'right' },
  rowReverse: { flexDirection: 'row-reverse' },
  flipX:      { transform: [{ scaleX: -1 }] },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  headerSub:   { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  headerBadge: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: COLORS.card, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },

  // List
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10, paddingTop: 4 },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardInactive: { backgroundColor: COLORS.background },

  avatarWrap: { position: 'relative' },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  presence: {
    position: 'absolute', bottom: -1, right: -1,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2.5, borderColor: COLORS.card,
  },

  body: { flex: 1, gap: 2 },
  name:  { fontSize: 15, fontWeight: '700', color: COLORS.text },
  email: { fontSize: 12.5, color: COLORS.textSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  meta:  { fontSize: 11, color: COLORS.textTertiary },
  tag:     { backgroundColor: COLORS.backgroundAlt, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary },

  right:    { alignItems: 'flex-end', gap: 1 },
  rightRtl: { alignItems: 'flex-start' },
  balance:  { fontSize: 15, fontWeight: '800', color: COLORS.text },
  currency: { fontSize: 10, color: COLORS.textTertiary, fontWeight: '600', marginBottom: 2 },

  // Empty
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyIconWrap:{ width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.backgroundAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptySub:     { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
});
