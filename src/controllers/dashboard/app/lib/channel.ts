/**
 * Shared active-channel constants. Kept in a plain (non-"use client") module so
 * both server routes and client components can import it without pulling a
 * client bundle across the RSC boundary.
 */

/** Cookie holding the dashboard's currently-active broadcaster twitch id. */
export const ACTIVE_CHANNEL_COOKIE = "dash_active_channel";
