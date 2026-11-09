-- Bumped when the password changes (by her or by Noa's reset): every older session token stops working.
ALTER TABLE users ADD COLUMN session_version int NOT NULL DEFAULT 0;
