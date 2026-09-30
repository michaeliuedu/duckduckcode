ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_practice_has_problem;
ALTER TABLE rooms DROP COLUMN IF EXISTS problem_snapshot;
ALTER TABLE rooms ADD CONSTRAINT rooms_practice_has_problem CHECK (
    (mode = 'practice' AND problem_id IS NOT NULL) OR
    (mode = 'blank'    AND problem_id IS NULL)
);

DROP TABLE IF EXISTS list_items;
DROP TABLE IF EXISTS lists;
DROP TABLE IF EXISTS problem_tests;
DROP TABLE IF EXISTS problem_examples;
DROP TABLE IF EXISTS problems;
