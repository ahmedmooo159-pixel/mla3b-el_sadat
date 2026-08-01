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
    slot_id UUID REFERENCES public.slots(id) ON DELETE CASCADE,
    customer_name TEXT,
    customer_phone TEXT,
    booking_date DATE NOT NULL,
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
    EXISTS (SELECT 1 FROM public.slots JOIN public.pitches ON slots.pitch_id = pitches.id WHERE slots.id = bookings.slot_id AND pitches.owner_id = auth.uid())
);
CREATE POLICY "Owners can update bookings for their pitches" ON public.bookings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.slots JOIN public.pitches ON slots.pitch_id = pitches.id WHERE slots.id = bookings.slot_id AND pitches.owner_id = auth.uid())
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
