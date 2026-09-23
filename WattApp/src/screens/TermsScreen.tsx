import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLang } from '../context/LanguageContext';
import { COLORS } from '../constants/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const TERMS_AR = [
  {
    title: '1. القبول والموافقة',
    body: 'باستخدامك لتطبيق Go Watt، فإنك توافق على الالتزام بهذه الشروط والأحكام. إذا كنت لا توافق على أي من هذه الشروط، يرجى عدم استخدام التطبيق.',
  },
  {
    title: '2. وصف الخدمة',
    body: 'يوفر تطبيق Go Watt منصة لحجز وإدارة محطات شحن السيارات الكهربائية في سلطنة عُمان. تشمل الخدمات: البحث عن المحطات، الحجز المسبق، الدفع الإلكتروني، وإدارة المحفظة الرقمية.',
  },
  {
    title: '3. حساب المستخدم',
    body: 'أنت مسؤول عن الحفاظ على سرية بيانات حسابك. يجب إخطارنا فوراً عند اكتشاف أي استخدام غير مصرح به لحسابك. نحتفظ بالحق في تعليق أو إنهاء حسابك في حالة انتهاك هذه الشروط.',
  },
  {
    title: '4. الحجز والإلغاء',
    body: 'يمكن إلغاء الحجز قبل بدء الجلسة دون رسوم. في حالة عدم الحضور (No-Show)، قد تُطبق رسوم إدارية. تُحتسب الأوقات بتوقيت سلطنة عُمان (GST+4).',
  },
  {
    title: '5. الرسوم والدفع',
    body: 'تُحتسب رسوم الشحن بناءً على الطاقة المستهلكة (kWh) وسعر المحطة. جميع المدفوعات تتم عبر المحفظة الرقمية داخل التطبيق. الأسعار قابلة للتغيير مع إشعار مسبق.',
  },
  {
    title: '6. استرداد المبالغ',
    body: 'تُعاد المبالغ للمحفظة الرقمية في حالة الأعطال التقنية المثبتة أو الإلغاء من قِبل المنصة. لا تُسترد المدفوعات عند إساءة استخدام الخدمة أو انتهاك هذه الشروط.',
  },
  {
    title: '7. سلوك المستخدم',
    body: 'يُحظر استخدام التطبيق لأغراض غير قانونية أو تشويه سمعة المنصة أو التدخل في عمل المحطات. يجب الالتزام بتعليمات السلامة الخاصة بكل محطة شحن.',
  },
  {
    title: '8. إخلاء المسؤولية',
    body: 'لا تتحمل Go Watt المسؤولية عن أي أضرار تنشأ عن الاستخدام غير السليم للمحطات، أو الأعطال الناجمة عن عوامل خارجة عن إرادتنا، أو أي خسائر غير مباشرة.',
  },
  {
    title: '9. الملكية الفكرية',
    body: 'جميع حقوق الملكية الفكرية الخاصة بالتطبيق، بما تشمل العلامات التجارية والمحتوى والتصميم، محفوظة لشركة Go Watt. لا يُسمح بنسخ أو توزيع أي محتوى دون إذن مسبق.',
  },
  {
    title: '10. تعديل الشروط',
    body: 'تحتفظ Go Watt بالحق في تعديل هذه الشروط في أي وقت. سيتم إخطار المستخدمين بالتغييرات الجوهرية عبر البريد الإلكتروني أو الإشعارات داخل التطبيق. استمرار استخدام التطبيق يُعد قبولاً للشروط المحدّثة.',
  },
  {
    title: '11. القانون المطبق',
    body: 'تخضع هذه الشروط لقوانين سلطنة عُمان. أي نزاعات تُحسم أمام المحاكم المختصة في مسقط، سلطنة عُمان.',
  },
  {
    title: '12. التواصل معنا',
    body: 'لأي استفسارات حول هذه الشروط، يرجى التواصل معنا عبر: support@watt.om',
  },
];

