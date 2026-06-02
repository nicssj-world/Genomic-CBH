import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202606030001_stock_management.sql'), 'utf8')

describe('Stock Management migration contract', () => {
  it('creates category, item, lot, and append-only movement tables', () => {
    expect(sql).toContain('create table public.nipt_stock_categories')
    expect(sql).toContain('create table public.nipt_stock_items')
    expect(sql).toContain('create table public.nipt_stock_lots')
    expect(sql).toContain('create table public.nipt_stock_movements')
    expect(sql).toContain('create trigger nipt_stock_movements_append_only')
    expect(sql).toContain("raise exception 'Stock movement ledger is append-only; create a reversal instead'")
  })

  it('keeps stock mutations atomic and server-only', () => {
    expect(sql).toContain('create or replace function public.receive_nipt_stock')
    expect(sql).toContain('create or replace function public.issue_nipt_stock')
    expect(sql).toContain('create or replace function public.adjust_nipt_stock')
    expect(sql).toContain('create or replace function public.reverse_nipt_stock_movement')
    expect(sql).toContain('revoke all on function public.issue_nipt_stock(uuid, numeric, text, text, text, boolean, uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.reverse_nipt_stock_movement(uuid, text, uuid) to service_role')
  })

  it('prevents negative stock and enforces reversal permissions', () => {
    expect(sql).toContain("raise exception 'Insufficient stock balance'")
    expect(sql).toContain("raise exception 'Stock balance cannot be negative'")
    expect(sql).toContain("raise exception 'You can reverse only your own stock movement'")
    expect(sql).toContain("raise exception 'Stock movement is already reversed'")
  })

  it('enables read-only RLS policies for browser users', () => {
    expect(sql).toContain('alter table public.nipt_stock_categories enable row level security')
    expect(sql).toContain('alter table public.nipt_stock_movements enable row level security')
    expect(sql).toContain('create policy nipt_stock_movements_active_read')
  })
})
