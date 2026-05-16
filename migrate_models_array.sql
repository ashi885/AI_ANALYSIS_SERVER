-- Migration to convert server.client_models from multiple rows to a single JSON array row

-- 1. Add new models JSONB column to hold the array
ALTER TABLE server.client_models ADD COLUMN IF NOT EXISTS models JSONB DEFAULT '[]'::jsonb;

-- 2. Drop the composite constraint first to allow updating multiple rows to 'all' temporarily
ALTER TABLE server.client_models DROP CONSTRAINT IF EXISTS client_models_client_id_module_name_key;

-- 3. Migrate existing data: group by client_id into JSON arrays
WITH grouped_models AS (
    SELECT 
        client_id,
        jsonb_agg(
            jsonb_build_object(
                'module_name', module_name,
                'api_provider', api_provider,
                'api_model', api_model
            )
        ) as models_array
    FROM server.client_models
    WHERE module_name != 'all' -- prevent recursion if run multiple times
       AND module_name IS NOT NULL
    GROUP BY client_id
)
UPDATE server.client_models cm
SET models = gm.models_array,
    module_name = 'all',
    api_provider = 'json',
    api_model = 'json'
FROM grouped_models gm
WHERE cm.client_id = gm.client_id;

-- 4. Delete duplicates (keep only the 'all' row per client)
DELETE FROM server.client_models
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM server.client_models 
    GROUP BY client_id
);

-- At this point, every client has exactly ONE row in client_models.

-- 5. We make the old columns nullable since they're no longer strictly needed but keeping them prevents unexpected breaking of older queries
ALTER TABLE server.client_models ALTER COLUMN module_name DROP NOT NULL;
ALTER TABLE server.client_models ALTER COLUMN api_provider DROP NOT NULL;
ALTER TABLE server.client_models ALTER COLUMN api_model DROP NOT NULL;

-- 6. Add unique constraint on client_id alone to enforce the 1-row-per-client rule
ALTER TABLE server.client_models ADD CONSTRAINT client_models_client_id_key UNIQUE (client_id);
