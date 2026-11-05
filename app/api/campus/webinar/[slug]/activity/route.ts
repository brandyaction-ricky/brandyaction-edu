import {recordActivity} from '@/features/campus/analytics/record';
// Bound to this public event; cannot submit member activity.
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
 const{slug}=await params;return recordActivity(request,slug);
}
