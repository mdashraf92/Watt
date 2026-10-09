import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import * as WebBrowser from 'expo-web-browser';

export const market = {
  get: <T = any>(path: string, query?: Record<string, any>) => api.request<T>('GET', `/api/marketplace${path}`, { query }),
  post: <T = any>(path: string, body: any) => api.request<T>('POST', `/api/marketplace${path}`, { body }),
  put: <T = any>(path: string, body: any) => api.request<T>('PUT', `/api/marketplace${path}`, { body }),
  patch: <T = any>(path: string, body: any) => api.request<T>('PATCH', `/api/marketplace${path}`, { body }),
  remove: (path: string) => api.request('DELETE', `/api/marketplace${path}`),
};
export const omr = (baisa: number) => `${(Number(baisa) / 1000).toFixed(3)} OMR`;
// Persist the complete checkout, not just its key, so a lost response can be retried unchanged.
export const pendingKey = (user: string) => `gowatt-market-checkout:${user}`;
export const requestKey = () => `market-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export async function fundWalletForMarket(user: string, amount: number) {
 const storageKey=`gowatt-market-topup:${user}`;
 const saved=await AsyncStorage.getItem(storageKey);
 let payment=saved?JSON.parse(saved):null;
 if(payment){
  const result=await api.payments.verify(payment.session_id);
  if(result.status==='paid'){await AsyncStorage.removeItem(storageKey);return true;}
  if(['cancelled','expired','failed'].includes(result.status)){await AsyncStorage.removeItem(storageKey);payment=null;}
 }
 if(!payment){payment=await api.payments.create(amount);await AsyncStorage.setItem(storageKey,JSON.stringify(payment));}
 await WebBrowser.openAuthSessionAsync(payment.pay_url,'watt://wallet');
 const result=await api.payments.verify(payment.session_id);
 if(['paid','cancelled','expired','failed'].includes(result.status))await AsyncStorage.removeItem(storageKey);
 return result.status==='paid';
}
export async function pendingCheckout(user: string, body: any) {
  const old = await AsyncStorage.getItem(pendingKey(user));
  if (old) return JSON.parse(old);
  const next = { ...body, request_key: requestKey() };
  await AsyncStorage.setItem(pendingKey(user), JSON.stringify(next));
  return next;
}
export interface Product {
 id: string; vendor_id: string; category_id: string; kind: 'physical' | 'service'; name: string; name_ar: string;
 description: string; description_ar: string; image_url: string; images: string[]; price: number; stock: number; version: number;
 vendor_name: string; vendor_name_ar: string; warranty: string; warranty_ar: string; return_days: number;
 pickup_address: string; pickup_enabled: boolean; delivery_enabled: boolean; delivery_fee: number; delivery_area: string;
 specifications: Record<string,string>; compatibility: {make:string;model:string;year_from:number;year_to:number}[];
 variants: Variant[]; slots: {id:string;starts_at:string;capacity:number;booked:number}[];
 reviews: {rating:number;comment:string;created_at:string}[]; price_basis:'fixed'|'quote'; duration_minutes:number;service_location:string;
}
export interface Variant { id:string;name:string;name_ar:string;price:number;stock:number;version:number;sku:string }
export interface Vehicle { id:string;make:string;model:string;year:number;connector:string }

// The signed-in user's seller store (owner or staff), or null. Re-checked each
// time the screen gains focus so a fresh approval shows up without a restart.
export function useMyStore(signedIn: boolean) {
  const [store, setStore] = React.useState<any | null>(null);
  useFocusEffect(React.useCallback(() => {
    if (!signedIn) { setStore(null); return; }
    let live = true;
    market.get<{ vendors: any[] }>('/portal').then(p => { if (live) setStore(p.vendors[0] ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [signedIn]));
  return store;
}
