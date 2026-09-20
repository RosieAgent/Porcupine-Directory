-- A generic invitation prompt without a destination/contact is not usable guidance.
-- This changes derived completeness only, preserving entry content and audit history.
CREATE OR REPLACE FUNCTION listing_has_joining_details(points jsonb,instructions text,phone text DEFAULT '',email text DEFAULT '') RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_array_length(points)>0 OR btrim(phone)<>'' OR btrim(email)<>'' OR (
    btrim(regexp_replace(coalesce(instructions,''),
      'Joining details have not been provided\. Check the source document for updates\.|Access has not been independently verified\. A listed link does not guarantee admission\.|Participation details have not been confirmed\.', '', 'gi')) !~* '^\s*(unknown|n/a|none|tbd|not provided|ask to join|request (an )?invit(e|ation)|invite only|invitation only|\?*)[.!]?\s*$'
  );
$$;
