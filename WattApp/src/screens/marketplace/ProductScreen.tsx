import React,{useCallback,useState} from 'react';
import {Image,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {market,omr,Product,Vehicle,requestKey} from '../../lib/marketplace';
import {useLang} from '../../context/LanguageContext';
import {useAuth} from '../../context/AuthContext';
import {useRequireAuth} from '../../lib/useRequireAuth';
import {Button,ErrorNotice,Field,Label,Loading,styles,useCopy} from './shared';

export default function ProductScreen({navigation,route}:any){
 const c=useCopy();const {isRTL}=useLang();const {session}=useAuth();const requireAuth=useRequireAuth();
 const [product,setProduct]=useState<Product|null>(null);const [vehicles,setVehicles]=useState<Vehicle[]>([]);
 const [variant,setVariant]=useState('');const [vehicle,setVehicle]=useState('');const [slot,setSlot]=useState('');const [notes,setNotes]=useState('');
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const p=await market.get<Product>(`/products/${route.params.id}`);setProduct(p);setVariant(p.variants[0]?.id||'');if(session)setVehicles(await market.get('/vehicles'));}catch(e:any){setError(e.message);}finally{setLoading(false);}},[route.params.id,session]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const action=async()=>{if(!product||!requireAuth(product.kind==='service'?'service':'order'))return;setBusy(true);setError('');try{
  if(product.kind==='physical'){await market.put(`/cart/${variant}`,{quantity:1});navigation.navigate('MarketCart');}
  else{await market.post('/appointments',{product_id:product.id,vehicle_id:vehicle,slot_id:slot,customer_notes:notes,request_key:requestKey()});navigation.navigate('MarketAppointments');}
 }catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const chosen=vehicles.find(v=>v.id===vehicle);
 const compatible=chosen&&product?.compatibility.some(v=>v.make.toLowerCase()===chosen.make.toLowerCase()&&v.model.toLowerCase()===chosen.model.toLowerCase()&&chosen.year>=v.year_from&&chosen.year<=v.year_to);
 return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
  <Button secondary label={c('Back','رجوع')} onPress={()=>navigation.goBack()}/>
  {loading?<Loading/>:product&&<>
   <Image source={{uri:product.image_url}} style={[styles.image,{maxHeight:380}]} resizeMode="contain"/>
   {!!product.images?.length&&<ScrollView horizontal contentContainerStyle={{gap:12}}>{product.images.map((uri,n)=><Image key={n} source={{uri}} resizeMode="contain" style={{width:220,height:220,borderRadius:12}}/>)}</ScrollView>}
   <Text style={styles.muted}>{isRTL?product.vendor_name_ar:product.vendor_name}</Text><Label large>{isRTL?product.name_ar:product.name}</Label>
   <Label>{isRTL?product.description_ar:product.description}</Label>
   <View style={styles.card}><Label>{c('Options','الخيارات')}</Label>{product.variants.map(v=><Button key={v.id} secondary={variant!==v.id} label={`${isRTL?v.name_ar:v.name} · ${omr(v.price)}${product.kind==='physical'?` · ${v.stock} ${c('in stock','متوفر')}`:''}`} onPress={()=>setVariant(v.id)}/>)}</View>
   <View style={styles.card}><Label>{c('Product details','تفاصيل المنتج')}</Label>{Object.entries(product.specifications||{}).map(([k,v])=><Label key={k}>{k}: {v}</Label>)}
    <Label>{c('Warranty: ','الضمان: ')}{isRTL?product.warranty_ar:product.warranty}</Label><Label>{c('Return window: ','مدة الإرجاع: ')}{product.return_days} {c('days','يوماً')}</Label>
    <Label>{c('Pickup location: ','موقع الاستلام: ')}{product.pickup_address}</Label>
    {product.delivery_enabled&&<Label>{c('Delivery area: ','نطاق التوصيل: ')}{product.delivery_area} · {omr(product.delivery_fee)}</Label>}
   </View>
   <View style={styles.card}><Label>{c('Your vehicle','سيارتك')}</Label>{vehicles.map(v=><Button key={v.id} secondary={vehicle!==v.id} label={`${v.make} ${v.model} ${v.year}`} onPress={()=>setVehicle(v.id)}/>)}
    <Button secondary label={c('Add a vehicle','إضافة سيارة')} onPress={()=>requireAuth('account')&&navigation.navigate('MarketVehicles')}/>
    <Label>{compatible?c('Listed as compatible by this vendor.','التاجر يؤكد توافق هذا المنتج مع سيارتك.'):c('Compatibility has not been confirmed for your vehicle. Check with the vendor before purchasing.','لم يتم تأكيد التوافق مع سيارتك. تحقق مع التاجر قبل الشراء.')}</Label>
   </View>
   {product.kind==='service'&&<View style={styles.card}><Label>{c('Choose an appointment','اختر موعداً')} · {product.duration_minutes} {c('minutes','دقيقة')}</Label>
    <Label>{product.service_location==='mobile'?c('Mobile service — add your location in the notes.','خدمة متنقلة — أضف موقعك في الملاحظات.'):c('Service at the partner location.','الخدمة في موقع الشريك.')}</Label>
    {product.slots.map(s=><Button key={s.id} secondary={slot!==s.id} label={new Date(s.starts_at).toLocaleString(isRTL?'ar-OM':'en-GB')} onPress={()=>setSlot(s.id)}/>)}
    {!product.slots.length&&<Label>{c('No appointments available yet.','لا توجد مواعيد متاحة حالياً.')}</Label>}
    <Field label={c('Service notes','ملاحظات الخدمة')} value={notes} onChangeText={setNotes} multiline/>
    <Label>{c('A request does not reserve the slot. Review the quote and pay to confirm.','إرسال الطلب لا يحجز الموعد. راجع عرض السعر وادفع لتأكيد الحجز.')}</Label>
   </View>}
   <Button disabled={busy||(product.kind==='service'?(!vehicle||!slot):!product.variants.find(v=>v.id===variant)?.stock)} label={busy?c('Please wait…','يرجى الانتظار…'):product.kind==='physical'?c('Add to cart','إضافة للسلة'):c('Request appointment','طلب موعد')} onPress={action}/>
   <View style={styles.card}><Label>{c('Verified purchase reviews','تقييمات المشترين')}</Label>{product.reviews.length?product.reviews.map((r,n)=><Label key={n}>{'★'.repeat(r.rating)} · {r.comment}</Label>):<Label>{c('No reviews yet.','لا توجد تقييمات بعد.')}</Label>}</View>
  </>}
  {!!error&&<ErrorNotice message={error} retry={!product?load:undefined}/>}
 </ScrollView></SafeAreaView>;
}
