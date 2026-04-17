-- Add RPC to reset the ACCOUNT password (the one used to sign in).
-- The previous rpc_update_library_password only updated the library password,
-- which left users unable to sign in with their new password.
CREATE OR REPLACE FUNCTION public.rpc_update_account_password(p_email text, p_new_account_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE library_accounts
     SET account_password_hash = p_new_account_hash,
         reset_token = NULL,
         reset_token_expires_at = NULL
   WHERE email = p_email;
  RETURN FOUND;
END;
$function$;