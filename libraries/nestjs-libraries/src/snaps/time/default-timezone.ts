/**
 * The timezone snaps assumes when nobody tells it otherwise.
 *
 * In the sign JavaScript uses for getTimezoneOffset: minutes to add to local
 * time to reach UTC, so Seoul is -540.
 *
 * Two places need it, which is why it lives on its own rather than inside
 * either of them:
 *
 * - the agent planner, when a caller omits `timezoneOffsetMinutes` while a
 *   model-supplied local publish time has to become an absolute instant;
 * - the report export, which is generated server-side and so has no browser
 *   offset to read.
 *
 * Both used to fall back to the host's own offset. Only the Pixelle service
 * sets `TZ` in docker-compose.yaml, so on the snaps backend that was UTC and a
 * plan reading 14:00 was scheduled nine hours later. Where the backend happens
 * to run is not a product decision, so the default is stated here.
 */
export const SNAPS_DEFAULT_TIMEZONE_OFFSET_MINUTES = -540;
