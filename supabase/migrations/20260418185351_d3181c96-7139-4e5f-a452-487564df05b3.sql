
CREATE OR REPLACE FUNCTION public.rpc_update_account_password(p_email text, p_new_account_hash text, p_reset_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_found boolean;
BEGIN
  IF p_reset_token IS NULL OR length(p_reset_token) < 16 THEN
    RAISE EXCEPTION 'Invalid reset token';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM library_accounts
    WHERE email = p_email
      AND reset_token = p_reset_token
      AND reset_token_expires_at > now()
  ) INTO v_found;
  IF NOT v_found THEN
    RAISE EXCEPTION 'Invalid or expired reset token';
  END IF;
  UPDATE library_accounts
     SET account_password_hash = p_new_account_hash,
         reset_token = NULL,
         reset_token_expires_at = NULL
   WHERE email = p_email;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_library_password(p_email text, p_new_hash text, p_reset_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_found boolean;
BEGIN
  IF p_reset_token IS NULL OR length(p_reset_token) < 16 THEN
    RAISE EXCEPTION 'Invalid reset token';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM library_accounts
    WHERE email = p_email
      AND reset_token = p_reset_token
      AND reset_token_expires_at > now()
  ) INTO v_found;
  IF NOT v_found THEN
    RAISE EXCEPTION 'Invalid or expired reset token';
  END IF;
  IF EXISTS (SELECT 1 FROM library_accounts WHERE password_hash = p_new_hash AND email != p_email) THEN
    RAISE EXCEPTION 'Password already in use by another account';
  END IF;
  UPDATE library_accounts
     SET password_hash = p_new_hash,
         reset_token = NULL,
         reset_token_expires_at = NULL
   WHERE email = p_email;
  RETURN FOUND;
END;
$function$;

-- Drop old 2-arg versions to remove the takeover vector
DROP FUNCTION IF EXISTS public.rpc_update_account_password(text, text);
DROP FUNCTION IF EXISTS public.rpc_update_library_password(text, text);
