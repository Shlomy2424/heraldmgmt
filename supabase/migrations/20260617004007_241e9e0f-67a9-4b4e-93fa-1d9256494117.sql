
-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'technician', 'viewer');

CREATE TYPE public.job_status AS ENUM (
  'new','scheduled','not_started','in_progress',
  'waiting_parts','waiting_tenant','waiting_approval','could_not_access',
  'done','manager_review','closed','reopened','cancelled'
);

CREATE TYPE public.job_priority AS ENUM ('emergency','high','normal','low');

CREATE TYPE public.delay_reason AS ENUM (
  'none','waiting_tenant','waiting_parts','weather','emergency_call',
  'could_not_access','needs_approval','need_more_information','need_quote','need_vendor','other'
);

CREATE TYPE public.follow_up_status AS ENUM (
  'no','yes','next_week','scheduled','needs_manager_review',
  'needs_tenant_response','needs_parts','needs_vendor'
);

CREATE TYPE public.note_type AS ENUM ('manager','technician','tenant','internal','follow_up');

CREATE TYPE public.photo_category AS ENUM ('before','during','after','other');

CREATE TYPE public.visit_status AS ENUM (
  'scheduled','in_progress','completed','cancelled','no_show','rescheduled'
);

-- =============================================================================
-- HELPER: updated_at trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================================================
-- PROFILES
-- =============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- USER ROLES + has_role helper
-- =============================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

-- Convenience: get all roles for current user
CREATE OR REPLACE FUNCTION public.current_user_roles()
RETURNS SETOF public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
$$;

-- =============================================================================
-- handle_new_user: profile + default 'viewer' role
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- PROFILE / ROLE policies
-- =============================================================================
CREATE POLICY "profiles_read_any_signed_in" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_update_any" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR id = auth.uid());

CREATE POLICY "roles_read_signed_in" ON public.user_roles FOR SELECT TO authenticated USING (true);
-- Only admins manage roles
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =============================================================================
-- PROPERTIES
-- =============================================================================
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  property_type TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "properties_read" ON public.properties FOR SELECT TO authenticated USING (true);
CREATE POLICY "properties_write_mgr" ON public.properties FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "properties_update_mgr" ON public.properties FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "properties_delete_admin" ON public.properties FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =============================================================================
-- UNITS
-- =============================================================================
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  floor TEXT,
  unit_type TEXT,
  notes TEXT,
  access_notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_units_updated BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_units_property ON public.units(property_id);

CREATE POLICY "units_read" ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "units_write_mgr" ON public.units FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "units_update_mgr" ON public.units FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "units_delete_admin" ON public.units FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =============================================================================
-- TENANTS
-- =============================================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  tenant_name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  email TEXT,
  lease_notes TEXT,
  access_notes TEXT,
  special_instructions TEXT,
  move_in_date DATE,
  move_out_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_tenants_property ON public.tenants(property_id);
CREATE INDEX idx_tenants_unit ON public.tenants(unit_id);

CREATE POLICY "tenants_read" ON public.tenants FOR SELECT TO authenticated USING (true);
CREATE POLICY "tenants_write_mgr" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "tenants_update_mgr" ON public.tenants FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "tenants_delete_admin" ON public.tenants FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =============================================================================
-- WORK ORDERS + auto job number
-- =============================================================================
CREATE SEQUENCE public.work_order_number_seq START 1001;

