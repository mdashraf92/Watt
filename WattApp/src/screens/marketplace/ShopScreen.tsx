import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,FlatList,Image,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {market,omr,Product,Vehicle} from '../../lib/marketplace';
import {useLang} from '../../context/LanguageContext';
import {useAuth} from '../../context/AuthContext';
import {useRequireAuth,AuthReason} from '../../lib/useRequireAuth';
import {COLORS} from '../../constants/colors';
import {FONTS,FONTS_AR} from '../../constants/typography';
import {useTabBarHeight} from '../../navigation/tabBarLayout';
import {
 CalendarIcon,CarIcon,CheckIcon,ClipboardIcon,PackageIcon,PlugZapIcon,SearchIcon,
 ShoppingCartIcon,SlidersIcon,StorefrontIcon,WrenchIcon,XIcon,
} from '../../components/icons';
import {ErrorNotice,useCopy} from './shared';
import GuestSignInButton from '../../components/GuestSignInButton';

const GAP=12;const PAD=20;const MAX_W=1050;
type Weight='regular'|'medium'|'bold'|'extrabold';

export default function ShopScreen({navigation}:any) {
 const c=useCopy();const {isRTL}=useLang();
 const {session}=useAuth();
 const {width}=useWindowDimensions();const insets=useSafeAreaInsets();const tabBarHeight=useTabBarHeight();
 const requireAuth=useRequireAuth();
 const openAccount=(screen:string,reason:AuthReason='account')=>{if(requireAuth(reason))navigation.navigate(screen);};
 const [kind,setKind]=useState<'physical'|'service'>('physical');const [search,setSearch]=useState('');
 const [sort,setSort]=useState('newest');const [vehicles,setVehicles]=useState<Vehicle[]>([]);const [vehicle,setVehicle]=useState('');
 const [category,setCategory]=useState('');const [categories,setCategories]=useState<any[]>([]);
 const [items,setItems]=useState<Product[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const [more,setMore]=useState(false);const [sheet,setSheet]=useState(false);const generation=useRef(0);
 const load=useCallback(async()=>{const run=++generation.current;setLoading(true);setError('');try{
   const selected=vehicles.find(v=>v.id===vehicle);
   const [products,cats]=await Promise.all([market.get<Product[]>('/catalog',{kind,q:search,category,sort,...(selected?{make:selected.make,model:selected.model,year:selected.year}:{})}),market.get<any[]>('/categories',{kind})]);
   if(run===generation.current){setItems(products);setCategories(cats);setMore(products.length===30);}
  }catch(e:any){if(run===generation.current)setError(e.message);}finally{if(run===generation.current)setLoading(false);}},[kind,search,category,sort,vehicle,vehicles]);
 useEffect(()=>{if(session)market.get<Vehicle[]>('/vehicles').then(setVehicles).catch(()=>setVehicles([]));},[session]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),250);return()=>{clearTimeout(timer);generation.current++;};},[load]);
 useFocusEffect(useCallback(()=>{void load();},[kind,category]));
 const next=async()=>{if(loading||!more)return;const run=generation.current;setLoading(true);try{const selected=vehicles.find(v=>v.id===vehicle);const rows=await market.get<Product[]>('/catalog',{kind,q:search,category,sort,...(selected?{make:selected.make,model:selected.model,year:selected.year}:{}),offset:items.length});if(run===generation.current){setItems(old=>[...old,...rows.filter(r=>!old.some(o=>o.id===r.id))]);setMore(rows.length===30);}}catch(e:any){setError(e.message);}finally{setLoading(false);}};

 // RTL is handled per-view in this app (no I18nManager), so rows flip explicitly.
 const row=isRTL?'row-reverse':'row';const align=isRTL?'right':'left';
 const f=(w:Weight)=>({fontFamily:isRTL?FONTS_AR[w]:FONTS[w],textAlign:align} as const);
 const cardW=(Math.min(width,MAX_W)-PAD*2-GAP)/2;

 const sorts:[string,string][]=[['newest',c('Newest','الأحدث')],['price_asc',c('Price: low to high','السعر: من الأقل للأعلى')],['price_desc',c('Price: high to low','السعر: من الأعلى للأقل')]];
 const activeFilters=(sort!=='newest'?1:0)+(vehicle?1:0);
 const allCategories=[{id:'',name:'All',name_ar:'الكل'},...categories];
 const actions=[
  {key:'MarketOrders',label:c('Orders','الطلبات'),Icon:ClipboardIcon},
  {key:'MarketAppointments',label:c('Bookings','المواعيد'),Icon:CalendarIcon},
  {key:'MarketVehicles',label:c('My vehicles','سياراتي'),Icon:CarIcon},
  {key:'MarketPortal',label:c('Sell','بع معنا'),Icon:StorefrontIcon},
 ];
 const kinds:[typeof kind,string,any][]=[['physical',c('Products','المنتجات'),PackageIcon],['service',c('Services & garages','الخدمات والورش'),WrenchIcon]];

 const header=<View style={s.headerStack}>
  <View style={[s.hero,{flexDirection:row}]}>
   <View style={{flex:1,gap:6}}>
    <Text style={[s.heroTitle,f('extrabold')]}>{c('Made for your EV','كل ما تحتاجه سيارتك الكهربائية')}</Text>
    <Text style={[s.heroText,f('regular')]}>{c('Accessories and care from approved partners.','إكسسوارات وخدمات عناية من شركاء معتمدين.')}</Text>
   </View>
   <View style={s.heroBadge}><PlugZapIcon size={26} color={COLORS.gold} strokeWidth={2}/></View>
  </View>

  <View style={[s.actions,{flexDirection:row}]}>
   {actions.map(({key,label,Icon})=><Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={()=>openAccount(key)} style={({pressed})=>[s.action,pressed&&s.pressed]}>
    <View style={s.actionIcon}><Icon size={20} color={COLORS.primaryDark} strokeWidth={1.8}/></View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[s.actionText,f('medium'),{textAlign:'center'}]}>{label}</Text>
   </Pressable>)}
  </View>

  <View style={[s.segment,{flexDirection:row}]} accessibilityRole="tablist">
   {kinds.map(([key,label,Icon])=>{const on=kind===key;return <Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:on}} onPress={()=>{setKind(key);setCategory('');}} style={[s.segmentItem,{flexDirection:row},on&&s.segmentOn]}>
    <Icon size={17} color={on?COLORS.primaryDark:COLORS.textSecondary} strokeWidth={2}/>
    <Text numberOfLines={1} style={[s.segmentText,f(on?'bold':'medium'),{color:on?COLORS.primaryDark:COLORS.textSecondary}]}>{label}</Text>
   </Pressable>;})}
  </View>

  <View style={{flexDirection:row,gap:10}}>
   <View style={[s.search,{flexDirection:row}]}>
    <SearchIcon size={19} color={COLORS.textTertiary} strokeWidth={2}/>
    <TextInput value={search} onChangeText={setSearch} placeholder={c('Search cables, chargers, services…','ابحث عن كابل، شاحن، خدمة…')} placeholderTextColor={COLORS.textTertiary}
     accessibilityLabel={c('Search','بحث')} returnKeyType="search" style={[s.searchInput,f('regular')]}/>
    {!!search&&<Pressable accessibilityRole="button" accessibilityLabel={c('Clear search','مسح البحث')} hitSlop={10} onPress={()=>setSearch('')} style={s.clear}><XIcon size={12} color="#fff" strokeWidth={3}/></Pressable>}
   </View>
   <Pressable accessibilityRole="button" accessibilityLabel={c('Sort and filter','الترتيب والتصفية')} onPress={()=>setSheet(true)} style={({pressed})=>[s.filterBtn,activeFilters>0&&s.filterBtnOn,pressed&&s.pressed]}>
    <SlidersIcon size={20} color={activeFilters>0?'#fff':COLORS.primaryDark} strokeWidth={2}/>
    {activeFilters>0&&<View style={s.filterCount}><Text style={s.filterCountText}>{activeFilters}</Text></View>}
   </Pressable>
  </View>

  <FlatList horizontal inverted={isRTL} data={allCategories} keyExtractor={cat=>cat.id||'all'} showsHorizontalScrollIndicator={false}
   style={{marginHorizontal:-PAD}} contentContainerStyle={{paddingHorizontal:PAD,gap:8}}
   renderItem={({item:cat})=>{const on=category===cat.id;return <Pressable accessibilityRole="button" accessibilityState={{selected:on}} onPress={()=>setCategory(cat.id)} style={[s.chip,on&&s.chipOn]}>
    <Text numberOfLines={1} style={[s.chipText,f(on?'bold':'medium'),{color:on?'#fff':COLORS.text}]}>{isRTL?cat.name_ar:cat.name}</Text>
   </Pressable>;}}/>

  {items.length>0&&<Text style={[s.count,f('medium')]}>{isRTL?`${items.length}${more?'+':''} نتيجة`:`${items.length}${more?'+':''} results`}</Text>}
 </View>;

 const empty=loading
  ?<View style={[s.grid,{flexDirection:row}]}>{[0,1,2,3].map(n=><View key={n} style={{width:cardW,gap:8}}><View style={[s.imageBox,s.skeleton]}/><View style={[s.skeletonLine,{width:'55%'}]}/><View style={[s.skeletonLine,{width:'85%'}]}/></View>)}</View>
  :error?<ErrorNotice message={error} retry={load}/>
  :<View style={s.empty}>
   <View style={s.emptyIcon}>{search?<SearchIcon size={28} color={COLORS.primary} strokeWidth={1.8}/>:<StorefrontIcon size={28} color={COLORS.primary} strokeWidth={1.8}/>}</View>
   <Text style={[s.emptyTitle,f('bold'),{textAlign:'center'}]}>{search?c('No matches found','لا توجد نتائج'):c('The marketplace is opening soon','السوق قيد التجهيز')}</Text>
   <Text style={[s.emptyText,f('regular'),{textAlign:'center'}]}>{search?c('Try a different word or clear the filters.','جرّب كلمة أخرى أو امسح عوامل التصفية.'):c('Approved partner products and services will appear here.','ستظهر هنا منتجات وخدمات الشركاء فور اعتمادها.')}</Text>
   {(!!search||activeFilters>0||!!category)&&<Pressable accessibilityRole="button" onPress={()=>{setSearch('');setSort('newest');setVehicle('');setCategory('');}} style={({pressed})=>[s.emptyBtn,pressed&&s.pressed]}>
    <Text style={[s.emptyBtnText,f('bold'),{textAlign:'center'}]}>{c('Clear all','مسح الكل')}</Text>
   </Pressable>}
  </View>;

 return <SafeAreaView edges={['top']} style={s.screen}>
  <View style={[s.topBar,{flexDirection:row}]}>
   {/* minWidth keeps the title readable however many header buttons there are. */}
   <View style={{flex:1,minWidth:90}}>
    <Text numberOfLines={1} style={[s.title,f('extrabold')]}>{c('Marketplace','السوق')}</Text>
    <Text numberOfLines={1} style={[s.subtitle,f('regular')]}>{c('Products & services for your EV','منتجات وخدمات لسيارتك الكهربائية')}</Text>
   </View>
   {!session&&<GuestSignInButton height={46}/>}
   <Pressable accessibilityRole="button" accessibilityLabel={c('Cart','السلة')} onPress={()=>openAccount('MarketCart','order')} style={({pressed})=>[s.iconBtn,pressed&&s.pressed]}>
    <ShoppingCartIcon size={22} color={COLORS.primaryDark} strokeWidth={1.9}/>
   </Pressable>
  </View>

  <FlatList data={error?[]:items} keyExtractor={i=>i.id} numColumns={2} key="grid"
   columnWrapperStyle={{flexDirection:row,gap:GAP}}
   contentContainerStyle={[s.content,{paddingBottom:tabBarHeight+24}]}
   keyboardShouldPersistTaps="handled" onRefresh={load} refreshing={loading&&items.length>0}
   onEndReached={next} onEndReachedThreshold={0.4}
   ListHeaderComponent={header} ListEmptyComponent={empty}
   ListFooterComponent={items.length>0&&loading&&more?<ActivityIndicator color={COLORS.primary} style={{paddingVertical:16}}/>:null}
   renderItem={({item})=>{const out=item.kind!=='service'&&item.stock<=0;return <Pressable accessibilityRole="button" accessibilityLabel={isRTL?item.name_ar:item.name} onPress={()=>navigation.navigate('MarketProduct',{id:item.id})} style={({pressed})=>[{width:cardW,gap:6},pressed&&s.pressed]}>
    <View style={s.imageBox}>
     {item.image_url?<Image source={{uri:item.image_url}} resizeMode="cover" style={StyleSheet.absoluteFill}/>:<View style={s.imageFallback}>{item.kind==='service'?<WrenchIcon size={30} color={COLORS.textTertiary} strokeWidth={1.6}/>:<PackageIcon size={30} color={COLORS.textTertiary} strokeWidth={1.6}/>}</View>}
     {(out||item.kind==='service')&&<View style={[s.badge,isRTL?{right:8}:{left:8},out&&s.badgeOut]}><Text style={[s.badgeText,f('bold'),out&&{color:COLORS.error}]}>{out?c('Out of stock','نفدت الكمية'):c('Service','خدمة')}</Text></View>}
    </View>
    <Text numberOfLines={1} style={[s.vendor,f('medium')]}>{isRTL?item.vendor_name_ar:item.vendor_name}</Text>
    <Text numberOfLines={2} style={[s.name,f('bold')]}>{isRTL?item.name_ar:item.name}</Text>
    <Text style={[s.price,f('extrabold'),out&&{color:COLORS.textTertiary}]}>{item.price_basis==='quote'?c('Request a quote','اطلب عرض سعر'):omr(item.price)}</Text>
   </Pressable>;}}/>

  <Modal visible={sheet} transparent animationType="slide" onRequestClose={()=>setSheet(false)} statusBarTranslucent>
   <Pressable style={s.backdrop} accessibilityLabel={c('Close','إغلاق')} onPress={()=>setSheet(false)}/>
   <View style={[s.sheet,{paddingBottom:Math.max(insets.bottom,16)+8}]}>
    <View style={s.handle}/>
    <View style={[{flexDirection:row,alignItems:'center'}]}>
     <Text style={[s.sheetTitle,f('extrabold'),{flex:1}]}>{c('Sort & filter','الترتيب والتصفية')}</Text>
     {activeFilters>0&&<Pressable accessibilityRole="button" hitSlop={8} onPress={()=>{setSort('newest');setVehicle('');}}><Text style={[s.reset,f('bold')]}>{c('Reset','إعادة ضبط')}</Text></Pressable>}
    </View>
    <ScrollView style={{maxHeight:420}} contentContainerStyle={{gap:6}}>
     <Text style={[s.sheetSection,f('bold')]}>{c('Sort by','ترتيب حسب')}</Text>
     {sorts.map(([key,label])=><Option key={key} label={label} on={sort===key} onPress={()=>setSort(key)} row={row} font={f}/>)}
     {!!vehicles.length&&<>
      <Text style={[s.sheetSection,f('bold'),{marginTop:12}]}>{c('Fits my vehicle','متوافق مع سيارتي')}</Text>
      <Option label={c('All vehicles','جميع السيارات')} on={!vehicle} onPress={()=>setVehicle('')} row={row} font={f}/>
      {vehicles.map(v=><Option key={v.id} label={`${v.make} ${v.model} ${v.year}`} on={vehicle===v.id} onPress={()=>setVehicle(v.id)} row={row} font={f}/>)}
     </>}
    </ScrollView>
    <Pressable accessibilityRole="button" onPress={()=>setSheet(false)} style={({pressed})=>[s.primaryBtn,pressed&&s.pressed]}>
     <Text style={[s.primaryBtnText,f('bold'),{textAlign:'center'}]}>{c('Show results','عرض النتائج')}</Text>
    </Pressable>
   </View>
  </Modal>
 </SafeAreaView>;
}

