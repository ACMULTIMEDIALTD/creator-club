-- Phones registered for push notifications (native app only)
CREATE TABLE push_devices (
  token        text PRIMARY KEY,               -- APNs device token (ios) or FCM token (android)
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('ios','android')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON push_devices (user_id);
