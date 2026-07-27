import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Local read-state for the in-app notification panel.
 *
 * Vehicle events already carry an authoritative server `acknowledged` flag (and
 * are marked read through the existing acknowledge API). Maintenance predictions
 * have no such flag, so their read/unread status is tracked here by a stable
 * notification key (e.g. `maint:<id>` or `event:<id>`). Keeping this separate
 * from server state means no backend contract changes.
 */
export type NotificationsState = {
  readKeys: Record<string, true>;
};

const initialState: NotificationsState = {
  readKeys: {},
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    markNotificationRead(state, action: PayloadAction<string>) {
      state.readKeys[action.payload] = true;
    },
    markNotificationsRead(state, action: PayloadAction<string[]>) {
      for (const key of action.payload) state.readKeys[key] = true;
    },
  },
});

export const { markNotificationRead, markNotificationsRead } = notificationsSlice.actions;
export default notificationsSlice.reducer;
