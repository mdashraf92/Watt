import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../lib/api';
import { COLORS } from '../../constants/colors';
import { useLang } from '../../context/LanguageContext';
import { ArrowLeftIcon, TrendingUpIcon, ZapIcon, WalletIcon } from '../../components/icons';
import ErrorView from '../../components/ErrorView';

type Bucket = { revenue: number; sessions: number; kwh: number };
type TopCharger = { name: string; sessions: number; revenue: number };
type MobileBucket = { revenue: number; jobs: number; kwh: number };
type Analytics = {
  today: Bucket; month: Bucket; all_time: Bucket;
  flagged: number; top_chargers: TopCharger[];
  // Reported separately from station revenue on purpose — see the 'mobile' key
  // comment in get_admin_analytics. Optional so an un-migrated server still renders.
  mobile?: {
    today: MobileBucket; month: MobileBucket; all_time: MobileBucket;
    flagged: number; unserved: number; vans_active: number;
  };
};

export default function AdminAnalyticsScreen() {
  const { t, isRTL } = useLang();
  const navigation = useNavigation<any>();

  const [data, setData]       = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.admin.analytics();
      setData(res as Analytics);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(true); } finally { setRefreshing(false); }
  };

  const money = (n: number) => `${(n ?? 0).toFixed(3)} OMR`;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={20} color={COLORS.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t.analytics_title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : error ? (
        <ErrorView onRetry={() => load()} />
      ) : data ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {/* Today */}
          <PeriodCard title={t.analytics_today} bucket={data.today} money={money} t={t} highlight />
          {/* This month */}
          <PeriodCard title={t.analytics_month} bucket={data.month} money={money} t={t} />
          {/* All time */}
          <PeriodCard title={t.analytics_all_time} bucket={data.all_time} money={money} t={t} />

          {/* Flagged sessions — tap to review */}
          {data.flagged > 0 && (
            <TouchableOpacity style={s.flagRow} onPress={() => navigation.navigate('AdminFlagged')} activeOpacity={0.8}>
              <Text style={s.flagText}>⚠ {data.flagged} {t.analytics_flagged}</Text>
              <Text style={s.flagArrow}>›</Text>
            </TouchableOpacity>
          )}

          {/* Mobile charging — kept out of the totals above so the station
              figures keep meaning what they always meant. */}
          {data.mobile && (
            <View style={s.card}>
              <Text style={[s.cardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t.mc_title}</Text>
              <View style={s.topRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.topName}>{t.analytics_month}</Text>
                  <Text style={s.topSub}>
                    {data.mobile.month.jobs} · {Number(data.mobile.month.kwh).toFixed(0)} kWh
                  </Text>
                </View>
                <Text style={s.topRevenue}>{money(data.mobile.month.revenue)}</Text>
              </View>
              <View style={s.topRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.topName}>{t.analytics_all_time}</Text>
                  <Text style={s.topSub}>
                    {data.mobile.all_time.jobs} · {Number(data.mobile.all_time.kwh).toFixed(0)} kWh
                  </Text>
                </View>
                <Text style={s.topRevenue}>{money(data.mobile.all_time.revenue)}</Text>
              </View>
              <View style={s.topRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.topName}>{t.ad_fleet_title}</Text>
                  <Text style={s.topSub}>{t.op_duty_on}</Text>
                </View>
                <Text style={s.topRevenue}>{data.mobile.vans_active}</Text>
              </View>
              {/* Demand we could not serve — the clearest signal the fleet is
                  too small, so it is stated rather than buried. */}
              {data.mobile.unserved > 0 && (
                <TouchableOpacity
                  style={s.flagRow}
                  onPress={() => navigation.navigate('AdminMobileRequests')}
                  activeOpacity={0.8}
                >
                  <Text style={s.flagText}>⚠ {data.mobile.unserved} · {t.mc_status_no_van}</Text>
                  <Text style={s.flagArrow}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Top chargers this month */}
          <View style={s.card}>
            <Text style={[s.cardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t.analytics_top_chargers}</Text>
            {data.top_chargers.length === 0 ? (
              <Text style={s.empty}>{t.analytics_no_data}</Text>
            ) : (
              data.top_chargers.map((c, i) => (
                <View key={i} style={s.topRow}>
                  <View style={s.rankWrap}><Text style={s.rank}>{i + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.topName} numberOfLines={1}>{c.name}</Text>
                    <Text style={s.topSub}>{c.sessions} {t.analytics_sessions}</Text>
                  </View>
                  <Text style={s.topRevenue}>{money(c.revenue)}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function PeriodCard({ title, bucket, money, t, highlight }: {
  title: string; bucket: Bucket; money: (n: number) => string; t: any; highlight?: boolean;
}) {
  return (
    <View style={[s.card, highlight && s.cardHighlight]}>
      <Text style={[s.periodTitle, highlight && { color: '#fff' }]}>{title}</Text>
      <Text style={[s.revenue, highlight && { color: '#fff' }]}>{money(bucket.revenue)}</Text>
      <View style={s.metricsRow}>
        <Metric icon={<ZapIcon size={16} color={highlight ? '#fff' : COLORS.primary} strokeWidth={2} />}
          value={`${(bucket.kwh ?? 0).toFixed(1)} kWh`} label={t.analytics_energy} highlight={highlight} />
        <Metric icon={<TrendingUpIcon size={16} color={highlight ? '#fff' : COLORS.gold} strokeWidth={2} />}
          value={String(bucket.sessions ?? 0)} label={t.analytics_sessions} highlight={highlight} />
      </View>
    </View>
  );
}

function Metric({ icon, value, label, highlight }: { icon: React.ReactNode; value: string; label: string; highlight?: boolean }) {
  return (
    <View style={s.metric}>
      {icon}
      <Text style={[s.metricValue, highlight && { color: '#fff' }]}>{value}</Text>
      <Text style={[s.metricLabel, highlight && { color: 'rgba(255,255,255,0.7)' }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border },
  cardHighlight: { backgroundColor: COLORS.primaryDark, borderColor: COLORS.primaryDark },
  cardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 12 },

  periodTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  revenue: { fontSize: 30, fontWeight: '900', color: COLORS.primary, marginTop: 4, marginBottom: 12 },
  metricsRow: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, alignItems: 'flex-start', gap: 3 },
  metricValue: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  metricLabel: { fontSize: 11, color: COLORS.textSecondary },

  flagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.errorBg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#fecaca' },
  flagText: { fontSize: 13, fontWeight: '700', color: COLORS.error },
  flagArrow: { fontSize: 20, fontWeight: '800', color: COLORS.error },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rankWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  rank: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  topName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  topSub: { fontSize: 12, color: COLORS.textTertiary, marginTop: 1 },
  topRevenue: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  empty: { fontSize: 13, color: COLORS.textSecondary, paddingVertical: 8 },
});
