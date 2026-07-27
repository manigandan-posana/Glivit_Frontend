import { configureStore } from '@reduxjs/toolkit';

import { baseApi } from '@/src/services/baseApi';
import authReducer from '@/src/store/authSlice';
import notificationsReducer from '@/src/store/notificationsSlice';
import vehiclePreferencesReducer from '@/src/store/vehiclePreferencesSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    notifications: notificationsReducer,
    vehiclePreferences: vehiclePreferencesReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
