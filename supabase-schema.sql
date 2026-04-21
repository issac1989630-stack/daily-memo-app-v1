-- Supabase Schema for 張薪濠每日備忘錄

-- 1. 建立 user_profiles 表（用於家長密碼設定等延伸功能）
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  parent_pin TEXT, -- 簡單 PIN 碼，進階應用應加密
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 2. 建立 tasks 表（核心備忘錄功能）
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL, -- 關聯至學生帳戶
  text TEXT NOT NULL,
  task_date DATE NOT NULL, -- 任務所屬日期，格式：YYYY-MM-DD
  is_completed BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 3. 設定 Row Level Security (RLS) 保護資料安全
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tasks" 
  ON tasks FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tasks" 
  ON tasks FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks" 
  ON tasks FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks" 
  ON tasks FOR DELETE 
  USING (auth.uid() = user_id);
