
-- Add account_password_hash column
ALTER TABLE library_accounts ADD COLUMN account_password_hash text;

-- For existing accounts, copy password_hash to account_password_hash so they can still log in
UPDATE library_accounts SET account_password_hash = password_hash WHERE account_password_hash IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE library_accounts ALTER COLUMN account_password_hash SET NOT NULL;

-- RPC to create account with both passwords
CREATE OR REPLACE FUNCTION public.rpc_create_library_account_v2(p_email text, p_account_hash text, p_library_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM library_accounts WHERE email = p_email) THEN
    RAISE EXCEPTION 'Email already registered';
  END IF;
  IF EXISTS (SELECT 1 FROM library_accounts WHERE password_hash = p_library_hash) THEN
    RAISE EXCEPTION 'Library password already in use';
  END IF;
  INSERT INTO library_accounts (email, account_password_hash, password_hash)
  VALUES (p_email, p_account_hash, p_library_hash);
END;
$$;

-- RPC to login with email + account password, returns true if valid
CREATE OR REPLACE FUNCTION public.rpc_login_account(p_email text, p_account_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM library_accounts
    WHERE email = p_email AND account_password_hash = p_account_hash
  );
END;
$$;
