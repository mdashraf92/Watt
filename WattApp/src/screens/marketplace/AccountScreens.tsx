import React,{useCallback,useState} from 'react';
import {Text,View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {market,omr,requestKey,Vehicle} from '../../lib/marketplace';
import {useLang} from '../../context/LanguageContext';
import {useAuth} from '../../context/AuthContext';
import {Button,ErrorNotice,Field,Label,Loading,styles,useCopy} from './shared';
import {Screen} from './SellerKit';

export function useStatus(){const c=useCopy();return(s:string)=>({paid:c('Paid','مدفوع'),accepted:c('Preparing','قيد التجهيز'),ready:c('Ready for pickup','جاهز للاستلام'),shipped:c('Shipped','تم الشحن'),completed:c('Completed','مكتمل'),cancelled:c('Cancelled','ملغي'),refunded:c('Refunded','تم الاسترداد'),partially_refunded:c('Partially refunded','استرداد جزئي'),requested:c('Requested','تم الطلب'),quoted:c('Quote ready','عرض السعر جاهز'),booked:c('Confirmed','مؤكد'),in_progress:c('In progress','قيد التنفيذ'),approved:c('Approved','معتمد'),rejected:c('Rejected','مرفوض'),pending:c('Awaiting review','بانتظار المراجعة'),published:c('Published','منشور'),paused:c('Paused','متوقف'),suspended:c('Suspended','معلق'),draft:c('Draft','مسودة')} as Record<string,string>)[s]||s;}
// Header with a back arrow + title (was a full-width "Back" button).
export function Frame({title,navigation,children}:any){return <Screen title={title} onBack={()=>navigation.goBack()}>{children}</Screen>;}
export function OrdersScreen({navigation}:any){
 const c=useCopy();const status=useStatus();const [orders,setOrders]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const load=async()=>{setLoading(true);setError('');try{setOrders(await market.get('/orders'));}catch(e:any){setError(e.message);}finally{setLoading(false);}};
 useFocusEffect(useCallback(()=>{void load();},[]));
 return <Frame navigation={navigation} title={c('Your orders','طلباتك')}>{loading?<Loading/>:orders.length?orders.map(o=><View key={o.id} style={styles.card}><Text style={styles.muted}>{new Date(o.created_at).toLocaleString()}</Text><Label>{status(o.status)}</Label><Text style={styles.price}>{omr(o.total)}</Text><Button secondary label={c('Track order','تتبع الطلب')} onPress={()=>navigation.navigate('MarketOrder',{id:o.id})}/></View>):<Label>{c('Your purchases will appear here.','ستظهر مشترياتك هنا.')}</Label>}{!!error&&<ErrorNotice message={error} retry={load}/>}</Frame>;
}
export function OrderScreen({navigation,route}:any){
 const c=useCopy();const status=useStatus();const {isRTL}=useLang();const [order,setOrder]=useState<any>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [reason,setReason]=useState('');const [selected,setSelected]=useState('');const [rating,setRating]=useState('5');const [comment,setComment]=useState('');
 const [reviewing,setReviewing]=useState('');const [reviewNotice,setReviewNotice]=useState('');
 const load=async()=>{setError('');try{setOrder(await market.get(`/orders/${route.params.id}`));}catch(e:any){setError(e.message);}};
 useFocusEffect(useCallback(()=>{void load();},[route.params.id]));
 const requestReturn=async()=>{setBusy(true);try{await market.post('/returns',{item_id:selected,reason});setSelected('');setReason('');await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 return <Frame navigation={navigation} title={c('Order details','تفاصيل الطلب')}>{!order&&!error?<Loading/>:order&&<>
  <View style={styles.card}><Label>{status(order.status)}</Label><Text selectable style={styles.muted}>{order.id}</Text><Text style={styles.price}>{omr(order.total)}</Text>{order.refunded_total>0&&<Label>{c('Refunded: ','المبلغ المسترد: ')}{omr(order.refunded_total)}</Label>}<Label>{order.phone}</Label>{!!order.delivery_address&&<Label>{order.delivery_address}</Label>}</View>
  {order.fulfilments.map((f:any)=><View key={f.id} style={styles.card}><Label large>{isRTL?f.vendor_name_ar:f.vendor_name}</Label><Label>{status(f.status)}</Label><Label>{f.method==='pickup'?c('Collect from vendor','الاستلام من التاجر'):f.method==='appointment'?c('Service appointment','موعد خدمة'):c('Vendor delivery','توصيل التاجر')}</Label>{!!f.tracking&&<Label>{f.tracking}</Label>}
   {order.items.filter((i:any)=>i.fulfilment_id===f.id).map((i:any)=><View key={i.id} style={{gap:10,paddingVertical:10,borderTopWidth:1,borderColor:'#E4E9E6'}}>
    <Label>{isRTL?i.snapshot.name_ar:i.snapshot.name} × {i.quantity}</Label><Label>{omr(i.unit_price*i.quantity)}</Label>
    {!!i.snapshot.pickup_address&&<Label>{i.snapshot.pickup_address}</Label>}<Label>{isRTL?i.snapshot.warranty_ar:i.snapshot.warranty}</Label>
    {i.return_status?<><Label>{c('Return: ','الإرجاع: ')}{status(i.return_status)}</Label>{!!i.resolution&&<Label>{i.resolution}</Label>}</>:!i.refunded&&<Button secondary label={c('Request return / cancellation','طلب إرجاع / إلغاء')} onPress={()=>setSelected(i.id)}/>}
    {selected===i.id&&<><Field label={c('Reason','السبب')} value={reason} onChangeText={setReason} multiline/><Button disabled={busy||!reason.trim()} label={c('Send request','إرسال الطلب')} onPress={requestReturn}/><Button secondary label={c('Cancel','إلغاء')} onPress={()=>setSelected('')}/></>}
    {f.status==='completed'&&!i.refunded&&<Button secondary label={c('Review this purchase','تقييم هذا الشراء')} onPress={()=>{setReviewing(i.product_id);setComment('');setRating('5');}}/>}
    {reviewing===i.product_id&&<><View style={styles.row}>{[1,2,3,4,5].map(n=><Button key={n} secondary={Number(rating)!==n} label={`${n} ★`} onPress={()=>setRating(String(n))}/>)}</View><Field label={c('Your review','تقييمك')} value={comment} onChangeText={setComment} multiline/><Button disabled={busy||!comment.trim()} label={c('Submit review','إرسال التقييم')} onPress={async()=>{setBusy(true);try{await market.post('/reviews',{product_id:i.product_id,rating:Number(rating),comment});setReviewing('');setReviewNotice(c('Review saved.','تم حفظ التقييم.'));}catch(e:any){setError(e.message);}finally{setBusy(false);}}}/></>}
   </View>)}
  </View>)}
  <View style={styles.card}><Label>{c('Order updates','تحديثات الطلب')}</Label>{order.events.map((e:any,n:number)=><Text key={n} style={styles.muted}>{new Date(e.created_at).toLocaleString()} · {e.action==='order_paid'?status('paid'):status(e.action)}</Text>)}</View>
  <Button secondary label={c('Refresh order','تحديث الطلب')} onPress={load}/>
 </>}{!!reviewNotice&&<Label>{reviewNotice}</Label>}{!!error&&<ErrorNotice message={error} retry={load}/>}</Frame>;
}
export function VehiclesScreen({navigation}:any){
 const c=useCopy();const [vehicles,setVehicles]=useState<Vehicle[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [make,setMake]=useState('');const [model,setModel]=useState('');const [year,setYear]=useState('');const [connector,setConnector]=useState('Type2');
 const load=async()=>{try{setVehicles(await market.get('/vehicles'));}catch(e:any){setError(e.message);}};useFocusEffect(useCallback(()=>{void load();},[]));
 const save=async()=>{setBusy(true);setError('');try{await market.post('/vehicles',{make,model,year:Number(year),connector});setMake('');setModel('');setYear('');await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 return <Frame navigation={navigation} title={c('My vehicles','سياراتي')}>{vehicles.map(v=><View key={v.id} style={styles.card}><Label large>{v.make} {v.model}</Label><Label>{v.year} · {v.connector}</Label><Button secondary disabled={busy} label={c('Remove vehicle','حذف السيارة')} onPress={async()=>{setBusy(true);try{await market.remove(`/vehicles/${v.id}`);await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}}}/></View>)}
  <View style={styles.card}><Label large>{c('Add a vehicle','إضافة سيارة')}</Label><Field label={c('Make','الشركة المصنعة')} value={make} onChangeText={setMake}/><Field label={c('Model','الطراز')} value={model} onChangeText={setModel}/><Field label={c('Year','سنة الصنع')} value={year} onChangeText={setYear} keyboardType="number-pad"/>
   <View style={styles.row}>{['Type2','CCS','CHAdeMO','GBT','Tesla','Other'].map(k=><Button key={k} secondary={connector!==k} label={k} onPress={()=>setConnector(k)}/>)}</View>
   <Button disabled={busy||!make.trim()||!model.trim()||!year} label={c('Save vehicle','حفظ السيارة')} onPress={save}/>
  </View>{!!error&&<ErrorNotice message={error} retry={load}/>}</Frame>;
}
export function AppointmentsScreen({navigation}:any){
 const c=useCopy();const {isRTL}=useLang();const status=useStatus();const {refreshProfile}=useAuth();const [items,setItems]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const load=async()=>{setLoading(true);try{setItems(await market.get('/appointments'));}catch(e:any){setError(e.message);}finally{setLoading(false);}};useFocusEffect(useCallback(()=>{void load();},[]));
 const act=async(a:any,action:string)=>{setBusy(true);setError('');try{const r=await market.post(`/appointments/${a.id}/${action}`,action==='pay'?{request_key:`appointment-${a.id}`,expected_price:a.quoted_price,quote_version:a.quote_version}:{});await refreshProfile();await load();if(action==='pay')navigation.navigate('MarketOrder',{id:r.id});}catch(e:any){setError(e.code==='insufficient_balance'?c('Add funds in Wallet, then retry payment.','أضف رصيداً في المحفظة ثم أعد الدفع.'):e.message);}finally{setBusy(false);}};
 return <Frame navigation={navigation} title={c('Appointments & service history','المواعيد وسجل الصيانة')}>{loading?<Loading/>:!items.length?<Label>{c('Book your first service from the Shop tab.','احجز أول خدمة من قسم المتجر.')}</Label>:items.map(a=><View key={a.id} style={styles.card}><Label large>{isRTL?a.name_ar:a.name}</Label><Label>{status(a.status)}</Label><Label>{new Date(a.starts_at).toLocaleString(isRTL?'ar-OM':'en-GB')}</Label>{a.quoted_price&&<Text style={styles.price}>{omr(a.quoted_price)}</Text>}{!!a.technician_notes&&<Label>{a.technician_notes}</Label>}
  {a.status==='quoted'&&<Button disabled={busy} label={c('Accept quote & pay from wallet','قبول العرض والدفع من المحفظة')} onPress={()=>act(a,'pay')}/>}
  {['requested','quoted'].includes(a.status)&&<Button secondary disabled={busy} label={c('Cancel request','إلغاء الطلب')} onPress={()=>act(a,'cancel')}/>}
  {a.order_id&&<Button secondary label={c('Order & refund request','الطلب وطلب الاسترداد')} onPress={()=>navigation.navigate('MarketOrder',{id:a.order_id})}/>}
 </View>)}{!!error&&<ErrorNotice message={error} retry={load}/>}</Frame>;
}
