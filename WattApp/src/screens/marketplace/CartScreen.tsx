import React,{useCallback,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {useAuth} from '../../context/AuthContext';
import {useLang} from '../../context/LanguageContext';
import {market,omr,pendingCheckout,pendingKey,fundWalletForMarket} from '../../lib/marketplace';
import {Button,ErrorNotice,Field,Label,Loading,styles,useCopy} from './shared';

export default function CartScreen({navigation}:any){
 const c=useCopy();const {isRTL}=useLang();const {session,profile,refreshProfile}=useAuth();
 const [items,setItems]=useState<any[]>([]);const [methods,setMethods]=useState<Record<string,'pickup'|'delivery'>>({});
 const [phone,setPhone]=useState(profile?.phone||'');const [address,setAddress]=useState('');const [pending,setPending]=useState<any>(null);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async()=>{if(!session)return;setLoading(true);setError('');try{const rows=await market.get<any[]>('/cart');setItems(rows);setMethods(old=>Object.fromEntries(rows.map(r=>[r.vendor_id,old[r.vendor_id]||(r.pickup_enabled?'pickup':'delivery')])));const p=await AsyncStorage.getItem(pendingKey(session.user.id));setPending(p?JSON.parse(p):null);}catch(e:any){setError(e.message);}finally{setLoading(false);}},[session]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const vendors=[...new Map(items.map(i=>[i.vendor_id,i])).values()];
 const total=items.reduce((n,i)=>n+i.price*i.quantity,0)+vendors.reduce((n,v)=>n+(methods[v.vendor_id]==='delivery'?v.delivery_fee:0),0);
 const available=Math.round(((profile?.wallet_balance||0)-(profile?.held_balance||0))*1000);
 const topup=Math.min(50000,Math.max(1000,(pending?.expected_total||total)-available));
 const change=async(id:string,quantity:number)=>{setBusy(true);try{await market.put(`/cart/${id}`,{quantity});await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const pay=async()=>{if(!session)return;setBusy(true);setError('');try{
  const body=await pendingCheckout(session.user.id,{expected_total:total,phone,address,fulfilment:methods,lines:items.map(i=>({variant_id:i.id,quantity:i.quantity,version:i.version,product_version:i.product_version}))});
  setPending(body);const order=await market.post('/checkout',body);await AsyncStorage.removeItem(pendingKey(session.user.id));setPending(null);await refreshProfile();navigation.replace('MarketOrder',{id:order.id});
 }catch(e:any){setError(e.code==='insufficient_balance'?c('Insufficient wallet balance. Add funds from Wallet, then retry this checkout.','رصيد المحفظة غير كافٍ. أضف رصيداً من المحفظة ثم أعد المحاولة.'):e.message);
  if(e.status>=400&&e.status<500&&e.status!==401&&e.status!==429){await AsyncStorage.removeItem(pendingKey(session.user.id));setPending(null);}
 }finally{setBusy(false);}};
 return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
  <Button secondary label={c('Back','رجوع')} onPress={()=>navigation.goBack()}/><Label large>{c('Your cart','سلتك')}</Label>
  {loading?<Loading/>:<>{pending&&<View style={styles.card}><Label>{c('A checkout is awaiting confirmation. Retry it to retrieve the order or finish payment.','هناك عملية دفع بانتظار التأكيد. أعد المحاولة لاسترجاع الطلب أو إكمال الدفع.')}</Label><Label>{omr(pending.expected_total)}</Label><Button disabled={busy} label={c('Retry saved checkout','إعادة محاولة الدفع المحفوظ')} onPress={pay}/></View>}
  {!items.length&&!pending&&<Label>{c('Your cart is empty. Explore the marketplace to add an item.','سلتك فارغة. تصفح السوق لإضافة منتج.')}</Label>}
  {items.map(i=><View key={i.id} style={styles.card}><Label>{isRTL?i.product_name_ar:i.product_name}</Label><Text style={styles.muted}>{isRTL?i.name_ar:i.name} · {omr(i.price)}</Text><View style={styles.row}>
   <Button secondary disabled={busy||!!pending} label="−" onPress={()=>change(i.id,i.quantity-1)}/><Label>{i.quantity}</Label><Button secondary disabled={busy||!!pending||i.quantity>=Math.min(99,i.stock)} label="+" onPress={()=>change(i.id,i.quantity+1)}/>
   <Button secondary disabled={busy||!!pending} label={c('Remove','إزالة')} onPress={()=>change(i.id,0)}/></View></View>)}
  {!!items.length&&!pending&&<>
   {vendors.map(v=><View key={v.vendor_id} style={styles.card}><Label>{isRTL?v.vendor_name_ar:v.vendor_name}</Label><Label>{v.pickup_address}</Label><View style={styles.row}>
    {v.pickup_enabled&&<Button secondary={methods[v.vendor_id]!=='pickup'} label={c('Collect from vendor','الاستلام من التاجر')} onPress={()=>setMethods(m=>({...m,[v.vendor_id]:'pickup'}))}/>}
    {v.delivery_enabled&&<Button secondary={methods[v.vendor_id]!=='delivery'} label={`${c('Delivery','التوصيل')} · ${omr(v.delivery_fee)}`} onPress={()=>setMethods(m=>({...m,[v.vendor_id]:'delivery'}))}/>}</View>
    {methods[v.vendor_id]==='delivery'&&<Label>{c('Coverage: ','نطاق التوصيل: ')}{v.delivery_area}</Label>}</View>)}
   <Field label={c('Contact phone','رقم التواصل')} value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
   {Object.values(methods).includes('delivery')&&<Field label={c('Delivery address (within the listed coverage)','عنوان التوصيل (ضمن النطاق المحدد)')} value={address} onChangeText={setAddress} multiline/>}
   <View style={styles.card}><Label>{c('Total','الإجمالي')}</Label><Text style={styles.price}>{omr(total)}</Text><Label>{c('Available wallet balance: ','رصيد المحفظة المتاح: ')}{omr(Math.round(((profile?.wallet_balance||0)-(profile?.held_balance||0))*1000))}</Label>
    <Label>{c('Payment is collected by Go Watt. Pickup is free. Each vendor prepares its part of your order.','يتم الدفع عبر Go Watt. الاستلام مجاني. يجهز كل تاجر الجزء الخاص به من طلبك.')}</Label>
    <Button disabled={busy||phone.trim().length<6} label={busy?c('Processing…','جارٍ الدفع…'):`${c('Pay from wallet','الدفع من المحفظة')} · ${omr(total)}`} onPress={pay}/>
   </View>
  </>}
  </>}
  {(items.length>0||pending)&&<View style={styles.card}><Label>{c('Need to add funds? Pay securely by card through Thawani, then complete your order from the wallet. Any unused balance stays in your wallet.','تحتاج إلى رصيد؟ ادفع بأمان بالبطاقة عبر ثواني ثم أكمل الطلب من المحفظة. يبقى أي رصيد غير مستخدم في محفظتك.')}</Label>
   <Button secondary disabled={busy} label={`${c('Add with card','إضافة رصيد بالبطاقة')} · ${omr(topup)}`} onPress={async()=>{if(!session)return;setBusy(true);setError('');try{const paid=await fundWalletForMarket(session.user.id,topup/1000);await refreshProfile();if(!paid)setError(c('Payment is not confirmed yet. Retry to check the same payment.','لم يتم تأكيد الدفع بعد. أعد المحاولة للتحقق من نفس العملية.'));}catch(e:any){setError(e.message);}finally{setBusy(false);}}}/>
  </View>}
  {!!error&&<ErrorNotice message={error} retry={load}/>}
 </ScrollView></SafeAreaView>;
}
