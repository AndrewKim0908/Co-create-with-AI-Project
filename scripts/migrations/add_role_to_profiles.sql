-- Migration: add role column to profiles
-- Run once in Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT;

COMMENT ON COLUMN profiles.role IS
  'User role: pm | designer | engineer | marketer | manufacture | other';
