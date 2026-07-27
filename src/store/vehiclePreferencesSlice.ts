import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { CarVariant } from '@/src/components/Vehicle3DMarker';

export type VehiclePreferencesState = {
  modelByDevice: Record<string, CarVariant>;
};

const initialState: VehiclePreferencesState = {
  modelByDevice: {},
};

const vehiclePreferencesSlice = createSlice({
  name: 'vehiclePreferences',
  initialState,
  reducers: {
    setVehicleModelPreference(
      state,
      action: PayloadAction<{ deviceKey: string; variant: CarVariant }>
    ) {
      state.modelByDevice[action.payload.deviceKey] = action.payload.variant;
    },
  },
});

export const { setVehicleModelPreference } = vehiclePreferencesSlice.actions;
export default vehiclePreferencesSlice.reducer;
