import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { CarVariant } from '@/src/components/Vehicle3DMarker';
import { clearActiveTenant, switchFailed, switchSucceeded } from '@/src/store/tenantSlice';

export type VehiclePreferencesState = {
  modelByDevice: Record<string, CarVariant>;
  /**
   * The vehicle the user is currently focused on. The AI assistant sends this
   * so questions like "where is it?" resolve to something concrete; the backend
   * still re-validates it against the caller's tenant.
   */
  selectedVehicleId: number | null;
  selectedVehicleName: string | null;
};

const initialState: VehiclePreferencesState = {
  modelByDevice: {},
  selectedVehicleId: null,
  selectedVehicleName: null,
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
    setSelectedVehicle(
      state,
      action: PayloadAction<{ vehicleId: number | null; vehicleName?: string | null }>
    ) {
      state.selectedVehicleId = action.payload.vehicleId;
      state.selectedVehicleName = action.payload.vehicleName ?? null;
    },
  },
  extraReducers: (builder) => {
    // Keyed by device id, and device ids belong to a tenant: keeping these across a
    // switch would apply one tenant's model choices to another tenant's vehicles.
    builder
      .addCase(switchSucceeded, () => initialState)
      .addCase(switchFailed, () => initialState)
      .addCase(clearActiveTenant, () => initialState);
  },
});

export const { setVehicleModelPreference, setSelectedVehicle } = vehiclePreferencesSlice.actions;
export default vehiclePreferencesSlice.reducer;
