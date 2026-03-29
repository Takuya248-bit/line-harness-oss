-- bali_area → locale
UPDATE knowledge_entries SET category = 'locale', subcategory = 'bali_' || subcategory WHERE category = 'bali_area';

-- study_faq → people
UPDATE knowledge_entries SET category = 'people', subcategory = 'barilingual_faq' WHERE category = 'study_faq';

-- barilingual (common_worries, student_types) → people
UPDATE knowledge_entries SET category = 'people', subcategory = 'barilingual_student' WHERE category = 'barilingual' AND subcategory IN ('common_worries', 'student_types');
-- barilingual (others) → case
UPDATE knowledge_entries SET category = 'case', subcategory = 'barilingual' WHERE category = 'barilingual' AND subcategory NOT IN ('common_worries', 'student_types');

-- english_learning → method
UPDATE knowledge_entries SET category = 'method', subcategory = 'english_' || subcategory WHERE category = 'english_learning';

-- evidence → case
UPDATE knowledge_entries SET category = 'case', subcategory = 'barilingual_' || subcategory WHERE category = 'evidence';
