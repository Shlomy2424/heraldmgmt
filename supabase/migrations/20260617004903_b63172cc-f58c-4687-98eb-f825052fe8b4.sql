
-- Seed demo data: units, tenants, sample work orders. Also auto-promote first user to admin.

-- Add some units for each property
INSERT INTO public.units (property_id, unit_number, unit_type, floor)
SELECT p.id, u.unit_number, u.unit_type, u.floor
FROM public.properties p
CROSS JOIN (VALUES
  ('101','apartment','1'),
  ('102','apartment','1'),
  ('201','apartment','2'),
  ('202','apartment','2'),
  ('301','apartment','3')
) AS u(unit_number, unit_type, floor)
WHERE NOT EXISTS (SELECT 1 FROM public.units WHERE property_id = p.id);

-- Add sample tenants for first 2 units of each property
INSERT INTO public.tenants (property_id, unit_id, tenant_name, email, phone)
SELECT u.property_id, u.id,
  CASE u.unit_number
    WHEN '101' THEN 'John Smith'
    WHEN '102' THEN 'Maria Garcia'
    ELSE 'Tenant ' || u.unit_number
  END,
  'tenant.' || lower(replace(u.unit_number,' ','')) || '@example.com',
  '555-0' || (1000 + (random()*8999)::int)::text
FROM public.units u
WHERE u.unit_number IN ('101','102')
AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE unit_id = u.id);

-- Sample work orders
INSERT INTO public.work_orders (job_number, title, task_description, property_id, unit_id, tenant_id, status, priority, category)
SELECT
  'WO-' || LPAD((10000 + row_number() OVER ())::text, 5, '0'),
  wo.title,
  wo.task_description,
  t.property_id,
  t.unit_id,
  t.id,
  wo.status::job_status,
  wo.priority::job_priority,
  wo.category
FROM public.tenants t
CROSS JOIN LATERAL (VALUES
  ('Leaking kitchen faucet', 'Tenant reports dripping faucet under sink. Possible washer replacement needed.', 'new', 'normal', 'plumbing'),
  ('AC not cooling', 'Unit not blowing cold air. Check refrigerant and filter.', 'in_progress', 'high', 'hvac'),
  ('Broken bedroom light', 'Light fixture stopped working after storm.', 'scheduled', 'normal', 'electrical')
) AS wo(title, task_description, status, priority, category)
WHERE t.unit_id IS NOT NULL
LIMIT 15
ON CONFLICT DO NOTHING;

-- Replace handle_new_user to also auto-promote the FIRST user to admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first boolean;
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::app_role ELSE 'viewer'::app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure status trigger and job_number trigger are attached
DROP TRIGGER IF EXISTS work_orders_status_history ON public.work_orders;
CREATE TRIGGER work_orders_status_history
  AFTER INSERT OR UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

DROP TRIGGER IF EXISTS work_orders_set_number ON public.work_orders;
CREATE TRIGGER work_orders_set_number
  BEFORE INSERT ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_job_number();

DROP TRIGGER IF EXISTS work_orders_notify_assignment ON public.work_orders;
CREATE TRIGGER work_orders_notify_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_assignment();

-- updated_at triggers
DROP TRIGGER IF EXISTS work_orders_updated_at ON public.work_orders;
CREATE TRIGGER work_orders_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS properties_updated_at ON public.properties;
CREATE TRIGGER properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS units_updated_at ON public.units;
CREATE TRIGGER units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tenants_updated_at ON public.tenants;
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
