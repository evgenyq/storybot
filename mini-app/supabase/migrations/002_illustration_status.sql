-- Add status field to illustrations for async loading
ALTER TABLE illustrations 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ready';

-- Add text_position to know where in the chapter to show the image
ALTER TABLE illustrations 
ADD COLUMN IF NOT EXISTS text_position INT DEFAULT 0;

-- Create index for faster status lookups
CREATE INDEX IF NOT EXISTS idx_illustrations_status ON illustrations(status);

-- Comment
COMMENT ON COLUMN illustrations.status IS 'pending = waiting for generation, generating = in progress, ready = done, error = failed';
COMMENT ON COLUMN illustrations.text_position IS 'Position in text where image placeholder [IMG:N] appears';

