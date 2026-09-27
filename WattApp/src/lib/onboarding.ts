import AsyncStorage from '@react-native-async-storage/async-storage';

// Set once the intro slides have been seen, so later launches (and signing
// out) go straight to browsing instead of replaying the onboarding.
export const ONBOARDED_KEY = 'gowatt:onboarded';

export const markOnboarded = () => AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
