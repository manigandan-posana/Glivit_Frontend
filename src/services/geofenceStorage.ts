import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const GEOFENCE_STATES_KEY = 'GEOFENCE_STATES_PERSIST_V2';
const GEOFENCE_NOTIFIED_KEY = 'GEOFENCE_NOTIFIED_PERSIST_V2';
 
let memoryStates: Record<string, 'INSIDE' | 'OUTSIDE'> = {};
let memoryNotified: Record<string, boolean> = {};

export async function loadGeofenceStatesFromStorage(): Promise<Record<string, 'INSIDE' | 'OUTSIDE'>> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem(GEOFENCE_STATES_KEY);
      if (data) {
        memoryStates = JSON.parse(data);
        return memoryStates;
      }
    } else {
      const data = await SecureStore.getItemAsync(GEOFENCE_STATES_KEY);
      if (data) {
        memoryStates = JSON.parse(data);
        return memoryStates;
      }
    }
  } catch {
    // Return in-memory fallback
  }
  return memoryStates;
}

export async function saveGeofenceStatesToStorage(states: Record<string, 'INSIDE' | 'OUTSIDE'>): Promise<void> {
  memoryStates = { ...states };
  try {
    const json = JSON.stringify(states);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(GEOFENCE_STATES_KEY, json);
    } else {
      await SecureStore.setItemAsync(GEOFENCE_STATES_KEY, json);
    }
  } catch {
    // Ignore storage write errors
  }
}

export async function loadGeofenceNotifiedKeys(): Promise<Record<string, boolean>> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem(GEOFENCE_NOTIFIED_KEY);
      if (data) {
        memoryNotified = JSON.parse(data);
        return memoryNotified;
      }
    } else {
      const data = await SecureStore.getItemAsync(GEOFENCE_NOTIFIED_KEY);
      if (data) {
        memoryNotified = JSON.parse(data);
        return memoryNotified;
      }
    }
  } catch {
    // Return in-memory fallback
  }
  return memoryNotified;
}

export async function saveGeofenceNotifiedKeys(keys: Record<string, boolean>): Promise<void> {
  memoryNotified = { ...keys };
  try {
    const json = JSON.stringify(keys);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(GEOFENCE_NOTIFIED_KEY, json);
    } else {
      await SecureStore.setItemAsync(GEOFENCE_NOTIFIED_KEY, json);
    }
  } catch {
    // Ignore storage write errors
  }
}