CREATE TABLE public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  task_description TEXT,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  priority public.job_priority NOT NULL DEFAULT 'normal',
  status public.job_status NOT NULL DEFAULT 'new',
  delay_reason public.delay_reason NOT NULL DEFAULT 'none',
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_by TEXT,
  category TEXT,
  subcategory TEXT,
  tags TEXT[],
  estimated_hours NUMERIC(6,2) DEFAULT 0,
  actual_hours NUMERIC(6,2) DEFAULT 0,
  manager_notes TEXT,
  tech_notes TEXT,
  tenant_notes TEXT,
  internal_notes TEXT,
  public_tenant_notes TEXT,
  follow_up public.follow_up_status NOT NULL DEFAULT 'no',
  follow_up_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopened BOOLEAN NOT NULL DEFAULT false,
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders TO authenticated;
GRANT ALL ON public.work_orders TO service_role;
GRANT USAGE ON SEQUENCE public.work_order_number_seq TO authenticated;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_wo_status ON public.work_orders(status);
CREATE INDEX idx_wo_priority ON public.work_orders(priority);
CREATE INDEX idx_wo_assigned ON public.work_orders(assigned_to);
CREATE INDEX idx_wo_property ON public.work_orders(property_id);
CREATE INDEX idx_wo_created ON public.work_orders(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_job_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := 'WO-' || LPAD(nextval('public.work_order_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_wo_job_number BEFORE INSERT ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_job_number();

CREATE TRIGGER trg_wo_updated BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Work order RLS
CREATE POLICY "wo_read" ON public.work_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "wo_insert_mgr" ON public.work_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
-- Managers/admins can update anything. Technicians can update only their assigned jobs.
CREATE POLICY "wo_update_mgr" ON public.work_orders FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "wo_update_tech_assigned" ON public.work_orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'technician') AND assigned_to = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'technician') AND assigned_to = auth.uid());
CREATE POLICY "wo_delete_admin" ON public.work_orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =============================================================================
-- SCHEDULE VISITS
-- =============================================================================
CREATE TABLE public.schedule_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  estimated_hours NUMERIC(6,2) DEFAULT 0,
  actual_hours NUMERIC(6,2) DEFAULT 0,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  visit_status public.visit_status NOT NULL DEFAULT 'scheduled',
  manager_notes TEXT,
  tech_notes TEXT,
  tenant_notes TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_visits TO authenticated;
GRANT ALL ON public.schedule_visits TO service_role;
ALTER TABLE public.schedule_visits ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_sv_updated BEFORE UPDATE ON public.schedule_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sv_wo ON public.schedule_visits(work_order_id);
CREATE INDEX idx_sv_date ON public.schedule_visits(scheduled_date);
CREATE INDEX idx_sv_assigned ON public.schedule_visits(assigned_to);

CREATE POLICY "sv_read" ON public.schedule_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "sv_write_mgr" ON public.schedule_visits FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "sv_update_mgr" ON public.schedule_visits FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "sv_update_tech" ON public.schedule_visits FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'technician') AND assigned_to = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'technician') AND assigned_to = auth.uid());
CREATE POLICY "sv_delete_mgr" ON public.schedule_visits FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- =============================================================================
-- JOB NOTES
-- =============================================================================
CREATE TABLE public.job_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  note_type public.note_type NOT NULL DEFAULT 'internal',
  note_text TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_notes TO authenticated;
GRANT ALL ON public.job_notes TO service_role;
ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notes_wo ON public.job_notes(work_order_id);

CREATE POLICY "notes_read" ON public.job_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "notes_insert_signed" ON public.job_notes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','manager','technician']::public.app_role[])
  );
