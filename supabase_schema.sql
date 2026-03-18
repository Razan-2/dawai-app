-- 1. جدول المستخدمين (Users)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. جدول الأدوية (Medicines)
CREATE TABLE medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  time TIME NOT NULL,
  type TEXT DEFAULT 'pill',
  instruction TEXT DEFAULT 'بدون تحديد',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. جدول التذكيرات (Reminders)
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
  reminder_time TIME NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إعدادات أمان اختيارية (Row Level Security - RLS)
-- لتفعيل القراءة والكتابة المفتوحة (لأغراض التطوير فقط)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read algorithms" ON users FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert algorithms" ON users FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous read algorithms" ON medicines FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert algorithms" ON medicines FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous read algorithms" ON reminders FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert algorithms" ON reminders FOR INSERT WITH CHECK (true);

-- إضافة عمود الصورة للأدوية (لتحديث لوحة التحكم)
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS image_url TEXT;
