import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, TextInputProps } from 'react-native';
import { useLang } from '../../context/LanguageContext';
import { COLORS } from '../../constants/colors';
import { FONTS, FONTS_AR } from '../../constants/typography';

export function useCopy() {
 const {isRTL}=useLang();
 return (en:string,ar:string)=>isRTL?ar:en;
}
export function Label({children,large=false}: {children:React.ReactNode;large?:boolean}) {
 const {isRTL}=useLang();
 return <Text style={[large?styles.title:styles.text,{textAlign:isRTL?'right':'left',fontFamily:isRTL?(large?FONTS_AR.bold:FONTS_AR.regular):(large?FONTS.bold:FONTS.regular)}]}>{children}</Text>;
}
export function Button({label,onPress,disabled=false,secondary=false}:{label:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
  style={({pressed})=>[styles.button,secondary&&styles.secondary,{opacity:disabled?0.45:pressed?0.75:1}]}>
  <Text style={[styles.buttonText,secondary&&{color:COLORS.primaryDark}]}>{label}</Text></Pressable>;
}
export function Field({label,...props}:TextInputProps&{label:string}) {
 const {isRTL}=useLang();
 return <View style={{gap:6}}><Label>{label}</Label><TextInput {...props} accessibilityLabel={label}
  placeholderTextColor={COLORS.textTertiary} style={[styles.input,{textAlign:isRTL?'right':'left'},props.multiline&&{minHeight:90},props.style]} /></View>;
}
export function ErrorNotice({message,retry}:{message:string;retry?:()=>void}) {
 const c=useCopy();return <View style={styles.error}><Text accessibilityRole="alert" style={styles.text}>{message}</Text>{retry&&<Button secondary label={c('Try again','إعادة المحاولة')} onPress={retry}/>}</View>;
}
export function Loading() {return <View style={{padding:20,gap:15}}>{[1,2,3].map(n=><View key={n} style={[styles.card,{height:100,backgroundColor:COLORS.backgroundAlt}]}/>)}<ActivityIndicator color={COLORS.primary}/></View>;}
export const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:COLORS.background},content:{padding:20,paddingBottom:125,gap:16,width:'100%',maxWidth:1050,alignSelf:'center'},
 header:{paddingHorizontal:20,paddingTop:12,paddingBottom:8,gap:8},title:{fontSize:26,fontWeight:'800',color:COLORS.text},
 text:{fontSize:15,lineHeight:23,color:COLORS.text},muted:{fontSize:13,lineHeight:20,color:COLORS.textSecondary},
 card:{backgroundColor:COLORS.card,borderRadius:20,padding:18,gap:12,borderWidth:1,borderColor:COLORS.border},
 row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},
 button:{minHeight:48,paddingVertical:13,paddingHorizontal:18,backgroundColor:COLORS.primaryDark,borderRadius:14,justifyContent:'center',alignItems:'center'},
 secondary:{backgroundColor:COLORS.primaryBg,borderWidth:1,borderColor:COLORS.primaryTint},buttonText:{fontSize:15,fontWeight:'700',color:'#fff',textAlign:'center'},
 input:{minHeight:48,borderWidth:1,borderColor:COLORS.border,borderRadius:12,padding:12,backgroundColor:'#fff',color:COLORS.text,fontSize:16},
 error:{padding:16,borderRadius:14,backgroundColor:'#FFF0EB',gap:10},image:{width:'100%',aspectRatio:1,borderRadius:12,backgroundColor:'#fff'},
 price:{fontSize:22,fontWeight:'800',color:COLORS.primaryDark},chip:{paddingHorizontal:15,paddingVertical:12,borderRadius:24,backgroundColor:COLORS.card,borderWidth:1,borderColor:COLORS.border},
 hero:{padding:24,borderRadius:24,backgroundColor:COLORS.primaryDark,gap:10},heroTitle:{fontSize:28,color:'#fff',fontWeight:'800'},
});
