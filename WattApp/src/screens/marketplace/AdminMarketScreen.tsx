import React,{useCallback,useState} from 'react';
import {Image,Text,View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {market,omr} from '../../lib/marketplace';
import {useLang} from '../../context/LanguageContext';
import {Button,ErrorNotice,Field,Label,Loading,styles,useCopy} from './shared';
import {Frame,useStatus} from './AccountScreens';

export default function AdminMarketScreen({navigation}:any){
 const c=useCopy();const {isRTL}=useLang();const status=useStatus();
 const [data,setData]=useState<any>(null);const [vendor,setVendor]=useState<any>(null);const [product,setProduct]=useState<any>(null);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [note,setNote]=useState('');const [checked,setChecked]=useState(false);
 const [eligible,setEligible]=useState<any[]>([]);const [reference,setReference]=useState('');const [selected,setSelected]=useState<string[]>([]);
 const [categoryId,setCategoryId]=useState('');const [categoryName,setCategoryName]=useState('');const [categoryAr,setCategoryAr]=useState('');
 const load=async()=>{setError('');try{setData(await market.get('/admin/overview'));}catch(e:any){setError(e.message);}};
 useFocusEffect(useCallback(()=>{void load();},[]));
 const act=async(path:string,body:any,patch=false)=>{setBusy(true);setError('');try{await(patch?market.patch(path,body):market.post(path,body));setProduct(null);setVendor(null);setEligible([]);setSelected([]);setNote('');await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 return <Frame navigation={navigation} title={c('Marketplace administration','إدارة السوق')}>
  {!data&&!error?<Loading/>:data&&<>
   <View style={styles.card}><Label large>{c('Catalog categories','فئات السوق')}</Label><Field label={c('Category ID (lowercase English, e.g. cables)','رمز الفئة (بالإنجليزية مثل cables)')} value={categoryId} onChangeText={setCategoryId}/><Field label={c('English name','الاسم بالإنجليزية')} value={categoryName} onChangeText={setCategoryName}/><Field label={c('Arabic name','الاسم بالعربية')} value={categoryAr} onChangeText={setCategoryAr}/><Button secondary disabled={busy||!categoryId||!categoryName||!categoryAr} label={c('Save category','حفظ الفئة')} onPress={async()=>{setBusy(true);try{await market.put(`/admin/categories/${categoryId}`,{name:categoryName,name_ar:categoryAr});setCategoryId('');setCategoryName('');setCategoryAr('');}catch(e:any){setError(e.message);}finally{setBusy(false);}}}/></View>
   <View style={styles.card}><Label large>{c('Vendors & commission','التجار والعمولة')}</Label>
    {!data.vendors.length&&<Label>{c('Vendor applications will appear here.','ستظهر طلبات التجار هنا.')}</Label>}
    {data.vendors.map((v:any)=><View key={v.id} style={styles.row}><Label>{isRTL?v.name_ar:v.name} · {status(v.status)} · {v.commission_bps===null?c('Commission unset','العمولة غير محددة'):`${v.commission_bps/100}%`}</Label><Button secondary label={c('Manage','إدارة')} onPress={()=>{setVendor({...v,commission_percent:v.commission_bps===null?'':String(v.commission_bps/100),fee_omr:String(v.delivery_fee/1000)});setEligible([]);setSelected([]);}}/></View>)}
   </View>
   {vendor&&<View style={styles.card}><Label large>{vendor.name}</Label><Label>{c('Commercial registration: ','السجل التجاري: ')}{vendor.cr_number}</Label><Label>{vendor.address}</Label><Label>{vendor.contact_phone}</Label><Label>{vendor.bank_details}</Label>
    <Field label={c('Commission (%) — admin editable','العمولة (%) — قابلة للتعديل من الإدارة')} value={vendor.commission_percent} onChangeText={v=>setVendor({...vendor,commission_percent:v})} keyboardType="decimal-pad"/>
    <View style={styles.row}>{['pending','approved','suspended'].map(s=><Button key={s} secondary={vendor.status!==s} label={status(s)} onPress={()=>setVendor({...vendor,status:s})}/>)}</View>
    <Button secondary={!vendor.pickup_enabled} label={c('Pickup enabled','تفعيل الاستلام')} onPress={()=>setVendor({...vendor,pickup_enabled:!vendor.pickup_enabled})}/>
    <Button secondary={!vendor.delivery_enabled} label={c('Delivery enabled','تفعيل التوصيل')} onPress={()=>setVendor({...vendor,delivery_enabled:!vendor.delivery_enabled})}/>
    {vendor.delivery_enabled&&<><Field label={c('Delivery fee (OMR)','رسوم التوصيل (ر.ع)')} value={vendor.fee_omr} onChangeText={v=>setVendor({...vendor,fee_omr:v})} keyboardType="decimal-pad"/><Field label={c('Delivery coverage','نطاق التوصيل')} value={vendor.delivery_area} onChangeText={v=>setVendor({...vendor,delivery_area:v})}/></>}
    <Field label={c('Review notes','ملاحظات المراجعة')} value={vendor.rejection_reason} onChangeText={v=>setVendor({...vendor,rejection_reason:v})} multiline/>
    <Button disabled={busy||vendor.commission_percent===''} label={c('Save vendor settings','حفظ إعدادات التاجر')} onPress={()=>act(`/admin/vendors/${vendor.id}`,{status:vendor.status,commission_bps:Math.round(Number(vendor.commission_percent)*100),pickup_enabled:vendor.pickup_enabled,delivery_enabled:vendor.delivery_enabled,delivery_fee:Math.round(Number(vendor.fee_omr)*1000),delivery_area:vendor.delivery_area,rejection_reason:vendor.rejection_reason},true)}/>
    <Button secondary disabled={busy} label={c('View payable order items','عرض البنود المستحقة للتسوية')} onPress={async()=>{try{setEligible(await market.get(`/admin/vendors/${vendor.id}/settlement-items`));}catch(e:any){setError(e.message);}}}/>
    {eligible.map(i=><Button key={i.id} secondary={!selected.includes(i.id)} label={`${isRTL?i.snapshot.name_ar:i.snapshot.name} · ${omr(i.quantity*i.unit_price-Math.round(i.quantity*i.unit_price*i.commission_bps/10000))}`} onPress={()=>setSelected(old=>old.includes(i.id)?old.filter(x=>x!==i.id):[...old,i.id])}/>)}
    {!!selected.length&&<><Field label={c('Completed bank transfer reference','مرجع التحويل البنكي المكتمل')} value={reference} onChangeText={setReference}/><Label>{c('Record only after the bank transfer has completed and been reconciled. This action does not send money.','سجل التسوية فقط بعد اكتمال التحويل البنكي ومطابقته. هذا الإجراء لا يحول الأموال.')}</Label><Button disabled={busy||!reference.trim()} label={c('Record settlement','تسجيل التسوية')} onPress={()=>act(`/admin/vendors/${vendor.id}/settlements`,{reference,item_ids:selected})}/></>}
   </View>}
   <View style={styles.card}><Label large>{c('Catalog moderation','مراجعة المنتجات')}</Label>{data.products.map((p:any)=><View key={p.id} style={styles.row}><Label>{isRTL?p.name_ar:p.name} · {status(p.status)}</Label><Button secondary label={c('Review','مراجعة')} onPress={()=>{setProduct(p);setChecked(false);setNote(p.moderation_note||'');}}/></View>)}</View>
   {product&&<View style={styles.card}><Image source={{uri:product.image_url}} style={[styles.image,{maxHeight:300}]} resizeMode="contain"/><Label large>{product.name}</Label><Label large>{product.name_ar}</Label><Label>{product.description}</Label><Label>{product.description_ar}</Label><Label>{product.warranty}</Label><Label>{product.warranty_ar}</Label>
    {Object.entries(product.specifications||{}).map(([k,v])=><Label key={k}>{k}: {String(v)}</Label>)}
    <Label>{c('Confirm square image ≥1200px, neutral background, no overlays; both languages are accurate; compatibility and warranty claims have been checked.','تأكد من أن الصورة مربعة بحجم 1200 بكسل أو أكثر وخلفية محايدة ودون نصوص؛ وأن اللغتين صحيحتان؛ وتم التحقق من التوافق والضمان.')}</Label>
    <Button secondary={!checked} label={checked?c('Quality review confirmed','تم تأكيد مراجعة الجودة'):c('Confirm quality review','تأكيد مراجعة الجودة')} onPress={()=>setChecked(!checked)}/>
    <Field label={c('Moderation notes','ملاحظات المراجعة')} value={note} onChangeText={setNote} multiline/>
    <View style={styles.row}>{['published','rejected','paused'].map(s=><Button key={s} secondary={s!=='published'} disabled={busy||(s==='published'&&!checked)||(s==='rejected'&&!note.trim())} label={status(s)} onPress={()=>act(`/admin/products/${product.id}/moderate`,{status:s,note,version:product.version,images_checked:checked})}/>)}</View>
   </View>}
   <View style={styles.card}><Label large>{c('Returns & refunds','الإرجاع والاسترداد')}</Label><Field label={c('Resolution / instructions','القرار / التعليمات')} value={note} onChangeText={setNote} multiline/>
    {data.returns.map((r:any)=><View key={r.id} style={styles.card}><Label>{isRTL?r.snapshot.name_ar:r.snapshot.name} · {omr(r.amount)}</Label><Label>{r.reason}</Label><Label>{status(r.status)}</Label>
     {r.status==='requested'&&<View style={styles.row}>{['approved','rejected'].map(s=><Button key={s} disabled={busy||!note.trim()} label={status(s)} onPress={()=>act(`/admin/returns/${r.id}`,{status:s,resolution:note})}/>)}</View>}
     {r.status==='approved'&&<Button disabled={busy} label={c('Confirm received & refund wallet','تأكيد الاستلام ورد المبلغ للمحفظة')} onPress={()=>act(`/admin/returns/${r.id}`,{status:'refunded',resolution:note||'Received and refunded'})}/>}
    </View>)}
   </View>
   <View style={styles.card}><Label large>{c('Recent orders','الطلبات الأخيرة')}</Label>{data.orders.map((o:any)=><View key={o.id} style={{gap:4}}><Text selectable style={styles.muted}>{o.id}</Text><Label>{omr(o.total)} · {status(o.status)}</Label></View>)}</View>
  </>}{!!error&&<ErrorNotice message={error} retry={load}/>}
 </Frame>;
}
