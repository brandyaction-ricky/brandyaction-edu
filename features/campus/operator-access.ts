/** Only a server-verified, active EDU profile may use enrollment-free space review. */
export function canReviewCampus(user: {role?: string; status?: string} | null | undefined) {
 return user?.status === 'active' && (user.role === 'admin' || user.role === 'staff');
}
export function campusReviewPath(cohort?: string, welcome=false) {
 const q=new URLSearchParams({room:welcome?'welcome':'study'});
 if(cohort)q.set('cohort',cohort);
 return '/campus/operator?'+q.toString();
}
