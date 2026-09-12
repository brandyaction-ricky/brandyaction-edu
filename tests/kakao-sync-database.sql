-- DEV-only assertions. Always enclose in BEGIN / ROLLBACK; never commit fixtures.
do $$
declare member uuid:=gen_random_uuid(); terms jsonb:='[{"tag":"qa_terms","agreed":true,"agreed_at":"2026-01-01T00:00:00Z"},{"tag":"qa_privacy","agreed":true,"agreed_at":"2026-01-01T00:00:00Z"}]'; before_profile jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data) values(member,'sync-qa-'||member::text||'@example.invalid','{}');
  select to_jsonb(p) into before_profile from public.profiles p where id=member;
  assert before_profile is not null, 'Auth must create a profile';
  update public.kakao_sync_config set value='{"enabled":true,"appId":"123","channelId":"_qa","termsTag":"qa_terms","privacyTag":"qa_privacy"}',revision=1 where id;
  perform public.edu_record_kakao_consent(member,'999999991234','123',1,'qa-v1',terms,'_qa','ADDED');
  perform public.edu_record_kakao_consent(member,'999999991234','123',1,'qa-v1',terms,'_qa','ADDED');
  assert (select count(*)=1 from public.kakao_sync_consent_history where user_id=member), 'Repeated login must not duplicate unchanged history';
  assert (select to_jsonb(p)=before_profile from public.profiles p where id=member), 'Channel addition must not change profile, marketing or role';
  perform public.edu_record_kakao_consent(member,'999999991234','123',1,'qa-v1',terms,'_qa','BLOCKED');
  assert (select channel_relation='BLOCKED' from public.kakao_sync_members where user_id=member), 'Blocked channel must not remain ADDED';
  assert (select count(*)=2 from public.kakao_sync_consent_history where user_id=member), 'Changed state audit required';
  begin
    perform public.edu_record_kakao_consent(member,'999999991234','123',0,'qa-v1',terms,'_qa','ADDED');
    raise exception 'Unexpected stale revision accepted';
  exception when raise_exception then assert SQLERRM='SYNC_CONFIG_CHANGED','Config race must fail closed'; end;
  begin
    perform public.edu_record_kakao_consent(member,'999999991234','999',1,'qa-v1',terms,'_qa','ADDED');
    raise exception 'Unexpected app accepted';
  exception when raise_exception then assert SQLERRM='SYNC_CONFIG_CHANGED','Application must match'; end;
  assert not has_table_privilege('anon','public.kakao_sync_members','SELECT'), 'No anonymous consent read';
  assert not has_table_privilege('authenticated','public.kakao_sync_config','UPDATE'), 'Browser cannot update config';
  assert not has_function_privilege('authenticated','public.edu_record_kakao_consent(uuid,text,text,integer,text,jsonb,text,text)','EXECUTE'), 'No forged browser consent';
end $$;
