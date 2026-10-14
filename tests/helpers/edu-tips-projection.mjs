import {readFileSync} from 'node:fs';
export const projectionMigration='20261014062210_edu_tips_hmac_projection_candidate.sql';
export async function installProjectionSchema(f){
 await f.db.exec('reset role');
 try{
 await f.db.exec(`
 create table courses(id uuid primary key,course_code text);
 create table cohorts(id uuid primary key,cohort_code text);
 create table orders(id uuid primary key,user_id uuid references profiles(id),is_test_order boolean default false,total_amount integer,status text,entry_src text);
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id),cohort_id uuid references cohorts(id));
 create table payments(id uuid primary key,order_id uuid references orders(id),status text,approved_amount integer,cancelled_amount integer default 0,approved_at timestamptz);
 create table refunds(id uuid primary key,payment_id uuid references payments(id),status text,amount integer,completed_at timestamptz);
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),order_item_id uuid references order_items(id),course_id uuid references courses(id),cohort_id uuid references cohorts(id),source text);
 create table learning_usage_events(id uuid primary key,enrollment_id uuid references enrollments(id),item_type text,item_id uuid,first_used_at timestamptz,last_used_at timestamptz,evidence_source text);
 create view edu_analytics_orders with(security_invoker=true) as select o.* from orders o join profiles p on p.id=o.user_id where not o.is_test_order and o.total_amount>0 and p.status='active' and not p.is_internal and p.role not in ('admin','staff');
 grant select on courses,cohorts,orders,order_items,payments,refunds,enrollments,learning_usage_events,edu_analytics_orders to service_role;
 `);
 for(const file of ['20261012030707_edu_tips_data_recovery_v2.sql','20261012041637_edu_tips_expired_revision_guard.sql','20261012052049_edu_tips_rest_safe_updates.sql','20261012064140_edu_tips_catalog_code_compat.sql',projectionMigration])await f.db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 }catch(error){await f.db.exec('rollback');throw error;}finally{await f.db.exec('set role service_role');}
}
