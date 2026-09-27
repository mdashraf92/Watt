import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

// Why the guest is being asked to sign in — picks the AuthPrompt headline.
export type AuthReason = 'generic' | 'booking' | 'order' | 'service' | 'favorite' | 'account';

// Guests can browse everything; anything that acts on their behalf (booking,
// ordering, saving, viewing their own records) goes through this gate.
//
//   const requireAuth = useRequireAuth();
//   onPress={() => requireAuth('booking') && navigation.navigate('Booking', …)}
//
// Returns true when signed in (carry on), otherwise opens the AuthPrompt sheet
// and returns false. AuthPrompt lives on the guest stack; navigate() bubbles up
// from any tab or nested screen, and signed-in users never reach it.
export function useRequireAuth() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  return useCallback((reason: AuthReason = 'generic') => {
    if (session) return true;
    navigation.navigate('AuthPrompt', { reason });
    return false;
  }, [session, navigation]);
}
