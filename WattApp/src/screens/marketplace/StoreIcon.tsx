import React from 'react';
import Svg,{Path,Rect} from 'react-native-svg';
export default function StoreIcon({color}:{color:string}) {
 return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
  <Rect x={4} y={7} width={16} height={14} rx={3}/><Path d="M8 9V6a4 4 0 0 1 8 0v3" strokeLinecap="round"/>
 </Svg>;
}
