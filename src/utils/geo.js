// Shared geolocation helpers for the attendance "Get My Location" flow.
//
// Browsers only expose navigator.geolocation in a SECURE context: HTTPS, or
// http://localhost / http://127.0.0.1. When the app is opened over plain HTTP
// from a LAN IP (e.g. a phone loading http://192.168.x.x:5174), the API is
// completely disabled and navigator.geolocation is undefined — there is no
// way to "pull" the device's position in that case.

export function isSecureContext() {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext === true) return true;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

const PROMPTS = {
  1: 'Location permission was denied. Allow location for this site (padlock icon in the address bar) and try again, or tap the map at your spot.',
  2: 'Could not determine your position (GPS / network location is off or unreachable). Tap the map at your current spot instead.',
  3: 'Location request timed out. Try again, or tap the map at your current spot.',
};

export function getGeolocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error(
        'GPS is unavailable in this browser/context. This page must be opened over HTTPS (or localhost) for geolocation to work. You can still tap the map at your location.'
      ));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(new Error(PROMPTS[err && err.code] || (err && err.message) || 'Could not determine your location.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}