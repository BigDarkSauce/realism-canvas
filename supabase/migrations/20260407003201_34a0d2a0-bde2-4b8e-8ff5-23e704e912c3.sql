
-- Library accounts table for email + password auth
CREATE TABLE public.library_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text UNIQUE NOT NULL,
  reset_token text,
  reset_token_expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.library_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access" ON public.library_accounts FOR ALL USING (false) WITH CHECK (false);

-- Create library account
CREATE OR REPLACE FUNCTION public.rpc_create_library_account(p_email text, p_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM library_accounts WHERE email = p_email) THEN
    RAISE EXCEPTION 'Email already registered';
  END IF;
  IF EXISTS (SELECT 1 FROM library_accounts WHERE password_hash = p_hash) THEN
    RAISE EXCEPTION 'Password already in use';
  END IF;
  INSERT INTO library_accounts (email, password_hash) VALUES (p_email, p_hash);
END;
$$;

-- Verify library login by password hash
CREATE OR REPLACE FUNCTION public.rpc_verify_library_login(p_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM library_accounts WHERE password_hash = p_hash);
END;
$$;

-- Check if password hash is unique (not used by anyone)
CREATE OR REPLACE FUNCTION public.rpc_check_password_unique(p_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN NOT EXISTS (SELECT 1 FROM library_accounts WHERE password_hash = p_hash);
END;
$$;

-- Store reset token
CREATE OR REPLACE FUNCTION public.rpc_set_reset_token(p_email text, p_token text, p_expires timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE library_accounts SET reset_token = p_token, reset_token_expires_at = p_expires WHERE email = p_email;
  RETURN FOUND;
END;
$$;

-- Verify reset token and return email
CREATE OR REPLACE FUNCTION public.rpc_verify_reset_token(p_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM library_accounts
  WHERE reset_token = p_token AND reset_token_expires_at > now();
  RETURN v_email;
END;
$$;

-- Update library password (checks uniqueness)
CREATE OR REPLACE FUNCTION public.rpc_update_library_password(p_email text, p_new_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM library_accounts WHERE password_hash = p_new_hash AND email != p_email) THEN
    RAISE EXCEPTION 'Password already in use by another account';
  END IF;
  UPDATE library_accounts SET password_hash = p_new_hash, reset_token = NULL, reset_token_expires_at = NULL WHERE email = p_email;
  RETURN FOUND;
END;
$$;

-- Update existing functions to use library_accounts
CREATE OR REPLACE FUNCTION public.rpc_has_library_password()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM library_accounts LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_verify_library_password(p_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM library_accounts WHERE password_hash = p_hash);
END;
$$;
