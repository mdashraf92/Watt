import React,{useEffect,useState} from 'react';
import {Image,View} from 'react-native';
import {market} from '../../lib/marketplace';
import {useLang} from '../../context/LanguageContext';
import {Button,ErrorNotice,Field,Label,styles,useCopy} from './shared';
import {Frame} from './AccountScreens';

export default function ProductEditorScreen({navigation,route}:any){
 const c=useCopy();const {isRTL}=useLang();const original=route.params.product;
 // A shop lists products only, a service provider services only (the API enforces it too).
 const sellerType=route.params.sellerType??'both';
 const kinds:('physical'|'service')[]=sellerType==='shop'?['physical']:sellerType==='service'?['service']:['physical','service'];
 const [form,setForm]=useState<any>(original||{kind:kinds[0],category_id:'',name:'',name_ar:'',description:'',description_ar:'',image_url:'',warranty:'',warranty_ar:'',return_days:7,duration_minutes:60,service_location:'at_centre',price_basis:'fixed',compatibility:[],specifications:{},variants:[{sku:'',name:'Standard',name_ar:'قياسي',price:0,stock:0}]});
 const [categories,setCategories]=useState<any[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [slotDate,setSlotDate]=useState('');const [capacity,setCapacity]=useState('1');const [imageValid,setImageValid]=useState(false);
 const [specKey,setSpecKey]=useState('');const [specValue,setSpecValue]=useState('');
 // Only categories of the chosen kind; keep the pick valid when the kind changes.
 useEffect(()=>{market.get<any[]>('/categories',{kind:form.kind}).then(list=>{setCategories(list);setForm((f:any)=>list.some(x=>x.id===f.category_id)?f:{...f,category_id:list[0]?.id??''});}).catch(e=>setError(e.message));},[form.kind]);
 useEffect(()=>{setImageValid(false);if(form.image_url)Image.getSize(form.image_url,(w,h)=>setImageValid(w>=1200&&h>=1200&&w===h),()=>setImageValid(false));},[form.image_url]);
 const set=(k:string,v:any)=>setForm((f:any)=>({...f,[k]:v}));
 const labels:Record<string,string>={name:c('Product name — English','اسم المنتج بالإنجليزية'),name_ar:c('Product name — Arabic','اسم المنتج بالعربية'),description:c('Description — English','الوصف بالإنجليزية'),description_ar:c('Description — Arabic','الوصف بالعربية'),image_url:c('Primary image HTTPS URL','رابط الصورة الرئيسية HTTPS'),warranty:c('Warranty terms — English','شروط الضمان بالإنجليزية'),warranty_ar:c('Warranty terms — Arabic','شروط الضمان بالعربية')};
 const save=async()=>{setBusy(true);setError('');try{const body={...form,return_days:Number(form.return_days),duration_minutes:form.kind==='service'?Number(form.duration_minutes):null};if(original)await market.put(`/products/${original.id}`,body);else await market.post(`/vendors/${route.params.vendorId}/products`,body);navigation.goBack();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 return <Frame navigation={navigation} title={original?c('Edit listing','تعديل المنتج'):c('New listing','منتج جديد')}>
  <View style={styles.card}><Label>{c('Changes go through review before publication. Use a square image of at least 1200 × 1200, on a plain background, without watermarks or text.','تخضع التغييرات للمراجعة قبل النشر. استخدم صورة مربعة لا تقل عن 1200 × 1200 بخلفية بسيطة ودون علامات مائية أو نصوص.')}</Label>
   {kinds.length>1&&<View style={styles.row}>{kinds.map(k=><Button key={k} disabled={!!original} secondary={form.kind!==k} label={k==='physical'?c('Product','منتج'):c('Service','خدمة')} onPress={()=>set('kind',k)}/>)}</View>}
   <Label>{c('Category','الفئة')}</Label><View style={styles.row}>{categories.map(k=><Button key={k.id} secondary={form.category_id!==k.id} label={isRTL?k.name_ar:k.name} onPress={()=>set('category_id',k.id)}/>)}</View>
   {Object.keys(labels).map(k=><Field key={k} label={labels[k]} value={form[k]} onChangeText={v=>set(k,v)} multiline={k.includes('description')||k.includes('warranty')}/>)}
   {!!form.image_url&&<><Image source={{uri:form.image_url}} style={[styles.image,{maxHeight:220}]} resizeMode="contain"/><Label>{imageValid?c('Image dimensions meet the minimum.','أبعاد الصورة تستوفي الحد الأدنى.'):c('Use a square image, at least 1200 × 1200.','استخدم صورة مربعة لا تقل عن 1200 × 1200.')}</Label></>}
   <Field label={c('Additional image URLs — one per line, up to 6','روابط صور إضافية — رابط في كل سطر، بحد أقصى 6')} value={(form.images||[]).join('\n')} onChangeText={v=>set('images',v.split('\n').filter(Boolean))} multiline/>
   <Field label={c('Return window (days)','مدة الإرجاع بالأيام')} value={String(form.return_days)} onChangeText={v=>set('return_days',Number(v))} keyboardType="number-pad"/>
  </View>
  <View style={styles.card}><Label large>{c('Variants and stock','الخيارات والمخزون')}</Label>{form.variants.map((v:any,n:number)=><View key={n} style={styles.card}>
   {['sku','name','name_ar','price','stock'].map(k=><Field key={k} label={{sku:c('SKU','رمز المنتج'),name:c('Option name — English','اسم الخيار بالإنجليزية'),name_ar:c('Option name — Arabic','اسم الخيار بالعربية'),price:c('Price (OMR)','السعر (ر.ع)'),stock:c('Stock quantity','كمية المخزون')}[k]!} {...(k==='price'?{defaultValue:String(v[k]/1000)}:{value:String(v[k])})} keyboardType={['price','stock'].includes(k)?'decimal-pad':'default'} onChangeText={value=>set('variants',form.variants.map((x:any,i:number)=>i===n?{...x,[k]:k==='price'?Math.round(Number(value)*1000):k==='stock'?Number(value):value}:x))}/>)}
   {original&&v.id&&<Button secondary disabled={busy} label={c('Update stock only','تحديث المخزون فقط')} onPress={async()=>{setBusy(true);setError('');try{const updated=await market.post(`/products/${original.id}/stock`,{variant_id:v.id,stock:v.stock,version:v.version});set('variants',form.variants.map((x:any,i:number)=>i===n?updated:x));setNotice(c('Stock confirmed. Listing freshness renewed.','تم تأكيد المخزون وتجديد صلاحية العرض.'));}catch(e:any){setError(e.message);}finally{setBusy(false);}}}/>}
  </View>)}
   <Button secondary label={c('Add option','إضافة خيار')} onPress={()=>set('variants',[...form.variants,{sku:'',name:'',name_ar:'',price:0,stock:0}])}/>
  </View>
  <View style={styles.card}><Label large>{c('Specifications','المواصفات')}</Label>{Object.entries(form.specifications||{}).map(([k,v])=><View key={k} style={styles.row}><Label>{k}: {String(v)}</Label><Button secondary label={c('Remove','إزالة')} onPress={()=>set('specifications',Object.fromEntries(Object.entries(form.specifications).filter(([key])=>key!==k)))}/></View>)}
   <Field label={c('Specification (e.g. connector type)','المواصفة (مثال: نوع الموصل)')} value={specKey} onChangeText={setSpecKey}/><Field label={c('Value','القيمة')} value={specValue} onChangeText={setSpecValue}/><Button secondary disabled={!specKey.trim()||!specValue.trim()} label={c('Add specification','إضافة مواصفة')} onPress={()=>{set('specifications',{...form.specifications,[specKey]:specValue});setSpecKey('');setSpecValue('');}}/>
  </View>
  <View style={styles.card}><Label large>{c('Verified vehicle compatibility','توافق السيارات المؤكد')}</Label><Label>{c('Only list vehicles whose compatibility you have verified. Otherwise leave this empty.','أضف السيارات التي تأكدت من توافقها فقط. وإلا اترك القائمة فارغة.')}</Label>
   {form.compatibility.map((v:any,n:number)=><View key={n} style={styles.card}>{['make','model','year_from','year_to'].map(k=><Field key={k} label={{make:c('Make','الشركة'),model:c('Model','الطراز'),year_from:c('From year','من سنة'),year_to:c('To year','إلى سنة')}[k]!} value={String(v[k])} onChangeText={value=>set('compatibility',form.compatibility.map((x:any,i:number)=>i===n?{...x,[k]:k.startsWith('year')?Number(value):value}:x))}/>)}<Button secondary label={c('Remove','إزالة')} onPress={()=>set('compatibility',form.compatibility.filter((_:any,i:number)=>i!==n))}/></View>)}
   <Button secondary label={c('Add compatible vehicle','إضافة سيارة متوافقة')} onPress={()=>set('compatibility',[...form.compatibility,{make:'',model:'',year_from:2020,year_to:2026}])}/>
  </View>
  {form.kind==='service'&&<View style={styles.card}><Field label={c('Duration (minutes)','المدة بالدقائق')} value={String(form.duration_minutes)} onChangeText={v=>set('duration_minutes',Number(v))} keyboardType="number-pad"/>
   <View style={styles.row}>{['fixed','quote'].map(k=><Button key={k} secondary={form.price_basis!==k} label={k==='fixed'?c('Fixed price','سعر ثابت'):c('Quote required','يتطلب عرض سعر')} onPress={()=>set('price_basis',k)}/>)}</View>
   <View style={styles.row}>{['at_centre','mobile'].map(k=><Button key={k} secondary={form.service_location!==k} label={k==='at_centre'?c('At centre','في المركز'):c('Mobile service','خدمة متنقلة')} onPress={()=>set('service_location',k)}/>)}</View>
  </View>}
  <Button disabled={busy||!imageValid} label={busy?c('Saving…','جارٍ الحفظ…'):c('Submit for review','إرسال للمراجعة')} onPress={save}/>
  {original?.kind==='service'&&<View style={styles.card}><Label large>{c('Add available appointment','إضافة موعد متاح')}</Label><Field label={c('Local date and time (YYYY-MM-DD HH:mm)','التاريخ والوقت المحلي (YYYY-MM-DD HH:mm)')} value={slotDate} onChangeText={setSlotDate}/><Field label={c('Number of bookings available','عدد الحجوزات المتاحة')} value={capacity} onChangeText={setCapacity} keyboardType="number-pad"/>
   <Button disabled={busy||!slotDate} label={c('Add appointment slot','إضافة الموعد')} onPress={async()=>{setBusy(true);setError('');try{const date=new Date(slotDate.replace(' ','T'));if(!Number.isFinite(date.getTime()))throw new Error(c('Enter a valid date and time','أدخل تاريخاً ووقتاً صحيحين'));await market.post(`/products/${original.id}/slots`,{starts_at:date.toISOString(),capacity:Number(capacity)});setSlotDate('');setNotice(c('Appointment slot added.','تمت إضافة الموعد.'));}catch(e:any){setError(e.message);}finally{setBusy(false);}}}/>
  </View>}{!!notice&&<Label>{notice}</Label>}{!!error&&<ErrorNotice message={error}/>}
 </Frame>;
}
