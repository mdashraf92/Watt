export type MarketplaceStackParamList = {
  MarketProduct: { id: string };
  MarketCart: undefined;
  MarketOrders: undefined;
  MarketOrder: { id: string };
  MarketVehicles: undefined;
  MarketAppointments: undefined;
  MarketPortal: undefined;
  MarketProductEditor: { vendorId: string; product?: any };
  MarketAdmin: undefined;
};

import type { NavigatorScreenParams } from '@react-navigation/native';

export interface Profile {
  id: string;
  phone?: string;
  full_name: string;
  role: 'customer' | 'host' | 'investor' | 'operator' | 'admin' | 'superadmin';
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
  onboarding_completed?: boolean;   // false until the first-run ProfileSetup is finished
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
  is_package_venue?: boolean;
  /** Café ordering enabled (backend-cafe-orders.sql) — opens CafeMenu instead of plain packages. */
  cafe_enabled?: boolean;
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
  /** Distinct connector types across this station's connectors (map filter). */
  connector_types?: string[];
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
  listing?: {
    id: string;
    address?: string;
    station_name?: string;
    tuya_device_id?: string;
    power_kw?: number;
    price_per_kwh?: number;
  };
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
  booking?: { id: string; listing_id: string | null; booked_end?: string | null };
  overstay_grace_minutes?: number | null;
  overstay_fee_per_minute?: number | null;
  overstay_minutes?: number;
  overstay_fee?: number;
  completion_photo_base64?: string | null;
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

// ── Venue packages (marketplace pivot, phase 1) ─────────────────────────────
// Go Watt does not sell kWh. A branded venue sells a bundle — a coffee and an
// hour on the charger, a gym month carrying charging credit — and charging is
// an included amenity. Note there is no price_per_kwh anywhere below: the
// package has one price, and the allowance is a cap, not a rate.
// See backend/sql/backend-packages.sql.

export interface VenuePackage {
  id: string;
  offer_version: string;
  station_id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  /** The non-electricity half of the bundle: the coffee, the gym month, the room night. */
  partner_benefit: string;
  partner_benefit_ar: string;
  price: number;
  /** Null when this package is not capped on that axis. At least one is always set. */
  included_minutes: number | null;
  included_kwh: number | null;
  validity_hours: number;
  sort_order: number;
}

export type PackageDraft = Omit<VenuePackage, 'id' | 'offer_version'>;
export interface VenueStaffMember { id: string; full_name: string | null; phone: string | null; }
export interface PackageDeviceConfig {
  connector_id: string; device_id: string | null; switch_code: string | null;
  energy_code: string | null; energy_scale: number | null; enabled: boolean;
  connector_type: string; power_kw: number; busy: boolean;
}
export interface VenueOperations {
  venue: { id: string; name: string; name_ar: string | null; is_package_venue: boolean };
  staff: VenueStaffMember[];
  devices: PackageDeviceConfig[];
  runs: { id: string; entitlement_id: string; connector_id: string; state: string; stop_reason: string | null;
    flagged_review: boolean; created_at: string; ended_at: string | null; package_name: string; package_name_ar: string }[];
}
export interface AdminVenuePackage extends VenuePackage {
  is_active: boolean;
  station_name: string;
  station_name_ar: string | null;
  sold_count: string;
}

export interface PackageChargingRun {
  id: string; entitlement_id: string; connector_id: string;
  state: 'starting' | 'active' | 'stopping' | 'completed';
  started_at: string | null; deadline: string; ended_at: string | null;
  kwh_delivered: number; cost: number; flagged_review: boolean; stop_reason: string | null;
}
export interface PackageChargingState {
  enabled: boolean;
  connectors: { id: string; connector_type: string; power_kw: number; status: string; busy: boolean }[];
  run: PackageChargingRun | null;
}
export interface PackageBenefit {
  id: string; package_name: string; package_name_ar: string;
  partner_benefit: string; partner_benefit_ar: string;
  station_name: string; station_name_ar: string | null;
  status: string; expires_at: string; benefit_redeemed_at: string | null;
}

export interface Entitlement {
  id: string;
  station_id: string;
  package_id: string;
  status: 'active' | 'consumed' | 'expired' | 'refunded';
  price_paid: number;
  /** Shown to venue staff at the counter. */
  redeem_code: string;
  minutes_total: number | null;
  minutes_used: number;
  kwh_total: number | null;
  kwh_used: number;
  purchased_at: string;
  expires_at: string;
  consumed_at?: string | null;
  benefit_redeemed_at: string | null;
  // Joined for display — the entitlement snapshots its own package and venue,
  // so these stay correct even if the package is re-priced or deactivated.
  package_name: string;
  package_name_ar: string;
  partner_benefit: string;
  partner_benefit_ar: string;
  station_name: string;
  station_name_ar?: string | null;
  address?: string | null;
}

export interface PurchaseResult {
  entitlement: Omit<Entitlement, 'station_name' | 'station_name_ar' | 'address'>;
  balance: number;
}

export interface RedeemResult {
  entitlement: Omit<Entitlement, 'station_name' | 'station_name_ar' | 'address'>;
  minutes_redeemed: number;
  kwh_redeemed: number;
  consumed: boolean;
}

export interface PayoutRequest {
  id: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'processing' | 'paid' | 'rejected' | 'failed';
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

export type GuestStackParamList = MarketplaceStackParamList & {
  Landing: undefined;
  SignIn: undefined;
  SignUp: undefined;
  GuestTabs: undefined;
  // Sign-in sheet opened by useRequireAuth() when a guest tries to act.
  AuthPrompt: { reason?: 'generic' | 'booking' | 'order' | 'service' | 'favorite' | 'account' } | undefined;
  // Guests can open a station from the map; acting on it is gated.
  StationDetails: { stationId: string } | { listingId: string };
};

export type GuestTabParamList = {
  GuestMap: undefined;
  GuestShop: undefined;
};

export type CustomerStackParamList = MarketplaceStackParamList & {
  Tabs: NavigatorScreenParams<CustomerTabParamList> | undefined;
  VenuePackages: { stationId: string; stationName: string };
  MyPackages: undefined;
  PackageCharging: { entitlementId: string; stationName: string };
  PackageStaff: undefined;
  StationDetails: { stationId: string } | { listingId: string };
  CompleteProfile: { station?: Station; listingId?: string } | undefined;
  Booking: { station: Station; listingId?: string };
  ActiveBooking: { bookingId: string };
  Charging: { sessionId: string; stationName: string };
  SessionSummary: { kwhDelivered: number; cost: number; durationSeconds: number; stationName: string; sessionId?: string };
  InvestorApplication: { reapply?: boolean };
  ReportIssue: { sessionId?: string; bookingId?: string } | undefined;
  Notifications: undefined;
  MobileCharge: undefined;
  MobileChargeTracking: { requestId: string };
  MobileChargeSummary: { requestId: string; kwh: number; cost: number };
  MobileChargeHistory: undefined;
  TripPlanner: undefined;
  TripPlanResult: { plan: TripPlan; from: { latitude: number; longitude: number; label: string };
                    to: { latitude: number; longitude: number; label: string } };
  MyTrips: undefined;
  TripDetail: { tripId: string };
  Favorites: undefined;
  CafeMenu: { stationId: string };
  CafeOrder: { orderId: string };
  CafeStaffOrders: undefined;
};

export type CustomerTabParamList = {
  Shop: undefined;
  Map: undefined;
  Coffee: undefined;
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

export type AdminStackParamList = MarketplaceStackParamList & {
  AdminVenueOperations: undefined;
  AdminCafes: undefined;
  AdminPackages: undefined;
  AdminTabs: undefined;
  AdminApplicationDetail: { application: ChargerApplication };
  AdminCustomerDetail: { customer: AdminCustomer };
  AdminPayouts: undefined;
  AdminAnalytics: undefined;
  AdminFlagged: undefined;
  AdminFleet: undefined;
  AdminMobileRequests: undefined;
  AdminReports: undefined;
  AdminReportDetail: { report: SupportReport };
  AdminActiveSessions: undefined;
  AdminInvestorEarnings: { userId: string };
  SuperAdmin: undefined;
  Notifications: undefined;
};

export type InvestorTabParamList = {
  Shop: undefined;
  Map: undefined;
  Bookings: undefined;
  InvestorCharger: undefined;
  Wallet: undefined;
  Profile: undefined;
};

export type InvestorStackParamList = MarketplaceStackParamList & {
  InvestorTabs: undefined;
  VenuePackages: { stationId: string; stationName: string };
  MyPackages: undefined;
  PackageCharging: { entitlementId: string; stationName: string };
  PackageStaff: undefined;
  StationDetails: { stationId: string } | { listingId: string };
  CompleteProfile: { station?: Station; listingId?: string } | undefined;
  Booking: { station: Station; listingId?: string };
  ActiveBooking: { bookingId: string };
  Charging: { sessionId: string; stationName: string };
  SessionSummary: { kwhDelivered: number; cost: number; durationSeconds: number; stationName: string; sessionId?: string };
  InvestorApplication: { reapply?: boolean };
  ReportIssue: { sessionId?: string; bookingId?: string } | undefined;
  Notifications: undefined;
  Favorites: undefined;
  MobileCharge: undefined;
  MobileChargeTracking: { requestId: string };
  MobileChargeSummary: { requestId: string; kwh: number; cost: number };
  MobileChargeHistory: undefined;
  TripPlanner: undefined;
  TripPlanResult: { plan: TripPlan; from: { latitude: number; longitude: number; label: string };
                    to: { latitude: number; longitude: number; label: string } };
  MyTrips: undefined;
  TripDetail: { tripId: string };
};

// ── Support reports ("report a problem") ───────────────────────────────────

export type ReportCategory = 'charger_fault' | 'payment' | 'safety' | 'damage' | 'other';
export type ReportStatus = 'open' | 'in_review' | 'resolved';

export interface SupportReport {
  id: string;
  user_id: string;
  category: ReportCategory;
  description: string;
  photo_base64?: string | null;
  booking_id?: string | null;
  session_id?: string | null;
  status: ReportStatus;
  admin_response?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
  reporter?: { full_name: string; phone: string };
}

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

// ── Mobile charging (roadside rescue) ──────────────────────────────────────

export type MobileChargeStatus =
  | 'pending' | 'offered' | 'assigned' | 'en_route' | 'arrived'
  | 'charging' | 'completed' | 'cancelled' | 'no_van';

/** Statuses where a van is still coming or working — i.e. the job is live. */
export const MOBILE_LIVE_STATUSES: MobileChargeStatus[] =
  ['pending', 'offered', 'assigned', 'en_route', 'arrived', 'charging'];

export interface MobileChargeConfig {
  enabled: boolean;
  callout_fee: number;
  price_per_kwh: number;
  min_kwh: number;
  max_kwh: number;
  hold_buffer: number;
  cancel_fee: number;
  service_radius_km: number;
  vans_on_duty: number;
}

export interface MobileChargeRequest {
  id: string;
  user_id: string;
  van_id?: string | null;
  operator_id?: string | null;
  pickup_lat: number;
  pickup_lng: number;
  address_text: string;
  notes?: string | null;
  car_make?: string | null;
  car_model?: string | null;
  connector_type?: string | null;
  requested_kwh: number;
  callout_fee: number;
  price_per_kwh: number;
  estimated_cost: number;
  held_amount: number;
  kwh_delivered?: number | null;
  cost?: number | null;
  cancel_fee: number;
  status: MobileChargeStatus;
  offer_expires_at?: string | null;
  eta_at?: string | null;
  assigned_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  /** Only populated while the job is live — see REQUEST_SELECT in the backend. */
  driver?: {
    name: string; phone: string; van: string; plate: string;
    lat: number | null; lng: number | null; seen_at: string | null;
  } | null;
}

export interface ServiceVan {
  id: string;
  label: string;
  plate: string;
  operator_id?: string | null;
  operator_name?: string | null;
  operator_phone?: string | null;
  capacity_kwh: number;
  current_kwh: number;
  status: 'offline' | 'available' | 'on_job' | 'maintenance';
  governorate?: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
  last_seen_at?: string | null;
  is_active: boolean;
  jobs_completed?: number;
}

/** A job as the driver sees it — carries the customer's contact details. */
export interface OperatorJob extends MobileChargeRequest {
  customer_name: string;
  customer_phone: string;
}

// ── Trip planner ───────────────────────────────────────────────────────────

export interface TripCandidate {
  kind: 'station' | 'listing';
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  power_kw: number;
  price_per_kwh: number;
  along_km: number;
  detour_km: number;
}

export interface TripStop extends TripCandidate {
  arrive_soc_pct: number;
  depart_soc_pct: number;
  charge_kwh: number;
  charge_minutes: number;
  cost: number;
}

export interface TripPlanParams {
  battery_kwh: number;
  start_soc_pct: number;
  reserve_soc_pct: number;
  consumption_kwh_per_100km: number;
  connector_type?: string | null;
}

export interface TripPlan {
  success: boolean;
  feasible: boolean;
  distance_km: number;
  duration_min: number;
  total_minutes: number;
  total_cost: number;
  total_kwh: number;
  arrive_soc_pct: number;
  stops: TripStop[];
  /** Present only when the trip cannot be completed with this car. */
  gap?: { from_km: number; needed_km: number; reachable_km: number };
  coordinates: Array<[number, number]>;
  nearby: TripCandidate[];
  params: TripPlanParams;
}

export interface Favorite {
  id: string;
  station_id: string | null;
  listing_id: string | null;
  created_at: string;
  station_name: string | null;
  listing_name: string | null;
  listing_address: string | null;
}

export interface SavedTrip {
  id: string;
  user_id: string;
  name: string;
  from_lat: number; from_lng: number; from_label: string;
  to_lat: number;   to_lng: number;   to_label: string;
  params: TripPlanParams;
  plan: Omit<TripPlan, 'coordinates' | 'nearby'>;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  stop_count?: number;
  created_at: string;
  stops?: SavedTripStop[];
}

export interface SavedTripStop {
  id: string;
  trip_id: string;
  seq: number;
  station_id: string | null;
  listing_id: string | null;
  name: string;
  latitude: number;
  longitude: number;
  along_km: number;
  arrive_soc: number | null;
  depart_soc: number | null;
  charge_kwh: number | null;
  charge_minutes: number | null;
  cost: number | null;
  booking_id: string | null;
  status: 'planned' | 'booked' | 'done' | 'skipped';
  booking_status?: string | null;
  booked_at?: string | null;
}

export type OperatorStackParamList = {
  OperatorTabs: undefined;
  OperatorJob: { requestId: string };
  Notifications: undefined;
};

export type OperatorTabParamList = {
  OperatorHome: undefined;
  OperatorHistory: undefined;
  OperatorProfile: undefined;
};

// Backwards-compat aliases
export type MainStackParamList = CustomerStackParamList;
export type TabParamList = CustomerTabParamList;

// ── Go Watt Café (backend/sql/backend-cafe-orders.sql) ──────────────────────
export type CafeSummary = {
  id: string; name: string; name_ar: string | null; address: string; address_ar: string | null;
  latitude: number; longitude: number; image_url: string | null; cafe_logo_url: string | null;
  operating_hours: string; orders_paused: boolean; prep_minutes: number; rating: number;
  from_price: number | null; included_minutes: number | null; included_kwh: number | null; can_order: boolean;
};
export type CafeChoice = { id: string; name: string; name_ar: string; price_delta: number };
export type CafeOptionGroup = { id: string; name: string; name_ar: string; required?: boolean; max?: number; choices: CafeChoice[] };
export type CafeMenuItem = {
  id: string; category: string; category_ar: string; name: string; name_ar: string;
  description: string; description_ar: string; price: number; image_url: string | null;
  options: CafeOptionGroup[];
  /** null = cannot be the package drink; 0 = included; >0 = extra when chosen as the package drink. */
  package_upcharge: number | null;
};
export type CafePackage = {
  id: string; name: string; name_ar: string; description: string; description_ar: string;
  partner_benefit: string; partner_benefit_ar: string; price: number;
  included_minutes: number | null; included_kwh: number | null; included_items: number;
  validity_hours: number; offer_version: string;
};
export type CafeDetail = Omit<CafeSummary, 'from_price' | 'included_minutes' | 'included_kwh' | 'rating'> & {
  charger_ready: boolean; packages: CafePackage[]; menu: CafeMenuItem[];
};
export type CafeOrderStatus = 'pending_payment' | 'paid' | 'accepted' | 'ready' | 'collected' | 'rejected' | 'cancelled' | 'payment_failed';
export type CafeOrderLine = { item_id: string; quantity: number; in_package: boolean; options: string[] };
export type CafeOrder = {
  id: string; number: number; status: CafeOrderStatus; station_id: string; package_id: string;
  package_price: number; items_total: number; total: number; note: string;
  refund_status: 'pending' | 'refunded' | 'failed' | 'review' | null; reject_reason: string | null;
  ready_eta: string | null; created_at: string; paid_at: string | null; accepted_at: string | null;
  ready_at: string | null; collected_at: string | null; entitlement_id: string | null;
  station_name: string; station_name_ar: string | null; address: string;
  redeem_code: string | null; minutes_total: number | null; minutes_used: number | null;
  kwh_total: number | null; kwh_used: number | null; expires_at: string | null; pass_status: string | null;
  package_name: string; package_name_ar: string;
  items?: { name: string; name_ar: string; options: { group: string; group_ar: string; name: string; name_ar: string }[];
            unit_price: number; quantity: number; in_package: boolean }[];
};
export type CafePaymentStep =
  | { status: 'paid' | 'pending'; order: { id: string } }
  | { status: 'action_required'; order: { id: string }; redirect_url: string }
  | { status: 'failed'; order: { id: string }; message?: string };
export type CafeStaffOrder = {
  id: string; number: number; status: 'paid' | 'accepted' | 'ready'; total: number; note: string;
  created_at: string; paid_at: string; ready_eta: string | null; customer_name: string | null;
  items: { name: string; name_ar: string; options: { name: string; name_ar: string }[]; quantity: number; in_package: boolean }[];
};
export type CafeStaffVenue = { id: string; name: string; name_ar: string | null; orders_paused: boolean; prep_minutes: number };
export type AdminCafe = {
  id: string; name: string; name_ar: string | null; is_package_venue: boolean; cafe_enabled: boolean;
  cafe_logo_url: string | null; image_url: string | null; orders_paused: boolean; prep_minutes: number;
  menu_source: 'manual' | 'beanz'; beanz_store_id: string | null; beanz_synced_at: string | null; beanz_sync_error: string | null;
  charge_share_omr: number; commission_pct: number; beanz_fee_pct: number; menu_count: number; refunds_failed: number;
};
export type AdminCafeMenuItem = CafeMenuItem & { is_available: boolean; source_available: boolean; source: 'manual' | 'csv' | 'beanz'; sort_order: number };
export type AdminCafeSettlement = {
  unsettled: { orders: number; gross: number; charge_share: number; commission: number; beanz_fee: number; cafe_net: number };
  settlements: { id: string; period_end: string; order_count: number; gross: number; cafe_net: number; beanz_fee: number; status: 'open' | 'paid'; bank_reference: string | null; created_at: string }[];
  refunds: { id: string; number: number; total: number; refund_status: string; reject_reason: string | null; closed_at: string }[];
};