const TERMS_EN = [
  {
    title: '1. Acceptance of Terms',
    body: 'By using the Go Watt app, you agree to be bound by these Terms and Conditions. If you do not agree to any of these terms, please do not use the application.',
  },
  {
    title: '2. Service Description',
    body: 'Go Watt provides a platform for booking and managing EV charging stations across the Sultanate of Oman. Services include: station search, advance booking, digital payments, and wallet management.',
  },
  {
    title: '3. User Account',
    body: 'You are responsible for maintaining the confidentiality of your account credentials. You must notify us immediately upon discovering any unauthorized use of your account. We reserve the right to suspend or terminate accounts that violate these terms.',
  },
  {
    title: '4. Bookings & Cancellations',
    body: 'Bookings may be cancelled before the session begins at no charge. A No-Show fee may apply if you fail to attend without cancellation. All times are in Oman Standard Time (GMT+4).',
  },
  {
    title: '5. Fees & Payments',
    body: 'Charging fees are calculated based on energy consumed (kWh) and the station\'s rate. All payments are processed through the in-app digital wallet. Prices are subject to change with prior notice.',
  },
  {
    title: '6. Refunds',
    body: 'Refunds are returned to the digital wallet in cases of proven technical failure or platform-initiated cancellation. Payments are non-refundable in cases of service misuse or violation of these terms.',
  },
  {
    title: '7. User Conduct',
    body: 'You must not use the app for unlawful purposes, defame the platform, or interfere with station operations. You must comply with all safety instructions at each charging station.',
  },
  {
    title: '8. Limitation of Liability',
    body: 'Go Watt is not liable for damages arising from improper use of charging stations, failures caused by factors beyond our control, or any indirect or consequential losses.',
  },
  {
    title: '9. Intellectual Property',
    body: 'All intellectual property rights in the app, including trademarks, content, and design, are owned by Go Watt. No content may be copied or distributed without prior written permission.',
  },
  {
    title: '10. Amendments',
    body: 'Go Watt reserves the right to modify these terms at any time. Users will be notified of material changes via email or in-app notifications. Continued use of the app constitutes acceptance of the updated terms.',
  },
  {
    title: '11. Governing Law',
    body: 'These terms are governed by the laws of the Sultanate of Oman. Any disputes shall be resolved before the competent courts in Muscat, Sultanate of Oman.',
  },
  {
    title: '12. Contact Us',
    body: 'For any inquiries regarding these terms, please contact us at: support@watt.om',
  },
];

export default function TermsScreen({ visible, onClose }: Props) {
  const { isRTL } = useLang();
  const sections = isRTL ? TERMS_AR : TERMS_EN;
  const title = isRTL ? 'شروط الاستخدام' : 'Terms of Use';
  const updated = isRTL ? 'آخر تحديث: يناير 2025' : 'Last updated: January 2025';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.introBadge}>
            <Text style={styles.introEmoji}>📄</Text>
            <Text style={styles.introTitle}>{title}</Text>
            <Text style={styles.introDate}>{updated}</Text>
          </View>

          {sections.map((s, i) => (
            <View key={i} style={styles.section}>
              <Text style={[styles.sectionTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{s.title}</Text>
              <Text style={[styles.sectionBody, { textAlign: isRTL ? 'right' : 'left' }]}>{s.body}</Text>
            </View>
          ))}

          <View style={styles.footer}>
            <Text style={styles.footerText}>© 2025 Go Watt. All rights reserved.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 16, color: COLORS.text },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  content: { padding: 20, gap: 4 },
  introBadge: {
    backgroundColor: COLORS.primary, borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 20, gap: 6,
  },
  introEmoji: { fontSize: 40 },
  introTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  introDate: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  section: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginBottom: 8 },
  sectionBody: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 21 },
  footer: { alignItems: 'center', paddingVertical: 24 },
  footerText: { fontSize: 11, color: COLORS.textTertiary },
});
