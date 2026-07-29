export interface Profile {
  id: string;
  phone?: string;
  full_name: string;
  role: 'customer' | 'host' | 'investor' | 'admin' | 'superadmin';
  is_active: boolean;
  avatar_url?: string;
  wallet_balance: number;
  held_balance: number;       // money reserved for active sessions (not spendable)
  total_sessions: number;
  total_kwh: number;
  car_model?: string;
  car_make?: string | null;
  battery_kwh?: number | null;
  connector_type?: string | null;
  profile_prompted?: boolean;
  investor_welcomed?: boolean;
  payout_bank_name?: string | null;
  payout_account_holder?: string | null;
  payout_iban?: string | null;
  expo_push_token?: string | null;
  notif_push?: boolean;
  notif_booking?: boolean;
  notif_charging?: boolean;
  notif_promo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChargerListing {
  id: string;
  host_id: string;
  host_name?: string;
  station_name?: string | null;
  address: string;
  latitude: number;
  longitude: number;
  charger_type: 'Type2' | 'CCS' | 'CHAdeMO' | 'GBT';
  power_kw: number;
  price_per_kwh: number;
  is_available: boolean;
  availability_start?: string;
  availability_end?: string;
  description?: string | null;
  total_bookings: number;
  rating: number;
  total_ratings: number;
  tuya_device_id?: string | null;
  switch_status?: boolean;
  tuya_verified?: boolean;
  created_at: string;
}

export interface Station {
  id: string;
  name: string;
  name_ar?: string;
  address: string;
  address_ar?: string;
  governorate: string;
  wilayat?: string;
  latitude: number;
  longitude: number;
  status: 'available' | 'busy' | 'fault' | 'offline';
  price_per_kwh: number;
  total_connectors: number;
  available_connectors: number;
  rating: number;
  total_ratings: number;
  power_kw: number;
  image_url?: string;
  amenities?: string[];
  operating_hours: string;
  last_maintenance?: string;
  created_at: string;
}

export interface Connector {
  id: string;
  station_id: string;
  connector_type: 'Type2' | 'CCS' | 'CHAdeMO' | 'GBT' | 'Tesla';
  power_kw: number;
  status: 'available' | 'occupied' | 'fault' | 'offline';
}

export interface Booking {
  id: string;
  user_id: string;
  station_id: string | null;
  connector_id?: string;
  listing_id?: string | null;
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled' | 'no_show';
  booked_at: string;
  duration_minutes: number;
  estimated_kwh?: number;
  estimated_cost?: number;
  actual_kwh?: number;
  actual_cost?: number;
  qr_code: string;
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
  station?: Station;
}

export interface ChargingSession {
  id: string;
  booking_id?: string;
  listing_id?: string;
  user_id: string;
  station_id?: string;
  connector_id?: string;
  status: 'active' | 'completed' | 'interrupted';
  started_at: string;
  ended_at?: string;
  kwh_delivered: number;
  cost: number;
  held_amount: number;        // amount reserved from the wallet for this session
  meter_kwh?: number | null;  // device's own energy reading (reconciliation)
  flagged_review?: boolean;   // meter vs estimate disagreed — needs admin review
  battery_start_pct?: number;
  battery_end_pct?: number;
  created_at: string;
  station?: Station;
  listing?: { id: string; tuya_device_id: string | null; power_kw: number; price_per_kwh: number; address: string };
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: 'topup' | 'charge' | 'refund' | 'bonus' | 'earning' | 'withdrawal';
  amount: number;
  balance_after: number;
  description: string;
  reference_id?: string;
  payment_method?: string;
  created_at: string;
}

export interface PayoutRequest {
  id: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  bank_name?: string | null;
  account_holder?: string | null;
  iban?: string | null;
  admin_note?: string | null;
  requested_at: string;
  processed_at?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
}

// Navigation param lists
export type RootStackParamList = {
  GuestMain: undefined;
  CustomerMain: undefined;
  // Auth screens (restore when needed)
  Splash: undefined;
  RoleSelect: undefined;
  Phone: { role: 'customer' };
  OTP: { email: string; role: 'customer'; fullName: string };
  SignIn: { role: 'customer' };
  SignUp: { role: 'customer' };
};

export type GuestStackParamList = {
  Landing: undefined;
  SignIn: undefined;
  SignUp: undefined;
  GuestTabs: undefined;
};

export type GuestTabParamList = {
  GuestMap: undefined;
  GuestBookings: { feature: 'bookings' };
  GuestWallet: { feature: 'wallet' };
  GuestProfile: undefined;
};

export type CustomerStackParamList = {
  Tabs: undefined;
  StationDetails: { stationId: string };
  CompleteProfile: { station?: Station; listingId?: string } | undefined;
  Booking: { station: Station; listingId?: string };
  ActiveBooking: { bookingId: string };
  Charging: { sessionId: string; stationName: string };
  SessionSummary: { kwhDelivered: number; cost: number; durationSeconds: number; stationName: string; sessionId?: string };
  InvestorApplication: { reapply?: boolean };
  Notifications: undefined;
};

export type CustomerTabParamList = {
  Map: undefined;
  Bookings: undefined;
  Wallet: undefined;
  Profile: undefined;
};

export type AdminTabParamList = {
  AdminMap: undefined;
  AdminCustomers: undefined;
  AdminInvestors: undefined;
  AdminProfile: undefined;
};

export interface AdminCustomer {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  role: string;
  is_active: boolean;
  wallet_balance: number;
  total_sessions: number;
  total_kwh: number;
  car_model?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export type AdminStackParamList = {
  AdminTabs: undefined;
  AdminApplicationDetail: { application: ChargerApplication };
  AdminCustomerDetail: { customer: AdminCustomer };
  AdminPayouts: undefined;
  AdminAnalytics: undefined;
  AdminFlagged: undefined;
  SuperAdmin: undefined;
  Notifications: undefined;
};

export type InvestorTabParamList = {
  Map: undefined;
  Bookings: undefined;
  InvestorCharger: undefined;
  Wallet: undefined;
  Profile: undefined;
};

export type InvestorStackParamList = {
  InvestorTabs: undefined;
  StationDetails: { stationId: string };
  CompleteProfile: { station?: Station; listingId?: string } | undefined;
  Booking: { station: Station; listingId?: string };
  ActiveBooking: { bookingId: string };
  Charging: { sessionId: string; stationName: string };
  SessionSummary: { kwhDelivered: number; cost: number; durationSeconds: number; stationName: string; sessionId?: string };
  InvestorApplication: { reapply?: boolean };
  Notifications: undefined;
};

export interface ChargerApplication {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  station_name?: string | null;
  governorate: string;
  city: string;
  latitude?: number;
  longitude?: number;
  charger_type: 'Type2' | 'CCS' | 'CHAdeMO' | 'GBT';
  power_kw?: number;
  electricity_form_name: string;
  commercial_registration: string;
  id_card_number: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'needs_info';
  admin_comment?: string;
  created_at: string;
  updated_at: string;
  profile?: { full_name: string; phone?: string };
}

// Backwards-compat aliases
export type MainStackParamList = CustomerStackParamList;
export type TabParamList = CustomerTabParamList;