function Option({label,on,onPress,row,font}:{label:string;on:boolean;onPress:()=>void;row:'row'|'row-reverse';font:(w:Weight)=>object}) {
 return <Pressable accessibilityRole="radio" accessibilityState={{checked:on}} onPress={onPress} style={({pressed})=>[s.option,{flexDirection:row},on&&s.optionOn,pressed&&s.pressed]}>
  <Text style={[s.optionText,font(on?'bold':'medium'),{flex:1,color:on?COLORS.primaryDark:COLORS.text}]}>{label}</Text>
  <View style={[s.radio,on&&s.radioOn]}>{on&&<CheckIcon size={12} color="#fff" strokeWidth={3.5}/>}</View>
 </Pressable>;
}

const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:COLORS.background},
 pressed:{opacity:0.7},
 topBar:{alignItems:'center',gap:12,paddingHorizontal:PAD,paddingTop:10,paddingBottom:12,width:'100%',maxWidth:MAX_W,alignSelf:'center'},
 title:{fontSize:28,lineHeight:36,color:COLORS.text},
 subtitle:{fontSize:13,lineHeight:18,color:COLORS.textSecondary},
 iconBtn:{width:46,height:46,borderRadius:23,backgroundColor:COLORS.card,borderWidth:1,borderColor:COLORS.border,alignItems:'center',justifyContent:'center'},
 content:{paddingHorizontal:PAD,gap:18,width:'100%',maxWidth:MAX_W,alignSelf:'center'},
 headerStack:{gap:16,paddingBottom:2},

 hero:{alignItems:'center',gap:14,padding:18,borderRadius:20,backgroundColor:COLORS.primaryDark,overflow:'hidden'},
 heroTitle:{fontSize:19,lineHeight:26,color:'#fff'},
 heroText:{fontSize:13,lineHeight:19,color:'#CFE6D8'},
 heroBadge:{width:52,height:52,borderRadius:16,backgroundColor:'rgba(255,255,255,0.10)',alignItems:'center',justifyContent:'center'},

 actions:{gap:10},
 action:{flex:1,alignItems:'center',gap:8,paddingVertical:12,paddingHorizontal:4,borderRadius:16,backgroundColor:COLORS.card,borderWidth:1,borderColor:COLORS.border},
 actionIcon:{width:40,height:40,borderRadius:12,backgroundColor:COLORS.primaryBg,alignItems:'center',justifyContent:'center'},
 actionText:{fontSize:12,color:COLORS.text},

 segment:{padding:4,borderRadius:14,backgroundColor:COLORS.backgroundAlt,gap:4},
 segmentItem:{flex:1,height:42,borderRadius:11,alignItems:'center',justifyContent:'center',gap:7},
 segmentOn:{backgroundColor:COLORS.card,shadowColor:COLORS.primaryDark,shadowOpacity:0.08,shadowRadius:6,shadowOffset:{width:0,height:2},elevation:2},
 segmentText:{fontSize:14},

 search:{flex:1,height:48,alignItems:'center',gap:10,paddingHorizontal:14,borderRadius:14,backgroundColor:COLORS.card,borderWidth:1,borderColor:COLORS.border},
 searchInput:{flex:1,height:'100%',fontSize:15,color:COLORS.text,paddingVertical:0},
 clear:{width:20,height:20,borderRadius:10,backgroundColor:COLORS.textTertiary,alignItems:'center',justifyContent:'center'},
 filterBtn:{width:48,height:48,borderRadius:14,backgroundColor:COLORS.card,borderWidth:1,borderColor:COLORS.border,alignItems:'center',justifyContent:'center'},
 filterBtnOn:{backgroundColor:COLORS.primaryDark,borderColor:COLORS.primaryDark},
 filterCount:{position:'absolute',top:-5,right:-5,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,backgroundColor:COLORS.gold,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:COLORS.background},
 filterCountText:{fontSize:10,fontWeight:'800',color:COLORS.textOnGold},

 chip:{height:38,paddingHorizontal:16,borderRadius:19,backgroundColor:COLORS.card,borderWidth:1,borderColor:COLORS.border,alignItems:'center',justifyContent:'center'},
 chipOn:{backgroundColor:COLORS.primaryDark,borderColor:COLORS.primaryDark},
 chipText:{fontSize:13},
 count:{fontSize:13,color:COLORS.textSecondary,marginTop:-4},

 grid:{flexWrap:'wrap',gap:GAP},
 imageBox:{width:'100%',aspectRatio:1,borderRadius:16,backgroundColor:COLORS.backgroundAlt,overflow:'hidden',borderWidth:1,borderColor:COLORS.border},
 imageFallback:{flex:1,alignItems:'center',justifyContent:'center'},
 badge:{position:'absolute',top:8,paddingHorizontal:8,paddingVertical:3,borderRadius:8,backgroundColor:'rgba(255,255,255,0.94)'},
 badgeOut:{backgroundColor:COLORS.errorBg},
 badgeText:{fontSize:11,color:COLORS.primaryDark},
 vendor:{fontSize:12,color:COLORS.textSecondary,marginTop:2},
 name:{fontSize:14,lineHeight:19,color:COLORS.text},
 price:{fontSize:15,color:COLORS.primaryDark},
 skeleton:{borderWidth:0,backgroundColor:COLORS.backgroundAlt},
 skeletonLine:{height:12,borderRadius:6,backgroundColor:COLORS.backgroundAlt},

 empty:{alignItems:'center',gap:8,paddingVertical:36,paddingHorizontal:24,borderRadius:20,backgroundColor:COLORS.card,borderWidth:1,borderColor:COLORS.border},
 emptyIcon:{width:64,height:64,borderRadius:32,backgroundColor:COLORS.primaryBg,alignItems:'center',justifyContent:'center',marginBottom:6},
 emptyTitle:{fontSize:17,color:COLORS.text},
 emptyText:{fontSize:14,lineHeight:21,color:COLORS.textSecondary,maxWidth:300},
 emptyBtn:{marginTop:8,paddingHorizontal:20,height:42,borderRadius:12,backgroundColor:COLORS.primaryBg,justifyContent:'center'},
 emptyBtnText:{fontSize:14,color:COLORS.primaryDark},

 backdrop:{flex:1,backgroundColor:COLORS.overlay},
 sheet:{backgroundColor:COLORS.card,borderTopLeftRadius:24,borderTopRightRadius:24,paddingHorizontal:PAD,paddingTop:10,gap:14},
 handle:{alignSelf:'center',width:40,height:4,borderRadius:2,backgroundColor:COLORS.borderStrong,marginBottom:4},
 sheetTitle:{fontSize:19,color:COLORS.text},
 reset:{fontSize:14,color:COLORS.primary},
 sheetSection:{fontSize:13,color:COLORS.textSecondary,marginBottom:2},
 option:{alignItems:'center',gap:12,minHeight:50,paddingHorizontal:14,borderRadius:14,borderWidth:1,borderColor:COLORS.border},
 optionOn:{borderColor:COLORS.primary,backgroundColor:COLORS.primaryBg},
 optionText:{fontSize:15},
 radio:{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:COLORS.borderStrong,alignItems:'center',justifyContent:'center'},
 radioOn:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},
 primaryBtn:{height:52,borderRadius:14,backgroundColor:COLORS.primaryDark,justifyContent:'center'},
 primaryBtnText:{fontSize:16,color:'#fff'},
});