CREATE POLICY "notes_update_owner_or_mgr" ON public.job_notes FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "notes_delete_mgr" ON public.job_notes FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- =============================================================================
-- PHOTOS / ATTACHMENTS
-- =============================================================================
CREATE TABLE public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  schedule_visit_id UUID REFERENCES public.schedule_visits(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  photo_category public.photo_category NOT NULL DEFAULT 'other',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO authenticated;
GRANT ALL ON public.photos TO service_role;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_photos_wo ON public.photos(work_order_id);

CREATE POLICY "photos_read" ON public.photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "photos_insert" ON public.photos FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','technician']::public.app_role[]));
CREATE POLICY "photos_delete_mgr" ON public.photos FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- =============================================================================
-- TIME ENTRIES
-- =============================================================================
CREATE TABLE public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  schedule_visit_id UUID REFERENCES public.schedule_visits(id) ON DELETE SET NULL,
  technician_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TEXT,
  end_time TEXT,
  total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_te_wo ON public.time_entries(work_order_id);

CREATE POLICY "te_read" ON public.time_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "te_insert" ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','technician']::public.app_role[]));
CREATE POLICY "te_update_owner_or_mgr" ON public.time_entries FOR UPDATE TO authenticated
  USING (technician_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (technician_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "te_delete_mgr" ON public.time_entries FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- =============================================================================
-- STATUS HISTORY (logged via trigger)
-- =============================================================================
CREATE TABLE public.status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  old_status public.job_status,
  new_status public.job_status NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.status_history TO authenticated;
GRANT ALL ON public.status_history TO service_role;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sh_wo ON public.status_history(work_order_id);

CREATE POLICY "sh_read" ON public.status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "sh_insert" ON public.status_history FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','technician']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.status_history(work_order_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, NEW.created_by);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.status_history(work_order_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_wo_status_history
AFTER INSERT OR UPDATE OF status ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

-- =============================================================================
-- IMPORT BATCHES
-- =============================================================================
CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type TEXT NOT NULL,
  file_name TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_rows INT DEFAULT 0,
  successful_rows INT DEFAULT 0,
  failed_rows INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ib_read" ON public.import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "ib_write_mgr" ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- =============================================================================
-- DROPDOWN OPTIONS
-- =============================================================================
CREATE TABLE public.dropdown_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_type TEXT NOT NULL,
  option_value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(option_type, option_value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dropdown_options TO authenticated;
GRANT ALL ON public.dropdown_options TO service_role;
ALTER TABLE public.dropdown_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "do_read" ON public.dropdown_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "do_write_admin" ON public.dropdown_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notif_user ON public.notifications(user_id, read);

CREATE POLICY "notif_own" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_insert_any" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- Trigger: notify assigned technician on assignment / status change
CREATE OR REPLACE FUNCTION public.notify_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    INSERT INTO public.notifications(user_id, title, body, work_order_id)
    VALUES (NEW.assigned_to,
            'New job assigned: ' || NEW.job_number,
            COALESCE(NEW.title,''),
            NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_wo_notify_assign
AFTER INSERT OR UPDATE OF assigned_to ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.notify_assignment();

-- =============================================================================
-- SEED: dropdowns + properties
-- =============================================================================
INSERT INTO public.dropdown_options(option_type, option_value, sort_order) VALUES
  ('status','Not Started',1),('status','In Progress',2),('status','Waiting Parts',3),
  ('status','Done',4),('status','Cancelled',5),('status','Manager Review',6),
  ('status','Closed',7),('status','Reopened',8),('status','Waiting Tenant',9),
  ('status','Waiting Approval',10),('status','Could Not Access',11),
  ('priority','Emergency',1),('priority','High',2),('priority','Normal',3),('priority','Low',4),
  ('assigned_to','Adam',1),('assigned_to','Amy',2),('assigned_to','Aaron',3),('assigned_to','Sub',4),
  ('delay_reason','None',1),('delay_reason','Waiting Tenant',2),('delay_reason','Waiting Parts',3),
  ('delay_reason','Weather',4),('delay_reason','Emergency Call',5),('delay_reason','Could Not Access',6),
  ('delay_reason','Needs Approval',7),('delay_reason','Other',8),
  ('follow_up','No',1),('follow_up','Yes',2),('follow_up','Next Week',3),('follow_up','Scheduled',4),
  ('completed','No',1),('completed','Yes',2),
  ('start_time','7:00 AM',1),('start_time','7:30 AM',2),('start_time','8:00 AM',3),
  ('start_time','8:30 AM',4),('start_time','9:00 AM',5),('start_time','9:30 AM',6),
  ('start_time','10:00 AM',7),('start_time','10:30 AM',8),('start_time','11:00 AM',9),
  ('start_time','11:30 AM',10),('start_time','12:00 PM',11),('start_time','12:30 PM',12),
  ('start_time','1:00 PM',13),('start_time','1:30 PM',14),('start_time','2:00 PM',15),
  ('start_time','2:30 PM',16),('start_time','3:00 PM',17),('start_time','3:30 PM',18),
  ('start_time','4:00 PM',19),('start_time','4:30 PM',20),('start_time','5:00 PM',21),
  ('start_time','5:30 PM',22),('start_time','6:00 PM',23)
ON CONFLICT DO NOTHING;

INSERT INTO public.properties(property_name, address) VALUES
  ('35 E Elizabeth Ave','35 E Elizabeth Ave'),
  ('WECA','WECA'),
  ('826 Monocacy Ave','826 Monocacy Ave'),
  ('65 E Greenwich St','65 E Greenwich St'),
  ('1330 Chelsea Ave','1330 Chelsea Ave'),
  ('865 E 4th St','865 E 4th St'),
  ('906 Evans St','906 Evans St')
ON CONFLICT DO NOTHING;
