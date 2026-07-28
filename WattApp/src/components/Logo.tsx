/**
 * GO WATT logo primitives.
 *  · GoWattIcon      — the "Go" infinity mark + orange lightning bolt (scalable
 *                      native SVG, recolored to the exact brand hexes). The bolt
 *                      is a separate <Path> so it can be animated (see BrandSplash).
 *  · GoWattWordmark  — full horizontal lockup (Go + watt) from the master PNG.
 *
 * Icon viewBox: 1642.38 × 1126.16. The right "O" (the charging loop that holds
 * the bolt) is centered at ≈ (1174, 563) → fractional (0.715, 0.50).
 */
import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { BRAND } from '../constants/colors';

/** Where the "O" sits inside the icon box — used by the splash zoom. */
export const ICON_O_FOCUS = { x: 0.715, y: 0.5 };
export const ICON_ASPECT = 1642.38 / 1126.16;

const BOLT_D =
  'M1210.18,921.21c-2.19-67.83-9.72-133.96-16.95-205.14l153.88-1.09-193.02-320.65,20.68,210.34-154.08,1.9,189.49,314.65Z';
const MARK_D =
  'M1173.86,189.14c-93.02,0-179.77,27.14-252.71,73.97-8.1,5.16-16.11,10.64-23.89,16.43-32.94,24.05-62.55,52.3-88.1,84.05h-236.2l-201.99,201.99h339.46c-38.42,95.88-132.23,163.58-241.92,163.58-72.14,0-137.39-29.29-184.53-76.59-24.52-24.6-44.21-54.13-57.38-86.99-12.06-30-18.73-62.78-18.73-97.07,0-37.3,7.86-72.86,21.98-104.93,40.4-91.67,132.07-155.72,238.66-155.72,71.83,0,136.91,29.13,184.06,76.11l144.61-144.61,2.38-2.38C714.79,52.38,597.73,0,468.51,0,245.89,0,59.45,155.32,11.83,363.59,4.05,397.32,0,432.4,0,468.51c0,33.25,3.5,65.72,10.08,97.07,19.05,90.32,64.05,171.04,126.91,233.98,16.59,16.59,34.37,31.91,53.26,45.88,77.78,57.54,174.06,91.59,278.27,91.59,49.22,0,96.67-7.59,141.22-21.67,22.59-7.14,78.41-26.69,135.38-68.73,105.87-78.14,149.37-185.01,165.28-232.02,3.74-11.29,7.57-22.63,11.49-34.04,1.62-4.71,3.24-9.4,4.87-14.07.06-.3.13-.6.2-.91l.78-2.59c5.14-13.58,11.65-26.31,19.24-38.3,45.9-76.7,129.79-128.06,225.68-128.06,145.16,0,262.83,117.67,262.83,262.83s-117.67,262.83-262.83,262.83c-105.44,0-196.37-62.1-238.24-151.71-37.09,60.88-87.65,112.64-147.55,151.12,84.29,123.42,226.2,204.46,387,204.46,258.74,0,468.51-209.77,468.51-468.51s-209.77-468.51-468.51-468.51Z';

export function GoWattIcon({
  size = 96,
  markColor = BRAND.green,
  boltColor = BRAND.orange,
}: {
  size?: number;
  markColor?: string;
  boltColor?: string;
}) {
  const w = size;
  const h = size / ICON_ASPECT;
  return (
    <Svg width={w} height={h} viewBox="0 0 1642.38 1126.16">
      <G>
        <Path d={MARK_D} fill={markColor} />
        <Path d={BOLT_D} fill={boltColor} />
      </G>
    </Svg>
  );
}

export function GoWattWordmark({
  width = 200,
  style,
}: {
  width?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={require('../../assets/gowatt-logo.png')}
      resizeMode="contain"
      style={[{ width, height: width / 3.6 }, style]}
    />
  );
}
