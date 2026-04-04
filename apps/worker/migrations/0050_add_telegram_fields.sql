-- Telegram CS Bot: ドラフト・修正フロー用カラム
ALTER TABLE inquiry_correction_log ADD COLUMN intent_type TEXT;
ALTER TABLE inquiry_correction_log ADD COLUMN regen_count INTEGER DEFAULT 0;
ALTER TABLE os_inquiry_log ADD COLUMN telegram_draft TEXT;
ALTER TABLE os_inquiry_log ADD COLUMN line_user_id_ref TEXT;
