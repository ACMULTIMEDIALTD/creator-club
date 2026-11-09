-- 6-digit login code sent with each sign-in link, so creators can sign in inside the home-screen
-- app (which doesn't share Safari's session) by typing the code instead of tapping the link.
ALTER TABLE magic_links ADD COLUMN code_hash text;
ALTER TABLE magic_links ADD COLUMN attempts int NOT NULL DEFAULT 0;
