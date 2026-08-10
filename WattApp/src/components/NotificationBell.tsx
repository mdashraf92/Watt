import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { useLang } from '../context/LanguageContext';
import { BellIcon } from '../components/icons';

/**
 * Bell + unread badge, linking to the shared NotificationsScreen. Extracted
 * from MapScreen (the only screen that had one) so every role's home screen
 * can carry the same entry point — previously investor/admin/superadmin had
 * no way to reach the inbox at all despite the screen and routes existing.
 *
 * Unlike MapScreen's inline version, this has no guest gate: only mount it on
 * screens that already require a signed-in role (admin/investor/etc.).
 */
export default function NotificationBell({ size = 44 }: { size?: number }) {
  const navigation = useNavigation<any>();
  const { t } = useLang();
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      api.notifications.unreadCount()
        .then((r: any) => { if (active) setUnreadCount(r?.count ?? 0); })
        .catch(() => { /* badge is non-critical — leave the last known value */ });
      return () => { active = false; };
    }, []),
  );

  return (
    <TouchableOpacity
      style={[s.bellBtn, { width: size, height: size }]}
      onPress={() => navigation.navigate('Notifications')}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t.a11y_notifications}
    >
      <BellIcon size={20} color={COLORS.text} strokeWidth={2} />
      {unreadCount > 0 && (
        <View style={s.bellBadge}>
          <Text style={s.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  bellBtn: {
    borderRadius: 14,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  bellBadge: {
    position: 'absolute', top: 6, right: 6,
    minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: COLORS.card,
  },
  bellBadgeText: { fontFamily: FONTS.bold, fontSize: 9, color: '#fff', lineHeight: 12 },
});
