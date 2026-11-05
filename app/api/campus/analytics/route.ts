import {recordActivity} from '@/features/campus/analytics/record';
export async function POST(request:Request){return recordActivity(request);}
