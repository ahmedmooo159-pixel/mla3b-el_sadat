-- schema.sql
-- Run this in your Supabase SQL Editor

-- 1. Create Tables
CREATE TABLE public.owners (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    telegram_chat_id TEXT,
    role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.pitches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    owner_id UUID REFERENCES public.owners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    price_per_hour NUMERIC NOT NULL,
    vodafone_cash TEXT,
    instapay_link TEXT,
    photos TEXT[] DEFAULT '{}',
    subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'pending')),
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    payment_proof_url TEXT,
    cancel_cutoff_hours INTEGER DEFAULT 24,
    refund_percent_after_cutoff INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.slots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pitch_id UUID REFERENCES public.pitches(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.bookings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pitch_id UUID REFERENCES public.pitches(id) ON DELETE CASCADE,
    slot_id UUID REFERENCES public.slots(id) ON DELETE SET NULL,
    customer_name TEXT,
    customer_phone TEXT,
    booking_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    status TEXT DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'confirmed', 'rejected', 'cancelled')),
    payment_screenshot TEXT,
    source TEXT DEFAULT 'online' CHECK (source IN ('online', 'manual')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.recurring_bookings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_phone TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    pitch_id UUID REFERENCES public.pitches(id) ON DELETE CASCADE,
    slot_id UUID REFERENCES public.slots(id) ON DELETE CASCADE,
    deposit_amount NUMERIC NOT NULL,
    deposit_screenshot TEXT,
    confirm_cutoff_days INTEGER DEFAULT 4,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.recurring_occurrences (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    recurring_booking_id UUID REFERENCES public.recurring_bookings(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    status TEXT DEFAULT 'awaiting_confirmation' CHECK (status IN ('awaiting_confirmation', 'confirmed', 'skipped')),
    payment_screenshot TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(recurring_booking_id, occurrence_date)
);

CREATE TABLE public.refund_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.platform_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    vodafone_cash_number TEXT NOT NULL,
    instapay_link TEXT NOT NULL,
    monthly_subscription_fee NUMERIC DEFAULT 500,
    areas TEXT[] DEFAULT '{"المنطقة الأولى", "المنطقة الثانية", "المنطقة الثالثة", "الحي المتميز"}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pitches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- 3. Basic RLS Policies
CREATE POLICY "Owners can view their own profile" ON public.owners FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Owners can update their own profile" ON public.owners FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Public can view active pitches" ON public.pitches FOR SELECT USING (subscription_status = 'active');
CREATE POLICY "Owners can manage their own pitches" ON public.pitches FOR ALL USING (auth.uid() = owner_id);

-- Admins RLS Policies for pitches
CREATE POLICY "Admins can view all pitches" ON public.pitches FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.owners WHERE owners.id = auth.uid() AND owners.role = 'admin')
);
CREATE POLICY "Admins can update all pitches" ON public.pitches FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.owners WHERE owners.id = auth.uid() AND owners.role = 'admin')
);

CREATE POLICY "Public can view slots" ON public.slots FOR SELECT USING (is_active = true);
CREATE POLICY "Owners can manage slots for their pitches" ON public.slots FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pitches WHERE pitches.id = slots.pitch_id AND pitches.owner_id = auth.uid())
);
CREATE POLICY "Public can view platform settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Admins can update platform settings" ON public.platform_settings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.owners WHERE owners.id = auth.uid() AND owners.role = 'admin')
);

-- 4. Create Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('pitch_photos', 'pitch_photos', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('payment_proofs', 'payment_proofs', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('booking_receipts', 'booking_receipts', false) ON CONFLICT DO NOTHING;

CREATE POLICY "Public can view pitch photos" ON storage.objects FOR SELECT USING (bucket_id = 'pitch_photos');
CREATE POLICY "Owners can upload photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'pitch_photos' AND auth.role() = 'authenticated');
CREATE POLICY "Owners can upload payment proofs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payment_proofs' AND auth.role() = 'authenticated');
CREATE POLICY "Public can upload booking receipts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'booking_receipts');

-- 5. Insert Initial Settings
INSERT INTO public.platform_settings (vodafone_cash_number, instapay_link, monthly_subscription_fee) 
VALUES ('[هتحط رقمك هنا]', '[هتحط رقمك هنا]@instapay', 500) 
ON CONFLICT DO NOTHING;

-- 6. Add RLS Policies for Bookings and Refunds
-- bookings
CREATE POLICY "Public can create bookings" ON public.bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Owners can view bookings for their pitches" ON public.bookings FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.pitches WHERE pitches.id = bookings.pitch_id AND pitches.owner_id = auth.uid())
);
CREATE POLICY "Owners can update bookings for their pitches" ON public.bookings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.pitches WHERE pitches.id = bookings.pitch_id AND pitches.owner_id = auth.uid())
);

-- recurring_bookings
CREATE POLICY "Public can create recurring bookings" ON public.recurring_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Owners can view recurring bookings for their pitches" ON public.recurring_bookings FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.pitches WHERE pitches.id = recurring_bookings.pitch_id AND pitches.owner_id = auth.uid())
);
CREATE POLICY "Owners can update recurring bookings for their pitches" ON public.recurring_bookings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.pitches WHERE pitches.id = recurring_bookings.pitch_id AND pitches.owner_id = auth.uid())
);

