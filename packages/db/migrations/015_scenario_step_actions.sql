-- Add multi-message and rich menu switching support to scenario steps
ALTER TABLE scenario_steps ADD COLUMN extra_messages TEXT DEFAULT NULL;
ALTER TABLE scenario_steps ADD COLUMN rich_menu_id TEXT DEFAULT NULL;
