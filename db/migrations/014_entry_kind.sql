-- Neutral compatibility value for new entries; existing categories/history remain intact.
ALTER TABLE listings DROP CONSTRAINT listings_kind_check;
ALTER TABLE listings ADD CONSTRAINT listings_kind_check CHECK (kind IN ('entry','group','channel','business','resource','organization'));