-- recurring_occurrences
CREATE POLICY "Owners can view occurrences for their pitches" ON public.recurring_occurrences FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.recurring_bookings JOIN public.pitches ON recurring_bookings.pitch_id = pitches.id WHERE recurring_bookings.id = recurring_occurrences.recurring_booking_id AND pitches.owner_id = auth.uid())
);
CREATE POLICY "Owners can update occurrences for their pitches" ON public.recurring_occurrences FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.recurring_bookings JOIN public.pitches ON recurring_bookings.pitch_id = pitches.id WHERE recurring_bookings.id = recurring_occurrences.recurring_booking_id AND pitches.owner_id = auth.uid())
);

-- refund_requests
CREATE POLICY "Public can create refund requests" ON public.refund_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Owners can view refund requests for their pitches" ON public.refund_requests FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bookings JOIN public.slots ON bookings.slot_id = slots.id JOIN public.pitches ON slots.pitch_id = pitches.id WHERE bookings.id = refund_requests.booking_id AND pitches.owner_id = auth.uid())
);
CREATE POLICY "Owners can update refund requests for their pitches" ON public.refund_requests FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.bookings JOIN public.slots ON bookings.slot_id = slots.id JOIN public.pitches ON slots.pitch_id = pitches.id WHERE bookings.id = refund_requests.booking_id AND pitches.owner_id = auth.uid())
);

-- 7. Postgres Functions (RPC) for Public Lookups
CREATE OR REPLACE FUNCTION public.get_bookings_by_phone(p_phone TEXT)
RETURNS SETOF public.bookings
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.bookings WHERE customer_phone = p_phone;
$$;

CREATE OR REPLACE FUNCTION public.get_recurring_bookings_by_phone(p_phone TEXT)
RETURNS SETOF public.recurring_bookings
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.recurring_bookings WHERE customer_phone = p_phone;
$$;

CREATE OR REPLACE FUNCTION public.upload_booking_receipt(p_booking_id UUID, p_screenshot TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bookings 
  SET payment_screenshot = p_screenshot 
  WHERE id = p_booking_id;
$$;

CREATE OR REPLACE FUNCTION public.upload_recurring_receipt(p_recurring_id UUID, p_screenshot TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.recurring_bookings 
  SET deposit_screenshot = p_screenshot 
  WHERE id = p_recurring_id;
$$;

-- 8. Atomic Booking to prevent Double Booking
CREATE OR REPLACE FUNCTION public.create_booking_atomically(
    p_pitch_id UUID,
    p_slot_id UUID,
    p_booking_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_source TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_overlap_count INT;
    v_start_ts TIMESTAMP;
    v_end_ts TIMESTAMP;
    v_b_start_ts TIMESTAMP;
    v_b_end_ts TIMESTAMP;
    v_new_id UUID;
    v_rec RECORD;
BEGIN
    v_start_ts := p_booking_date + p_start_time;
    v_end_ts := p_booking_date + p_end_time;
    IF p_end_time <= p_start_time THEN
        v_end_ts := v_end_ts + interval '1 day';
    END IF;

    PERFORM 1 FROM public.pitches WHERE id = p_pitch_id FOR UPDATE;

    v_overlap_count := 0;
    
    FOR v_rec IN 
        SELECT booking_date, start_time, end_time, status, created_at
        FROM public.bookings
        WHERE pitch_id = p_pitch_id
          AND booking_date >= (p_booking_date - interval '1 day')::DATE
          AND booking_date <= (p_booking_date + interval '1 day')::DATE
          AND status IN ('confirmed', 'pending_payment')
    LOOP
        IF v_rec.status = 'pending_payment' AND (extract(epoch from (now() - v_rec.created_at))/60) > 10 THEN
            CONTINUE;
        END IF;

        v_b_start_ts := v_rec.booking_date + v_rec.start_time;
        v_b_end_ts := v_rec.booking_date + v_rec.end_time;
        IF v_rec.end_time <= v_rec.start_time THEN
            v_b_end_ts := v_b_end_ts + interval '1 day';
        END IF;

        IF GREATEST(v_start_ts, v_b_start_ts) < LEAST(v_end_ts, v_b_end_ts) THEN
            v_overlap_count := v_overlap_count + 1;
            EXIT;
        END IF;
    END LOOP;

    IF v_overlap_count > 0 THEN
        RAISE EXCEPTION 'overlap';
    END IF;

    INSERT INTO public.bookings (
        pitch_id, slot_id, booking_date, start_time, end_time, 
        customer_name, customer_phone, source, status
    ) VALUES (
        p_pitch_id, p_slot_id, p_booking_date, p_start_time, p_end_time,
        p_customer_name, p_customer_phone, p_source, 'pending_payment'
    ) RETURNING id INTO v_new_id;

    RETURN json_build_object('id', v_new_id);
END;
$$;
