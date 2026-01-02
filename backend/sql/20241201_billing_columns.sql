ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS billing_due_day int NOT NULL DEFAULT 20,
ADD COLUMN IF NOT EXISTS billing_next_due date NULL,
ADD COLUMN IF NOT EXISTS billing_last_paid_at date NULL;

ALTER TABLE public.profiles_auth
ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS billing_due_day int NOT NULL DEFAULT 20,
ADD COLUMN IF NOT EXISTS billing_next_due date NULL,
ADD COLUMN IF NOT EXISTS billing_last_paid_at date NULL;
