import { notFound, redirect } from "next/navigation";
import { BrandHeader } from "../components/brand-header";
import { CheckoutClient } from "../components/checkout-client";
import { getCheckoutCourse } from "@/lib/checkout-data";
import { createClient } from "@/lib/supabase/server";
import { getTossPaymentConfig } from "@/lib/payment-config";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ course?: string; cohort?: string }> }) {
  const query = await searchParams;
  if (!query.course) redirect("/classes");
  const slug = query.course;
  const next = `/checkout?course=${encodeURIComponent(slug)}${query.cohort ? `&cohort=${encodeURIComponent(query.cohort)}` : ""}`;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const course = await getCheckoutCourse(slug);
  if (!course) notFound();
  const cohort = course.cohorts.find((item) => item.id === query.cohort) || course.cohorts[0];
  if (!cohort) redirect(`/classes/${course.slug}?notice=closed`);
  const { data: profile } = await supabase.from("profiles").select("full_name,phone").eq("id", userData.user.id).maybeSingle();
  const paymentConfig = getTossPaymentConfig();

  return <main className="checkout-page"><BrandHeader/><CheckoutClient
    course={course}
    initialCohortId={cohort.id}
    customer={{
      id: userData.user.id,
      name: profile?.full_name || userData.user.user_metadata?.full_name || "",
      email: userData.user.email || "",
      phone: profile?.phone || String(userData.user.user_metadata?.phone || ""),
    }}
    clientKey={paymentConfig.clientKey}
    paymentMode={paymentConfig.clientMode}
    paymentReady={paymentConfig.ready}
    paymentConfigError={paymentConfig.error}
  /></main>;
}
