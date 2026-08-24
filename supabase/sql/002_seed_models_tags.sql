-- Seed: AI model catalog + content tags
-- Idempotent (upsert by unique keys)
--
-- หมายเหตุ (2026-08): google/gemini-2.0-flash-001, anthropic/claude-3.5-haiku,
-- google/gemma-3-27b-it:free โดนปลดจาก OpenRouter แล้ว (เรียกแล้ว 404)
-- จึง set is_enabled=false ไว้ — stealth/ox-alpha เป็น default (sort_order 0)

insert into ai_models (model_key, provider, provider_model_id, display_name,
  input_cost_per_million, output_cost_per_million, energy_multiplier,
  max_context_tokens, is_enabled, is_premium_only, sort_order)
values
  ('stealth/ox-alpha', 'openrouter', 'stealth/ox-alpha',
   'Ox Alpha', 0.50, 1.50, 1.00, 128000, true, false, 0),
  ('google/gemini-2.0-flash-001', 'openrouter', 'google/gemini-2.0-flash-001',
   'Gemini 2.0 Flash', 0.10, 0.40, 1.00, 1048576, false, false, 1),
  ('openai/gpt-4o-mini', 'openrouter', 'openai/gpt-4o-mini',
   'GPT-4o mini', 0.15, 0.60, 1.20, 128000, true, false, 2),
  ('meta-llama/llama-3.3-70b-instruct', 'openrouter', 'meta-llama/llama-3.3-70b-instruct',
   'Llama 3.3 70B', 0.12, 0.30, 0.80, 131072, true, false, 3),
  ('deepseek/deepseek-chat', 'openrouter', 'deepseek/deepseek-chat',
   'DeepSeek V3', 0.27, 1.10, 1.00, 64000, true, false, 4),
  ('anthropic/claude-3.5-haiku', 'openrouter', 'anthropic/claude-3.5-haiku',
   'Claude 3.5 Haiku', 0.80, 4.00, 2.00, 200000, false, false, 5),
  ('anthropic/claude-sonnet-4', 'openrouter', 'anthropic/claude-sonnet-4',
   'Claude Sonnet 4', 3.00, 15.00, 5.00, 200000, true, true, 6),
  ('google/gemma-3-27b-it:free', 'openrouter', 'google/gemma-3-27b-it:free',
   'Gemma 3 27B (ฟรี)', 0.00, 0.00, 0.50, 96000, false, false, 7)
on conflict (model_key) do update set
  provider_model_id   = excluded.provider_model_id,
  display_name        = excluded.display_name,
  input_cost_per_million = excluded.input_cost_per_million,
  output_cost_per_million = excluded.output_cost_per_million,
  energy_multiplier   = excluded.energy_multiplier,
  max_context_tokens  = excluded.max_context_tokens,
  is_enabled          = excluded.is_enabled,
  sort_order          = excluded.sort_order;

insert into tags (name, slug) values
  ('โรแมนซ์', 'romance'),
  ('แฟนตาซี', 'fantasy'),
  ('แอ็กชัน', 'action'),
  ('โรงเรียน', 'school'),
  ('สำนักงาน', 'office'),
  ('ย้อนยุค', 'historical'),
  ('สยองขวัญ', 'horror'),
  ('คอมเมดี้', 'comedy'),
  ('ลึกลับ', 'mystery'),
  ('ไซไฟ', 'sci-fi'),
  ('ต่างโลก', 'isekai'),
  ('น่ารักอบอุ่น', 'wholesome')
on conflict (slug) do nothing;
